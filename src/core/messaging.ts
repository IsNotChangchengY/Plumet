import type { ErrorCode } from './errors'
import type { AiProviderConfig } from '../storage/settings'

export const YUYI_PORT = 'yuyi'

export type TranslateJobRequest = {
  kind: 'translate'
  requestId: string
  segments: string[]
  sourceLang: string
  targetLang: string
  context?: string
  engineId?: string
}

export type CancelJobRequest = {
  kind: 'cancel'
  requestId: string
}

export type TestJobRequest = {
  kind: 'test'
  requestId: string
  config: AiProviderConfig
}

export type JobRequest = TranslateJobRequest | CancelJobRequest | TestJobRequest

export type JobResult = {
  segments: string[]
  engineLabel: string
  usedFallback: boolean
  cached: boolean
  elapsedMs: number
  detectedLang?: string
}

export type JobEvent =
  | { kind: 'delta'; requestId: string; text: string }
  | { kind: 'done'; requestId: string; result: JobResult }
  | { kind: 'testDone'; requestId: string; latencyMs: number; sample: string }
  | { kind: 'error'; requestId: string; code: ErrorCode; message: string }

export function isJobEvent(value: unknown): value is JobEvent {
  if (!value || typeof value !== 'object') return false
  const kind = (value as { kind?: unknown }).kind
  return kind === 'delta' || kind === 'done' || kind === 'testDone' || kind === 'error'
}
