// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { entryText } from '../src/core/dictionary/format'
import { normalizeEntrySnapshot, snapshotEntry } from '../src/core/dictionary/snapshot'
import { clearDictionaryCache, lookupWord } from '../src/core/dictionary/lookup'
import { dictionaryQueryFor } from '../src/core/dictionary/query'
import { isDictionaryWord, parseDictionaryQuery } from '../src/core/dictionary/word'
import { createDictionaryProvider } from '../src/core/providers/dict/registry'
import { DICTIONARY_SERVICES } from '../src/core/providers/dict/services'
import { parseFreeDictionary } from '../src/core/providers/dict/freedict'
import { audioUrl, parseYoudao } from '../src/core/providers/dict/youdao'
import { defaultDictionary, normalizeSettings } from '../src/storage/settings'

const youdaoHello = {
  simple: {
    query: 'hello',
    word: [{ ukphone: 'həˈləʊ', usphone: 'həˈloʊ', ukspeech: 'hello&type=1', usspeech: 'hello&type=2' }],
  },
  ec: {
    word: [
      {
        ukphone: 'həˈləʊ',
        usphone: 'həˈloʊ',
        trs: [{ tr: [{ l: { i: ['int. 喂，你好'] } }] }, { tr: [{ l: { i: ['n. 招呼，问候'] } }] }],
        wfs: [
          { wf: { name: '复数', value: 'hellos' } },
          { wf: { name: '过去式', value: 'helloed' } },
        ],
        'return-phrase': { l: { i: 'hello' } },
      },
    ],
  },
  ee: {
    word: {
      trs: [
        {
          pos: 'n.',
          tr: [
            {
              l: { i: 'a word of greeting' },
              exam: { i: { f: { l: [{ i: 'she said hello' }] } } },
            },
          ],
        },
      ],
    },
  },
  blng_sents_part: {
    'sentence-pair': [{ sentence: 'She said <b>hello</b>.', 'sentence-translation': '她说你好。' }],
  },
  phrs: {
    phrs: [{ phr: { headword: { l: { i: 'say hello' } }, trs: [{ tr: { l: { i: '打招呼' } } }] } }],
  },
}

const youdaoHelloZh = {
  simple: { query: '你好', word: [{ phone: 'nǐ hǎo', 'return-phrase': '你好' }] },
  ce: {
    word: [
      {
        trs: [
          { tr: [{ l: { i: ['', { '#text': 'hello' }, '!'], '#tran': '喂，你好' } }] },
          { tr: [{ l: { pos: 'n.', i: ['', { '#text': 'hi' }] } }] },
        ],
        phone: 'nǐ hǎo',
        'return-phrase': { l: { i: '你好' } },
      },
    ],
  },
  blng_sents_part: {
    'sentence-pair': [{ sentence: '你好，西蒙！', 'sentence-translation': 'Hello, Simon!' }],
  },
}

const freeHello = [
  {
    word: 'hello',
    phonetics: [
      { text: '/həˈləʊ/', audio: '' },
      { text: '/həˈləʊ/', audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/hello-uk.mp3' },
      { text: '/həˈloʊ/', audio: '' },
    ],
    meanings: [
      {
        partOfSpeech: 'noun',
        definitions: [{ definition: 'a greeting', example: 'she said hello' }],
      },
      { partOfSpeech: 'verb', definitions: [{ definition: 'to greet someone' }] },
    ],
  },
]

afterEach(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  clearDictionaryCache()
})

describe('isDictionaryWord', () => {
  it('单个英文单词与带标点的写法都算', () => {
    expect(isDictionaryWord('hello')).toBe(true)
    expect(isDictionaryWord('  Hello ')).toBe(true)
    expect(isDictionaryWord("don't")).toBe(true)
    expect(isDictionaryWord('well-known')).toBe(true)
    expect(isDictionaryWord('hello!')).toBe(true)
    expect(isDictionaryWord('hello world')).toBe(false)
    expect(isDictionaryWord('123')).toBe(false)
    expect(isDictionaryWord('')).toBe(false)
    expect(isDictionaryWord('a'.repeat(41))).toBe(false)
  })
})

