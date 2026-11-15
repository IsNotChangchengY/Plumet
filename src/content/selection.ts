import type { Settings } from '../storage/settings'
import { SETTINGS_KEY, loadSettings } from '../storage/settings'
import { saveCard } from '../storage/learning'
import { entryText } from '../core/dictionary/format'
import { playPronunciation } from '../core/dictionary/audio'
import { dictionaryQueryFor } from '../core/dictionary/query'
import { resolveTargetLang } from '../core/lang'
import type { Bubble, BubbleAnchor } from './bubble'
import { createBubble } from './bubble'
import { DEFAULT_CONTEXT_CHARS, clampIconPosition, looksLikeWord } from './context'
import type { SelectionHit, SelectionProbe } from './selection-hit'
import { endPointOf, readSelection, rectOf } from './selection-hit'
import { requestSelectionTranslation, requestWordLookup } from './translate-client'
import { applyHostTheme, CONTENT_THEME_CSS } from './theme'
import { isYuyiNode, isYuyiPath, markUiHost } from './ui-mark'

const ICON_SIZE = 28
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
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--brand);
    font: 700 13px/1 var(--font);
    box-shadow: var(--shadow-md);
    cursor: pointer;
    transition: transform var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
  }
  .icon:hover {
    transform: translateY(-2px);
    box-shadow: 0 18px 30px -14px rgba(43, 60, 140, 0.4);
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
let lastTargetLang = ''
let cancelRequest: (() => void) | null = null
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

function probeFrom(event?: Event): SelectionProbe {
  const source = event as MouseEvent | undefined
  if (event) rememberRoots(shadowRootsOf(event))
  return {
    contextChars: contextChars(),
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
  shadow.innerHTML = `<style>${ICON_STYLE}</style><button type="button" class="icon" title="翻译选中内容">译</button>`
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
      void navigator.clipboard.writeText(text).catch(() => undefined)
    },
    onSpeak: (text, lang) => {
      speak(text, lang)
    },
    onAudio: (url, word) => {
      playPronunciation(url, word)
    },
    onSave: () => {
      void saveCurrentSelection()
    },
    onRetry: () => {
      if (!current) return
      bubble?.render({ status: 'loading' })
      startTranslation(current)
    },
    onClose: () => {
      closeBubble()
    },
  })
  bubble.setTheme(settings?.theme ?? 'auto')
  return bubble
}

async function saveCurrentSelection(): Promise<void> {
  if (!current || !lastTranslation) return
  try {
    await saveCard({
      text: current.text,
      translation: lastTranslation,
      context: current.context,
      sourceUrl: location.href,
      sourceTitle: document.title,
      sourceLang: settings?.sourceLang ?? 'auto',
      targetLang: lastTargetLang || resolveTargetLang(settings?.targetLang ?? 'zh-CN', current.text),
    })
    bubble?.setSaved(true)
  } catch {
    // 存储不可用时维持未收藏态
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
  const query = dictionaryQueryFor(settings.dictionary, hit.text)
  if (query) {
    const dictionary = settings.dictionary
    bubble?.render({ status: 'loading', label: '正在查词' })
    let streamed = ''
    cancelRequest = requestWordLookup(
      { word: query.word, sourceLang: settings.sourceLang, targetLang, context: hit.context },
      {
        onDelta(delta) {
          streamed += delta
          bubble?.render({ status: 'streaming', text: streamed })
        },
        onResult(result) {
          cancelRequest = null
          if (result.kind === 'dictionary') {
            const text = entryText(result.entry)
            lastTranslation = text
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
          bubble?.render({
            status: 'done',
            text: result.text,
            engineLabel: result.engineLabel,
            elapsedMs: result.elapsedMs,
            word,
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
  let streamed = ''
  cancelRequest = requestSelectionTranslation(
    {
      text: hit.text,
      context: hit.context,
      sourceLang: settings.sourceLang,
      targetLang,
    },
    {
      onDelta(delta) {
        streamed += delta
        bubble?.render({ status: 'streaming', text: streamed })
      },
      onDone(result) {
        cancelRequest = null
        lastTranslation = result.text
        bubble?.render({
          status: 'done',
          text: result.text,
          engineLabel: result.engineLabel,
          elapsedMs: result.elapsedMs,
          word,
        })
      },
      onError(message) {
        cancelRequest = null
        bubble?.render({ status: 'error', message })
      },
    },
  )
}

async function openBubble(hit: SelectionHit): Promise<void> {
  hideIcon()
  const view = ensureBubble()
  current = hit
  lastTranslation = ''
  lastTargetLang = ''
  view.setSource(hit.text)
  view.showAt(anchorOf(hit))
  view.render({ status: 'loading' })
  if (!settings) await refreshSettings()
  startTranslation(hit)
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
  lastTargetLang = ''
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

export function translateCurrentSelection(): boolean {
  const hit = readSelection({ contextChars: contextChars() })
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
