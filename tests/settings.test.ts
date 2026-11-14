import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, defaultServices, normalizeSettings } from '../src/storage/settings'

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
    expect(settings.translateEngine).toBe('mt:mymemory')
    expect('mtEnabled' in (settings as unknown as Record<string, unknown>)).toBe(false)
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

  it('默认设置里的 services 是独立副本', () => {
    const first = defaultServices()
    first.baidu.appId = 'changed'
    expect(DEFAULT_SETTINGS.services.baidu.appId).toBe('')
    expect(defaultServices().baidu.appId).toBe('')
  })
})
