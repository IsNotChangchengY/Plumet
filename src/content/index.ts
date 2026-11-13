import { initSelection, translateCurrentSelection } from './selection'

type ContentMessage = {
  type?: string
}

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

function handleMessage(message: ContentMessage): { ok: boolean; status?: string; reason?: string } | null {
  if (!message || typeof message !== 'object') return null
  if (message.type === 'yuyi:ping') {
    return { ok: true, status: 'content-ready' }
  }
  if (message.type === 'yuyi:translate-selection') {
    start()
    const opened = translateCurrentSelection()
    return { ok: opened, reason: opened ? undefined : '没有选中文本，或选区在输入框里' }
  }
  if (message.type === 'yuyi:translate-page') {
    return { ok: false, reason: '网页翻译在 M4 实现' }
  }
  return null
}

try {
  chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
    const result = handleMessage(message)
    if (!result) return false
    sendResponse(result)
    return true
  })
} catch {
  // content script 在某些受限页面不会注入，忽略即可
}
