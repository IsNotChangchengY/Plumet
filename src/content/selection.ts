import type { Settings } from '../storage/settings'
import { loadSettings } from '../storage/settings'
import type { Bubble } from './bubble'
import { createBubble } from './bubble'
import {
  DEFAULT_CONTEXT_CHARS,
  MAX_SELECTION_CHARS,
  buildContextWindow,
  composeContext,
  isBlockElement,
  isEditableElement,
  looksLikeWord,
  normalizeSelectionText,
} from './context'
import { requestSelectionTranslation } from './translate-client'
import { applyHostTheme, CONTENT_THEME_CSS } from './theme'
import { isYuyiNode, isYuyiPath, markUiHost } from './ui-mark'

const ICON_SIZE = 28
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

export type SelectionInfo = {
  text: string
  context: string
  rect: { top: number; bottom: number; left: number; right: number }
  range: Range
}

let settings: Settings | null = null
let iconHost: HTMLElement | null = null
let bubble: Bubble | null = null
let current: SelectionInfo | null = null
let cancelRequest: (() => void) | null = null
let initialized = false
let viewportFrame = 0

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

function isOurNode(node: Node | null): boolean {
  return isYuyiNode(node)
}

function isOurPath(path: EventTarget[]): boolean {
  return isYuyiPath(path)
}

function pickContextText(range: Range, maxChars: number): string {
  let node: Node | null = range.startContainer
  let best = ''
  while (node && node !== document.body) {
    if (node.nodeType === 1) {
      const element = node as HTMLElement
      if (isBlockElement(element)) {
        const text = (element.innerText || element.textContent || '').trim()
        if (text) {
          best = text
          if (text.length >= maxChars * 2) break
        }
      }
    }
    node = node.parentNode
  }
  if (best) return best
  return document.body ? (document.body.innerText || '').slice(0, maxChars * 2) : ''
}

export function readSelectionInfo(): SelectionInfo | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const text = normalizeSelectionText(selection.toString())
  if (!text || text.length > MAX_SELECTION_CHARS) return null
  const range = selection.getRangeAt(0)
  if (range.collapsed) return null
  if (isEditableElement(range.commonAncestorContainer)) return null
  if (isOurNode(range.commonAncestorContainer) || isOurNode(range.startContainer)) return null
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  const contextChars = settings?.selectionContextChars ?? DEFAULT_CONTEXT_CHARS
  const blockText = pickContextText(range, contextChars)
  const context = composeContext({
    title: document.title,
    host: location.hostname,
    window: buildContextWindow(blockText, text, contextChars),
    maxLength: 2000,
  })
  return {
    text,
    context,
    rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
    range,
  }
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

function showIcon(rect: SelectionInfo['rect']): void {
  const host = ensureIcon()
  let left = rect.right + 6
  let top = rect.top - ICON_SIZE - 6
  if (top < 6) top = rect.bottom + 6
  left = Math.min(Math.max(6, left), window.innerWidth - ICON_SIZE - 8)
  top = Math.min(Math.max(6, top), window.innerHeight - ICON_SIZE - 8)
  host.style.left = `${Math.round(left)}px`
  host.style.top = `${Math.round(top)}px`
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
    onSpeak: (text) => {
      speak(text)
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

function speak(text: string): void {
  try {
    const utterance = new SpeechSynthesisUtterance(text)
    if (settings?.targetLang) utterance.lang = settings.targetLang
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  } catch {
    // 某些页面禁用了语音合成，忽略
  }
}

function startTranslation(info: SelectionInfo): void {
  cancelRequest?.()
  cancelRequest = null
  if (!settings) {
    bubble?.render({ status: 'error', message: '读取设置失败，请刷新页面后再试' })
    return
  }
  const word = looksLikeWord(info.text)
  let streamed = ''
  cancelRequest = requestSelectionTranslation(
    {
      text: info.text,
      context: info.context,
      sourceLang: settings.sourceLang,
      targetLang: settings.targetLang,
    },
    {
      onDelta(delta) {
        streamed += delta
        bubble?.render({ status: 'streaming', text: streamed })
      },
      onDone(result) {
        cancelRequest = null
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

async function openBubble(info: SelectionInfo): Promise<void> {
  hideIcon()
  const view = ensureBubble()
  current = info
  view.setSource(info.text)
  view.showAt({ top: info.rect.top, bottom: info.rect.bottom, left: info.rect.left })
  view.render({ status: 'loading' })
  if (!settings) await refreshSettings()
  startTranslation(info)
}

function closeBubble(): void {
  cancelRequest?.()
  cancelRequest = null
  current = null
  bubble?.hide()
}

export function translateCurrentSelection(): boolean {
  const info = readSelectionInfo()
  if (!info) return false
  void openBubble(info)
  return true
}

function onMouseUp(event: MouseEvent): void {
  if (isOurPath(event.composedPath())) return
  if (!settings || settings.selectionTrigger !== 'icon') {
    hideIcon()
    return
  }
  window.setTimeout(() => {
    const info = readSelectionInfo()
    if (!info) {
      hideIcon()
      return
    }
    current = info
    showIcon(info.rect)
  }, 0)
}

function onMouseDown(event: MouseEvent): void {
  if (isOurPath(event.composedPath())) return
  hideIcon()
  if (bubble?.isOpen()) closeBubble()
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  hideIcon()
  if (bubble?.isOpen()) closeBubble()
}

function onViewportChange(): void {
  if (viewportFrame) return
  viewportFrame = window.requestAnimationFrame(() => {
    viewportFrame = 0
    if (!bubble?.isOpen() || !current) return
    const rect = current.range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) {
      closeBubble()
      return
    }
    current.rect = { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
    bubble.showAt({ top: rect.top, bottom: rect.bottom, left: rect.left })
  })
}

export function initSelection(): void {
  if (initialized) return
  initialized = true
  void refreshSettings()
  document.addEventListener('mouseup', onMouseUp, true)
  document.addEventListener('mousedown', onMouseDown, true)
  document.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', onViewportChange)
  try {
    chrome.storage.onChanged.addListener((_changes, area) => {
      if (area === 'local') void refreshSettings()
    })
  } catch {
    // 非扩展环境（例如本地预览）没有 chrome.storage
  }
}
