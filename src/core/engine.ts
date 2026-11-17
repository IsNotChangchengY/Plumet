import { isAbortError, toAppError } from './errors'
import { getCached, makeCacheKey, setCached } from './cache'
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
    context: engineId.startsWith('ai:') ? input.context : undefined,
    revision: engineRevision(engineId, settings),
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
