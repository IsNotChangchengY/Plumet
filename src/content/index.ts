type ContentMessage = {
  type?: string
}

function handle(message: ContentMessage): { ok: boolean; status?: string; reason?: string } | null {
  if (!message || typeof message !== 'object') return null
  if (message.type === 'yuyi:ping') {
    return { ok: true, status: 'content-ready' }
  }
  if (message.type === 'yuyi:translate-page' || message.type === 'yuyi:translate-selection') {
    return { ok: false, reason: '尚未实现（计划见 M3 / M4）' }
  }
  return null
}

try {
  chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
    const result = handle(message)
    if (!result) return false
    sendResponse(result)
    return true
  })
} catch {
  // content script 在某些受限页面不会注入，忽略即可
}
