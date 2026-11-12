import type { GlossaryEntry } from '../../storage/settings'

export type TranslateProviderKind = 'mt' | 'ai'

export type TranslateRequest = {
  segments: string[]
  sourceLang: string
  targetLang: string
  context?: string
  glossary?: GlossaryEntry[]
  signal?: AbortSignal
  onDelta?: (delta: string) => void
}

export type TranslateResponse = {
  segments: string[]
  engineLabel: string
  model?: string
  detectedLang?: string
}

export interface TranslateProvider {
  readonly id: string
  readonly label: string
  readonly kind: TranslateProviderKind
  translate(request: TranslateRequest): Promise<TranslateResponse>
}
