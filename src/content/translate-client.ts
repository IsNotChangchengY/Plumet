import type { TranslateJobRequest } from '../core/messaging'
import { isJobEvent, YUYI_PORT } from '../core/messaging'

export type SelectionTranslation = {
  text: string
  engineLabel: string
  elapsedMs: number
  detectedLang?: string
}

export type SelectionHandlers = {
  onDelta?: (delta: string) => void
  onDone?: (result: SelectionTranslation) => void
  onError?: (message: string) => void
}

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `sel-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function requestSelectionTranslation(
  input: { text: string; context: string; sourceLang: string; targetLang: string },
  handlers: SelectionHandlers,
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
      handlers.onDelta?.(event.text)
      return
    }
    if (event.kind === 'done') {
      handlers.onDone?.({
        text: event.result.segments.join('\n\n'),
        engineLabel: event.result.engineLabel,
        elapsedMs: event.result.elapsedMs,
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
      segments: [input.text],
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      context: input.context || undefined,
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
