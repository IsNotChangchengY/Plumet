import { AppError, isAbortError, toAppError } from './errors'
import {
  canonicalSegment,
  dropCached,
  dropCachedSegment,
  getCached,
  getCachedSegment,
  makeCacheKey,
  makeSegmentCacheKey,
  setCached,
  setCachedSegment,
} from './cache'
import {
  fromPlaceholderMarkup,
  hasInlineMarkers,
  inlineMarkupIntact,
  toPlaceholderMarkup,
} from './inline-markup'
import { resolveEngine } from './providers/registry'
import { PROMPT_VERSION } from './providers/ai/prompts'
import type { TranslateProvider, TranslateRequest } from './providers/types'
import type { Settings } from '../storage/settings'

const PLACEHOLDER_PREFIX = 'mt:'

function engineRevision(engineId: string, settings: Settings): string {
  if (!engineId.startsWith('ai:')) return '2'
  const provider = settings.aiProviders.find((item) => `ai:${item.id}` === engineId)
  return `${PROMPT_VERSION}:${provider?.model ?? ''}`
}

export type EngineResult = {
  segments: string[]
  engineLabel: string
  cached: boolean
  elapsedMs: number
  detectedLang?: string
}

export type TranslateOptions = {
  cacheSegments?: boolean
}

type TranslateInput = Omit<TranslateRequest, 'onDelta'>

function segmentKeys(input: TranslateInput, engineId: string, revision: string): string[] {
  return input.segments.map((segment) =>
    makeSegmentCacheKey({
      engineId,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      segment,
      revision,
    }),
  )
}

function encodeForProvider(engineId: string, segments: string[]): { segments: string[]; placeholder: boolean[] } {
  const supported = engineId.startsWith(PLACEHOLDER_PREFIX)
  const placeholder = segments.map((segment) => supported && hasInlineMarkers(segment))
  return {
    segments: segments.map((segment, index) => (placeholder[index] ? toPlaceholderMarkup(segment) : segment)),
    placeholder,
  }
}

function decodeFromProvider(placeholder: boolean[], segments: string[]): string[] {
  return segments.map((segment, index) => (placeholder[index] ? fromPlaceholderMarkup(segment) : segment))
}

async function storeSegments(
  input: TranslateInput,
  engineId: string,
  revision: string,
  translated: string[],
  engineLabel: string,
): Promise<void> {
  const keys = segmentKeys(input, engineId, revision)
  for (let index = 0; index < input.segments.length; index += 1) {
    const source = input.segments[index] ?? ''
    if (!canonicalSegment(source)) continue
    const text = translated[index] ?? ''
    if (!inlineMarkupIntact(source, text)) continue
    await setCachedSegment(keys[index] ?? '', text, engineLabel)
  }
}

async function repairMarkup(
  provider: TranslateProvider,
  engineId: string,
  sources: string[],
  translated: string[],
  input: TranslateInput,
): Promise<string[]> {
  const repaired = translated.slice()
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index] ?? ''
    if (inlineMarkupIntact(source, repaired[index] ?? '')) continue
    const encoded = encodeForProvider(engineId, [source])
    try {
      const response = await provider.translate({
        segments: encoded.segments,
        sourceLang: input.sourceLang,
        targetLang: input.targetLang,
        context: input.context,
        glossary: input.glossary,
        signal: input.signal,
      })
      const retried = decodeFromProvider(encoded.placeholder, response.segments)[0] ?? ''
      if (inlineMarkupIntact(source, retried)) repaired[index] = retried
    } catch (error) {
      if (isAbortError(error)) throw error
    }
  }
  return repaired
}

async function translateFresh(
  input: TranslateInput,
  settings: Settings,
  engineId: string,
  batchKey: string,
  started: number,
  onDelta?: (delta: string) => void,
): Promise<EngineResult> {
  const provider = resolveEngine(engineId, settings)
  try {
    const response = await provider.translate({ ...input, onDelta })
    const joined = response.segments.join('\u0000')
    if (joined) await setCached(batchKey, joined, response.engineLabel)
    return {
      segments: response.segments,
      engineLabel: response.engineLabel,
      cached: false,
      elapsedMs: Date.now() - started,
      detectedLang: response.detectedLang,
    }
  } catch (error) {
    if (isAbortError(error)) throw error
    throw toAppError(error)
  }
}

