import type { PageCommandName } from '../core/messaging'
import { handlePageCommand } from './page/translate'
import { initSelection, translateCurrentSelection } from './selection'

type ContentMessage = {
  type?: string
  command?: PageCommandName
}

const isTopFrame = window.top === window
let started = false

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

function handleMessage(message: ContentMessage, sendResponse: (value: unknown) => void): boolean {
  if (!message || typeof message !== 'object') return false
  if (message.type === 'yuyi:ping') {
    sendResponse({ ok: true, status: 'content-ready' })
    return false
  }
  if (message.type === 'yuyi:translate-selection') {
    start()
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
    void handlePageCommand(command).then(sendResponse)
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
