import type { AiProviderConfig, MtServiceId, Settings } from '../../storage/settings'

export const MT_SERVICE_LABELS: Record<MtServiceId, string> = {
  'google-free': '谷歌翻译',
  mymemory: 'MyMemory',
  baidu: '百度翻译',
  microsoft: '微软 / 必应',
}

export function aiEngineLabel(provider: AiProviderConfig): string {
  const name = provider.label.trim() || provider.model.trim() || 'AI 服务'
  const model = provider.model.trim()
  if (!model || name === model) return name
  return `${name} · ${model}`
}

export function engineLabelOf(settings: Settings, engineId: string): string {
  if (engineId.startsWith('ai:')) {
    const provider = settings.aiProviders.find((item) => item.id === engineId.slice(3))
    return provider ? aiEngineLabel(provider) : engineId
  }
  if (engineId.startsWith('mt:')) {
    return MT_SERVICE_LABELS[engineId.slice(3) as MtServiceId] ?? engineId
  }
  return engineId
}
