import type { PageCommandName } from '../core/messaging'
import type { PageMode } from '../storage/settings'
import type { ShortcutAction } from '../core/shortcuts'
import { matchShortcut } from '../core/shortcuts'
import { handlePageCommand } from './page/translate'
import { contentShortcuts, initSelection, translateCurrentSelection } from './selection'

type ContentMessage = {
  type?: string
  command?: PageCommandName
  mode?: PageMode
}

const isTopFrame = window.top === window
const ACTION_GRACE = 200
let started = false
let lastAction: ShortcutAction | null = null
let lastActionAt = 0

function start(): void {
  if (started) return
  started = true
  try {
    initSelection()
  } catch {
    // 受限页面里可能拿不到完整 DOM，忽略即可
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true })
} else {
  start()
}

function recentlyHandled(action: ShortcutAction): boolean {
  return lastAction === action && Date.now() - lastActionAt < ACTION_GRACE
}

function markHandled(action: ShortcutAction): void {
  lastAction = action
  lastActionAt = Date.now()
}

function onShortcut(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.repeat || event.isComposing) return
  const shortcuts = contentShortcuts()
  if (matchShortcut(event, shortcuts.selection)) {
    event.preventDefault()
    event.stopPropagation()
    if (recentlyHandled('selection')) return
    markHandled('selection')
    start()
    translateCurrentSelection()
    return
  }
  if (matchShortcut(event, shortcuts.page)) {
    if (!isTopFrame) return
    event.preventDefault()
    event.stopPropagation()
    if (recentlyHandled('page')) return
    markHandled('page')
    start()
    void handlePageCommand('translate')
  }
}

document.addEventListener('keydown', onShortcut, true)

function handleMessage(message: ContentMessage, sendResponse: (value: unknown) => void): boolean {
  if (!message || typeof message !== 'object') return false
  if (message.type === 'yuyi:ping') {
    sendResponse({ ok: true, status: 'content-ready' })
    return false
  }
  if (message.type === 'yuyi:translate-selection') {
    start()
    if (recentlyHandled('selection')) {
      sendResponse({ ok: true })
      return false
    }
    markHandled('selection')
    const opened = translateCurrentSelection()
    sendResponse({ ok: opened, reason: opened ? undefined : '没有选中文本' })
    return false
  }
  if (message.type === 'yuyi:translate-page' || message.type === 'yuyi:page-command') {
    if (!isTopFrame) {
      sendResponse({ ok: false, reason: '网页翻译只在主框架执行' })
      return false
    }
    start()
    const command: PageCommandName = message.command ?? 'translate'
    if (command === 'translate' && recentlyHandled('page')) {
      sendResponse({ ok: true })
      return false
    }
    if (command === 'translate') markHandled('page')
    void handlePageCommand(command, message.mode).then(sendResponse)
    return true
  }
  return false
}

try {
  chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
    return handleMessage(message, sendResponse)
  })
} catch {
  // content script 在某些受限页面不会注入，忽略即可
}
