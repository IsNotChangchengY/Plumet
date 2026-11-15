import { AppError } from '../errors'
import { createDictionaryProvider } from '../providers/dict/registry'
import { dictionaryServiceSupportsChinese } from '../providers/dict/services'
import { parseDictionaryQuery } from './word'
import type { DictionaryLookupResult } from './types'
import type { DictionaryServiceId } from '../../storage/settings'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_LIMIT = 200

const cache = new Map<string, { at: number; result: DictionaryLookupResult }>()

function remember(key: string, result: DictionaryLookupResult): void {
  cache.set(key, { at: Date.now(), result })
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    cache.delete(oldest.value)
  }
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
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { ...cached.result, cached: true }
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
  if (entry) remember(key, result)
  return result
}

export function clearDictionaryCache(): void {
  cache.clear()
}
