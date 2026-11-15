import { parseDictionaryQuery } from '../../dictionary/word'
import type {
  DictionaryDefinition,
  DictionaryEntry,
  DictionaryExample,
  DictionaryForm,
  DictionaryPhonetic,
  DictionaryPhrase,
  DictionaryProvider,
  DictionaryTranslation,
} from '../../dictionary/types'
import { ensureOk, fetchWithTimeout } from '../http'

const ENDPOINT = 'https://dict.youdao.com/jsonapi'
const AUDIO_ENDPOINT = 'https://dict.youdao.com/dictvoice'
const MAX_TRANSLATIONS = 8
const MAX_DEFINITIONS = 8
const MAX_EXAMPLES = 3
const MAX_PHRASES = 6

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

function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, '')
}

function readInnerText(node: unknown): string {
  const record = asRecord(node)
  if (!record) return ''
  const inner = record.i
  if (typeof inner === 'string') return inner.trim()
  if (Array.isArray(inner)) {
    return inner
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .join('；')
  }
  return ''
}

function readReturnPhrase(value: unknown): string {
  if (typeof value === 'string') return value
  const inner = asRecord(asRecord(value)?.l)
  return asString(inner?.i)
}

function splitPos(line: string): DictionaryTranslation {
  const bracket = /^【([^】]{1,10})】\s*([\s\S]*)$/.exec(line)
  if (bracket) return { pos: `【${bracket[1] ?? ''}】`, text: (bracket[2] ?? '').trim() }
  const dot = /^([A-Za-z]{1,6}\.)\s*([\s\S]*)$/.exec(line)
  if (dot) return { pos: dot[1] ?? '', text: (dot[2] ?? '').trim() }
  return { pos: '', text: line.trim() }
}

function readExam(tr: Loose): string {
  const exam = asRecord(tr.exam)
  const inner = asRecord(exam?.i)
  const holder = asRecord(inner?.f)
  for (const item of asArray(holder?.l)) {
    const text = asString(asRecord(item)?.i)
    if (text) return stripTags(text).trim()
  }
  return ''
}

function readNodeText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((item) => readNodeText(item)).join('')
  const record = asRecord(value)
  return record ? asString(record['#text']) : ''
}

function readChineseTranslations(raw: Loose): DictionaryTranslation[] {
  const ce = asRecord(raw.ce)
  const translations: DictionaryTranslation[] = []
  for (const wordItem of asArray(ce?.word)) {
    for (const group of asArray(asRecord(wordItem)?.trs)) {
      for (const item of asArray(asRecord(group)?.tr)) {
        const inner = asRecord(asRecord(item)?.l)
        if (!inner) continue
        const text = readNodeText(inner.i).replace(/\s+/g, ' ').trim()
        if (!text) continue
        translations.push({ pos: asString(inner.pos), text })
      }
    }
  }
  return translations.slice(0, MAX_TRANSLATIONS)
}

function readChinesePhonetics(raw: Loose, word: string): DictionaryPhonetic[] {
  const ceWord = asRecord(asArray(asRecord(raw.ce)?.word)[0])
  const simple = asRecord(asArray(asRecord(raw.simple)?.word)[0])
  const ceNew = asRecord(asArray(asRecord(raw.ce_new)?.word)[0])
  const pinyin =
    asString(ceWord?.phone).trim() || asString(simple?.phone).trim() || asString(ceNew?.phone).trim()
  if (!pinyin) return []
  return [{ label: '拼音', text: pinyin, audio: audioUrl(word, 'uk') }]
}

function readEcWord(raw: Loose): Loose | null {
  return asRecord(asArray(asRecord(raw.ec)?.word)[0])
}

function readPhonetics(raw: Loose, word: string): DictionaryPhonetic[] {
  const simple = asRecord(asArray(asRecord(raw.simple)?.word)[0])
  const ecWord = readEcWord(raw)
  const cleanPhone = (value: unknown): string => asString(value).replace(/^\[|\]$/g, '').trim()
  const uk = cleanPhone(simple?.ukphone) || cleanPhone(ecWord?.ukphone)
  const us = cleanPhone(simple?.usphone) || cleanPhone(ecWord?.usphone)
  const phonetics: DictionaryPhonetic[] = []
  if (uk) phonetics.push({ label: '英', text: uk, audio: audioUrl(word, 'uk') })
  if (us) phonetics.push({ label: '美', text: us, audio: audioUrl(word, 'us') })
  return phonetics
}

function readTranslations(raw: Loose): DictionaryTranslation[] {
  const ecWord = readEcWord(raw)
  const translations: DictionaryTranslation[] = []
  for (const group of asArray(ecWord?.trs)) {
    for (const item of asArray(asRecord(group)?.tr)) {
      const line = readInnerText(asRecord(item)?.l)
      if (!line) continue
      const parsed = splitPos(line)
      if (parsed.text) translations.push(parsed)
    }
  }
  return translations.slice(0, MAX_TRANSLATIONS)
}

function readDefinitions(raw: Loose): DictionaryDefinition[] {
  const ee = asRecord(raw.ee)
  const word = asRecord(ee?.word)
  const definitions: DictionaryDefinition[] = []
  for (const group of asArray(word?.trs)) {
    const pos = asString(asRecord(group)?.pos)
    for (const item of asArray(asRecord(group)?.tr)) {
      const record = asRecord(item)
      if (!record) continue
      const text = stripTags(readInnerText(record.l)).trim()
      if (!text) continue
      definitions.push({ pos, text, example: readExam(record) })
    }
  }
  return definitions.slice(0, MAX_DEFINITIONS)
}

