import type { MaterialOptions, MaterialRecord, MaterialType, SourceDocument } from '../types'
import { generateMaterial } from './materialService'

// Point this at a secure server-side proxy for Gemini 2.5 Flash. Never ship an API key in the client.
export async function generateMaterialWithApi(source: SourceDocument, type: MaterialType, options: MaterialOptions): Promise<MaterialRecord> {
  const endpoint = import.meta.env.VITE_AI_API_URL as string | undefined
  if (!endpoint) return generateMaterial(source, type, options)
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceText: source.extractedText, materialType: type, options, qualityInstructions: 'Act as an expert educator and assessment designer. Stay strictly grounded in the supplied source. Build a coherent, high-signal learning artifact: prioritize concepts, definitions, relationships, evidence, trade-offs, applications, and misconceptions over surface-level sentence copying. For quizzes, use varied higher-order stems, plausible source-grounded distractors, one unambiguous answer, and explain why the answer is correct. For reviewers, synthesize and organize the material with examples and retrieval prompts. Never invent facts, citations, or details absent from the source.' }) })
  if (!response.ok) throw new Error('The AI generation service is unavailable.')
  return await response.json() as MaterialRecord
}