describe('isDictionaryWord 的中文词', () => {
  it('1–4 个汉字算一个词，长句不算', () => {
    expect(isDictionaryWord('你好')).toBe(true)
    expect(isDictionaryWord('跑')).toBe(true)
    expect(isDictionaryWord('一心一意')).toBe(true)
    expect(isDictionaryWord('今天天气很好')).toBe(false)
    expect(isDictionaryWord('你好！')).toBe(true)
    expect(isDictionaryWord('“苹果”')).toBe(true)
    expect(isDictionaryWord('hello.')).toBe(true)
    expect(isDictionaryWord('hello world')).toBe(false)
  })

  it('带方向与标点裁剪', () => {
    expect(parseDictionaryQuery('你好')).toEqual({ word: '你好', direction: 'zh-en' })
    expect(parseDictionaryQuery('Hello,')).toEqual({ word: 'Hello', direction: 'en-zh' })
    expect(parseDictionaryQuery('……')).toBe(null)
  })
})

describe('有道词典解析', () => {
  it('音标、释义、词形、英英、例句与词组都取到', () => {
    const entry = parseYoudao(youdaoHello, 'hello')
    if (!entry) throw new Error('应当解析成功')
    expect(entry.word).toBe('hello')
    expect(entry.phonetics.map((item) => item.label)).toEqual(['英', '美'])
    expect(entry.phonetics[0]?.audio).toContain('audio=hello&type=1')
    expect(entry.translations[0]).toEqual({ pos: 'int.', text: '喂，你好' })
    expect(entry.translations[1]).toEqual({ pos: 'n.', text: '招呼，问候' })
    expect(entry.definitions[0]).toEqual({ pos: 'n.', text: 'a word of greeting', example: 'she said hello' })
    expect(entry.forms).toEqual([
      { name: '复数', value: 'hellos' },
      { name: '过去式', value: 'helloed' },
    ])
    expect(entry.examples).toEqual([{ source: 'She said hello.', target: '她说你好。' }])
    expect(entry.phrases).toEqual([{ phrase: 'say hello', meaning: '打招呼' }])
  })

  it('有柯林斯词典时优先用它做英英释义', () => {
    const entry = parseYoudao(
      {
        ...youdaoHello,
        collins_primary: {
          gramcat: [
            {
              partofspeech: 'convention',
              senses: [
                { definition: 'said to someone when you meet them', examples: [{ example: 'Hello, Trish.' }] },
                { word: '（见面问候时说）喂，你好' },
              ],
            },
          ],
        },
      },
      'hello',
    )
    expect(entry?.definitions).toEqual([
      { pos: 'convention', text: 'said to someone when you meet them', example: 'Hello, Trish.' },
    ])
  })

  it('中文词解析出英文释义、拼音与例句', () => {
    const entry = parseYoudao(youdaoHelloZh, '你好')
    if (!entry) throw new Error('应当解析成功')
    expect(entry.direction).toBe('zh-en')
    expect(entry.word).toBe('你好')
    expect(entry.phonetics[0]?.label).toBe('拼音')
    expect(entry.phonetics[0]?.text).toBe('nǐ hǎo')
    expect(entry.phonetics[0]?.audio).toContain('type=1')
    expect(entry.translations).toEqual([
      { pos: '', text: 'hello!' },
      { pos: 'n.', text: 'hi' },
    ])
    expect(entry.examples).toEqual([{ source: '你好，西蒙！', target: 'Hello, Simon!' }])
    expect(entry.definitions).toEqual([])
  })

  it('拼音缺在 ce 里时退回 ce_new', () => {
    const entry = parseYoudao(
      {
        ...youdaoHelloZh,
        ce: { word: [{ ...youdaoHelloZh.ce.word[0], phone: undefined }] },
        simple: { query: '苹果', word: [{ 'return-phrase': '苹果' }] },
        ce_new: { word: [{ phone: 'píng guǒ' }] },
      },
      '苹果',
    )
    expect(entry?.phonetics[0]?.text).toBe('píng guǒ')
  })

  it('没收录的词返回 null', () => {
    expect(parseYoudao({ input: 'zzzqqqxxx', meta: { isHasSimpleDict: '0' } }, 'zzzqqqxxx')).toBe(null)
    expect(parseYoudao(null, 'hello')).toBe(null)
  })

  it('发音地址按英式/美式拼', () => {
    expect(audioUrl('hello', 'uk')).toBe('https://dict.youdao.com/dictvoice?audio=hello&type=1')
    expect(audioUrl('take off', 'us')).toContain('audio=take%20off&type=2')
  })
})