function readCollinsExample(entry: Loose): string {
  for (const item of asArray(entry.examples)) {
    const example = asString(asRecord(item)?.example).trim()
    if (example) return example
  }
  return ''
}

function readCollinsDefinitions(raw: Loose): DictionaryDefinition[] {
  const primary = asRecord(raw.collins_primary)
  const definitions: DictionaryDefinition[] = []
  for (const group of asArray(primary?.gramcat)) {
    const record = asRecord(group)
    if (!record) continue
    const pos = asString(record.partofspeech)
    for (const sense of asArray(record.senses)) {
      const entry = asRecord(sense)
      if (!entry) continue
      const text = stripTags(asString(entry.definition)).trim()
      if (!text) continue
      definitions.push({ pos, text, example: readCollinsExample(entry) })
    }
  }
  return definitions.slice(0, MAX_DEFINITIONS)
}

function readForms(raw: Loose): DictionaryForm[] {
  const ecWord = readEcWord(raw)
  const forms: DictionaryForm[] = []
  for (const item of asArray(ecWord?.wfs)) {
    const form = asRecord(asRecord(item)?.wf)
    const name = asString(form?.name)
    const value = asString(form?.value)
    if (name && value) forms.push({ name, value })
  }
  return forms
}

function readExamples(raw: Loose): DictionaryExample[] {
  const part = asRecord(raw.blng_sents_part)
  const examples: DictionaryExample[] = []
  for (const pair of asArray(part?.['sentence-pair'])) {
    const record = asRecord(pair)
    const source = stripTags(asString(record?.sentence)).trim()
    const target = asString(record?.['sentence-translation']).trim()
    if (!source) continue
    examples.push({ source, target })
  }
  return examples.slice(0, MAX_EXAMPLES)
}

function readPhrases(raw: Loose): DictionaryPhrase[] {
  const container = asRecord(raw.phrs)
  const phrases: DictionaryPhrase[] = []
  for (const item of asArray(container?.phrs)) {
    const phr = asRecord(asRecord(item)?.phr)
    if (!phr) continue
    const phrase = readReturnPhrase(phr.headword).trim()
    const meanings: string[] = []
    for (const trs of asArray(phr.trs)) {
      const text = readInnerText(asRecord(asRecord(trs)?.tr)?.l).trim()
      if (text) meanings.push(text)
    }
    if (!phrase || meanings.length === 0) continue
    phrases.push({ phrase, meaning: meanings.join('；') })
  }
  return phrases.slice(0, MAX_PHRASES)
}

export function audioUrl(word: string, accent: 'uk' | 'us'): string {
  return `${AUDIO_ENDPOINT}?audio=${encodeURIComponent(word)}&type=${accent === 'uk' ? 1 : 2}`
}

function parseChineseEntry(root: Loose, query: string): DictionaryEntry | null {
  const ceWord = asRecord(asArray(asRecord(root.ce)?.word)[0])
  if (!ceWord) return null
  const translations = readChineseTranslations(root)
  if (translations.length === 0) return null
  const simple = asRecord(asArray(asRecord(root.simple)?.word)[0])
  const word = readReturnPhrase(ceWord['return-phrase']).trim() || asString(simple?.query).trim() || query
  return {
    word,
    direction: 'zh-en',
    phonetics: readChinesePhonetics(root, word),
    translations,
    definitions: [],
    forms: [],
    examples: readExamples(root),
    phrases: [],
  }
}

export function parseYoudao(raw: unknown, query: string): DictionaryEntry | null {
  const root = asRecord(raw)
  if (!root) return null
  const queryInfo = parseDictionaryQuery(query)
  if (queryInfo?.direction === 'zh-en') return parseChineseEntry(root, queryInfo.word)
  const simple = asRecord(root.simple)
  const ecWord = readEcWord(root)
  const word = asString(simple?.query).trim() || readReturnPhrase(ecWord?.['return-phrase']).trim() || query
  const translations = readTranslations(root)
  const collins = readCollinsDefinitions(root)
  const definitions = collins.length > 0 ? collins : readDefinitions(root)
  if (translations.length === 0 && definitions.length === 0) return null
  return {
    word,
    direction: 'en-zh',
    phonetics: readPhonetics(root, word),
    translations,
    definitions,
    forms: readForms(root),
    examples: readExamples(root),
    phrases: readPhrases(root),
  }
}

export function createYoudaoDictionary(): DictionaryProvider {
  return {
    id: 'youdao',
    label: '有道词典',
    capabilities: {
      phonetic: true,
      translation: true,
      definition: true,
      forms: true,
      examples: true,
      phrases: true,
    },
    supportsChinese: true,
    async lookup(word: string, signal?: AbortSignal): Promise<DictionaryEntry | null> {
      const response = await fetchWithTimeout(
        `${ENDPOINT}?q=${encodeURIComponent(word)}`,
        { method: 'GET' },
        signal,
      )
      await ensureOk(response)
      const raw: unknown = await response.json()
      return parseYoudao(raw, word)
    },
  }
}
