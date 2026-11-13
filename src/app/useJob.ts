import { useCallback, useEffect, useRef, useState } from 'react'
import type { ErrorCode } from '../core/errors'
import type {
  CheckJobResult,
  CheckJobRequest,
  JobRequest,
  JobResult,
  PolishJobRequest,
  PolishJobResult,
  TranslateJobRequest,
} from '../core/messaging'
import { isJobEvent, YUYI_PORT } from '../core/messaging'

export type JobKind = 'translate' | 'check' | 'polish'

export type JobState =
  | { status: 'idle' }
  | { status: 'running'; kind: JobKind; text: string; progress: { done: number; total: number } | null }
  | { status: 'done'; kind: 'translate'; text: string; result: JobResult }
  | { status: 'done'; kind: 'check'; result: CheckJobResult }
  | { status: 'done'; kind: 'polish'; result: PolishJobResult }
  | { status: 'error'; kind: JobKind | null; code: ErrorCode; message: string }

export type RunInput =
  | { kind: 'translate'; segments: string[]; sourceLang: string; targetLang: string; context?: string }
  | { kind: 'check'; text: string }
  | { kind: 'polish'; text: string; instruction: string }

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `job-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useJob(): {
  state: JobState
  run: (input: RunInput) => boolean
  cancel: () => void
  reset: () => void
} {
  const portRef = useRef<chrome.runtime.Port | null>(null)
  const requestIdRef = useRef('')
  const kindRef = useRef<JobKind | null>(null)
  const [state, setState] = useState<JobState>({ status: 'idle' })

  const ensurePort = useCallback((): chrome.runtime.Port => {
    if (portRef.current) return portRef.current
    const port = chrome.runtime.connect({ name: YUYI_PORT })
    port.onMessage.addListener((event: unknown) => {
      if (!isJobEvent(event)) return
      if (event.requestId !== requestIdRef.current) return
      if (event.kind === 'delta') {
        setState((previous) =>
          previous.status === 'running' ? { ...previous, text: previous.text + event.text } : previous,
        )
        return
      }
      if (event.kind === 'progress') {
        setState((previous) =>
          previous.status === 'running'
            ? { ...previous, progress: { done: event.done, total: event.total } }
            : previous,
        )
        return
      }
      if (event.kind === 'done') {
        setState({
          status: 'done',
          kind: 'translate',
          text: event.result.segments.join('\n\n'),
          result: event.result,
        })
        return
      }
      if (event.kind === 'checkDone') {
        setState({ status: 'done', kind: 'check', result: event.result })
        return
      }
      if (event.kind === 'polishDone') {
        setState({ status: 'done', kind: 'polish', result: event.result })
        return
      }
      if (event.kind === 'error') {
        setState({ status: 'error', kind: kindRef.current, code: event.code, message: event.message })
      }
    })
    port.onDisconnect.addListener(() => {
      portRef.current = null
      setState((previous) =>
        previous.status === 'running'
          ? { status: 'error', kind: kindRef.current, code: 'network', message: '与后台的连接中断了，请再试一次' }
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
    (input: RunInput): boolean => {
      const requestId = newRequestId()
      requestIdRef.current = requestId
      kindRef.current = input.kind
      setState({ status: 'running', kind: input.kind, text: '', progress: null })
      try {
        const port = ensurePort()
        if (input.kind === 'translate') {
          const payload: TranslateJobRequest = {
            kind: 'translate',
            requestId,
            segments: input.segments,
            sourceLang: input.sourceLang,
            targetLang: input.targetLang,
            context: input.context,
          }
          port.postMessage(payload satisfies JobRequest)
        } else if (input.kind === 'check') {
          const payload: CheckJobRequest = { kind: 'check', requestId, text: input.text }
          port.postMessage(payload satisfies JobRequest)
        } else {
          const payload: PolishJobRequest = {
            kind: 'polish',
            requestId,
            text: input.text,
            instruction: input.instruction,
          }
          port.postMessage(payload satisfies JobRequest)
        }
        return true
      } catch {
        setState({
          status: 'error',
          kind: input.kind,
          code: 'network',
          message: '无法连接到扩展后台，请重新加载扩展后再试',
        })
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
    kindRef.current = null
    setState((previous) => (previous.status === 'idle' ? previous : { status: 'idle' }))
  }, [])

  return { state, run, cancel, reset }
}
