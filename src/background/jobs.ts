import { AppError, isAbortError, toAppError } from '../core/errors'
import { entryText } from '../core/dictionary/format'
import { lookupWord } from '../core/dictionary/lookup'
import { isDictionaryWord } from '../core/dictionary/word'
import { translateText } from '../core/engine'
import type { EngineResult } from '../core/engine'
import { resolveTargetLang } from '../core/lang'
import { testAiProvider } from '../core/providers/ai/openai-compatible'
import { createMtProvider } from '../core/providers/services'
import { runCheckChunk } from '../core/providers/ai/check'
import { runPolish } from '../core/providers/ai/polish'
import { aiEngineLabel, engineLabel, resolveAiProviderConfig } from '../core/providers/registry'
import { applyIssues, locateIssues, mergeIssues, splitForCheck } from '../core/check'
import type { CheckChunk, LocatedIssue } from '../core/check'
import type {
  CheckJobRequest,
  CheckJobResult,
  DictJobRequest,
  JobEvent,
  JobRequest,
  PolishJobRequest,
  TestJobRequest,
  TranslateJobRequest,
} from '../core/messaging'
import { loadSettings, primaryTranslateEngine } from '../storage/settings'
import type { Settings } from '../storage/settings'
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

type EngineSuccess = { ok: true; engineId: string; result: EngineResult }
type EngineFailure = { ok: false; engineId: string; error: AppError }
type EngineOutcome = EngineSuccess | EngineFailure

function resolveEngineIds(request: TranslateJobRequest, settings: Settings): string[] {
  const explicit = Array.isArray(request.engineIds) ? request.engineIds : []
  const seen = new Set<string>()
  const ids: string[] = []
  for (const item of explicit) {
    const id = typeof item === 'string' ? item.trim() : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  if (ids.length > 0) return ids
  const legacy = request.engineId?.trim()
  return [legacy || primaryTranslateEngine(settings)]
}

async function translateAndReport(
  request: TranslateJobRequest,
  settings: Settings,
  job: Job,
  notice?: string,
): Promise<void> {
  const engineIds = resolveEngineIds(request, settings)
  const targetLang = resolveTargetLang(request.targetLang, request.segments.join('\n'))
  const outcomes = await Promise.all(
    engineIds.map(async (engineId): Promise<EngineOutcome> => {
      try {
        const result = await translateText(
          {
            segments: request.segments,
            sourceLang: request.sourceLang,
            targetLang,
            context: request.context,
            glossary: settings.glossary,
            signal: job.controller.signal,
          },
          settings,
          engineId,
          (delta) =>
            sendTo(job, { kind: 'delta', requestId: request.requestId, text: delta, engineId }),
        )
        sendTo(job, {
          kind: 'engineDone',
          requestId: request.requestId,
          result: {
            engineId,
            engineLabel: result.engineLabel,
            ok: true,
            segments: result.segments,
            cached: result.cached,
            elapsedMs: result.elapsedMs,
            detectedLang: result.detectedLang,
          },
        })
        return { ok: true, engineId, result }
      } catch (error) {
        if (isAbortError(error) || job.controller.signal.aborted) throw error
        const appError = toAppError(error)
        sendTo(job, {
          kind: 'engineDone',
          requestId: request.requestId,
          result: {
            engineId,
            engineLabel: engineLabel(engineId, settings),
            ok: false,
            code: appError.code,
            message: appError.message,
          },
        })
        return { ok: false, engineId, error: appError }
      }
    }),
  )

  const primary = outcomes.find((outcome): outcome is EngineSuccess => outcome.ok)
  if (!primary) {
    const first = outcomes[0]
    throw first && !first.ok ? first.error : new AppError('unknown', '翻译失败')
  }

  sendTo(job, {
    kind: 'done',
    requestId: request.requestId,
    result: {
      segments: primary.result.segments,
      engineLabel: primary.result.engineLabel,
      cached: primary.result.cached,
      elapsedMs: primary.result.elapsedMs,
      detectedLang: primary.result.detectedLang,
      notice: notice || undefined,
    },
  })

  if (!request.silent) {
    await addHistory({
      mode: 'translate',
      sourceText: request.segments.join('\n\n'),
      resultText: primary.result.segments.join('\n\n'),
      engineLabel: primary.result.engineLabel,
      sourceLang: request.sourceLang,
      targetLang,
    })
  }
}

async function runTranslate(request: TranslateJobRequest, job: Job): Promise<void> {
  try {
    const settings = await loadSettings()
    await translateAndReport(request, settings, job)
  } catch (error) {
    sendError(job, request.requestId, error)
  } finally {
    jobs.delete(request.requestId)
  }
}

async function runDict(request: DictJobRequest, job: Job): Promise<void> {
  try {
    const settings = await loadSettings()
    let notice = ''
    if (settings.dictionary.enabled && isDictionaryWord(request.word)) {
      try {
        const lookup = await lookupWord({
          word: request.word,
          service: settings.dictionary.service,
          signal: job.controller.signal,
        })
        if (lookup.entry) {
          sendTo(job, {
            kind: 'dictDone',
            requestId: request.requestId,
            result: {
              entry: lookup.entry,
              engineLabel: lookup.engineLabel,
              elapsedMs: lookup.elapsedMs,
              cached: lookup.cached,
            },
          })
          if (!request.silent) {
            await addHistory({
              mode: 'translate',
              sourceText: lookup.entry.word || request.word,
              resultText: entryText(lookup.entry),
              engineLabel: lookup.engineLabel,
              sourceLang: request.sourceLang,
              targetLang: resolveTargetLang(request.targetLang, request.word),
            })
          }
          return
        }
        notice = '词典未收录，已改用翻译'
      } catch (error) {
        if (isAbortError(error)) throw error
        if (!(error instanceof AppError && error.code === 'config')) notice = '词典查询失败，已改用翻译'
      }
    }
    await translateAndReport(
      {
        kind: 'translate',
        requestId: request.requestId,
        segments: [request.word],
        sourceLang: request.sourceLang,
        targetLang: request.targetLang,
        context: request.context,
        silent: request.silent,
      },
      settings,
      job,
      notice,
    )
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
      targetLang: resolveTargetLang(settings.targetLang, request.text),
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
      targetLang: resolveTargetLang(settings.targetLang, request.text),
    })
  } catch (error) {
    sendError(job, request.requestId, error)
  } finally {
    jobs.delete(request.requestId)
  }
}

async function runTest(request: TestJobRequest, job: Job): Promise<void> {
  try {
    const started = Date.now()
    let sample = ''
    if (request.target === 'ai') {
      sample = (await testAiProvider(request.config)).sample
    } else {
      const provider = createMtProvider(request.serviceId, request.config)
      const result = await provider.translate({
        segments: ['Hello world'],
        sourceLang: 'en',
        targetLang: 'zh-CN',
      })
      sample = result.segments[0] ?? ''
    }
    sendTo(job, {
      kind: 'testDone',
      requestId: request.requestId,
      latencyMs: Date.now() - started,
      sample,
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

  if (request.kind === 'dict') {
    void runDict(request, job)
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