async function translateBySegments(
  input: TranslateInput,
  settings: Settings,
  engineId: string,
  revision: string,
  batchKey: string,
  started: number,
  onDelta?: (delta: string) => void,
): Promise<EngineResult> {
  const keys = segmentKeys(input, engineId, revision)
  const translated: string[] = new Array<string>(input.segments.length).fill('')
  const missing: number[] = []
  let cachedLabel = ''
  for (let index = 0; index < input.segments.length; index += 1) {
    const source = input.segments[index] ?? ''
    const key = keys[index] ?? ''
    const hit = canonicalSegment(source) ? await getCachedSegment(key) : null
    if (hit && inlineMarkupIntact(source, hit.text)) {
      translated[index] = hit.text
      if (!cachedLabel) cachedLabel = hit.engineLabel
      continue
    }
    if (hit) await dropCachedSegment(key)
    missing.push(index)
  }
  if (missing.length === 0) {
    const joined = translated.join('\u0000')
    if (joined) await setCached(batchKey, joined, cachedLabel)
    return {
      segments: translated,
      engineLabel: cachedLabel,
      cached: true,
      elapsedMs: Date.now() - started,
    }
  }

  const provider = resolveEngine(engineId, settings)
  const pending = missing.map((index) => input.segments[index] ?? '')
  const whole = missing.length === input.segments.length
  try {
    const encoded = encodeForProvider(engineId, pending)
    const response = await provider.translate({
      ...input,
      segments: encoded.segments,
      onDelta: whole ? onDelta : undefined,
    })
    if (response.segments.length !== pending.length) {
      throw new AppError(
        'parse',
        `引擎返回了 ${response.segments.length} 段译文，但请求了 ${pending.length} 段`,
      )
    }
    const decoded = decodeFromProvider(encoded.placeholder, response.segments)
    const repaired = await repairMarkup(provider, engineId, pending, decoded, input)
    let intact = true
    for (let offset = 0; offset < missing.length; offset += 1) {
      const index = missing[offset] ?? 0
      const source = input.segments[index] ?? ''
      const text = repaired[offset] ?? ''
      translated[index] = text
      if (!inlineMarkupIntact(source, text)) {
        intact = false
        continue
      }
      if (canonicalSegment(source)) await setCachedSegment(keys[index] ?? '', text, response.engineLabel)
    }
    const joined = translated.join('\u0000')
    if (joined && intact) await setCached(batchKey, joined, response.engineLabel)
    return {
      segments: translated,
      engineLabel: response.engineLabel,
      cached: false,
      elapsedMs: Date.now() - started,
      detectedLang: response.detectedLang,
    }
  } catch (error) {
    if (isAbortError(error)) throw error
    throw toAppError(error)
  }
}

export async function translateText(
  input: TranslateInput,
  settings: Settings,
  engineId: string,
  onDelta?: (delta: string) => void,
  options?: TranslateOptions,
): Promise<EngineResult> {
  const started = Date.now()
  const revision = engineRevision(engineId, settings)
  const context = engineId.startsWith('ai:') ? input.context : undefined
  const batchKey = makeCacheKey({
    engineId,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    segments: input.segments,
    context,
    revision,
  })
  const cached = await getCached(batchKey)
  if (cached) {
    const segments = cached.text.split('\u0000')
    const usable =
      segments.length === input.segments.length &&
      (!options?.cacheSegments ||
        segments.every((text, index) => inlineMarkupIntact(input.segments[index] ?? '', text)))
    if (usable) {
      if (options?.cacheSegments) await storeSegments(input, engineId, revision, segments, cached.engineLabel)
      return {
        segments,
        engineLabel: cached.engineLabel,
        cached: true,
        elapsedMs: Date.now() - started,
      }
    }
    await dropCached(batchKey)
  }
  if (options?.cacheSegments && !context && input.segments.length > 0) {
    return translateBySegments(input, settings, engineId, revision, batchKey, started, onDelta)
  }
  return translateFresh(input, settings, engineId, batchKey, started, onDelta)
}
