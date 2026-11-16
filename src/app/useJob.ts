import { useCallback, useEffect, useRef, useState } from 'react'
import type { ErrorCode } from '../core/errors'
import type {
  CheckJobResult,
  CheckJobRequest,
  DictJobRequest,
  DictJobResult,
  EngineRunResult,
  JobRequest,
  JobResult,
  PolishJobRequest,
  PolishJobResult,
  TranslateJobRequest,
} from '../core/messaging'
import { isJobEvent, YUYI_PORT } from '../core/messaging'

export type JobKind = 'translate' | 'check' | 'polish' | 'dict'

export type EngineRun = {
  engineId: string
  label: string
  text: string
  done: boolean
  result: JobResult | null
  error: { code: ErrorCode; message: string } | null
}

export type JobState =
  | { status: 'idle' }
  | { status: 'running'; kind: 'translate'; parts: EngineRun[] }
  | {
      status: 'running'
      kind: 'dict' | 'check' | 'polish'
      text: string
      progress: { done: number; total: number } | null
    }
  | { status: 'done'; kind: 'translate'; parts: EngineRun[] }
  | { status: 'done'; kind: 'dict'; result: DictJobResult }
  | { status: 'done'; kind: 'check'; result: CheckJobResult }
  | { status: 'done'; kind: 'polish'; result: PolishJobResult }
  | { status: 'error'; kind: JobKind | null; code: ErrorCode; message: string }

export type RunInput =
  | {
      kind: 'translate'
      segments: string[]
      sourceLang: string
      targetLang: string
      context?: string
      engines: { id: string; label: string }[]
    }
  | { kind: 'dict'; word: string; sourceLang: string; targetLang: string; context?: string }
  | { kind: 'check'; text: string }
  | { kind: 'polish'; text: string; instruction: string }

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `job-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function newEngineRun(engineId: string, label: string): EngineRun {
  return { engineId, label, text: '', done: false, result: null, error: null }
}

function applyEngineResult(parts: EngineRun[], result: EngineRunResult): EngineRun[] {
  if (!result.ok) {
    const failed: EngineRun = {
      engineId: result.engineId,
      label: result.engineLabel,
      text: '',
      done: true,
      result: null,
      error: { code: result.code, message: result.message },
    }
    return replacePart(parts, result.engineId, (part) => ({ ...part, ...failed, text: part.text }))
  }
  const translated: EngineRun = {
    engineId: result.engineId,
    label: result.engineLabel,
    text: result.segments.join('\n\n'),
    done: true,
    result: {
      segments: result.segments,
      engineLabel: result.engineLabel,
      cached: result.cached,
      elapsedMs: result.elapsedMs,
      detectedLang: result.detectedLang,
      notice: result.notice,
    },
    error: null,
  }
  return replacePart(parts, result.engineId, () => translated)
}

function replacePart(
  parts: EngineRun[],
  engineId: string,
  update: (part: EngineRun) => EngineRun,
): EngineRun[] {
  const index = parts.findIndex((part) => part.engineId === engineId)
  if (index >= 0) return parts.map((part, at) => (at === index ? update(part) : part))
  const pending = parts.findIndex((part) => !part.done && part.engineId === '')
  if (pending >= 0) return parts.map((part, at) => (at === pending ? update(part) : part))
  return [...parts, update(newEngineRun(engineId, engineId))]
}

function appendDelta(parts: EngineRun[], text: string, engineId?: string): EngineRun[] {
  let index = engineId ? parts.findIndex((part) => part.engineId === engineId) : -1
  if (index < 0) index = parts.findIndex((part) => !part.done)
  if (index < 0) return parts
  return parts.map((part, at) => (at === index ? { ...part, text: part.text + text } : part))
}

function finishTranslate(parts: EngineRun[], result: JobResult): EngineRun[] {
  if (parts.length === 0) {
    return [
      {
        engineId: result.engineLabel,
        label: result.engineLabel,
        text: result.segments.join('\n\n'),
        done: true,
        result,
        error: null,
      },
    ]
  }
  if (parts.length === 1 && !parts[0].result && !parts[0].error) {
    return [{ ...parts[0], text: result.segments.join('\n\n'), done: true, result }]
  }
  return parts.map((part) => (part.done ? part : { ...part, done: true }))
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
        setState((previous) => {
          if (previous.status !== 'running') return previous
          if (previous.kind === 'translate') {
            return { ...previous, parts: appendDelta(previous.parts, event.text, event.engineId) }
          }
          return { ...previous, text: previous.text + event.text }
        })
        return
      }
      if (event.kind === 'engineDone') {
        setState((previous) =>
          previous.status === 'running' && previous.kind === 'translate'
            ? { ...previous, parts: applyEngineResult(previous.parts, event.result) }
            : previous,
        )
        return
      }
      if (event.kind === 'progress') {
        setState((previous) =>
          previous.status === 'running' && previous.kind !== 'translate'
            ? { ...previous, progress: { done: event.done, total: event.total } }
            : previous,
        )
        return
      }
      if (event.kind === 'done') {
        setState((previous) => {
          const parts = previous.status === 'running' && previous.kind === 'translate' ? previous.parts : []
          return { status: 'done', kind: 'translate', parts: finishTranslate(parts, event.result) }
        })
        return
      }
      if (event.kind === 'dictDone') {
        setState({ status: 'done', kind: 'dict', result: event.result })
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
      if (input.kind === 'translate') {
        const engines = input.engines.length > 0 ? input.engines : [{ id: '', label: '翻译引擎' }]
        setState({
          status: 'running',
          kind: 'translate',
          parts: engines.map((engine) => newEngineRun(engine.id, engine.label)),
        })
      } else {
        setState({ status: 'running', kind: input.kind, text: '', progress: null })
      }
      try {
        const port = ensurePort()
        if (input.kind === 'translate') {
          const engines = input.engines.filter((engine) => engine.id)
          const payload: TranslateJobRequest = {
            kind: 'translate',
            requestId,
            segments: input.segments,
            sourceLang: input.sourceLang,
            targetLang: input.targetLang,
            context: input.context,
            engineIds: engines.map((engine) => engine.id),
          }
          port.postMessage(payload satisfies JobRequest)
        } else if (input.kind === 'dict') {
          const payload: DictJobRequest = {
            kind: 'dict',
            requestId,
            word: input.word,
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
