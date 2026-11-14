// @vitest-environment node
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { translateText } from '../src/core/engine'
import { md5 } from '../src/core/providers/mt/md5'
import { chunkByBytes, createBaiduProvider, parseBaidu, parseBaiduLines, signBaidu } from '../src/core/providers/mt/baidu'
import {
  azureEndpoint,
  buildAzureUrl,
  createMicrosoftProvider,
  parseAzure,
} from '../src/core/providers/mt/microsoft'
import { toAzureLang, toBaiduLang } from '../src/core/providers/lang-map'
import { aiProviderMissing, missingMtFields } from '../src/core/providers/services'
import { listEngines, resolveEngine } from '../src/core/providers/registry'
import { DEFAULT_SETTINGS, defaultServices } from '../src/storage/settings'
import type { AiProviderConfig, MtServiceConfig, Settings } from '../src/storage/settings'

function settingsWith(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, services: defaultServices(), ...patch }
}

function withService(id: 'baidu' | 'microsoft', patch: Partial<MtServiceConfig>): Settings {
  const services = defaultServices()
  return { ...DEFAULT_SETTINGS, services: { ...services, [id]: { ...services[id], ...patch } } }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('md5', () => {
  it('与 Node crypto 一致（含中文与长文本）', () => {
    const samples = ['', 'abc', 'The quick brown fox jumps over the lazy dog', '百度翻译签名测试', 'a'.repeat(300)]
    for (const sample of samples) {
      expect(md5(sample)).toBe(createHash('md5').update(sample, 'utf8').digest('hex'))
    }
  })

  it('百度签名 = md5(appid + q + salt + 密钥)', () => {
    expect(signBaidu('appid', '你好', '123', 'secret')).toBe(
      createHash('md5').update('appid你好123secret', 'utf8').digest('hex'),
    )
  })
})

describe('语言码映射', () => {
  it('百度用 zh / cht / jp / kor', () => {
    expect(toBaiduLang('zh-CN')).toBe('zh')
    expect(toBaiduLang('zh-TW')).toBe('cht')
    expect(toBaiduLang('ja')).toBe('jp')
    expect(toBaiduLang('ko')).toBe('kor')
    expect(toBaiduLang('auto')).toBe('auto')
    expect(toBaiduLang('xx')).toBe('xx')
  })

  it('微软用 BCP-47', () => {
    expect(toAzureLang('zh-CN')).toBe('zh-Hans')
    expect(toAzureLang('zh-TW')).toBe('zh-Hant')
    expect(toAzureLang('en')).toBe('en')
  })
})

describe('百度响应解析', () => {
  it('多段译文与识别语言', () => {
    const parsed = parseBaidu(
      { from: 'en', trans_result: [{ src: 'a', dst: '甲' }, { src: 'b', dst: '乙' }] },
      2,
    )
    expect(parsed.segments).toEqual(['甲', '乙'])
    expect(parsed.from).toBe('en')
  })

  it('错误码映射成 AppError', () => {
    expect(() => parseBaidu({ error_code: '54001', error_msg: 'Invalid Sign' }, 1)).toThrow(/签名错误/)
    try {
      parseBaidu({ error_code: '54003', error_msg: 'freq' }, 1)
    } catch (error) {
      expect((error as { code?: string }).code).toBe('quota')
    }
  })

  it('段数不一致时报 parse', () => {
    expect(() => parseBaidu({ trans_result: [{ dst: '甲' }] }, 2)).toThrow(/段/)
  })

  it('单段多行按行还原，不按段数校验', () => {
    expect(parseBaiduLines({ from: 'en', trans_result: [{ dst: '甲' }, { dst: '乙' }] })).toBe('甲\n乙')
    expect(() => parseBaiduLines({ trans_result: [] })).toThrow(/译文/)
    expect(() => parseBaiduLines({ error_code: '54001', error_msg: 'Invalid Sign' })).toThrow(/签名错误/)
  })
})

describe('百度多行单段', () => {
  it('选区带换行时拼回分行译文，而不是报段数不符', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ from: 'en', trans_result: [{ dst: '甲' }, { dst: '乙' }] }), { status: 200 }),
    )
    const provider = createBaiduProvider({ ...defaultServices().baidu, appId: 'app', secret: 's' })
    const result = await provider.translate({ segments: ['one\ntwo'], sourceLang: 'en', targetLang: 'zh-CN' })
    expect(result.segments).toEqual(['甲\n乙'])
    expect(result.detectedLang).toBe('en')
  })
})

describe('百度长文本切分', () => {
  it('按字节切分后能拼回原文且不超限', () => {
    const text = '这是一段比较长的中文文本，用来验证按字节切分。'.repeat(40)
    const parts = chunkByBytes(text, 300)
    expect(parts.join('')).toBe(text)
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(300)
  })
})

