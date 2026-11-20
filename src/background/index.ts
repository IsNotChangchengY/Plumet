import { YUYI_PORT } from '../core/messaging'
import type { JobRequest } from '../core/messaging'
import { isDefaultShortcut } from '../core/shortcuts'
import { loadSettings } from '../storage/settings'
import { handleJobMessage, removePort } from './jobs'
import { setupPageRouter } from './page'

function setupMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'yuyi-translate-selection',
      title: '羽译：翻译选中内容',
      contexts: ['selection'],
    })
    chrome.contextMenus.create({
      id: 'yuyi-translate-page',
      title: '羽译：翻译此页',
      contexts: ['page'],
    })
  })
}

async function tellContent(tabId: number, type: string, options?: { frameId?: number }): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type }, options)
  } catch {
    // 页面里没有 content script（例如浏览器内置页面）时忽略
  }
}

chrome.runtime.onInstalled.addListener(() => {
  setupMenus()
})

chrome.runtime.onStartup.addListener(() => {
  setupMenus()
})

setupPageRouter()

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const tabId = tab?.id
  if (info.menuItemId === 'yuyi-translate-selection' && tabId !== undefined) {
    const options = typeof info.frameId === 'number' ? { frameId: info.frameId } : undefined
    void tellContent(tabId, 'yuyi:translate-selection', options)
    return
  }
  if (info.menuItemId === 'yuyi-translate-page' && tabId !== undefined) {
    void tellContent(tabId, 'yuyi:translate-page', { frameId: 0 })
  }
})

async function runCommand(command: string, tabId: number): Promise<void> {
  if (command !== 'translate-selection' && command !== 'translate-page') return
  const settings = await loadSettings().catch(() => null)
  if (!settings) return
  if (command === 'translate-selection') {
    if (!isDefaultShortcut('selection', settings.shortcuts.selection)) return
    await tellContent(tabId, 'yuyi:translate-selection')
    return
  }
  if (!isDefaultShortcut('page', settings.shortcuts.page)) return
  await tellContent(tabId, 'yuyi:translate-page', { frameId: 0 })
}

chrome.commands.onCommand.addListener((command, tab) => {
  const tabId = tab?.id
  if (tabId === undefined) return
  void runCommand(command, tabId)
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== YUYI_PORT) return
  port.onMessage.addListener((message: unknown) => {
    handleJobMessage(port, message as JobRequest)
  })
  port.onDisconnect.addListener(() => {
    removePort(port)
  })
})
