import { AppError, isAbortError, toAppError } from './errors'
import { getCached, makeCacheKey, setCached } from './cache'
import { fallbackEngineIds, isMtEnabled, resolveEngine } from './providers/registry'
import type { TranslateRequest } from './providers/types'
import type { Settings } from '../storage/settings'

export type EngineResult = {
  segments: string[]
  engineLabel: string
  usedFallback: boolean
  cached: boolean
  elapsedMs: number
  detectedLang?: string
}

export async function translateWithFallback(
  input: Omit<TranslateRequest, 'onDelta'>,
  settings: Settings,
  primaryEngineId: string,
  onDelta?: (delta: string) => void,
): Promise<EngineResult> {
  const started = Date.now()
  const key = makeCacheKey({
    engineId: primaryEngineId,
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
      usedFallback: false,
      cached: true,
      elapsedMs: Date.now() - started,
    }
  }

  const attempts: string[] = [primaryEngineId]
  for (const engineId of fallbackEngineIds(settings, primaryEngineId)) {
    if (isMtEnabled(settings, engineId)) attempts.push(engineId)
  }

  let firstError: unknown = null
  for (let index = 0; index < attempts.length; index += 1) {
    const engineId = attempts[index] as string
    const isPrimary = index === 0
    try {
      const provider = resolveEngine(engineId, settings)
      const response = await provider.translate({
        ...input,
        onDelta: isPrimary ? onDelta : undefined,
      })
      const joined = response.segments.join('\u0000')
      if (joined) await setCached(key, joined, response.engineLabel)
      return {
        segments: response.segments,
        engineLabel: response.engineLabel,
        usedFallback: !isPrimary,
        cached: false,
        elapsedMs: Date.now() - started,
        detectedLang: response.detectedLang,
      }
    } catch (error) {
      if (isAbortError(error)) throw error
      if (firstError === null) firstError = error
    }
  }

  throw toAppError(firstError ?? new AppError('unknown', '没有可用的翻译引擎，请到设置页检查配置'))
}
