import type { TemplateDefinition } from '../types'

export const templates: TemplateDefinition[] = [
  {
    id: 'reviewer',
    label: 'Reviewer',
    description: 'A focused study review with key ideas, gaps, and prompts.',
    accent: 'peach',
  },
  {
    id: 'summary',
    label: 'Summary',
    description: 'A clear, foundational recap of the lesson in plain language.',
    accent: 'sage',
  },
  {
    id: 'flashcards',
    label: 'Flashcards',
    description: 'Question-and-answer recall cards from the source material.',
    accent: 'rose',
  },
  {
    id: 'quiz',
    label: 'Practice Quiz',
    description: 'Quick checks that test understanding without guessing.',
    accent: 'lavender',
  },
  {
    id: 'ppt-outline',
    label: 'PowerPoint Outline',
    description: 'A slide-ready structure with sections and talking points.',
    accent: 'gold',
  },
]