describe('免费英英词典解析', () => {
  it('音标与释义、例句', () => {
    const entry = parseFreeDictionary(freeHello, 'hello')
    if (!entry) throw new Error('应当解析成功')
    expect(entry.word).toBe('hello')
    expect(entry.phonetics).toHaveLength(2)
    expect(entry.phonetics[0]?.text).toBe('/həˈləʊ/')
    expect(entry.phonetics[0]?.audio).toContain('hello-uk.mp3')
    expect(entry.translations).toEqual([])
    expect(entry.forms).toEqual([])
    expect(entry.definitions.map((item) => item.pos)).toEqual(['noun', 'verb'])
    expect(entry.examples).toEqual([{ source: 'she said hello', target: '' }])
  })

  it('空数据返回 null', () => {
    expect(parseFreeDictionary([], 'hello')).toBe(null)
    expect(parseFreeDictionary({ title: 'No Definitions Found' }, 'hello')).toBe(null)
  })
})

describe('词典服务注册', () => {
  it('就绪即用，能力表与实现一致', () => {
    const byId = new Map(DICTIONARY_SERVICES.map((service) => [service.id, service]))
    expect(byId.get('youdao')?.capabilities.forms).toBe(true)
    expect(byId.get('freedict')?.capabilities.translation).toBe(false)
    expect(createDictionaryProvider('youdao').label).toBe('有道词典')
    expect(createDictionaryProvider('freedict').label).toBe('免费英英词典')
  })
})

describe('lookupWord', () => {
  it('命中后写入内存缓存，第二次不再请求', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url)
      return new Response(JSON.stringify(youdaoHello), { status: 200 })
    })
    const first = await lookupWord({ word: 'hello', service: 'youdao' })
    expect(first.entry?.word).toBe('hello')
    expect(first.cached).toBe(false)
    const second = await lookupWord({ word: 'Hello', service: 'youdao' })
    expect(second.cached).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('dict.youdao.com/jsonapi')
    expect(calls[0]).toContain('q=hello')
  })

  it('非单词直接报 config，不发请求', async () => {
    const calls: unknown[] = []
    vi.stubGlobal('fetch', async () => {
      calls.push(1)
      return new Response('{}')
    })
    await expect(lookupWord({ word: 'hello world', service: 'youdao' })).rejects.toMatchObject({
      code: 'config',
    })
    expect(calls).toHaveLength(0)
  })
})

describe('中文查词路由', () => {
  it('有道支持中文词，英英词典不支持', () => {
    const youdao = { ...defaultDictionary(), service: 'youdao' as const }
    const free = { ...defaultDictionary(), service: 'freedict' as const }
    expect(dictionaryQueryFor(youdao, '你好')?.direction).toBe('zh-en')
    expect(dictionaryQueryFor(free, '你好')).toBe(null)
    expect(dictionaryQueryFor(free, 'hello')?.direction).toBe('en-zh')
    expect(dictionaryQueryFor({ ...youdao, enabled: false }, '你好')).toBe(null)
  })

  it('英英词典收到中文词直接报 config，不发请求', async () => {
    const calls: unknown[] = []
    vi.stubGlobal('fetch', async () => {
      calls.push(1)
      return new Response('{}')
    })
    await expect(lookupWord({ word: '你好', service: 'freedict' })).rejects.toMatchObject({ code: 'config' })
    expect(calls).toHaveLength(0)
  })

  it('有道中文查词命中并缓存', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url)
      return new Response(JSON.stringify(youdaoHelloZh), { status: 200 })
    })
    const first = await lookupWord({ word: '你好', service: 'youdao' })
    expect(first.entry?.direction).toBe('zh-en')
    const second = await lookupWord({ word: '你好', service: 'youdao' })
    expect(second.cached).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain(encodeURIComponent('你好'))
  })
})

