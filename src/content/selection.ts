import type { ContextScope, Settings } from '../storage/settings'
import { SETTINGS_KEY, loadSettings } from '../storage/settings'
import type { ShortcutSettings } from '../core/shortcuts'
import { defaultShortcuts } from '../core/shortcuts'
import { saveCard } from '../storage/learning'
import type { DictionaryEntry } from '../core/dictionary/types'
import { entryText } from '../core/dictionary/format'
import { snapshotEntry } from '../core/dictionary/snapshot'
import { playPronunciation } from '../core/dictionary/audio'
import { dictionaryQueryFor } from '../core/dictionary/query'
import { resolveTargetLang } from '../core/lang'
import { engineLabelOf } from '../core/providers/labels'
import type { Bubble, BubbleAnchor, BubbleEngineRun } from './bubble'
import { createBubble } from './bubble'
import { DEFAULT_CONTEXT_CHARS, MAX_SELECTION_CHARS, clampIconPosition, looksLikeWord } from './context'
import { buildStructuredContext } from './structure'
import type { SelectionHit, SelectionProbe } from './selection-hit'
import { endPointOf, pageContext, readSelection, rectOf, scanSelectionText } from './selection-hit'
import type { EngineRunResult } from '../core/messaging'
import type { EngineDeltaEvent } from './translate-client'
import { requestSelectionTranslation, requestWordLookup } from './translate-client'
import { applyHostTheme, CONTENT_THEME_CSS } from './theme'
import iconSvg from '../../assets/icon-master.svg?raw'
import { isYuyiNode, isYuyiPath, markUiHost } from './ui-mark'

const ICON_SIZE = 22
const ICON_GAP = 8
const ICON_MARGIN = 6
const CHECK_DELAY = 140
const POINTER_GUARD = 4000
const MAX_ROOTS = 32
const ICON_STYLE = `
  ${CONTENT_THEME_CSS}
  :host { all: initial; }
  .icon {
    width: ${ICON_SIZE}px;
    height: ${ICON_SIZE}px;
    display: block;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    box-shadow: var(--shadow-md);
    cursor: pointer;
    transition: transform var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
  }
  .icon svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .icon:hover {
    transform: translateY(-2px);
    box-shadow: 0 18px 30px -14px rgba(15, 105, 214, 0.55);
  }
  .icon:active {
    transform: translateY(0);
  }
  @media (prefers-reduced-motion: reduce) {
    .icon { transition: none; }
    .icon:hover { transform: none; }
  }
`

let settings: Settings | null = null
let iconHost: HTMLElement | null = null
let bubble: Bubble | null = null
let current: SelectionHit | null = null
let lastTranslation = ''
let lastDictionary: DictionaryEntry | null = null
let lastTargetLang = ''
let pendingVisibleText = ''
let cancelRequest: (() => void) | null = null
let engineMode = false
let dictionaryAvailable = false
let initialized = false
let viewportFrame = 0
let pendingCheck = 0
let pointerGuard = 0
let pointerDown = false
let recentRoots: ShadowRoot[] = []

async function refreshSettings(): Promise<void> {
  try {
    settings = await loadSettings()
  } catch {
    settings = null
  }
  const theme = settings?.theme ?? 'auto'
  if (iconHost) applyHostTheme(iconHost, theme)
  bubble?.setTheme(theme)
  if (settings && settings.selectionTrigger !== 'icon') hideIcon()
}

function contextChars(): number {
  return settings?.selectionContextChars ?? DEFAULT_CONTEXT_CHARS
}

function contextScope(): ContextScope {
  return settings?.selectionContextScope ?? 'section'
}

function probeFrom(event?: Event): SelectionProbe {
  const source = event as MouseEvent | undefined
  if (event) rememberRoots(shadowRootsOf(event))
  return {
    contextChars: contextChars(),
    scope: contextScope(),
    point: source && typeof source.clientX === 'number' ? { x: source.clientX, y: source.clientY } : undefined,
    path: event?.composedPath(),
    roots: recentRoots.slice(),
  }
}

function shadowRootsOf(event: Event): ShadowRoot[] {
  const roots: ShadowRoot[] = []
  for (const target of event.composedPath()) {
    if (!(target instanceof Node)) continue
    const root = target.getRootNode()
    if (!(root instanceof ShadowRoot)) continue
    if (root.host && isYuyiNode(root.host)) continue
    if (!roots.includes(root)) roots.push(root)
  }
  return roots
}

