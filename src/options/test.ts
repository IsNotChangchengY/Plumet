import { isJobEvent, YUYI_PORT } from '../core/messaging'
import type { JobEvent } from '../core/messaging'
import { originPattern } from '../core/providers/ai/presets'
import type { AiProviderConfig, MtServiceConfig, MtServiceId } from '../storage/settings'

export type TestResult = { latencyMs: number; sample: string }

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `test-${Date.now()}`
}

function runTest(build: (requestId: string) => Record<string, unknown>): Promise<TestResult> {
  const requestId = newRequestId()
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: YUYI_PORT })
    const timer = setTimeout(() => {
      port.disconnect()
      reject(new Error('测试超时（60 秒），请检查网络或服务地址'))
    }, 60_000)
    port.onMessage.addListener((event: unknown) => {
      if (!isJobEvent(event)) return
      const jobEvent = event as JobEvent
      if (jobEvent.requestId !== requestId) return
      clearTimeout(timer)
      port.disconnect()
      if (jobEvent.kind === 'testDone') {
        resolve({ latencyMs: jobEvent.latencyMs, sample: jobEvent.sample })
        return
      }
      if (jobEvent.kind === 'error') {
        reject(new Error(jobEvent.message))
        return
      }
      reject(new Error('收到了意外的测试结果'))
    })
    port.onDisconnect.addListener(() => clearTimeout(timer))
    port.postMessage(build(requestId))
  })
}

export function testAiService(config: AiProviderConfig): Promise<TestResult> {
  return runTest((requestId) => ({ kind: 'test', requestId, target: 'ai', config }))
}

export function testMtService(serviceId: MtServiceId, config: MtServiceConfig): Promise<TestResult> {
  return runTest((requestId) => ({ kind: 'test', requestId, target: 'mt', serviceId, config }))
}

export async function requestHostPermission(baseUrl: string): Promise<boolean> {
  const pattern = originPattern(baseUrl)
  if (!pattern) return false
  try {
    return await chrome.permissions.request({ origins: [pattern] })
  } catch {
    return false
  }
}

export function openLink(url: string): void {
  if (!url) return
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
    void chrome.tabs.create({ url })
    return
  }
  window.open(url, '_blank')
}