describe('词卡文本', () => {
  it('优先中文释义，按行拼给收藏与历史', () => {
    const entry = parseYoudao(youdaoHello, 'hello')
    if (!entry) throw new Error('应当解析成功')
    expect(entryText(entry)).toBe('int. 喂，你好\nn. 招呼，问候')
  })

  it('没有中文释义时退回英英释义', () => {
    const entry = parseFreeDictionary(freeHello, 'hello')
    if (!entry) throw new Error('应当解析成功')
    expect(entryText(entry)).toContain('a greeting')
  })
})

describe('词典快照', () => {
  it('收藏时保留六类内容', () => {
    const entry = parseYoudao(youdaoHello, 'hello')
    if (!entry) throw new Error('应当解析成功')
    const snapshot = snapshotEntry(entry)
    expect(snapshot.word).toBe('hello')
    expect(snapshot.direction).toBe('en-zh')
    expect(snapshot.phonetics).toHaveLength(2)
    expect(snapshot.translations).toEqual(entry.translations)
    expect(snapshot.definitions).toEqual(entry.definitions)
    expect(snapshot.forms).toEqual(entry.forms)
    expect(snapshot.examples).toEqual(entry.examples)
    expect(snapshot.phrases).toEqual(entry.phrases)
  })

  it('超过上限的条数与超长文本被截断', () => {
    const long = 'x'.repeat(400)
    const snapshot = snapshotEntry({
      word: 'w'.repeat(120),
      direction: 'en-zh',
      phonetics: Array.from({ length: 4 }, (_, index) => ({ label: '英', text: `/x${index}/`, audio: '' })),
      translations: Array.from({ length: 12 }, (_, index) => ({ pos: '', text: `译 ${index}` })),
      definitions: Array.from({ length: 5 }, (_, index) => ({ pos: '', text: `释义 ${index}`, example: long })),
      forms: Array.from({ length: 10 }, (_, index) => ({ name: '形', value: `v${index}` })),
      examples: Array.from({ length: 4 }, (_, index) => ({ source: `句 ${index}`, target: '' })),
      phrases: Array.from({ length: 9 }, (_, index) => ({ phrase: `组 ${index}`, meaning: '' })),
    })
    expect(snapshot.word).toHaveLength(80)
    expect(snapshot.phonetics).toHaveLength(2)
    expect(snapshot.translations).toHaveLength(8)
    expect(snapshot.definitions).toHaveLength(3)
    expect(snapshot.forms).toHaveLength(8)
    expect(snapshot.examples).toHaveLength(2)
    expect(snapshot.phrases).toHaveLength(6)
    expect(snapshot.definitions[0]?.example).toHaveLength(240)
  })

  it('坏快照没有可读内容时返回 null，可读条目保留', () => {
    expect(normalizeEntrySnapshot(null)).toBe(null)
    expect(normalizeEntrySnapshot('hello')).toBe(null)
    expect(normalizeEntrySnapshot({ word: 'hello' })).toBe(null)
    expect(normalizeEntrySnapshot({ translations: [null, { text: 42 }, { text: '   ' }] })).toBe(null)
    const partial = normalizeEntrySnapshot({
      translations: [null, { pos: 'n.', text: '问候' }],
      definitions: 'nope',
    })
    expect(partial?.translations).toEqual([{ pos: 'n.', text: '问候' }])
    expect(partial?.direction).toBe('en-zh')
    expect(normalizeEntrySnapshot({ word: '你好', translations: [{ text: 'hello' }] })?.direction).toBe('zh-en')
  })
})

describe('词典设置', () => {
  it('缺省值与部分写入都收敛到完整结构', () => {
    const empty = normalizeSettings(undefined)
    expect(empty.dictionary.enabled).toBe(true)
    expect(empty.dictionary.service).toBe('youdao')
    expect(empty.dictionary.sections.forms).toBe(true)

    const partial = normalizeSettings({
      dictionary: { service: 'freedict', sections: { examples: true, forms: false } },
    })
    expect(partial.dictionary.service).toBe('freedict')
    expect(partial.dictionary.enabled).toBe(true)
    expect(partial.dictionary.sections.examples).toBe(true)
    expect(partial.dictionary.sections.forms).toBe(false)
    expect(partial.dictionary.sections.translation).toBe(true)

    const invalid = normalizeSettings({ dictionary: { service: 'whatever' } })
    expect(invalid.dictionary.service).toBe('youdao')
  })
})
