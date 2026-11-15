import type {
  DictionaryDefinition,
  DictionaryEntry,
  DictionaryExample,
  DictionaryPhonetic,
  DictionaryProvider,
} from '../../dictionary/types'
import { ensureOk, fetchWithTimeout } from '../http'

const ENDPOINT = 'https://api.dictionaryapi.dev/api/v2/entries/en'
const MAX_PHONETICS = 3
const MAX_DEFINITIONS = 10
const MAX_EXAMPLES = 3

type Loose = Record<string, unknown>

function asRecord(value: unknown): Loose | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Loose) : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function parseFreeDictionary(raw: unknown, query: string): DictionaryEntry | null {
  const entries = asArray(raw).map(asRecord).filter((entry): entry is Loose => entry !== null)
  if (entries.length === 0) return null

  const phonetics: DictionaryPhonetic[] = []
  const phoneticIndex = new Map<string, number>()
  const pushPhonetic = (text: string, audio: string): void => {
    const clean = text.trim()
    if (!clean && !audio) return
    const key = clean || audio
    const existing = phoneticIndex.get(key)
    if (existing !== undefined) {
      const current = phonetics[existing]
      if (current && !current.audio && audio) phonetics[existing] = { ...current, audio }
      return
    }
    phoneticIndex.set(key, phonetics.length)
    phonetics.push({ label: '', text: clean, audio })
  }

  const definitions: DictionaryDefinition[] = []
  const examples: DictionaryExample[] = []

  for (const entry of entries) {
    pushPhonetic(asString(entry.phonetic), '')
    for (const item of asArray(entry.phonetics)) {
      const phonetic = asRecord(item)
      pushPhonetic(asString(phonetic?.text), asString(phonetic?.audio))
    }
    for (const meaning of asArray(entry.meanings)) {
      const record = asRecord(meaning)
      if (!record) continue
      const pos = asString(record.partOfSpeech)
      for (const item of asArray(record.definitions)) {
        const definition = asRecord(item)
        const text = asString(definition?.definition).trim()
        if (!text) continue
        if (definitions.length < MAX_DEFINITIONS) {
          definitions.push({ pos, text, example: '' })
        }
        const example = asString(definition?.example).trim()
        if (example && examples.length < MAX_EXAMPLES) examples.push({ source: example, target: '' })
      }
    }
  }

  if (definitions.length === 0) return null
  const head = entries[0]
  return {
    word: asString(head?.word).trim() || query,
    direction: 'en-zh',
    phonetics: phonetics.slice(0, MAX_PHONETICS),
    translations: [],
    definitions,
    forms: [],
    examples,
    phrases: [],
  }
}

export function createFreeDictionary(): DictionaryProvider {
  return {
    id: 'freedict',
    label: '免费英英词典',
    capabilities: {
      phonetic: true,
      translation: false,
      definition: true,
      forms: false,
      examples: true,
      phrases: false,
    },
    supportsChinese: false,
    async lookup(word: string, signal?: AbortSignal): Promise<DictionaryEntry | null> {
      const response = await fetchWithTimeout(
        `${ENDPOINT}/${encodeURIComponent(word)}`,
        { method: 'GET' },
        signal,
      )
      if (response.status === 404) return null
      await ensureOk(response)
      const raw: unknown = await response.json()
      return parseFreeDictionary(raw, word)
    },
  }
}
