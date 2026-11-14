import { isAbortError, toAppError } from './errors'
import { getCached, makeCacheKey, setCached } from './cache'
import { resolveEngine } from './providers/registry'
import type { TranslateRequest } from './providers/types'
import type { Settings } from '../storage/settings'

export type EngineResult = {
  segments: string[]
  engineLabel: string
  cached: boolean
  elapsedMs: number
  detectedLang?: string
}

export async function translateText(
  input: Omit<TranslateRequest, 'onDelta'>,
  settings: Settings,
  engineId: string,
  onDelta?: (delta: string) => void,
): Promise<EngineResult> {
  const started = Date.now()
  const key = makeCacheKey({
    engineId,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    segments: input.segments,
    context: input.context,
  })
  const cached = await getCached(key)
  if (cached) {
    return {
      segments: cached.text.split('\u0000'),
      engineLabel: cached.engineLabel,
      cached: true,
      elapsedMs: Date.now() - started,
    }
  }

  const provider = resolveEngine(engineId, settings)
  try {
    const response = await provider.translate({ ...input, onDelta })
    const joined = response.segments.join('\u0000')
    if (joined) await setCached(key, joined, response.engineLabel)
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
