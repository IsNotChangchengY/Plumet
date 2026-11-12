import { useCallback, useEffect, useRef, useState } from 'react'
import type { ErrorCode } from '../core/errors'
import type { JobResult, TranslateJobRequest } from '../core/messaging'
import { isJobEvent, YUYI_PORT } from '../core/messaging'

export type JobState =
  | { status: 'idle' }
  | { status: 'running'; text: string }
  | { status: 'done'; text: string; result: JobResult }
  | { status: 'error'; code: ErrorCode; message: string }

export type TranslateInput = Omit<TranslateJobRequest, 'kind' | 'requestId'>

export function useTranslateJob(): {
  state: JobState
  run: (input: TranslateInput) => boolean
  cancel: () => void
  reset: () => void
} {
  const portRef = useRef<chrome.runtime.Port | null>(null)
  const requestIdRef = useRef('')
  const [state, setState] = useState<JobState>({ status: 'idle' })

  const ensurePort = useCallback((): chrome.runtime.Port => {
    if (portRef.current) return portRef.current
    const port = chrome.runtime.connect({ name: YUYI_PORT })
    port.onMessage.addListener((event: unknown) => {
      if (!isJobEvent(event)) return
      if (event.requestId !== requestIdRef.current) return
      if (event.kind === 'delta') {
        setState((previous) => ({
          status: 'running',
          text: (previous.status === 'running' ? previous.text : '') + event.text,
        }))
        return
      }
      if (event.kind === 'done') {
        setState({ status: 'done', text: event.result.segments.join('\n\n'), result: event.result })
        return
      }
      if (event.kind === 'error') {
        setState({ status: 'error', code: event.code, message: event.message })
      }
    })
    port.onDisconnect.addListener(() => {
      portRef.current = null
      setState((previous) =>
        previous.status === 'running'
          ? { status: 'error', code: 'network', message: '与后台的连接中断了，请再点一次翻译' }
          : previous,
      )
    })
    portRef.current = port
    return port
  }, [])

  useEffect(
    () => () => {
      portRef.current?.disconnect()
      portRef.current = null
    },
    [],
  )

  const run = useCallback(
    (input: TranslateInput): boolean => {
      const requestId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `job-${Date.now()}-${Math.random().toString(36).slice(2)}`
      requestIdRef.current = requestId
      setState({ status: 'running', text: '' })
      try {
        const port = ensurePort()
        port.postMessage({ kind: 'translate', requestId, ...input } satisfies TranslateJobRequest)
        return true
      } catch {
        setState({ status: 'error', code: 'network', message: '无法连接到扩展后台，请重新加载扩展后再试' })
        return false
      }
    },
    [ensurePort],
  )

  const cancel = useCallback(() => {
    const requestId = requestIdRef.current
    if (!requestId || !portRef.current) return
    try {
      portRef.current.postMessage({ kind: 'cancel', requestId })
    } catch {
      setState({ status: 'idle' })
    }
  }, [])

  const reset = useCallback(() => {
    requestIdRef.current = ''
    setState((previous) => (previous.status === 'idle' ? previous : { status: 'idle' }))
  }, [])

  return { state, run, cancel, reset }
}
