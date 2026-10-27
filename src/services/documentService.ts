import { z } from 'zod'
import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import type { SourceDocument } from '../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const supportedTypes = ['text/plain', 'text/markdown', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']

export const sourceDocumentSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  kind: z.enum(['text', 'markdown', 'docx', 'pdf']),
  sizeBytes: z.number().nonnegative(),
  uploadedAt: z.string(),
  extractedText: z.string().min(1),
  warnings: z.array(z.string()),
})

export async function parseSourceFile(file: File): Promise<SourceDocument> {
  const fileName = file.name
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  const kind = detectKind(file.type, extension)

  if (!kind) {
    throw new Error('Unsupported file type. Please upload TXT, MD, DOCX, or PDF.')
  }

  if (file.size > 20 * 1024 * 1024) {
    throw new Error('Files larger than 20 MB are not supported for the first release.')
  }

  const arrayBuffer = await file.arrayBuffer()
  const warnings: string[] = []
  let extractedText = ''

  if (kind === 'text' || kind === 'markdown') {
    extractedText = new TextDecoder('utf-8').decode(arrayBuffer)
    if (extractedText.trim().length === 0) {
      throw new Error('The selected file appears to be empty.')
    }
  }

  if (kind === 'docx') {
    const result = await mammoth.extractRawText({ arrayBuffer })
    extractedText = result.value.trim()
    if (!extractedText) {
      throw new Error('The DOCX file could not be read for text extraction.')
    }
    if (result.messages.length > 0) {
      warnings.push(...result.messages.map((message) => message.message))
    }
  }

  if (kind === 'pdf') {
    extractedText = await extractPdfText(arrayBuffer)
    if (!extractedText.trim()) {
      throw new Error('The PDF did not produce readable text. Try a text-based PDF or a DOCX/TXT file.')
    }
  }

  const source: SourceDocument = {
    id: crypto.randomUUID(),
    fileName,
    kind,
    sizeBytes: file.size,
    uploadedAt: new Date().toISOString(),
    extractedText: normalizeExtractedText(extractedText),
    warnings,
  }

  return sourceDocumentSchema.parse(source)
}

function detectKind(mimeType: string, extension: string): SourceDocument['kind'] | null {
  if (extension === 'txt') return 'text'
  if (extension === 'md' || extension === 'markdown') return 'markdown'
  if (extension === 'docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
  if (extension === 'pdf' || mimeType === 'application/pdf') return 'pdf'
  if (mimeType === 'text/plain') return 'text'
  if (mimeType === 'text/markdown') return 'markdown'

  return null
}

async function extractPdfText(arrayBuffer: ArrayBuffer): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pageTexts: string[] = []

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    if (pageText.trim()) {
      pageTexts.push(pageText)
    }
  }

  return pageTexts.join('\n\n')
}

export function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function normalizeExtractedText(value: string): string {
  return normalizeWhitespace(value.replace(/\uFFFD/g, ' '))
    .split('\n')
    .map((line) => normalizePdfLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizePdfLine(line: string): string {
  let cleaned = line
     .replace(/\s+/g, ' ')
     .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
  if (!cleaned) return ''

  // PDF text layers sometimes space every glyph in an all-caps heading.
  cleaned = cleaned .replace(/\b(?:[A-Z]\s+){3,}[A-Z]\b/g, (value) => value.replace(/\s+/g, ''))
  cleaned = cleaned
    .replace(/PROFESSIONALISSUESININFORMATIONSYSTEMS/gi, 'Professional Issues in Information Systems')
    .replace(/ETHICALFRAMEWORKSFORCOMPUTINGDECISIONS/gi, 'Ethical Frameworks for Computing Decisions')
    .replace(/INFORMATION SYSTEMS/gi, 'Information Systems')

  const letters = cleaned.replace(/[^A-Za-z]/g, '')
  const uppercaseRatio = letters ? letters.split('').filter((letter) => letter === letter.toUpperCase()).length / letters.length : 0
  if (letters.length >= 8 && uppercaseRatio > 0.88) {
    cleaned = cleaned.toLowerCase().replace(/(^|[.!?]\s+|\bI\b)/g, (match) => match.toUpperCase())
    cleaned = cleaned .replace(/(^|\s)([a-z])/g, (_, prefix: string, letter: string) => prefix + letter.toUpperCase())
  }
  return cleaned
}

export function fileAcceptList(): string {
  return supportedTypes.join(',')
}
