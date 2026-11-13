import { YUYI_PORT } from '../core/messaging'
import type { JobRequest } from '../core/messaging'
import { handleJobMessage, removePort } from './jobs'
import { setupPageRouter } from './page'

function setupSidePanel(): void {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined)
}

function setupMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'yuyi-open-panel',
      title: '羽译：打开翻译面板',
      contexts: ['all'],
    })
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

async function openPanelForWindow(windowId: number): Promise<void> {
  try {
    await chrome.sidePanel.open({ windowId })
  } catch {
    // 用户手势缺失时浏览器会拒绝打开，忽略即可
  }
}

async function tellContent(tabId: number, type: string): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type })
  } catch {
    // 页面里没有 content script（例如浏览器内置页面）时忽略
  }
}

chrome.runtime.onInstalled.addListener(() => {
  setupSidePanel()
  setupMenus()
})

chrome.runtime.onStartup.addListener(() => {
  setupSidePanel()
})

setupSidePanel()
setupPageRouter()

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const tabId = tab?.id
  const windowId = tab?.windowId
  if (info.menuItemId === 'yuyi-open-panel' && windowId !== undefined) {
    void openPanelForWindow(windowId)
    return
  }
  if (info.menuItemId === 'yuyi-translate-selection' && tabId !== undefined) {
    void tellContent(tabId, 'yuyi:translate-selection')
    return
  }
  if (info.menuItemId === 'yuyi-translate-page' && tabId !== undefined) {
    void tellContent(tabId, 'yuyi:translate-page')
    if (windowId !== undefined) void openPanelForWindow(windowId)
  }
})

chrome.commands.onCommand.addListener((command, tab) => {
  const tabId = tab?.id
  if (command === 'translate-selection' && tabId !== undefined) {
    void tellContent(tabId, 'yuyi:translate-selection')
  }
  if (command === 'translate-page' && tabId !== undefined) {
    void tellContent(tabId, 'yuyi:translate-page')
  }
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
