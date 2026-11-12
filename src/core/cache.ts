import { readLocal, writeLocal } from '../storage/local'

const STORAGE_KEY = 'cache.v1'
const TTL_MS = 7 * 24 * 60 * 60 * 1000
const MEMORY_LIMIT = 300

export type CacheEntry = {
  text: string
  at: number
  engineLabel: string
}

type CacheBag = Record<string, CacheEntry>

let memory: Map<string, CacheEntry> | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null

async function ensureLoaded(): Promise<Map<string, CacheEntry>> {
  if (memory) return memory
  const stored = await readLocal<CacheBag>(STORAGE_KEY, {})
  memory = new Map(Object.entries(stored))
  return memory
}

export function hashKey(parts: string[]): string {
  let hash = 5381
  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      hash = ((hash * 33) ^ part.charCodeAt(index)) | 0
    }
    hash = ((hash * 33) ^ 0x9e3779b9) | 0
  }
  return `${(hash >>> 0).toString(36)}-${parts.join('|').length.toString(36)}`
}

export function makeCacheKey(input: {
  engineId: string
  sourceLang: string
  targetLang: string
  segments: string[]
  context?: string
}): string {
  return hashKey([
    input.engineId,
    input.sourceLang,
    input.targetLang,
    input.context ?? '',
    input.segments.join('\u0000'),
  ])
}

function scheduleFlush(): void {
  if (flushTimer !== null) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushNow()
  }, 1500)
}

async function flushNow(): Promise<void> {
  if (!memory) return
  const bag: CacheBag = {}
  for (const [key, value] of memory) bag[key] = value
  await writeLocal(STORAGE_KEY, bag)
}

export async function getCached(key: string): Promise<CacheEntry | null> {
  const map = await ensureLoaded()
  const entry = map.get(key)
  if (!entry) return null
  if (Date.now() - entry.at > TTL_MS) {
    map.delete(key)
    scheduleFlush()
    return null
  }
  return entry
}

export async function setCached(key: string, text: string, engineLabel: string): Promise<void> {
  const map = await ensureLoaded()
  map.set(key, { text, at: Date.now(), engineLabel })
  while (map.size > MEMORY_LIMIT) {
    const oldest = map.keys().next()
    if (oldest.done) break
    map.delete(oldest.value)
  }
  scheduleFlush()
}

export async function clearCache(): Promise<void> {
  memory = new Map()
  await writeLocal(STORAGE_KEY, {})
}
