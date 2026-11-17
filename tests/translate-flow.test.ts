// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleJobMessage } from '../src/background/jobs'
import { clearCache } from '../src/core/cache'
import type { EngineRunResult, JobEvent } from '../src/core/messaging'
import { clearLocal, readLocal } from '../src/storage/local'
import { DEFAULT_SETTINGS, defaultServices, saveSettings } from '../src/storage/settings'
import type { HistoryEntry } from '../src/storage/history'

function fakePort(events: JobEvent[]): chrome.runtime.Port {
  return {
    postMessage: (event: JobEvent) => events.push(event),
  } as unknown as chrome.runtime.Port
}

async function waitForTerminal(events: JobEvent[]): Promise<JobEvent> {
  for (let index = 0; index < 400; index += 1) {
    const terminal = events.find((event) => event.kind === 'done' || event.kind === 'error')
    if (terminal) return terminal
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('没有收到任务结束事件')
}

function engineResults(events: JobEvent[]): EngineRunResult[] {
  return events
    .filter((event): event is Extract<JobEvent, { kind: 'engineDone' }> => event.kind === 'engineDone')
    .map((event) => event.result)
}

async function historyEntries(min: number): Promise<HistoryEntry[]> {
  for (let index = 0; index < 200; index += 1) {
    const entries = await readLocal<HistoryEntry[]>('history.v1', [])
    if (entries.length >= min) return entries
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return readLocal<HistoryEntry[]>('history.v1', [])
}

function googleResponse(text = '你好'): Response {
  return new Response(JSON.stringify([[text, 'en']]), { status: 200 })
}

function myMemoryResponse(text = '嗨'): Response {
  return new Response(JSON.stringify({ responseData: { translatedText: text } }), { status: 200 })
}

function upstreamError(): Response {
  return new Response('upstream boom', { status: 500 })
}

async function saveMultiEngineSettings(): Promise<void> {
  await saveSettings({
    ...DEFAULT_SETTINGS,
    services: defaultServices(),
    translateEngines: ['mt:google-free', 'mt:mymemory'],
  })
}

beforeEach(async () => {
  await clearLocal()
  await clearCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('多引擎翻译任务', () => {
  it('勾选多个引擎时各自回 engineDone，历史只写主引擎一条', async () => {
    await saveMultiEngineSettings()
    const urls: string[] = []
    vi.stubGlobal('fetch', async (input: string) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('clients5.google.com')) return googleResponse()
      if (url.includes('api.mymemory.translated.net')) return myMemoryResponse()
      throw new Error(`意外的请求 ${url}`)
    })

    const events: JobEvent[] = []
    handleJobMessage(fakePort(events), {
      kind: 'translate',
      requestId: 'multi-1',
      segments: ['hello'],
      sourceLang: 'en',
      targetLang: 'zh-CN',
      engineIds: ['mt:google-free', 'mt:mymemory'],
    })
    const terminal = await waitForTerminal(events)
    expect(terminal.kind).toBe('done')

    const results = engineResults(events)
    expect(results).toHaveLength(2)
    expect(results.find((item) => item.engineId === 'mt:google-free')).toMatchObject({
      ok: true,
      segments: ['你好'],
    })
    expect(results.find((item) => item.engineId === 'mt:mymemory')).toMatchObject({
      ok: true,
      segments: ['嗨'],
    })

    if (terminal.kind !== 'done') return
    expect(terminal.result.segments).toEqual(['你好'])
    expect(terminal.result.engineLabel).toContain('谷歌')
    expect(urls).toHaveLength(2)

    const history = await historyEntries(1)
    expect(history).toHaveLength(1)
    expect(history[0]?.resultText).toBe('你好')
    expect(history[0]?.engineLabel).toContain('谷歌')
  })

  it('请求没带 engineIds 时只走主引擎，不默认铺开全部勾选', async () => {
    await saveMultiEngineSettings()
    const urls: string[] = []
    vi.stubGlobal('fetch', async (input: string) => {
      urls.push(String(input))
      return googleResponse()
    })

    const events: JobEvent[] = []
    handleJobMessage(fakePort(events), {
      kind: 'translate',
      requestId: 'single-1',
      segments: ['hello'],
      sourceLang: 'en',
      targetLang: 'zh-CN',
    })
    const terminal = await waitForTerminal(events)
    expect(terminal.kind).toBe('done')
    expect(engineResults(events)).toHaveLength(1)
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('clients5.google.com')
    if (terminal.kind !== 'done') return
    expect(terminal.result.engineLabel).toContain('谷歌')
  })

  it('单个引擎失败不影响其他引擎，done 取第一个成功结果', async () => {
    await saveMultiEngineSettings()
    vi.stubGlobal('fetch', async (input: string) => {
      const url = String(input)
      if (url.includes('clients5.google.com')) return upstreamError()
      return myMemoryResponse()
    })

    const events: JobEvent[] = []
    handleJobMessage(fakePort(events), {
      kind: 'translate',
      requestId: 'partial-1',
      segments: ['hello'],
      sourceLang: 'en',
      targetLang: 'zh-CN',
      engineIds: ['mt:google-free', 'mt:mymemory'],
    })
    const terminal = await waitForTerminal(events)
    expect(terminal.kind).toBe('done')

    const results = engineResults(events)
    expect(results).toHaveLength(2)
    const failed = results.find((item) => item.engineId === 'mt:google-free')
    expect(failed?.ok).toBe(false)
    if (failed && !failed.ok) expect(failed.code).toBe('network')
    expect(results.find((item) => item.engineId === 'mt:mymemory')).toMatchObject({
      ok: true,
      segments: ['嗨'],
    })

    if (terminal.kind !== 'done') return
    expect(terminal.result.segments).toEqual(['嗨'])
    expect(terminal.result.engineLabel).toContain('MyMemory')

    const history = await historyEntries(1)
    expect(history).toHaveLength(1)
    expect(history[0]?.engineLabel).toContain('MyMemory')
  })

  it('全部引擎失败时报错，不显示部分结果', async () => {
    await saveMultiEngineSettings()
    vi.stubGlobal('fetch', async () => upstreamError())

    const events: JobEvent[] = []
    handleJobMessage(fakePort(events), {
      kind: 'translate',
      requestId: 'fail-1',
      segments: ['hello'],
      sourceLang: 'en',
      targetLang: 'zh-CN',
      engineIds: ['mt:google-free', 'mt:mymemory'],
    })
    const terminal = await waitForTerminal(events)
    expect(terminal.kind).toBe('error')
    if (terminal.kind !== 'error') return
    expect(terminal.code).toBe('network')

    const results = engineResults(events)
    expect(results).toHaveLength(2)
    expect(results.every((item) => !item.ok)).toBe(true)
  })

  it('MT 引擎的缓存键忽略上下文，同一句跨上下文复用', async () => {
    await saveMultiEngineSettings()
    let calls = 0
    vi.stubGlobal('fetch', async (input: string) => {
      const url = String(input)
      if (url.includes('clients5.google.com')) {
        calls += 1
        return googleResponse()
      }
      throw new Error(`意外的请求 ${url}`)
    })

    const first: JobEvent[] = []
    handleJobMessage(fakePort(first), {
      kind: 'translate',
      requestId: 'ctx-1',
      segments: ['hello'],
      sourceLang: 'en',
      targetLang: 'zh-CN',
      context: '页面标题：甲',
    })
    expect((await waitForTerminal(first)).kind).toBe('done')

    const second: JobEvent[] = []
    handleJobMessage(fakePort(second), {
      kind: 'translate',
      requestId: 'ctx-2',
      segments: ['hello'],
      sourceLang: 'en',
      targetLang: 'zh-CN',
      context: '页面标题：乙',
    })
    expect((await waitForTerminal(second)).kind).toBe('done')

    expect(calls).toBe(1)
    expect(engineResults(second)[0]).toMatchObject({ ok: true, cached: true })
  })
})
