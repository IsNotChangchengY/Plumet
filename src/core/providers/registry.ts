import { AppError } from '../errors'
import type { AiProviderConfig, Settings } from '../../storage/settings'
import type { TranslateProvider, TranslateProviderKind } from './types'
import { createAiProvider } from './ai/openai-compatible'
import { createGoogleFreeProvider } from './mt/google-free'
import { createMyMemoryProvider } from './mt/mymemory'

export const MT_GOOGLE_FREE = 'mt:google-free'
export const MT_MYMEMORY = 'mt:mymemory'

export type EngineOption = {
  id: string
  label: string
  kind: TranslateProviderKind
  configured: boolean
}

export function listEngines(settings: Settings): EngineOption[] {
  const engines: EngineOption[] = []
  for (const provider of settings.aiProviders) {
    engines.push({
      id: `ai:${provider.id}`,
      label: provider.label.trim() || provider.model.trim() || 'AI 服务',
      kind: 'ai',
      configured: Boolean(provider.baseUrl.trim() && provider.model.trim()),
    })
  }
  engines.push({ id: MT_GOOGLE_FREE, label: '谷歌翻译（免费通道）', kind: 'mt', configured: true })
  engines.push({ id: MT_MYMEMORY, label: 'MyMemory（免费通道）', kind: 'mt', configured: true })
  return engines
}

export function resolveEngine(engineId: string, settings: Settings): TranslateProvider {
  if (engineId.startsWith('ai:')) {
    const id = engineId.slice(3)
    const config = settings.aiProviders.find((item) => item.id === id)
    if (!config) throw new AppError('config', '选中的 AI 服务已被删除，请到设置页重新选择')
    if (!config.baseUrl.trim()) throw new AppError('config', 'AI 服务的 Base URL 为空，请到设置页填写')
    if (!config.model.trim()) throw new AppError('config', 'AI 服务的模型名为空，请到设置页填写')
    return createAiProvider(config)
  }
  if (engineId === MT_GOOGLE_FREE) return createGoogleFreeProvider()
  if (engineId === MT_MYMEMORY) return createMyMemoryProvider()
  throw new AppError('config', `未知的翻译引擎：${engineId}`)
}

export function isMtEnabled(settings: Settings, engineId: string): boolean {
  if (!engineId.startsWith('mt:')) return true
  const name = engineId.slice(3)
  return settings.mtEnabled[name] !== false
}

export function fallbackEngineIds(settings: Settings, primaryId: string): string[] {
  return [MT_GOOGLE_FREE, MT_MYMEMORY].filter(
    (id) => id !== primaryId && isMtEnabled(settings, id),
  )
}

export function engineLabel(engineId: string, settings: Settings): string {
  return listEngines(settings).find((engine) => engine.id === engineId)?.label ?? engineId
}

export function listAiEngines(settings: Settings): EngineOption[] {
  return settings.aiProviders.map((provider) => ({
    id: `ai:${provider.id}`,
    label: aiEngineLabel(provider),
    kind: 'ai' as const,
    configured: Boolean(provider.baseUrl.trim() && provider.model.trim()),
  }))
}

export function aiEngineLabel(provider: AiProviderConfig): string {
  return provider.label.trim() || provider.model.trim() || 'AI 服务'
}

export function findAiProvider(settings: Settings, engineId: string): AiProviderConfig | null {
  if (!engineId.startsWith('ai:')) return null
  return settings.aiProviders.find((item) => item.id === engineId.slice(3)) ?? null
}

function assertUsable(provider: AiProviderConfig): void {
  if (!provider.baseUrl.trim()) throw new AppError('config', 'AI 服务的 Base URL 为空，请到设置页填写')
  if (!provider.model.trim()) throw new AppError('config', 'AI 服务的模型名为空，请到设置页填写')
}

export function resolveAiProviderConfig(settings: Settings, preferredEngineId: string): AiProviderConfig {
  const preferred = preferredEngineId.trim()
  if (preferred.startsWith('ai:')) {
    const config = findAiProvider(settings, preferred)
    if (!config) throw new AppError('config', '选中的 AI 服务已被删除，请到设置页重新选择')
    assertUsable(config)
    return config
  }

  if (settings.translateEngine.startsWith('ai:')) {
    const config = findAiProvider(settings, settings.translateEngine)
    if (config && config.baseUrl.trim() && config.model.trim()) return config
  }

  const first = settings.aiProviders.find((item) => item.baseUrl.trim() && item.model.trim())
  if (first) return first

  throw new AppError(
    'config',
    '还没有可用的 AI 服务。语法检查和润色需要 AI，请到设置页 → AI 服务里添加一个。',
  )
}
