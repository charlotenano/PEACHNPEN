import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

function loadEnvFile(fileName) {
  const filePath = resolve(projectRoot, fileName)
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
}

loadEnvFile('.env')
loadEnvFile('.env.local')

const port = Number(process.env.AI_PORT || 8787)
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

const responseSchema = {
  type: 'OBJECT',
  required: ['id', 'sourceId', 'sourceName', 'type', 'title', 'content', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'STRING' }, sourceId: { type: 'STRING' }, sourceName: { type: 'STRING' },
    type: { type: 'STRING', enum: ['reviewer', 'summary', 'flashcards', 'quiz', 'ppt-outline'] },
    title: { type: 'STRING' }, content: { type: 'STRING' }, createdAt: { type: 'STRING' }, updatedAt: { type: 'STRING' },
    flashcards: { type: 'ARRAY', items: { type: 'OBJECT', required: ['question', 'answer'], properties: { question: { type: 'STRING' }, answer: { type: 'STRING' } } } },
    quizQuestions: { type: 'ARRAY', items: { type: 'OBJECT', required: ['question', 'type', 'answer'], properties: {
      question: { type: 'STRING' }, type: { type: 'STRING', enum: ['selection', 'checkbox', 'fill'] },
      options: { type: 'ARRAY', items: { type: 'STRING' } }, answer: { anyOf: [{ type: 'STRING' }, { type: 'ARRAY', items: { type: 'STRING' } }] },
    } } },
  },
}

const quizContextSchema = {
  type: 'OBJECT',
  required: ['topic', 'learningObjectives', 'concepts', 'relationships', 'examples', 'misconceptions'],
  properties: {
    topic: { type: 'STRING' },
    learningObjectives: { type: 'ARRAY', items: { type: 'STRING' } },
    concepts: { type: 'ARRAY', items: { type: 'OBJECT', required: ['name', 'explanation'], properties: { name: { type: 'STRING' }, explanation: { type: 'STRING' } } } },
    relationships: { type: 'ARRAY', items: { type: 'STRING' } },
    examples: { type: 'ARRAY', items: { type: 'STRING' } },
    misconceptions: { type: 'ARRAY', items: { type: 'STRING' } },
  },
}

const generationRules = `You are an expert educator, instructional designer, and assessment writer.
Create a high-signal study artifact from the supplied lesson only. Do not invent facts, citations, examples, terminology, or answers that are not supported by the lesson.
Preserve important technical terms and capitalization, but repair extraction artifacts such as words with spaces between every letter and replacement glyphs (�). Replace missing glyphs with a space so adjacent words do not run together. Prefer synthesis, relationships, mechanisms, trade-offs, applications, and misconceptions over copying sentences.
Use standard sentence capitalization throughout summaries, reviewers, and PowerPoint outlines: capitalize the first word of every sentence, bullet, and heading, and avoid all-lowercase or all-uppercase prose. Preserve proper nouns, acronyms, and case-sensitive technical terms.
For quizzes, vary question stems (explain, compare, apply, infer, distinguish, evaluate), use plausible source-grounded distractors, make one unambiguous answer, and make fill answers short. Return only JSON matching the schema.`

async function generateWithGemini(prompt, schema, temperature = 0.35) {
  const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature } }),
  })
  const payload = await geminiResponse.json()
  if (!geminiResponse.ok) throw new Error(payload?.error?.message || 'Gemini generation failed.')
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('')
  if (!text) throw new Error('Gemini returned an empty response.')
  return JSON.parse(text.replace(/^```json\s*|\s*```$/g, '').trim())
}

