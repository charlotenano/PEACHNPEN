import { z } from 'zod'

import type { MaterialOptions, MaterialRecord, MaterialType, SourceDocument } from '../types'

export const materialRecordSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
  type: z.enum(['reviewer', 'summary', 'flashcards', 'quiz', 'ppt-outline']),
  title: z.string().min(1),
  content: z.string().min(1),
  flashcards: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  quizQuestions: z.array(z.object({ question: z.string(), type: z.enum(['selection', 'checkbox', 'fill']), options: z.array(z.string()).optional(), answer: z.union([z.string(), z.array(z.string())]) })).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archived: z.boolean().optional(),
})

export function generateMaterial(source: SourceDocument, type: MaterialType, options: MaterialOptions): MaterialRecord {
  const text = source.extractedText
  const paragraphs = text
    .split(/\n{2,}|(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)

  const highlight = paragraphs.slice(0, 6).join(' ')
  const lead = capitalizeSentenceStarts(truncateText(highlight, 500))
  const keyPoints = paragraphs.slice(0, Math.min(8, paragraphs.length)).map((entry) => capitalizeSentenceStarts(entry.replace(/\s+/g, ' ')))

  const title = `${source.fileName.replace(/\.[^.]+$/, '')} · ${labelForType(type)}`
  const now = new Date().toISOString()

  let content = ''
  let flashcards: { question: string; answer: string }[] | undefined
  let quizQuestions: { question: string; type: 'selection' | 'checkbox' | 'fill'; options?: string[]; answer: string | string[] }[] | undefined

  switch (type) {
    case 'reviewer': {
      content = [
        '## Reviewer',
        '',
        `**Source:** ${source.fileName}`,
        '',
        '### Big picture',
        `This lesson is mainly about ${summarizeTopic(lead)}.`,
        '',
        '### Core concepts',
        ...keyPoints.map((point, index) => `#### ${index + 1}. Concept to know\n- ${point}`),
        '',
        '### Connections and reasoning',
        ...keyPoints.slice(0, 3).map((point, index) => `- How point ${index + 1} connects: ${point}`),
        '',
        '### Common confusion checks',
        '- What is the difference between the main concept and a similar-looking idea?',
        '- Which claim is directly supported by the source, and which would require outside evidence?',
        '- What assumption would make this explanation incomplete?',
        '',
        '### Retrieval prompts',
        '- Explain the central idea without looking at the lesson.',
        '- Give one concrete example from the source and explain why it matters.',
        '- Compare two important ideas and describe their relationship.',
        '- Apply the lesson to a new but realistic situation.',
        '- What would you challenge, verify, or study again?',
      ].join('\n')
      break
    } case 'summary': {
      content = [
        '## Summary',
        '',
        `**Source:** ${source.fileName}`,
        '',
        '### Thesis',
        `The lesson focuses on ${summarizeTopic(lead)}.`,
        '',
        '### Essential points',
        ...keyPoints.map((point, index) => `${index + 1}. ${point}`),
        '',
        '### How the ideas fit together',
        'The points should be read as a connected argument: identify the central claim, trace the supporting details, then check the limits or assumptions behind the explanation.',
        '',
        '### In one sentence',
        truncateText(lead, 240),
        '',
        '### Study takeaway',
        'Be able to define the key terms, explain the cause-and-effect or evidence, and apply the lesson to a new example.',
      ].join('\n')
      break
    } case 'flashcards': {
      const cards = keyPoints.length ? keyPoints : [lead || 'What is the central idea of this lesson?']
      const stems = [
        'What is the key idea here?',
        'Why does this point matter?',
        'What evidence or detail should you remember?',
        'How would you explain this to a classmate?',
      ]
      flashcards = Array.from({ length: options.quizQuestionCount }, (_, index) => {
        const point = cards[index % cards.length]
        return { question: stems[index % stems.length], answer: point }
      })
      if (options.randomize) flashcards = [...flashcards].sort(() => Math.random() - 0.5)
      content = ['## Flashcards', '', ...flashcards.map((card, index) => `Card ${index + 1}: ${card.question}`)].join('\n\n')
      break
    } case 'quiz': {
      const quizPoints = extractQuizStudyPoints(text, lead)
      quizQuestions = createQuizQuestions(quizPoints, options.quizQuestionCount)
      content = generateQuiz(quizPoints, options.quizQuestionCount)
      break
    } case 'ppt-outline': {
      const requestedSections = options.customInstructions['ppt-outline']
        .split(/\r?\n/)
        .map((section) => section.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
        .filter(Boolean)

      if (requestedSections.length) {
        const sections = requestedSections.flatMap((section, index) => {
          const start = Math.floor(index * keyPoints.length / requestedSections.length)
          const end = Math.floor((index + 1) * keyPoints.length / requestedSections.length)
          const sectionPoints = keyPoints.slice(start, end)
          return [
            `### Slide ${index + 1} — ${capitalizeSentenceStarts(section)}`,
            ...(sectionPoints.length ? sectionPoints.map((point) => `- ${point}`) : [`- ${summarizeTopic(lead)}`]),
            '',
          ]
        })
        content = ['## PowerPoint Outline', '', ...sections].join('\n').trimEnd()
      } else {
        content = [
          '## PowerPoint Outline',
          '',
          '### Slide 1 — Title',
          `Overview of ${source.fileName}`,
          '',
          '### Slide 2 — Core idea',
          summarizeTopic(lead),
          '',
          '### Slide 3 — Supporting points',
          ...keyPoints.slice(0, 3).map((point) => `- ${point}`),
          '',
          '### Slide 4 — Takeaway',
          'Review the key concept, assess the evidence, and identify one question to revisit.',
        ].join('\n')
      }
      break
    }
    default:
      content = 'No material generated.'
  }

  if (options.tone === 'concise') {
    content = content.replace(/\n{3,}/g, '\n\n')
  }

  if (options.detail === 3 && !(type === 'ppt-outline' && options.customInstructions['ppt-outline'].trim())) {
    content = `${content}\n\n### Extra review notes\n- Check wording against the source notes.\n- Make a summary in your own words.\n- Identify one example or question to revisit later.`
  }

  const record: MaterialRecord = {
    id: crypto.randomUUID(),
    sourceId: source.id,
    sourceName: source.fileName,
    type,
    title,
    content,
    flashcards,
    quizQuestions,
    createdAt: now,
    updatedAt: now,
  }

  return materialRecordSchema.parse(record)
}

function labelForType(type: MaterialType): string {
  switch (type) {
    case 'reviewer':
      return 'Reviewer'
    case 'summary':
      return 'Summary'
    case 'flashcards':
      return 'Flashcards'
    case 'quiz':
      return 'Practice Quiz'
    case 'ppt-outline':
      return 'PowerPoint Outline'
    default:
      return 'Study Material'
  }
}

function summarizeTopic(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').replace(/^[^A-Za-z]+/, '').trim()
  if (!normalized) return 'the central theme of the lesson.'

  const segments = normalized.split(/\s+/).slice(0, 16)
  return segments.join(' ') + (segments.length === 16 ? '…' : '')
}

function capitalizeSentenceStarts(text: string): string {
  return text.replace(/(^|[.!?]\s+)([a-z])/gm, (_, boundary: string, letter: string) => boundary + letter.toUpperCase())
}

function extractQuizStudyPoints(text: string, fallback: string): string[] {
  const points = text
    .replace(/[\uFFFD]/g, ' ')
    .replace(/[•●▪◦]/g, '\n')
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((point) => point
      .replace(/^\s*(?:INTRODUCTION TO [^:]+|DEFINITIONS(?:\s*\(CONT\.?\))?)\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((point) => point.length >= 12)
    .filter((point) => !/^(?:objectives?|learning outcomes?)\b|to be acquainted with/i.test(point))
    .filter((point) => !/^\d+$/.test(point))
  const uniquePoints = [...new Map(points.map((point) => [point.toLocaleLowerCase(), capitalizeSentenceStarts(point)])).values()]
  return uniquePoints.length ? uniquePoints : [fallback || 'The lesson’s central idea']
}

function truncateText(value: string, maxLength: number): string {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`
}

function createQuizQuestions(points: string[], questionCount: number) {
  const cleanPoints = points.map((point) => truncateText(point, 190))
  const questions: { question: string; type: 'selection' | 'checkbox' | 'fill'; options?: string[]; answer: string | string[] }[] = []
  const stems = [
    'Which statement best captures the meaning of this idea?',
    'Which conclusion is most strongly supported by the lesson?',
    'Which explanation would be the strongest answer in a discussion?',
    'Which detail should a learner use as evidence for this concept?',
  ]
  const falseOptions = [
    'This claim is not established by the lesson and would need outside evidence.',
    'This reverses the relationship described in the source.',
    'This is an unrelated interpretation that the source does not support.',
  ]
  for (let index = 0; index < questionCount; index += 1) {
    const point = cleanPoints[index % cleanPoints.length]
    const second = cleanPoints.length > 1 ? cleanPoints[(index + 1) % cleanPoints.length] : point
    const words = point.split(/\s+/)
    const kind = index % 3 === 1 ? 'checkbox' : index % 3 === 2 && words.length >= 7 ? 'fill' : 'selection'
    if (kind === 'fill') {
      const blankLength = Math.min(3, Math.max(1, Math.floor(words.length / 4)))
      const blankStart = Math.min(Math.max(1, Math.floor(words.length / 2) - 1), words.length - blankLength - 1)
      const answer = words.slice(blankStart, blankStart + blankLength).join(' ')
      const statement = [...words.slice(0, blankStart), '_____', ...words.slice(blankStart + blankLength)].join(' ')
      questions.push({ question: `Complete the statement: “${statement}”`, type: kind, answer })
    } else if (kind === 'checkbox') {
      questions.push({ question: 'Which ideas are directly supported by the lesson?', type: kind, options: [point, second, ...falseOptions], answer: [point, second] })
    } else {
      const options = [...falseOptions]
      const correctPosition = index % options.length
      options.splice(correctPosition, 0, point)
      questions.push({ question: stems[index % stems.length], type: kind, options, answer: point })
    }
  }
  return questions
}

function generateQuiz(sourcePoints: string[], questionCount: number): string {
  const points = sourcePoints.length ? sourcePoints : ['The lesson’s central idea']
  const questions: string[] = []
  const answerKeys: string[] = []
  const stems = [
    'Which statement best captures the meaning of this idea?',
    'Which conclusion is most strongly supported by the lesson?',
    'Which explanation would be the strongest answer in a discussion?',
    'Which detail should a learner use as evidence for this concept?',
  ]
  const distractorFallbacks = [
    'This claim is not established by the lesson and would need outside evidence.',
    'This reverses the relationship described in the source.',
    'This is an unrelated interpretation that the source does not support.',
  ]
  const labels = ['A', 'B', 'C', 'D']
  for (let index = 0; index < questionCount; index += 1) {
    const correctPoint = truncateText(points[index % points.length], 180)
    const choices = [correctPoint, ...distractorFallbacks]
    const correctPosition = index % choices.length
    const correct = choices.splice(0, 1)[0]
    choices.splice(correctPosition, 0, correct)
    questions.push([
      `### Question ${index + 1}`,
      stems[index % stems.length],
      ...choices.map((choice, choiceIndex) => `${labels[choiceIndex]}. ${choice}`),
    ].join('\\n'))
    answerKeys.push(`${index + 1}. ${labels[correctPosition]}`)
  }
  return ['## Practice Quiz', '', ...questions.flatMap((question) => [question, '']), '### Answer key', ...answerKeys].join('\\n')
}
