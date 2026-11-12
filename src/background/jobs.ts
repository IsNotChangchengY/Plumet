import { isAbortError, toAppError } from '../core/errors'
import { translateWithFallback } from '../core/engine'
import { testAiProvider } from '../core/providers/ai/openai-compatible'
import type { JobEvent, JobRequest, TestJobRequest, TranslateJobRequest } from '../core/messaging'
import { loadSettings } from '../storage/settings'
import { addHistory } from '../storage/history'

type Job = {
  controller: AbortController
  ports: Set<chrome.runtime.Port>
}

const jobs = new Map<string, Job>()

function sendTo(job: Job, event: JobEvent): void {
  for (const port of job.ports) {
    try {
      port.postMessage(event)
    } catch {
      job.ports.delete(port)
    }
  }
}

async function runTranslate(request: TranslateJobRequest, job: Job): Promise<void> {
  try {
    const settings = await loadSettings()
    const engineId = request.engineId?.trim() ? request.engineId : settings.translateEngine
    const result = await translateWithFallback(
      {
        segments: request.segments,
        sourceLang: request.sourceLang,
        targetLang: request.targetLang,
        context: request.context,
        glossary: settings.glossary,
        signal: job.controller.signal,
      },
      settings,
      engineId,
      (delta) => sendTo(job, { kind: 'delta', requestId: request.requestId, text: delta }),
    )

    sendTo(job, {
      kind: 'done',
      requestId: request.requestId,
      result: {
        segments: result.segments,
        engineLabel: result.engineLabel,
        usedFallback: result.usedFallback,
        cached: result.cached,
        elapsedMs: result.elapsedMs,
        detectedLang: result.detectedLang,
      },
    })

    await addHistory({
      mode: 'translate',
      sourceText: request.segments.join('\n\n'),
      resultText: result.segments.join('\n\n'),
      engineLabel: result.engineLabel,
      sourceLang: request.sourceLang,
      targetLang: request.targetLang,
    })
  } catch (error) {
    const appError = toAppError(error)
    const aborted = isAbortError(appError)
    sendTo(job, {
      kind: 'error',
      requestId: request.requestId,
      code: aborted ? 'abort' : appError.code,
      message: aborted ? '已取消' : appError.message,
    })
  } finally {
    jobs.delete(request.requestId)
  }
}

async function runTest(request: TestJobRequest, job: Job): Promise<void> {
  try {
    const result = await testAiProvider(request.config)
    sendTo(job, {
      kind: 'testDone',
      requestId: request.requestId,
      latencyMs: result.latencyMs,
      sample: result.sample,
    })
  } catch (error) {
    const appError = toAppError(error)
    sendTo(job, {
      kind: 'error',
      requestId: request.requestId,
      code: appError.code,
      message: appError.message,
    })
  } finally {
    jobs.delete(request.requestId)
  }
}

export function handleJobMessage(port: chrome.runtime.Port, request: JobRequest): void {
  if (!request || typeof request !== 'object' || typeof request.kind !== 'string') return

  if (request.kind === 'cancel') {
    jobs.get(request.requestId)?.controller.abort()
    return
  }

  const existing = jobs.get(request.requestId)
  if (existing) {
    existing.ports.add(port)
    return
  }

  const job: Job = { controller: new AbortController(), ports: new Set([port]) }
  jobs.set(request.requestId, job)

  if (request.kind === 'translate') {
    void runTranslate(request, job)
    return
  }

  if (request.kind === 'test') {
    void runTest(request, job)
  }
}

export function removePort(port: chrome.runtime.Port): void {
  for (const job of jobs.values()) job.ports.delete(port)
}
