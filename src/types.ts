export type MaterialType = 'reviewer' | 'summary' | 'flashcards' | 'quiz' | 'ppt-outline'

export type Tone = 'supportive' | 'balanced' | 'concise'

export interface SourceDocument {
  id: string
  fileName: string
  kind: 'text' | 'markdown' | 'docx' | 'pdf'
  sizeBytes: number
  uploadedAt: string
  extractedText: string
  warnings: string[]
}

export interface MaterialOptions {
  tone: Tone
  detail: number
  quizQuestionCount: number
  randomize: boolean
  saveToLibrary: boolean
  customInstructions: Record<MaterialType, string>
}

export interface Flashcard {
  question: string
  answer: string
}

export interface QuizQuestion {
  question: string
  type: 'selection' | 'checkbox' | 'fill'
  options?: string[]
  answer: string | string[]
}

export interface MaterialRecord {
  id: string
  sourceId: string
  sourceName: string
  type: MaterialType
  title: string
  content: string
  flashcards?: Flashcard[]
  quizQuestions?: QuizQuestion[]
  createdAt: string
  updatedAt: string
  archived?: boolean
}

export interface Account {
  username: string
  password: string
  createdAt: string
}

export type ProfileIcon = 'peach' | 'apple' | 'strawberry' | 'kiwi' | 'banana'

export interface TemplateDefinition {
  id: MaterialType
  label: string
  description: string
  accent: string
}
