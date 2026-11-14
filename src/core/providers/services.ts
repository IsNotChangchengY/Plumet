import { isLocalBaseUrl } from './ai/presets'
import type { AiProviderConfig, MtServiceConfig, MtServiceId, Settings } from '../../storage/settings'
import type { TranslateProvider } from './types'
import { createBaiduProvider } from './mt/baidu'
import { createGoogleFreeProvider } from './mt/google-free'
import { createMicrosoftProvider } from './mt/microsoft'
import { createMyMemoryProvider } from './mt/mymemory'

export type ServiceField = {
  key: 'appId' | 'secret' | 'key' | 'region' | 'endpoint'
  label: string
  placeholder: string
  secret?: boolean
}

export type ServiceDef = {
  id: MtServiceId
  label: string
  tag: string
  kind: 'free' | 'key'
  fields: ServiceField[]
  applyUrl: string
  quota: string
  steps: string[]
}

export const MT_SERVICES: ServiceDef[] = [
  {
    id: 'google-free',
    label: '谷歌翻译',
    tag: '免 Key',
    kind: 'free',
    fields: [],
    applyUrl: '',
    quota: '',
    steps: [],
  },
  {
    id: 'mymemory',
    label: 'MyMemory',
    tag: '免 Key',
    kind: 'free',
    fields: [],
    applyUrl: 'https://mymemory.translated.net/',
    quota: '匿名额度约 5000 字符/天。',
    steps: [],
  },
  {
    id: 'baidu',
    label: '百度翻译',
    tag: 'AppID + 密钥',
    kind: 'key',
    fields: [
      { key: 'appId', label: 'AppID', placeholder: '2025010100000001' },
      { key: 'secret', label: '密钥', placeholder: '开放平台 → 我的服务', secret: true },
    ],
    applyUrl: 'https://fanyi-api.baidu.com/',
    quota: '个人认证免费额度约 5 万字符/月；标准版 QPS 1，整页翻译会排队。',
    steps: [
      '注册百度翻译开放平台并完成开发者认证。',
      '开通「通用文本翻译」，复制 AppID 与密钥。',
      '填进来，点「测试连接」。',
    ],
  },
  {
    id: 'microsoft',
    label: '微软 / 必应',
    tag: 'Key + 区域',
    kind: 'key',
    fields: [
      { key: 'key', label: '订阅 Key', placeholder: 'Azure 门户 → 资源 → 密钥', secret: true },
      { key: 'region', label: '区域（可选）', placeholder: 'eastasia' },
      { key: 'endpoint', label: 'Endpoint（可选）', placeholder: 'https://api.cognitive.microsofttranslator.com' },
    ],
    applyUrl: 'https://portal.azure.com/#create/Microsoft.CognitiveServicesTextTranslation',
    quota: '免费层约 200 万字符/月。',
    steps: [
      '在 Azure 门户创建「翻译」资源。',
      '在资源的「密钥和终结点」里复制 Key 与区域。',
      '填进来，点「测试连接」。',
    ],
  },
]

export const FREE_SERVICES = MT_SERVICES.filter((service) => service.kind === 'free')
export const KEY_SERVICES = MT_SERVICES.filter((service) => service.kind === 'key')

export function findMtService(id: string): ServiceDef | undefined {
  return MT_SERVICES.find((service) => service.id === id)
}

export function missingMtFields(settings: Settings, id: MtServiceId): string[] {
  const config = settings.services[id]
  if (!config) return ['未配置']
  if (config.enabled === false) return ['已停用']
  if (id === 'baidu') {
    const missing: string[] = []
    if (!config.appId.trim()) missing.push('AppID')
    if (!config.secret.trim()) missing.push('密钥')
    return missing
  }
  if (id === 'microsoft') {
    return config.key.trim() ? [] : ['订阅 Key']
  }
  return []
}

export function aiProviderMissing(config: AiProviderConfig): string[] {
  const missing: string[] = []
  if (!config.baseUrl.trim()) missing.push('Base URL')
  if (!config.model.trim()) missing.push('模型')
  if (!config.apiKey.trim() && !isLocalBaseUrl(config.baseUrl)) missing.push('API Key')
  return missing
}

export function createMtProvider(id: MtServiceId, config: MtServiceConfig): TranslateProvider {
  if (id === 'google-free') return createGoogleFreeProvider()
  if (id === 'mymemory') return createMyMemoryProvider()
  if (id === 'baidu') return createBaiduProvider(config)
  return createMicrosoftProvider(config)
}

export function serviceKeyOf(engineId: string): string {
  if (engineId.startsWith('ai:')) return engineId
  return engineId.startsWith('mt:') ? engineId.slice(3) : engineId
}
