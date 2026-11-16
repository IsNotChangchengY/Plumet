import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, defaultServices, normalizeSettings, primaryTranslateEngine } from '../src/storage/settings'

describe('normalizeSettings', () => {
  it('空数据返回默认值', () => {
    const settings = normalizeSettings(undefined)
    expect(settings.version).toBe(2)
    expect(settings.services['google-free'].enabled).toBe(true)
    expect(settings.services.baidu.appId).toBe('')
    expect(settings.aiProviders).toEqual([])
  })

  it('v1 的 mtEnabled 迁移到 services', () => {
    const settings = normalizeSettings({
      version: 1,
      mtEnabled: { 'google-free': false, mymemory: true },
      translateEngine: 'mt:mymemory',
    })
    expect(settings.services['google-free'].enabled).toBe(false)
    expect(settings.services.mymemory.enabled).toBe(true)
    expect(settings.translateEngines).toEqual(['mt:mymemory'])
    expect('mtEnabled' in (settings as unknown as Record<string, unknown>)).toBe(false)
    expect('translateEngine' in (settings as unknown as Record<string, unknown>)).toBe(false)
  })

  it('保留已存凭证，非法字段收敛成空串', () => {
    const settings = normalizeSettings({ services: { baidu: { appId: 'app', secret: 42 } } })
    expect(settings.services.baidu.appId).toBe('app')
    expect(settings.services.baidu.secret).toBe('')
    expect(settings.services.baidu.enabled).toBe(true)
    expect(settings.services.microsoft.key).toBe('')
  })

  it('aiProviders 缺字段时补默认值', () => {
    const settings = normalizeSettings({
      aiProviders: [{ id: 'x', label: 'A', baseUrl: 'https://a', model: 'm' }],
    })
    expect(settings.aiProviders[0]?.apiKey).toBe('')
    expect(settings.aiProviders[0]?.temperature).toBe(0.3)
    expect(settings.aiProviders[0]?.presetId).toBe('custom')
  })

  it('aiProviders 的思考强度只认已知档位，其余收敛成空', () => {
    const settings = normalizeSettings({
      aiProviders: [
        { id: 'a', label: 'A', baseUrl: 'https://a', model: 'm', reasoningEffort: 'high' },
        { id: 'b', label: 'B', baseUrl: 'https://a', model: 'm', reasoningEffort: 'extreme' },
        { id: 'c', label: 'C', baseUrl: 'https://a', model: 'm' },
      ],
    })
    expect(settings.aiProviders.map((provider) => provider.reasoningEffort)).toEqual(['high', '', ''])
  })

  it('多引擎列表会去重并剔除空值', () => {
    const settings = normalizeSettings({
      translateEngines: ['mt:baidu', '', '  ', 'mt:baidu', 'ai:abc', 42],
    })
    expect(settings.translateEngines).toEqual(['mt:baidu', 'ai:abc'])
  })

  it('旧版 translateEngine 迁移成单元素列表', () => {
    const settings = normalizeSettings({ translateEngine: ' mt:microsoft ' })
    expect(settings.translateEngines).toEqual(['mt:microsoft'])
  })

  it('空列表回退到默认引擎', () => {
    expect(normalizeSettings({ translateEngines: [] }).translateEngines).toEqual(['mt:google-free'])
  })

  it('默认设置里的 translateEngines 是独立副本', () => {
    const first = normalizeSettings(undefined)
    first.translateEngines.push('mt:baidu')
    expect(DEFAULT_SETTINGS.translateEngines).toEqual(['mt:google-free'])
  })

  it('主引擎取列表首个，列表为空时回退默认', () => {
    const settings = { ...DEFAULT_SETTINGS, translateEngines: [] }
    expect(primaryTranslateEngine(settings)).toBe('mt:google-free')
    expect(primaryTranslateEngine({ ...DEFAULT_SETTINGS, translateEngines: ['ai:x', 'mt:baidu'] })).toBe('ai:x')
  })

  it('默认设置里的 services 是独立副本', () => {
    const first = defaultServices()
    first.baidu.appId = 'changed'
    expect(DEFAULT_SETTINGS.services.baidu.appId).toBe('')
    expect(defaultServices().baidu.appId).toBe('')
  })
})
