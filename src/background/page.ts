import type { PageCommand, PageCommandResult } from '../core/messaging'
import { isPageCommand } from '../core/messaging'

async function activeTabId(): Promise<number | null> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const id = tabs[0]?.id
    return typeof id === 'number' ? id : null
  } catch {
    return null
  }
}

export async function forwardPageCommand(command: PageCommand): Promise<PageCommandResult> {
  const tabId = await activeTabId()
  if (tabId === null) return { ok: false, reason: '没有找到当前标签页' }
  try {
    const result = (await chrome.tabs.sendMessage(tabId, command)) as PageCommandResult | undefined
    if (!result || typeof result !== 'object') {
      return { ok: false, reason: '页面没有返回网页翻译状态，刷新页面后再试' }
    }
    return result
  } catch {
    return {
      ok: false,
      reason: '当前页面用不了网页翻译：浏览器内置页、扩展页，或者扩展刚更新还没刷新页面',
    }
  }
}

export function setupPageRouter(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isPageCommand(message)) return false
    void forwardPageCommand(message).then(sendResponse)
    return true
  })
}
