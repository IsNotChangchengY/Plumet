import { AppError, isAbortError, toAppError } from './errors'
import {
  canonicalSegment,
  getCached,
  getCachedSegment,
  makeCacheKey,
  makeSegmentCacheKey,
  setCached,
  setCachedSegment,
} from './cache'
import { resolveEngine } from './providers/registry'
import { PROMPT_VERSION } from './providers/ai/prompts'
import type { TranslateRequest } from './providers/types'
import type { Settings } from '../storage/settings'

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

async function storeSegments(
  input: TranslateInput,
  engineId: string,
  revision: string,
  translated: string[],
  engineLabel: string,
): Promise<void> {
  const keys = segmentKeys(input, engineId, revision)
  for (let index = 0; index < input.segments.length; index += 1) {
    if (!canonicalSegment(input.segments[index] ?? '')) continue
    await setCachedSegment(keys[index] ?? '', translated[index] ?? '', engineLabel)
  }
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
    const hit = canonicalSegment(source) ? await getCachedSegment(keys[index] ?? '') : null
    if (hit) {
      translated[index] = hit.text
      if (!cachedLabel) cachedLabel = hit.engineLabel
    } else {
      missing.push(index)
    }
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
    const response = await provider.translate({
      ...input,
      segments: pending,
      onDelta: whole ? onDelta : undefined,
    })
    if (response.segments.length !== pending.length) {
      throw new AppError(
        'parse',
        `引擎返回了 ${response.segments.length} 段译文，但请求了 ${pending.length} 段`,
      )
    }
    for (let offset = 0; offset < missing.length; offset += 1) {
      const index = missing[offset] ?? 0
      const text = response.segments[offset] ?? ''
      translated[index] = text
      if (canonicalSegment(input.segments[index] ?? '')) {
        await setCachedSegment(keys[index] ?? '', text, response.engineLabel)
      }
    }
    const joined = translated.join('\u0000')
    if (joined) await setCached(batchKey, joined, response.engineLabel)
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
    if (options?.cacheSegments && segments.length === input.segments.length) {
      await storeSegments(input, engineId, revision, segments, cached.engineLabel)
    }
    return {
      segments,
      engineLabel: cached.engineLabel,
      cached: true,
      elapsedMs: Date.now() - started,
    }
  }
  if (options?.cacheSegments && !context && input.segments.length > 0) {
    return translateBySegments(input, settings, engineId, revision, batchKey, started, onDelta)
  }
  return translateFresh(input, settings, engineId, batchKey, started, onDelta)
}
