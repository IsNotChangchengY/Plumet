import { readLocal, writeLocal } from '../storage/local'

const MAIN_STORAGE_KEY = 'cache.v1'
const SEGMENT_STORAGE_KEY = 'cache.segments.v1'
const TTL_MS = 7 * 24 * 60 * 60 * 1000
const FLUSH_MS = 1500
export const CACHE_LIMIT = 1000
export const SEGMENT_CACHE_LIMIT = 3000

const ZERO_WIDTH = /[\u200b-\u200d\u2060\ufeff]/g
const WIDE_SPACES = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g

export function canonicalSegment(text: string): string {
  return text
    .normalize('NFC')
    .replace(ZERO_WIDTH, '')
    .replace(WIDE_SPACES, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

export type CacheEntry = {
  text: string
  at: number
  engineLabel: string
}

type CacheBag = Record<string, CacheEntry>

type CacheStore = {
  storageKey: string
  limit: number
  memory: Map<string, CacheEntry> | null
  loading: Promise<Map<string, CacheEntry>> | null
  timer: ReturnType<typeof setTimeout> | null
}

function createStore(storageKey: string, limit: number): CacheStore {
  return { storageKey, limit, memory: null, loading: null, timer: null }
}

const mainStore = createStore(MAIN_STORAGE_KEY, CACHE_LIMIT)
const segmentStore = createStore(SEGMENT_STORAGE_KEY, SEGMENT_CACHE_LIMIT)

function normalizeEntry(value: unknown): CacheEntry | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Partial<CacheEntry>
  if (typeof entry.text !== 'string' || typeof entry.at !== 'number') return null
  return {
    text: entry.text,
    at: entry.at,
    engineLabel: typeof entry.engineLabel === 'string' ? entry.engineLabel : '',
  }
}

function normalizeBag(stored: unknown): Map<string, CacheEntry> {
  const map = new Map<string, CacheEntry>()
  if (!stored || typeof stored !== 'object') return map
  const now = Date.now()
  for (const [key, value] of Object.entries(stored as CacheBag)) {
    const entry = normalizeEntry(value)
    if (!entry) continue
    if (now - entry.at > TTL_MS) continue
    map.set(key, entry)
  }
  return map
}

async function ensureLoaded(store: CacheStore): Promise<Map<string, CacheEntry>> {
  if (store.memory) return store.memory
  const pending = store.loading
  if (pending) return pending
  const created = readLocal<CacheBag>(store.storageKey, {}).then((stored) => {
    const map = store.memory ?? normalizeBag(stored)
    store.memory = map
    store.loading = null
    return map
  })
  store.loading = created
  return created
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
  revision?: string
}): string {
  return hashKey([
    input.engineId,
    input.revision ?? '',
    input.sourceLang,
    input.targetLang,
    input.context ? canonicalSegment(input.context) : '',
    input.segments.map(canonicalSegment).join('\u0000'),
  ])
}

export function makeSegmentCacheKey(input: {
  engineId: string
  sourceLang: string
  targetLang: string
  segment: string
  revision?: string
}): string {
  return hashKey([
    input.engineId,
    input.revision ?? '',
    input.sourceLang,
    input.targetLang,
    canonicalSegment(input.segment),
  ])
}

function scheduleFlush(store: CacheStore): void {
  if (store.timer !== null) return
  store.timer = setTimeout(() => {
    store.timer = null
    void flush(store)
  }, FLUSH_MS)
}

async function flush(store: CacheStore): Promise<void> {
  const map = store.memory
  if (!map) return
  const bag: CacheBag = {}
  for (const [key, value] of map) bag[key] = value
  await writeLocal(store.storageKey, bag)
}

async function readEntry(store: CacheStore, key: string): Promise<CacheEntry | null> {
  const map = await ensureLoaded(store)
  const entry = map.get(key)
  if (!entry) return null
  const now = Date.now()
  if (now - entry.at > TTL_MS) {
    map.delete(key)
    scheduleFlush(store)
    return null
  }
  const refreshed: CacheEntry = { text: entry.text, at: now, engineLabel: entry.engineLabel }
  map.delete(key)
  map.set(key, refreshed)
  scheduleFlush(store)
  return refreshed
}

async function writeEntry(store: CacheStore, key: string, text: string, engineLabel: string): Promise<void> {
  const map = await ensureLoaded(store)
  map.delete(key)
  map.set(key, { text, at: Date.now(), engineLabel })
  while (map.size > store.limit) {
    const oldest = map.keys().next()
    if (oldest.done) break
    map.delete(oldest.value)
  }
  scheduleFlush(store)
}

export async function getCached(key: string): Promise<CacheEntry | null> {
  return readEntry(mainStore, key)
}

export async function setCached(key: string, text: string, engineLabel: string): Promise<void> {
  return writeEntry(mainStore, key, text, engineLabel)
}

export async function getCachedSegment(key: string): Promise<CacheEntry | null> {
  return readEntry(segmentStore, key)
}

export async function setCachedSegment(key: string, text: string, engineLabel: string): Promise<void> {
  return writeEntry(segmentStore, key, text, engineLabel)
}

async function dropEntry(store: CacheStore, key: string): Promise<void> {
  const map = await ensureLoaded(store)
  if (!map.delete(key)) return
  scheduleFlush(store)
}

export async function dropCached(key: string): Promise<void> {
  return dropEntry(mainStore, key)
}

export async function dropCachedSegment(key: string): Promise<void> {
  return dropEntry(segmentStore, key)
}

export async function clearCache(): Promise<void> {
  mainStore.memory = new Map()
  segmentStore.memory = new Map()
  await Promise.all([writeLocal(MAIN_STORAGE_KEY, {}), writeLocal(SEGMENT_STORAGE_KEY, {})])
}
