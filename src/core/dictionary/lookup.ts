import { AppError } from '../errors'
import { createDictionaryProvider } from '../providers/dict/registry'
import { dictionaryServiceSupportsChinese } from '../providers/dict/services'
import { readLocal, writeLocal } from '../../storage/local'
import { parseDictionaryQuery } from './word'
import type { DictionaryLookupResult } from './types'
import type { DictionaryServiceId } from '../../storage/settings'

const STORAGE_KEY = 'dict.v1'
const STORAGE_VERSION = 1
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_LIMIT = 200
const FLUSH_MS = 1500

type DictionaryCacheEntry = { at: number; result: DictionaryLookupResult }
type DictionaryCacheBag = { version: number; entries: Record<string, DictionaryCacheEntry> }

let memory: Map<string, DictionaryCacheEntry> | null = null
let loading: Promise<Map<string, DictionaryCacheEntry>> | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null
let generation = 0

function normalizeBag(stored: unknown): Map<string, DictionaryCacheEntry> {
  const map = new Map<string, DictionaryCacheEntry>()
  if (!stored || typeof stored !== 'object') return map
  const bag = stored as Partial<DictionaryCacheBag>
  if (bag.version !== STORAGE_VERSION || !bag.entries || typeof bag.entries !== 'object') return map
  const now = Date.now()
  for (const [key, value] of Object.entries(bag.entries)) {
    if (!value || typeof value.at !== 'number' || !value.result) continue
    if (now - value.at > CACHE_TTL_MS) continue
    map.set(key, value)
  }
  return map
}

async function ensureLoaded(): Promise<Map<string, DictionaryCacheEntry>> {
  if (memory) return memory
  const pending = loading
  if (pending) return pending
  const started = generation
  const created = readLocal<DictionaryCacheBag>(STORAGE_KEY, {
    version: STORAGE_VERSION,
    entries: {},
  }).then((stored) => {
    const target = started === generation && !memory ? normalizeBag(stored) : (memory ?? new Map())
    if (started === generation) {
      memory = target
      loading = null
    }
    return target
  })
  loading = created
  return created
}

function scheduleFlush(): void {
  if (flushTimer !== null) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushNow()
  }, FLUSH_MS)
}

async function flushNow(): Promise<void> {
  const map = memory
  if (!map) return
  const entries: Record<string, DictionaryCacheEntry> = {}
  for (const [key, value] of map) entries[key] = value
  await writeLocal(STORAGE_KEY, { version: STORAGE_VERSION, entries })
}

export async function lookupWord(input: {
  word: string
  service: DictionaryServiceId
  signal?: AbortSignal
}): Promise<DictionaryLookupResult> {
  const query = parseDictionaryQuery(input.word)
  if (!query) throw new AppError('config', '词典只查单个词')
  if (query.direction === 'zh-en' && !dictionaryServiceSupportsChinese(input.service)) {
    throw new AppError('config', '这个词典服务不支持中文查词')
  }
  const word = query.word
  const key = `${input.service}:${word.toLowerCase()}`
  const map = await ensureLoaded()
  const cached = map.get(key)
  if (cached) {
    map.delete(key)
    if (Date.now() - cached.at < CACHE_TTL_MS) {
      map.set(key, { at: Date.now(), result: cached.result })
      scheduleFlush()
      return { ...cached.result, cached: true }
    }
    scheduleFlush()
  }

  const started = Date.now()
  const provider = createDictionaryProvider(input.service)
  const entry = await provider.lookup(word, input.signal)
  const result: DictionaryLookupResult = {
    entry,
    engineLabel: provider.label,
    elapsedMs: Date.now() - started,
    cached: false,
  }
  if (entry) {
    map.delete(key)
    map.set(key, { at: Date.now(), result })
    while (map.size > CACHE_LIMIT) {
      const oldest = map.keys().next()
      if (oldest.done) break
      map.delete(oldest.value)
    }
    scheduleFlush()
  }
  return result
}

export function clearDictionaryCache(): void {
  generation += 1
  memory = new Map()
  loading = null
  void writeLocal(STORAGE_KEY, { version: STORAGE_VERSION, entries: {} })
}
