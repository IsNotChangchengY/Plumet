import type { DictionarySections, DictionaryServiceId } from '../../storage/settings'
import type { DictionaryDirection } from './word'

export type DictionaryPhonetic = {
  label: string
  text: string
  audio: string
}

export type DictionaryTranslation = {
  pos: string
  text: string
}

export type DictionaryDefinition = {
  pos: string
  text: string
  example: string
}

export type DictionaryForm = {
  name: string
  value: string
}

export type DictionaryExample = {
  source: string
  target: string
}

export type DictionaryPhrase = {
  phrase: string
  meaning: string
}

export type DictionaryEntry = {
  word: string
  direction: DictionaryDirection
  phonetics: DictionaryPhonetic[]
  translations: DictionaryTranslation[]
  definitions: DictionaryDefinition[]
  forms: DictionaryForm[]
  examples: DictionaryExample[]
  phrases: DictionaryPhrase[]
}

export type DictionaryCapabilities = DictionarySections

export type DictionaryLookupResult = {
  entry: DictionaryEntry | null
  engineLabel: string
  elapsedMs: number
  cached: boolean
}

export interface DictionaryProvider {
  readonly id: DictionaryServiceId
  readonly label: string
  readonly capabilities: DictionaryCapabilities
  readonly supportsChinese: boolean
  lookup(word: string, signal?: AbortSignal): Promise<DictionaryEntry | null>
}