describe('微软翻译请求', () => {
  it('拼出 v3 地址并带上 Key / 区域 / 数组 body', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(
        JSON.stringify([
          { translations: [{ text: '你好', to: 'zh-Hans' }] },
          { translations: [{ text: '世界', to: 'zh-Hans' }] },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })

    const provider = createMicrosoftProvider({ ...defaultServices().microsoft, key: 'k', region: 'eastasia' })
    const result = await provider.translate({ segments: ['Hello', 'World'], sourceLang: 'auto', targetLang: 'zh-CN' })

    expect(result.segments).toEqual(['你好', '世界'])
    const call = calls[0] as { url: string; init: RequestInit }
    expect(call.url).toContain('/translate?api-version=3.0')
    expect(call.url).toContain('to=zh-Hans')
    expect(call.url).not.toContain('from=')
    const headers = call.init.headers as Record<string, string>
    expect(headers['Ocp-Apim-Subscription-Key']).toBe('k')
    expect(headers['Ocp-Apim-Subscription-Region']).toBe('eastasia')
    expect(JSON.parse(String(call.init.body))).toEqual([{ text: 'Hello' }, { text: 'World' }])
  })

  it('地址与解析工具', () => {
    expect(azureEndpoint({ ...defaultServices().microsoft, endpoint: 'https://x.example/' })).toBe('https://x.example')
    expect(azureEndpoint(defaultServices().microsoft)).toBe('https://api.cognitive.microsofttranslator.com')
    expect(buildAzureUrl('https://e', 'zh-Hans', 'auto')).toBe('https://e/translate?api-version=3.0&to=zh-Hans')
    expect(buildAzureUrl('https://e', 'zh-Hans', 'en')).toContain('from=en')
    expect(parseAzure([{ translations: [{ text: '甲' }], detectedLanguage: { language: 'en' } }], 1)).toEqual({
      segments: ['甲'],
      detectedLang: 'en',
    })
    expect(() => parseAzure({ oops: true }, 1)).toThrow()
  })
})

describe('百度失败不降级', () => {
  it('签名错误直接抛 auth，不再请求免费通道', async () => {
    const calls: unknown[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push(url)
      const body = new URLSearchParams(String(init.body))
      expect(body.get('sign')).toBe(signBaidu('app', 'hello', String(body.get('salt')), 'wrong'))
      return new Response(JSON.stringify({ error_code: '54001', error_msg: 'Invalid Sign' }), { status: 200 })
    })

    const provider = createBaiduProvider({ ...defaultServices().baidu, appId: 'app', secret: 'wrong' })
    await expect(
      provider.translate({ segments: ['hello'], sourceLang: 'en', targetLang: 'zh-CN' }),
    ).rejects.toMatchObject({ code: 'auth' })
    expect(calls).toHaveLength(1)
  })
})

describe('引擎就绪判定', () => {
  it('缺凭证的百度 / 微软不可用', () => {
    expect(missingMtFields(settingsWith(), 'baidu')).toEqual(['AppID', '密钥'])
    expect(missingMtFields(settingsWith(), 'microsoft')).toEqual(['订阅 Key'])
    expect(missingMtFields(settingsWith(), 'google-free')).toEqual([])
  })

  it('关掉的免费通道不进可用列表', () => {
    const services = defaultServices()
    services['google-free'].enabled = false
    expect(missingMtFields({ ...DEFAULT_SETTINGS, services }, 'google-free')).toEqual(['已停用'])
  })

  it('填好凭证后百度就绪', () => {
    expect(missingMtFields(withService('baidu', { appId: 'a', secret: 's' }), 'baidu')).toEqual([])
  })

  it('AI 服务：本地地址不要 Key，云端要 Key', () => {
    const cloud: AiProviderConfig = {
      id: 'c',
      label: 'Cloud',
      presetId: 'custom',
      baseUrl: 'https://api.example.com/v1',
      apiKey: '',
      model: 'm',
      temperature: 0.3,
    }
    const local: AiProviderConfig = { ...cloud, id: 'l', baseUrl: 'http://localhost:11434/v1' }
    expect(aiProviderMissing(cloud)).toEqual(['API Key'])
    expect(aiProviderMissing(local)).toEqual([])
    expect(aiProviderMissing({ ...cloud, baseUrl: '', model: '' })).toEqual(['Base URL', '模型', 'API Key'])
  })

  it('引擎列表按分组返回并带就绪信息', () => {
    const engines = listEngines(withService('baidu', { appId: 'a', secret: 's' }))
    const byId = new Map(engines.map((engine) => [engine.id, engine]))
    expect(byId.get('mt:google-free')?.ready).toBe(true)
    expect(byId.get('mt:baidu')?.ready).toBe(true)
    expect(byId.get('mt:baidu')?.group).toBe('mt')
    expect(byId.get('mt:google-free')?.group).toBe('free')
    expect(byId.get('mt:mymemory')?.group) .toBe('free')
  })

  it('未配置的引擎在 resolveEngine 处报 config', () => {
    expect(() => resolveEngine('mt:baidu', settingsWith())).toThrow(/AppID/)
    try {
      resolveEngine('mt:baidu', settingsWith())
    } catch (error) {
      expect((error as { code?: string }).code).toBe('config')
    }
  })
})

describe('翻译链路', () => {
  it('未配置引擎直接报错，不发任何请求', async () => {
    const calls: unknown[] = []
    vi.stubGlobal('fetch', async () => {
      calls.push(1)
      return new Response('{}')
    })
    await expect(
      translateText({ segments: ['hi'], sourceLang: 'en', targetLang: 'zh-CN' }, settingsWith(), 'mt:baidu'),
    ).rejects.toMatchObject({ code: 'config' })
    expect(calls).toHaveLength(0)
  })
})
