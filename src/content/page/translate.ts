import type { PageCommandName, PageCommandResult, PageState } from '../../core/messaging'
import type { Settings } from '../../storage/settings'
import { loadSettings } from '../../storage/settings'
import { isYuyiNode } from '../ui-mark'
import { requestTextTranslation } from '../translate-client'
import type { PageUnit, SkipCounts } from './collect'
import { collectUnits } from './collect'
import type { Pill } from './pill'
import { createPill } from './pill'
import { ensurePageStyle, hasPageTranslations, markUnitFailed, renderTranslation, restorePage } from './render'
import { MAX_UNITS, groupUnits, pickScanRoots } from './text'

const CONCURRENCY = 2
const DEBOUNCE_MS = 500

let state: PageState = { state: 'idle', done: 0, total: 0, failed: 0, mode: 'bilingual' }
let settings: Settings | null = null
let aborted = false
let running = false
let queue: PageUnit[][] = []
let active = new Map<string, () => void>()
let failedUnits: PageUnit[] = []
let seen = new Set<Element>()
let observer: MutationObserver | null = null
let observerTimer: ReturnType<typeof setTimeout> | null = null
let pending: MutationRecord[] = []
let lastHref = ''
let lastSkip: SkipCounts = {}
let pill: Pill | null = null

function ensurePill(): Pill {
  if (pill) return pill
  pill = createPill({
    onCancel: () => {
      cancelPageTranslation()
    },
    onRetry: () => {
      retryFailedPageTranslation()
    },
    onRestore: () => {
      void restorePageTranslation()
    },
    onClose: () => {
      pill?.hide()
    },
  })
  return pill
}

function notifyPanel(): void {
  try {
    const response = chrome.runtime.sendMessage({ type: 'yuyi:page-state', state }) as unknown
    const promise = response as Promise<unknown> | undefined
    if (promise && typeof promise.catch === 'function') void promise.catch(() => undefined)
  } catch {
    // 没有扩展运行时（例如本地预览）时忽略
  }
}

function broadcast(): void {
  ensurePill().render(state)
  if (state.state === 'idle') pill?.hide()
  notifyPanel()
}

function emptyMessage(skipped: SkipCounts): string {
  const parts: string[] = []
  if ((skipped.targetLang ?? 0) > 0) parts.push(`本页 ${skipped.targetLang} 段内容已经是目标语言`)
  if ((skipped.tooLong ?? 0) > 0) parts.push(`${skipped.tooLong} 段文本过长已跳过`)
  if (parts.length === 0) parts.push('本页没有找到可翻译的正文（可能全是代码、图片或输入框）')
  return parts.join('；')
}

function resetRunState(): void {
  aborted = false
  running = false
  queue = []
  active = new Map()
  failedUnits = []
  seen = new Set()
  lastSkip = {}
}

export async function startPageTranslation(): Promise<PageCommandResult> {
  if (running) return { ok: true, state }
  try {
    settings = await loadSettings()
  } catch {
    return { ok: false, reason: '读取设置失败，请刷新页面后再试', state }
  }
  if (hasPageTranslations() || state.state !== 'idle') {
    restorePage()
    resetRunState()
  }
  aborted = false
  ensurePageStyle()
  const collected = collectUnits(document.body, {
    targetLang: settings.targetLang,
    limit: MAX_UNITS,
    seen,
  })
  lastSkip = collected.skipped
  lastHref = location.href
  state = { state: 'running', done: 0, total: collected.units.length, failed: 0, mode: settings.pageMode }
  ensurePill().render(state)
  startObserver()
  if (collected.units.length === 0) {
    stopObserver()
    state = { ...state, state: 'done', message: emptyMessage(lastSkip) }
    broadcast()
    return { ok: true, state }
  }
  broadcast()
  enqueue(groupUnits(collected.units))
  return { ok: true, state }
}

export function cancelPageTranslation(): PageCommandResult {
  aborted = true
  queue = []
  for (const cancel of Array.from(active.values())) cancel()
  active.clear()
  stopObserver()
  if (state.state === 'running') state = { ...state, state: 'cancelled' }
  broadcast()
  return { ok: true, state }
}

export function retryFailedPageTranslation(): PageCommandResult {
  if (running) return { ok: true, state }
  if (failedUnits.length === 0) return { ok: false, reason: '没有失败的段落', state }
  aborted = false
  const retry = failedUnits
  failedUnits = []
  state = { ...state, state: 'running', failed: 0, message: undefined }
  lastHref = location.href
  startObserver()
  broadcast()
  enqueue(groupUnits(retry))
  return { ok: true, state }
}

