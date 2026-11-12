import type { ErrorCode } from './errors'
import type { IssueCategory, IssueSeverity } from './check'
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

export type CheckJobRequest = {
  kind: 'check'
  requestId: string
  text: string
  engineId?: string
}

export type PolishJobRequest = {
  kind: 'polish'
  requestId: string
  text: string
  instruction: string
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

export type JobRequest =
  | TranslateJobRequest
  | CheckJobRequest
  | PolishJobRequest
  | CancelJobRequest
  | TestJobRequest

export type JobResult = {
  segments: string[]
  engineLabel: string
  usedFallback: boolean
  cached: boolean
  elapsedMs: number
  detectedLang?: string
}

export type CheckIssuePayload = {
  id: string
  quote: string
  replacement: string
  category: IssueCategory
  severity: IssueSeverity
  explanation: string
  start: number
  end: number
}

export type CheckJobResult = {
  issues: CheckIssuePayload[]
  corrected: string
  engineLabel: string
  elapsedMs: number
  chunks: number
  dropped: number
}

export type PolishJobResult = {
  polished: string
  engineLabel: string
  elapsedMs: number
}

export type JobEvent =
  | { kind: 'delta'; requestId: string; text: string }
  | { kind: 'progress'; requestId: string; done: number; total: number; label?: string }
  | { kind: 'done'; requestId: string; result: JobResult }
  | { kind: 'checkDone'; requestId: string; result: CheckJobResult }
  | { kind: 'polishDone'; requestId: string; result: PolishJobResult }
  | { kind: 'testDone'; requestId: string; latencyMs: number; sample: string }
  | { kind: 'error'; requestId: string; code: ErrorCode; message: string }

const EVENT_KINDS = new Set(['delta', 'progress', 'done', 'checkDone', 'polishDone', 'testDone', 'error'])

export function isJobEvent(value: unknown): value is JobEvent {
  if (!value || typeof value !== 'object') return false
  const kind = (value as { kind?: unknown }).kind
  return typeof kind === 'string' && EVENT_KINDS.has(kind)
}
