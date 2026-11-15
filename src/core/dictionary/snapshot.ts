import type { DictionaryDirection } from './word'
import type { DictionaryEntry } from './types'

const MAX = {
  word: 80,
  label: 16,
  phonetic: 80,
  audio: 300,
  pos: 24,
  translation: 240,
  definition: 240,
  example: 240,
  formName: 40,
  formValue: 120,
  phrase: 120,
  phraseMeaning: 240,
}

const LIMIT = {
  phonetics: 2,
  translations: 8,
  definitions: 3,
  forms: 8,
  examples: 2,
  phrases: 6,
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? clip(value, max) : ''
}

function objects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
}

function guessDirection(word: string): DictionaryDirection {
  return word && !/[A-Za-z]/.test(word) ? 'zh-en' : 'en-zh'
}

function collect(raw: unknown): DictionaryEntry {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const word = text(source.word, MAX.word).trim()
  return {
    word,
    direction:
      source.direction === 'zh-en' || source.direction === 'en-zh' ? source.direction : guessDirection(word),
    phonetics: objects(source.phonetics)
      .map((item) => ({
        label: text(item.label, MAX.label).trim(),
        text: text(item.text, MAX.phonetic).trim(),
        audio: text(item.audio, MAX.audio),
      }))
      .filter((item) => item.text || item.audio)
      .slice(0, LIMIT.phonetics),
    translations: objects(source.translations)
      .map((item) => ({ pos: text(item.pos, MAX.pos).trim(), text: text(item.text, MAX.translation).trim() }))
      .filter((item) => item.text)
      .slice(0, LIMIT.translations),
    definitions: objects(source.definitions)
      .map((item) => ({
        pos: text(item.pos, MAX.pos).trim(),
        text: text(item.text, MAX.definition).trim(),
        example: text(item.example, MAX.example).trim(),
      }))
      .filter((item) => item.text)
      .slice(0, LIMIT.definitions),
    forms: objects(source.forms)
      .map((item) => ({ name: text(item.name, MAX.formName).trim(), value: text(item.value, MAX.formValue).trim() }))
      .filter((item) => item.name && item.value)
      .slice(0, LIMIT.forms),
    examples: objects(source.examples)
      .map((item) => ({ source: text(item.source, MAX.example).trim(), target: text(item.target, MAX.example).trim() }))
      .filter((item) => item.source)
      .slice(0, LIMIT.examples),
    phrases: objects(source.phrases)
      .map((item) => ({
        phrase: text(item.phrase, MAX.phrase).trim(),
        meaning: text(item.meaning, MAX.phraseMeaning).trim(),
      }))
      .filter((item) => item.phrase)
      .slice(0, LIMIT.phrases),
  }
}

export function snapshotEntry(entry: DictionaryEntry): DictionaryEntry {
  return collect(entry)
}

export function normalizeEntrySnapshot(raw: unknown): DictionaryEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = collect(raw)
  if (entry.translations.length === 0 && entry.definitions.length === 0) return null
  return entry
}
