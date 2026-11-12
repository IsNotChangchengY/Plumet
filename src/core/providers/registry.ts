import { AppError } from '../errors'
import type { Settings } from '../../storage/settings'
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
