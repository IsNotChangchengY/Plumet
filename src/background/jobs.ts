import { AppError, isAbortError, toAppError } from '../core/errors'
import { translateWithFallback } from '../core/engine'
import { testAiProvider } from '../core/providers/ai/openai-compatible'
import { runCheckChunk } from '../core/providers/ai/check'
import { runPolish } from '../core/providers/ai/polish'
import { aiEngineLabel, resolveAiProviderConfig } from '../core/providers/registry'
import { applyIssues, locateIssues, mergeIssues, splitForCheck } from '../core/check'
import type { CheckChunk, LocatedIssue } from '../core/check'
import type {
  CheckJobRequest,
  CheckJobResult,
  JobEvent,
  JobRequest,
  PolishJobRequest,
  TestJobRequest,
  TranslateJobRequest,
} from '../core/messaging'
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

function sendError(job: Job, requestId: string, error: unknown): void {
  const appError = toAppError(error)
  const aborted = isAbortError(appError)
  sendTo(job, {
    kind: 'error',
    requestId,
    code: aborted ? 'abort' : appError.code,
    message: aborted ? '已取消' : appError.message,
  })
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
    sendError(job, request.requestId, error)
  } finally {
    jobs.delete(request.requestId)
  }
}

async function runCheck(request: CheckJobRequest, job: Job): Promise<void> {
  try {
    const settings = await loadSettings()
    const preferred = request.engineId?.trim() ? request.engineId : settings.checkEngine
    const config = resolveAiProviderConfig(settings, preferred)
    const engineLabel = aiEngineLabel(config)
    const started = Date.now()
    const chunks = splitForCheck(request.text)
    if (chunks.length === 0) throw new AppError('config', '没有可检查的文本')

    const located: LocatedIssue[] = []
    let dropped = 0

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index] as CheckChunk
      if (job.controller.signal.aborted) throw new AppError('abort', '已取消')
      sendTo(job, {
        kind: 'progress',
        requestId: request.requestId,
        done: index,
        total: chunks.length,
        label: `检查第 ${index + 1}/${chunks.length} 段`,
      })
      const rawIssues = await runCheckChunk(config, chunk.text, job.controller.signal)
      const result = locateIssues(rawIssues, chunk.text, chunk.offset, `c${index}`)
      located.push(...result.located)
      dropped += result.dropped
    }

    const issues = mergeIssues(located)
    const corrected = applyIssues(request.text, issues)
    const payload: CheckJobResult = {
      issues: issues.map((issue) => ({
        id: issue.id,
        quote: issue.quote,
        replacement: issue.replacement,
        category: issue.category,
        severity: issue.severity,
        explanation: issue.explanation,
        start: issue.start,
        end: issue.end,
      })),
      corrected,
      engineLabel,
      elapsedMs: Date.now() - started,
      chunks: chunks.length,
      dropped,
    }

    sendTo(job, { kind: 'progress', requestId: request.requestId, done: chunks.length, total: chunks.length })
    sendTo(job, { kind: 'checkDone', requestId: request.requestId, result: payload })

    await addHistory({
      mode: 'check',
      sourceText: request.text,
      resultText: corrected,
      engineLabel,
      sourceLang: settings.sourceLang,
      targetLang: settings.targetLang,
    })
  } catch (error) {
    sendError(job, request.requestId, error)
  } finally {
    jobs.delete(request.requestId)
  }
}

async function runPolishJob(request: PolishJobRequest, job: Job): Promise<void> {
  try {
    const settings = await loadSettings()
    const preferred = request.engineId?.trim() ? request.engineId : settings.polishEngine
    const config = resolveAiProviderConfig(settings, preferred)
    const engineLabel = aiEngineLabel(config)
    const started = Date.now()

    const polished = await runPolish(
      config,
      { text: request.text, instruction: request.instruction },
      (delta) => sendTo(job, { kind: 'delta', requestId: request.requestId, text: delta }),
      job.controller.signal,
    )

    sendTo(job, {
      kind: 'polishDone',
      requestId: request.requestId,
      result: { polished, engineLabel, elapsedMs: Date.now() - started },
    })

    await addHistory({
      mode: 'polish',
      sourceText: request.text,
      resultText: polished,
      engineLabel,
      sourceLang: settings.sourceLang,
      targetLang: settings.targetLang,
    })
  } catch (error) {
    sendError(job, request.requestId, error)
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
    sendError(job, request.requestId, error)
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

  if (request.kind === 'check') {
    void runCheck(request, job)
    return
  }

  if (request.kind === 'polish') {
    void runPolishJob(request, job)
    return
  }

  if (request.kind === 'test') {
    void runTest(request, job)
  }
}

export function removePort(port: chrome.runtime.Port): void {
  for (const job of jobs.values()) job.ports.delete(port)
}
