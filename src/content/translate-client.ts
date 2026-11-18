import type { DictJobRequest, EngineRunResult, TranslateJobRequest } from '../core/messaging'
import { isJobEvent, YUYI_PORT } from '../core/messaging'
import type { DictionaryEntry } from '../core/dictionary/types'

export type TextTranslation = {
  segments: string[]
  engineLabel: string
  elapsedMs: number
  cached: boolean
  detectedLang?: string
}

export type SelectionTranslation = {
  text: string
  engineLabel: string
  elapsedMs: number
  cached: boolean
  detectedLang?: string
}

export type EngineDeltaEvent = { engineId: string; text: string }

export type TextHandlers = {
  onDelta?: (delta: string) => void
  onEngineDelta?: (event: EngineDeltaEvent) => void
  onEngineDone?: (result: EngineRunResult) => void
  onDone?: (result: TextTranslation) => void
  onError?: (message: string) => void
}

export type WordLookupResult =
  | { kind: 'dictionary'; entry: DictionaryEntry; engineLabel: string; elapsedMs: number; cached: boolean }
  | { kind: 'translation'; text: string; engineLabel: string; elapsedMs: number; cached: boolean; notice: string }

export type WordLookupHandlers = {
  onDelta?: (delta: string) => void
  onEngineDelta?: (event: EngineDeltaEvent) => void
  onEngineDone?: (result: EngineRunResult) => void
  onResult?: (result: WordLookupResult) => void
  onError?: (message: string) => void
}

export type SelectionHandlers = {
  onDelta?: (delta: string) => void
  onEngineDelta?: (event: EngineDeltaEvent) => void
  onEngineDone?: (result: EngineRunResult) => void
  onDone?: (result: SelectionTranslation) => void
  onError?: (message: string) => void
}

export type TextInput = {
  segments: string[]
  sourceLang: string
  targetLang: string
  context?: string
  engineId?: string
  engineIds?: string[]
  silent?: boolean
}

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function requestTextTranslation(input: TextInput, handlers: TextHandlers): () => void {
  const requestId = newRequestId()
  let finished = false
  let port: chrome.runtime.Port

  try {
    port = chrome.runtime.connect({ name: YUYI_PORT })
  } catch {
    handlers.onError?.('无法连接到扩展后台，请重新加载页面或扩展')
    return () => undefined
  }

  const finish = () => {
    if (finished) return
    finished = true
    try {
      port.disconnect()
    } catch {
      // 端口可能已经断开
    }
  }

  port.onMessage.addListener((event: unknown) => {
    if (!isJobEvent(event) || event.requestId !== requestId) return
    if (event.kind === 'delta') {
      if (event.engineId) handlers.onEngineDelta?.({ engineId: event.engineId, text: event.text })
      handlers.onDelta?.(event.text)
      return
    }
    if (event.kind === 'engineDone') {
      handlers.onEngineDone?.(event.result)
      return
    }
    if (event.kind === 'done') {
      handlers.onDone?.({
        segments: event.result.segments,
        engineLabel: event.result.engineLabel,
        elapsedMs: event.result.elapsedMs,
        cached: event.result.cached,
        detectedLang: event.result.detectedLang,
      })
      finish()
      return
    }
    if (event.kind === 'error') {
      handlers.onError?.(event.message)
      finish()
    }
  })

  port.onDisconnect.addListener(() => {
    if (!finished) {
      finished = true
      handlers.onError?.('与扩展后台的连接中断了，请刷新页面后再试')
    }
  })

  try {
    const payload: TranslateJobRequest = {
      kind: 'translate',
      requestId,
      segments: input.segments,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      context: input.context || undefined,
      engineId: input.engineId || undefined,
      engineIds: input.engineIds && input.engineIds.length > 0 ? input.engineIds : undefined,
      silent: input.silent || undefined,
    }
    port.postMessage(payload)
  } catch {
    handlers.onError?.('发送翻译请求失败，请刷新页面后再试')
    finish()
  }

  return () => {
    if (finished) return
    try {
      port.postMessage({ kind: 'cancel', requestId })
    } catch {
      // 忽略发送失败
    }
    finish()
  }
}

export function requestSelectionTranslation(
  input: { text: string; context: string; sourceLang: string; targetLang: string; engineIds?: string[] },
  handlers: SelectionHandlers,
): () => void {
  return requestTextTranslation(
    {
      segments: [input.text],
      context: input.context,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      engineIds: input.engineIds,
    },
    {
      onDelta: handlers.onDelta,
      onEngineDelta: handlers.onEngineDelta,
      onEngineDone: handlers.onEngineDone,
      onDone(result) {
        handlers.onDone?.({
          text: result.segments.join('\n\n'),
          engineLabel: result.engineLabel,
          elapsedMs: result.elapsedMs,
          cached: result.cached,
          detectedLang: result.detectedLang,
        })
      },
      onError: handlers.onError,
    },
  )
}

export function requestWordLookup(
  input: { word: string; sourceLang: string; targetLang: string; context?: string; engineIds?: string[] },
  handlers: WordLookupHandlers,
): () => void {
  const requestId = newRequestId()
  let finished = false
  let port: chrome.runtime.Port

  try {
    port = chrome.runtime.connect({ name: YUYI_PORT })
  } catch {
    handlers.onError?.('无法连接到扩展后台，请重新加载页面或扩展')
    return () => undefined
  }

  const finish = () => {
    if (finished) return
    finished = true
    try {
      port.disconnect()
    } catch {
      // 端口可能已经断开
    }
  }

  port.onMessage.addListener((event: unknown) => {
    if (!isJobEvent(event) || event.requestId !== requestId) return
    if (event.kind === 'delta') {
      if (event.engineId) handlers.onEngineDelta?.({ engineId: event.engineId, text: event.text })
      handlers.onDelta?.(event.text)
      return
    }
    if (event.kind === 'engineDone') {
      handlers.onEngineDone?.(event.result)
      return
    }
    if (event.kind === 'done') {
      handlers.onResult?.({
        kind: 'translation',
        text: event.result.segments.join('\n\n'),
        engineLabel: event.result.engineLabel,
        elapsedMs: event.result.elapsedMs,
        cached: event.result.cached,
        notice: event.result.notice ?? '',
      })
      finish()
      return
    }
    if (event.kind === 'dictDone') {
      handlers.onResult?.({
        kind: 'dictionary',
        entry: event.result.entry,
        engineLabel: event.result.engineLabel,
        elapsedMs: event.result.elapsedMs,
        cached: event.result.cached,
      })
      finish()
      return
    }
    if (event.kind === 'error') {
      handlers.onError?.(event.message)
      finish()
    }
  })

  port.onDisconnect.addListener(() => {
    if (!finished) {
      finished = true
      handlers.onError?.('与扩展后台的连接中断了，请刷新页面后再试')
    }
  })

  try {
    const payload: DictJobRequest = {
      kind: 'dict',
      requestId,
      word: input.word,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      context: input.context || undefined,
      engineIds: input.engineIds && input.engineIds.length > 0 ? input.engineIds : undefined,
    }
    port.postMessage(payload)
  } catch {
    handlers.onError?.('发送查词请求失败，请刷新页面后再试')
    finish()
  }

  return () => {
    if (finished) return
    try {
      port.postMessage({ kind: 'cancel', requestId })
    } catch {
      // 忽略发送失败
    }
    finish()
  }
}