function validateQuiz(material, questionCount) {
  if (!Array.isArray(material.quizQuestions) || material.quizQuestions.length !== questionCount) {
    throw new Error(`The quiz generator did not return the requested ${questionCount} questions. Please try again.`)
  }

  for (const [index, question] of material.quizQuestions.entries()) {
    if (!question || typeof question.question !== 'string' || !question.question.trim()) {
      throw new Error(`Quiz question ${index + 1} is empty. Please try again.`)
    }
    if (question.type === 'selection' || question.type === 'checkbox') {
      if (!Array.isArray(question.options)) throw new Error(`Quiz question ${index + 1} has no answer choices. Please try again.`)
      const uniqueOptions = [...new Map(question.options.filter((option) => typeof option === 'string' && option.trim()).map((option) => [option.trim().toLocaleLowerCase(), option.trim()])).values()]
      const answers = Array.isArray(question.answer) ? question.answer : [question.answer]
      if (uniqueOptions.length < 2 || answers.some((answer) => !uniqueOptions.some((option) => option.toLocaleLowerCase() === String(answer).trim().toLocaleLowerCase()))) {
        throw new Error(`Quiz question ${index + 1} has invalid answer choices. Please try again.`)
      }
      question.options = uniqueOptions
    } else if (question.type === 'fill' && (typeof question.answer !== 'string' || !question.answer.trim())) {
      throw new Error(`Quiz question ${index + 1} has no valid answer. Please try again.`)
    }
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' })
  response.end(JSON.stringify(body))
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => resolveBody(body))
    request.on('error', reject)
  })
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') { response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }); response.end(); return }
  if (request.method !== 'POST' || request.url !== '/api/generate') { sendJson(response, 404, { error: 'Not found' }); return }
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.startsWith('your_')) { sendJson(response, 500, { error: 'GEMINI_API_KEY is not configured on the server. Replace the placeholder in .env.' }); return }

  try {
    const requestBody = JSON.parse(await readBody(request))
    const { sourceText, materialType, options = {}, qualityInstructions = '', sourceName = 'Uploaded lesson', sourceId = 'gemini-source' } = requestBody
    if (!sourceText || !materialType) { sendJson(response, 400, { error: 'sourceText and materialType are required.' }); return }
    const now = new Date().toISOString()
    const customStructure = materialType === 'ppt-outline' ? options.customInstructions?.['ppt-outline']?.trim() : ''
    const structureGuidance = customStructure
      ? `\nThe learner provided this custom PowerPoint structure. Use each non-empty line as a slide heading, keep the same order, and fill the slides with relevant source-grounded content:\n${customStructure}\n`
      : ''
    let lessonContent = sourceText
    let quizQuestionCount = 0
    if (materialType === 'quiz') {
      quizQuestionCount = Math.max(1, Math.min(30, Number(options.quizQuestionCount) || 20))
      const learningContext = await generateWithGemini(
        `Act as a careful teacher. Read the uploaded lesson and make a concise, accurate teaching context for quiz writing.
Treat bullet marks, slide fragments, repeated headers, page numbers, and extraction artifacts as formatting noise, not as facts or question text. Combine related fragments into clear concepts and explanations. Identify the topic, what a learner should understand, how key ideas relate, examples present in the source, and likely confusions. Preserve technical terms and relationships. Do not copy long passages or simply turn each bullet into a quiz item. Do not add information absent from the source. When evidence is unclear, omit it rather than guess. Return only the structured context.

LESSON SOURCE:
${sourceText}`,
        quizContextSchema,
        0.2,
      )
      lessonContent = `TEACHING CONTEXT (distilled from the uploaded lesson; use this context, not raw slide text):
${JSON.stringify(learningContext)}`
    }
    const quizGuidance = materialType === 'quiz'
      ? `\nCreate exactly ${quizQuestionCount} questions from the distilled teaching context. Assess understanding, distinctions, relationships, and reasonable applications—not verbatim recall of slide bullets. Use clear, self-contained question wording. For each selection or checkbox question, provide distinct answer choices with exactly one occurrence of each choice and ensure the correct answer exactly matches a choice. Avoid repeating a question or testing the same fact with only a different stem. If the context does not support enough distinct facts, vary question type and test a different relationship or application without inventing content.\n`
      : ''
    const prompt = `${generationRules}\n\nRequested artifact: ${materialType}\nSource name: ${sourceName}\nSource id: ${sourceId}\nOptions: ${JSON.stringify(options)}\n${structureGuidance}${quizGuidance}Additional quality instructions: ${qualityInstructions}\n\n${materialType === 'quiz' ? 'DISTILLED LESSON CONTEXT:' : 'LESSON:'}\n${lessonContent}`
    const material = await generateWithGemini(prompt, responseSchema)
    if (materialType === 'quiz') validateQuiz(material, quizQuestionCount)
    material.id ||= `material-${Date.now()}`; material.sourceId ||= sourceId; material.sourceName ||= sourceName; material.type ||= materialType; material.createdAt ||= now; material.updatedAt ||= now
    sendJson(response, 200, material)
  } catch (error) { sendJson(response, 500, { error: error instanceof Error ? error.message : 'Unexpected generation error.' }) }
})

server.listen(port, () => console.log(`Gemini proxy listening at http://localhost:${port}/api/generate using ${model}`))
