// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleJobMessage } from '../src/background/jobs'
import type { JobEvent } from '../src/core/messaging'
import { clearLocal, readLocal } from '../src/storage/local'
import { clearDictionaryCache } from '../src/core/dictionary/lookup'
import { DEFAULT_SETTINGS, defaultDictionary, defaultServices, saveSettings } from '../src/storage/settings'
import type { HistoryEntry } from '../src/storage/history'

const youdaoHello = {
  simple: { query: 'hello', word: [{ ukphone: 'həˈləʊ', usphone: 'həˈloʊ' }] },
  ec: {
    word: [
      {
        trs: [{ tr: [{ l: { i: ['int. 喂，你好'] } }] }],
        wfs: [{ wf: { name: '复数', value: 'hellos' } }],
      },
    ],
  },
}

function fakePort(events: JobEvent[]): chrome.runtime.Port {
  return {
    postMessage: (event: JobEvent) => events.push(event),
  } as unknown as chrome.runtime.Port
}

async function waitForEvent(events: JobEvent[]): Promise<JobEvent> {
  for (let index = 0; index < 200; index += 1) {
    const terminal = events.find((event) => event.kind === 'done' || event.kind === 'dictDone' || event.kind === 'error')
    if (terminal) return terminal
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('没有收到任务结束事件')
}

function googleResponse(): Response {
  return new Response(JSON.stringify([['你好', 'en']]), { status: 200 })
}

beforeEach(async () => {
  await clearLocal()
  clearDictionaryCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('查词任务', () => {
  it('命中词典时回 dictDone，并把词条写进历史', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      expect(url).toContain('dict.youdao.com/jsonapi')
      return new Response(JSON.stringify(youdaoHello), { status: 200 })
    })
    const events: JobEvent[] = []
    handleJobMessage(fakePort(events), {
      kind: 'dict',
      requestId: 'dict-1',
      word: 'hello',
      sourceLang: 'en',
      targetLang: 'zh-CN',
    })
    const event = await waitForEvent(events)
    expect(event.kind).toBe('dictDone')
    if (event.kind !== 'dictDone') return
    expect(event.result.entry.word).toBe('hello')
    expect(event.result.entry.translations[0]?.text).toBe('喂，你好')

    const history = await readLocal<HistoryEntry[]>('history.v1', [])
    expect(history[0]?.sourceText).toBe('hello')
    expect(history[0]?.resultText).toContain('喂，你好')
  })

  it('词典未收录时改用翻译，并带上说明', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url)
      if (url.includes('dict.youdao.com')) {
        return new Response(JSON.stringify({ input: 'zzzqqq', meta: { isHasSimpleDict: '0' } }), { status: 200 })
      }
      return googleResponse()
    })
    const events: JobEvent[] = []
    handleJobMessage(fakePort(events), {
      kind: 'dict',
      requestId: 'dict-2',
      word: 'zzzqqq',
      sourceLang: 'en',
      targetLang: 'zh-CN',
    })
    const event = await waitForEvent(events)
    expect(event.kind).toBe('done')
    if (event.kind !== 'done') return
    expect(event.result.segments).toEqual(['你好'])
    expect(event.result.notice).toContain('词典未收录')
    expect(urls.some((url) => url.includes('clients5.google.com'))).toBe(true)
  })

  it('英英词典遇到中文词直接走翻译，不显示词典提示', async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      services: defaultServices(),
      dictionary: { ...defaultDictionary(), service: 'freedict' },
    })
    const urls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url)
      return googleResponse()
    })
    const events: JobEvent[] = []
    handleJobMessage(fakePort(events), {
      kind: 'dict',
      requestId: 'dict-4',
      word: '你好',
      sourceLang: 'zh-CN',
      targetLang: 'en',
    })
    const event = await waitForEvent(events)
    expect(event.kind).toBe('done')
    if (event.kind !== 'done') return
    expect(event.result.notice).toBeUndefined()
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('clients5.google.com')
  })

  it('关掉词典后直接翻译，不再请求词典接口', async () => {
    const services = defaultServices()
    await saveSettings({
      ...DEFAULT_SETTINGS,
      services,
      dictionary: { ...defaultDictionary(), enabled: false },
    })
    const urls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url)
      return googleResponse()
    })
    const events: JobEvent[] = []
    handleJobMessage(fakePort(events), {
      kind: 'dict',
      requestId: 'dict-3',
      word: 'hello',
      sourceLang: 'en',
      targetLang: 'zh-CN',
    })
    const event = await waitForEvent(events)
    expect(event.kind).toBe('done')
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('clients5.google.com')
  })
})