export async function restorePageTranslation(): Promise<PageCommandResult> {
  if (running) cancelPageTranslation()
  stopObserver()
  restorePage()
  resetRunState()
  state = { state: 'idle', done: 0, total: 0, failed: 0, mode: settings?.pageMode ?? 'bilingual' }
  broadcast()
  return { ok: true, state }
}

export function pageStatus(): PageCommandResult {
  return { ok: true, state }
}

export async function handlePageCommand(command: PageCommandName): Promise<PageCommandResult> {
  if (command === 'translate') return startPageTranslation()
  if (command === 'cancel') return cancelPageTranslation()
  if (command === 'restore') return restorePageTranslation()
  return pageStatus()
}

function enqueue(groups: PageUnit[][]): void {
  queue.push(...groups)
  if (running) return
  running = true
  void pump()
}

async function pump(): Promise<void> {
  const workers: Promise<void>[] = []
  for (let index = 0; index < CONCURRENCY; index += 1) workers.push(worker())
  await Promise.all(workers)
  running = false
  if (aborted) {
    state = { ...state, state: 'cancelled' }
    broadcast()
    return
  }
  if (queue.length > 0) {
    enqueue(queue.splice(0, queue.length))
    return
  }
  if (state.state === 'running') {
    state = { ...state, state: 'done' }
    broadcast()
  }
}

async function worker(): Promise<void> {
  while (!aborted) {
    const batch = queue.shift()
    if (!batch) return
    await runBatch(batch)
  }
}

function markFailed(batch: PageUnit[], message: string): void {
  for (const unit of batch) {
    markUnitFailed(unit)
    failedUnits.push(unit)
  }
  state = { ...state, failed: state.failed + batch.length, message }
}

function runBatch(batch: PageUnit[]): Promise<void> {
  return new Promise((resolve) => {
    const key = batch[0]?.id ?? ''
    let finished = false
    const finish = (): void => {
      if (finished) return
      finished = true
      active.delete(key)
      resolve()
    }
    const cancel = requestTextTranslation(
      {
        segments: batch.map((unit) => unit.text),
        sourceLang: settings?.sourceLang ?? 'auto',
        targetLang: settings?.targetLang ?? 'zh-CN',
        engineId: settings?.pageEngine,
        silent: true,
      },
      {
        onDone(result) {
          if (!aborted) {
            if (result.segments.length !== batch.length) {
              markFailed(batch, '这一批返回的译文段数不对，已跳过')
            } else {
              const mode = settings?.pageMode ?? 'bilingual'
              const targetLang = settings?.targetLang ?? 'zh-CN'
              for (let index = 0; index < batch.length; index += 1) {
                const unit = batch[index] as PageUnit
                renderTranslation(unit, result.segments[index] ?? '', mode, targetLang)
              }
              state = { ...state, done: state.done + batch.length, engineLabel: result.engineLabel }
            }
          }
          finish()
          if (!aborted) broadcast()
        },
        onError(message) {
          if (!aborted) {
            markFailed(batch, message)
            broadcast()
          }
          finish()
        },
      },
    )
    active.set(key, cancel)
    if (aborted) cancel()
  })
}

function startObserver(): void {
  if (observer || typeof MutationObserver === 'undefined' || !document.body) return
  observer = new MutationObserver((records) => {
    if (aborted) return
    for (const record of records) pending.push(record)
    if (observerTimer !== null) return
    observerTimer = setTimeout(() => {
      observerTimer = null
      const batch = pending.splice(0, pending.length)
      flushMutations(batch)
    }, DEBOUNCE_MS)
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

function stopObserver(): void {
  if (observerTimer !== null) {
    clearTimeout(observerTimer)
    observerTimer = null
  }
  pending = []
  observer?.disconnect()
  observer = null
}

function flushMutations(records: MutationRecord[]): void {
  if (aborted || !settings) return
  if (state.total >= MAX_UNITS) return
  const urlChanged = location.href !== lastHref
  if (urlChanged) lastHref = location.href
  const roots = urlChanged ? [document.body] : pickScanRoots(records, (element) => isYuyiNode(element))
  if (roots.length === 0) return
  let remaining = MAX_UNITS - state.total
  const units: PageUnit[] = []
  for (const root of roots) {
    if (remaining <= 0) break
    const collected = collectUnits(root, { targetLang: settings.targetLang, limit: remaining, seen })
    units.push(...collected.units)
    remaining -= collected.units.length
  }
  if (units.length === 0) return
  state = { ...state, total: state.total + units.length, state: 'running' }
  broadcast()
  enqueue(groupUnits(units))
}