function rememberRoots(roots: ShadowRoot[]): void {
  if (roots.length === 0) return
  recentRoots = recentRoots.filter((root) => root.host && root.host.isConnected)
  for (const root of roots) {
    const index = recentRoots.indexOf(root)
    if (index >= 0) recentRoots.splice(index, 1)
    recentRoots.push(root)
  }
  if (recentRoots.length > MAX_ROOTS) recentRoots.splice(0, recentRoots.length - MAX_ROOTS)
}

function ensureIcon(): HTMLElement {
  if (iconHost) return iconHost
  const host = document.createElement('div')
  markUiHost(host, 'icon')
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483645; display: none;'
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>${ICON_STYLE}</style><button type="button" class="icon" title="翻译选中内容" aria-label="翻译选中内容">${iconSvg}</button>`
  applyHostTheme(host, settings?.theme ?? 'auto')
  const button = shadow.querySelector('button')
  button?.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (current) void openBubble(current)
  })
  button?.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  document.documentElement.appendChild(host)
  iconHost = host
  return host
}

function mountHost(host: HTMLElement): void {
  const fullscreen = document.fullscreenElement
  const parent = fullscreen && !(fullscreen instanceof HTMLMediaElement) ? fullscreen : document.documentElement
  if (host.parentNode !== parent) parent.appendChild(host)
}

function placeIcon(host: HTMLElement, point: { x: number; y: number }): void {
  const position = clampIconPosition(
    point,
    { width: ICON_SIZE, height: ICON_SIZE },
    { width: window.innerWidth, height: window.innerHeight },
    { gap: ICON_GAP, margin: ICON_MARGIN },
  )
  host.style.left = `${position.left}px`
  host.style.top = `${position.top}px`
}

function showIcon(hit: SelectionHit, point?: { x: number; y: number }): void {
  const anchor = point ?? endPointOf(hit)
  if (!anchor) {
    hideIcon()
    return
  }
  const host = ensureIcon()
  mountHost(host)
  placeIcon(host, anchor)
  host.style.display = 'block'
}

function hideIcon(): void {
  if (iconHost) iconHost.style.display = 'none'
}

function ensureBubble(): Bubble {
  if (bubble) return bubble
  bubble = createBubble({
    onCopy: (text) => {
      if (!navigator.clipboard) return
      void navigator.clipboard.writeText(text).then(
        () => bubble?.setCopied(),
        () => undefined,
      )
    },
    onSpeak: (text, lang) => {
      speak(text, lang)
    },
    onAudio: (url, word) => {
      playPronunciation(url, word)
    },
    onSave: (text) => saveCurrentSelection(text),
    onRetry: () => {
      if (!current) return
      bubble?.render({ status: 'loading' })
      startTranslation(current)
    },
    onEngineTranslate: () => {
      if (!current) return
      engineMode = true
      dictionaryAvailable = true
      lastDictionary = null
      startTranslation(current)
    },
    onDictionaryTranslate: () => {
      if (!current) return
      engineMode = false
      dictionaryAvailable = false
      lastDictionary = null
      startTranslation(current)
    },
    onMoreContext: () => {
      expandContext()
    },
    onContinue: () => {
      void continueHiddenSelection()
    },
    onClose: () => {
      closeBubble()
    },
  })
  bubble.setTheme(settings?.theme ?? 'auto')
  return bubble
}

async function saveCurrentSelection(translation?: string): Promise<boolean> {
  const text = translation || lastTranslation
  if (!current || !text) return false
  try {
    await saveCard({
      text: current.text,
      translation: text,
      dictionary: lastDictionary ?? undefined,
      sourceUrl: location.href,
      sourceTitle: document.title,
      sourceLang: settings?.sourceLang ?? 'auto',
      targetLang: lastTargetLang || resolveTargetLang(settings?.targetLang ?? 'zh-CN', current.text),
    })
    return true
  } catch {
    return false
  }
}

function speak(text: string, lang?: string): void {
  try {
    const utterance = new SpeechSynthesisUtterance(text)
    const code = lang || lastTargetLang
    if (code) utterance.lang = code
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  } catch {
    // 某些页面禁用了语音合成，忽略
  }
}

function startTranslation(hit: SelectionHit): void {
  cancelRequest?.()
  cancelRequest = null
  if (!settings) {
    bubble?.render({ status: 'error', message: '读取设置失败，请刷新页面后再试' })
    return
  }
  const word = looksLikeWord(hit.text)
  const targetLang = resolveTargetLang(settings.targetLang, hit.text)
  lastTargetLang = targetLang
  const query = engineMode ? null : dictionaryQueryFor(settings.dictionary, hit.text)
  const expandable = !word && !query && hit.scope !== 'page' && hit.block !== null && hit.text.length <= MAX_SELECTION_CHARS
  const prefs = settings
  const runs: BubbleEngineRun[] = prefs.translateEngines.map((engineId) => ({
    engineId,
    label: engineLabelOf(prefs, engineId),
    text: '',
    done: false,
  }))
  const renderStreaming = (): void => {
    if (!bubble?.isOpen()) return
    bubble.render({
      status: 'streaming',
      text: runs[0]?.text ?? '',
      runs: runs.map((run) => ({ ...run })),
    })
  }
  const applyEngineDelta = (event: EngineDeltaEvent): void => {
    const run = runs.find((item) => item.engineId === event.engineId)
    if (!run || run.done) return
    run.text += event.text
    renderStreaming()
  }
  const applyEngineDone = (result: EngineRunResult): void => {
    const run = runs.find((item) => item.engineId === result.engineId)
    if (!run) return
    run.done = true
    if (result.ok) {
      run.text = result.segments.join('\n\n')
      run.elapsedMs = result.elapsedMs
      run.cached = result.cached
      run.notice = result.notice
    } else {
      run.error = result.message
    }
    renderStreaming()
  }
  if (query) {
    const dictionary = settings.dictionary
    bubble?.render({ status: 'loading', label: '正在查词' })
    cancelRequest = requestWordLookup(
      {
        word: query.word,
        sourceLang: settings.sourceLang,
        targetLang,
        context: hit.context,
        engineIds: runs.map((run) => run.engineId),
      },
      {
        onEngineDelta: applyEngineDelta,
        onEngineDone: applyEngineDone,
        onResult(result) {
          cancelRequest = null
          if (result.kind === 'dictionary') {
            const text = entryText(result.entry)
            lastTranslation = text
            lastDictionary = snapshotEntry(result.entry)
            bubble?.render({
              status: 'done',
              text,
              engineLabel: result.engineLabel,
              elapsedMs: result.elapsedMs,
              word: true,
              dictionary: result.entry,
              display: dictionary.sections,
            })
            return
          }
          lastTranslation = result.text
          lastDictionary = null
          bubble?.render({
            status: 'done',
            text: result.text,
            engineLabel: result.engineLabel,
            elapsedMs: result.elapsedMs,
            word,
            expandable,
            context: hit.context,
            cached: result.cached,
            runs: runs.map((run) => ({ ...run })),
          })
        },
        onError(message) {
          cancelRequest = null
          bubble?.render({ status: 'error', message })
        },
      },
    )
    return
  }
  bubble?.render({ status: 'loading', count: runs.length })
  cancelRequest = requestSelectionTranslation(
    {
      text: hit.text,
      context: hit.context,
      sourceLang: settings.sourceLang,
      targetLang,
      engineIds: runs.map((run) => run.engineId),
    },
    {
      onEngineDelta: applyEngineDelta,
      onEngineDone: applyEngineDone,
      onDone(result) {
        cancelRequest = null
        lastTranslation = result.text
        lastDictionary = null
        bubble?.render({
          status: 'done',
          text: result.text,
          engineLabel: result.engineLabel,
          elapsedMs: result.elapsedMs,
          word,
          expandable,
          context: hit.context,
          cached: result.cached,
          runs: runs.map((run) => ({ ...run })),
          dictionaryAvailable,
        })
      },
      onError(message) {
        cancelRequest = null
        bubble?.render({ status: 'error', message, dictionaryAvailable })
      },
    },
  )
}

function expandContext(): void {
  if (!current) return
  cancelRequest?.()
  cancelRequest = null
  const page = pageContext()
  const expanded: SelectionHit = {
    ...current,
    scope: 'page',
    context: buildStructuredContext({
      block: current.block,
      selection: current.text,
      title: page.title,
      host: page.host,
      contextChars: contextChars(),
      scope: 'page',
      range: current.range,
    }),
  }
  current = expanded
  bubble?.render({ status: 'loading', label: '正在带上整页结构重译' })
  startTranslation(expanded)
}

async function openBubble(hit: SelectionHit): Promise<void> {
  hideIcon()
  const view = ensureBubble()
  current = hit
  lastTranslation = ''
  lastDictionary = null
  lastTargetLang = ''
  pendingVisibleText = ''
  engineMode = false
  dictionaryAvailable = false
  view.setSource(hit.text)
  view.showAt(anchorOf(hit))
  if (hit.range) {
    const scan = scanSelectionText(hit.range)
    if (scan.hidden) {
      pendingVisibleText = scan.text
      view.render({ status: 'guard', text: hit.text })
      return
    }
  }
  view.render({ status: 'loading' })
  if (!settings) await refreshSettings()
  startTranslation(hit)
}

async function continueHiddenSelection(): Promise<void> {
  if (!current) return
  const visible = pendingVisibleText
  pendingVisibleText = ''
  current = { ...current, text: visible || current.text }
  const view = ensureBubble()
  view.setSource(current.text)
  view.render({ status: 'loading' })
  if (!settings) await refreshSettings()
  startTranslation(current)
}

function anchorOf(hit: SelectionHit): BubbleAnchor {
  const rect = rectOf(hit)
  if (rect) return { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.right - rect.left }
  if (hit.point) return { top: hit.point.y, bottom: hit.point.y, left: hit.point.x }
  return { top: window.innerHeight / 2, bottom: window.innerHeight / 2, left: window.innerWidth / 2 }
}

function closeBubble(): void {
  cancelRequest?.()
  cancelRequest = null
  current = null
  lastTranslation = ''
  lastDictionary = null
  lastTargetLang = ''
  pendingVisibleText = ''
  engineMode = false
  dictionaryAvailable = false
  bubble?.hide()
}

function cancelPending(): void {
  if (!pendingCheck) return
  window.clearTimeout(pendingCheck)
  pendingCheck = 0
}

function scheduleCheck(event: Event | undefined, delay: number): void {
  cancelPending()
  const probe = probeFrom(event)
  pendingCheck = window.setTimeout(() => {
    pendingCheck = 0
    check(probe)
  }, delay)
}

function check(probe: SelectionProbe): void {
  if (!settings || settings.selectionTrigger !== 'icon') {
    hideIcon()
    return
  }
  const hit = readSelection(probe)
  if (!hit) {
    hideIcon()
    return
  }
  if (bubble?.isOpen()) {
    if (current && current.text === hit.text) return
    closeBubble()
  }
  current = hit
  showIcon(hit, probe.point)
}

function onPointerDown(event: PointerEvent): void {
  if (isYuyiPath(event.composedPath())) return
  rememberRoots(shadowRootsOf(event))
  pointerDown = true
  if (pointerGuard) window.clearTimeout(pointerGuard)
  pointerGuard = window.setTimeout(() => {
    pointerDown = false
    pointerGuard = 0
  }, POINTER_GUARD)
  cancelPending()
  hideIcon()
  if (bubble?.isOpen()) closeBubble()
}

function onPointerUp(): void {
  pointerDown = false
  if (pointerGuard) {
    window.clearTimeout(pointerGuard)
    pointerGuard = 0
  }
}

function onPointerMove(event: PointerEvent): void {
  if (!pointerDown) return
  rememberRoots(shadowRootsOf(event))
}

function onMouseUp(event: MouseEvent): void {
  if (isYuyiPath(event.composedPath())) return
  pointerDown = false
  if (!settings || settings.selectionTrigger !== 'icon') {
    hideIcon()
    return
  }
  scheduleCheck(event, 0)
}

function onSelectionChange(): void {
  if (pointerDown) return
  if (!settings || settings.selectionTrigger !== 'icon') return
  scheduleCheck(undefined, CHECK_DELAY)
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  cancelPending()
  hideIcon()
  if (bubble?.isOpen()) closeBubble()
}

function onViewportChange(): void {
  if (viewportFrame) return
  viewportFrame = window.requestAnimationFrame(() => {
    viewportFrame = 0
    if (!current) return
    if (iconHost && iconHost.style.display === 'block') {
      const point = endPointOf(current)
      if (point) placeIcon(iconHost, point)
    }
    if (!bubble?.isOpen()) return
    const rect = rectOf(current)
    if (!rect) {
      closeBubble()
      return
    }
    current = { ...current, rect }
    bubble.showAt({ top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.right - rect.left })
  })
}

export function contentShortcuts(): ShortcutSettings {
  return settings?.shortcuts ?? defaultShortcuts()
}

export function translateCurrentSelection(): boolean {
  const hit = readSelection({ contextChars: contextChars(), scope: contextScope() })
  if (!hit) return false
  void openBubble(hit)
  return true
}

export function initSelection(): void {
  if (initialized) return
  initialized = true
  void refreshSettings()
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('pointermove', onPointerMove, true)
  document.addEventListener('pointerup', onPointerUp, true)
  document.addEventListener('pointercancel', onPointerUp, true)
  document.addEventListener('mouseup', onMouseUp, true)
  document.addEventListener('selectionchange', onSelectionChange)
  document.addEventListener('select', onSelectionChange, true)
  document.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', onViewportChange)
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[SETTINGS_KEY]) void refreshSettings()
    })
  } catch {
    // 非扩展环境（例如本地预览）没有 chrome.storage
  }
}
