import type { TranslateJobRequest } from '../core/messaging'
import { isJobEvent, YUYI_PORT } from '../core/messaging'

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
  detectedLang?: string
}

export type TextHandlers = {
  onDelta?: (delta: string) => void
  onDone?: (result: TextTranslation) => void
  onError?: (message: string) => void
}

export type SelectionHandlers = {
  onDelta?: (delta: string) => void
  onDone?: (result: SelectionTranslation) => void
  onError?: (message: string) => void
}

export type TextInput = {
  segments: string[]
  sourceLang: string
  targetLang: string
  context?: string
  engineId?: string
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
      handlers.onDelta?.(event.text)
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
  input: { text: string; context: string; sourceLang: string; targetLang: string },
  handlers: SelectionHandlers,
): () => void {
  return requestTextTranslation(
    {
      segments: [input.text],
      context: input.context,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
    },
    {
      onDelta: handlers.onDelta,
      onDone(result) {
        handlers.onDone?.({
          text: result.segments.join('\n\n'),
          engineLabel: result.engineLabel,
          elapsedMs: result.elapsedMs,
          detectedLang: result.detectedLang,
        })
      },
      onError: handlers.onError,
    },
  )
}
