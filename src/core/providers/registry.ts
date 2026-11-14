import { AppError } from '../errors'
import type { AiProviderConfig, MtServiceId, Settings } from '../../storage/settings'
import { MT_SERVICE_IDS } from '../../storage/settings'
import type { TranslateProvider, TranslateProviderKind } from './types'
import { createAiProvider } from './ai/openai-compatible'
import { aiProviderMissing, createMtProvider, findMtService, missingMtFields } from './services'

export const MT_GOOGLE_FREE = 'mt:google-free'
export const MT_MYMEMORY = 'mt:mymemory'

const MT_ORDER: MtServiceId[] = ['baidu', 'microsoft', 'google-free', 'mymemory']

export type EngineGroup = 'ai' | 'mt' | 'free'

export type EngineOption = {
  id: string
  label: string
  kind: TranslateProviderKind
  group: EngineGroup
  ready: boolean
  missing: string[]
}

export function aiEngineLabel(provider: AiProviderConfig): string {
  const name = provider.label.trim() || provider.model.trim() || 'AI 服务'
  const model = provider.model.trim()
  if (!model || name === model) return name
  return `${name} · ${model}`
}

export function listEngines(settings: Settings): EngineOption[] {
  const engines: EngineOption[] = []
  for (const provider of settings.aiProviders) {
    const missing = aiProviderMissing(provider)
    engines.push({
      id: `ai:${provider.id}`,
      label: aiEngineLabel(provider),
      kind: 'ai',
      group: 'ai',
      ready: missing.length === 0,
      missing,
    })
  }
  for (const id of MT_ORDER) {
    const service = findMtService(id)
    if (!service) continue
    const missing = missingMtFields(settings, id)
    engines.push({
      id: `mt:${id}`,
      label: service.label,
      kind: 'mt',
      group: service.kind === 'free' ? 'free' : 'mt',
      ready: missing.length === 0,
      missing,
    })
  }
  return engines
}

export function engineReadiness(settings: Settings, engineId: string): { ready: boolean; missing: string[] } {
  const option = listEngines(settings).find((engine) => engine.id === engineId)
  if (option) return { ready: option.ready, missing: option.missing }
  return { ready: false, missing: ['已删除'] }
}

export function engineLabel(engineId: string, settings: Settings): string {
  return listEngines(settings).find((engine) => engine.id === engineId)?.label ?? engineId
}

export function findAiProvider(settings: Settings, engineId: string): AiProviderConfig | null {
  if (!engineId.startsWith('ai:')) return null
  return settings.aiProviders.find((item) => item.id === engineId.slice(3)) ?? null
}

export function resolveEngine(engineId: string, settings: Settings): TranslateProvider {
  if (engineId.startsWith('ai:')) {
    const config = findAiProvider(settings, engineId)
    if (!config) throw new AppError('config', '选中的 AI 服务已被删除，请到设置 → 服务里重新添加')
    const missing = aiProviderMissing(config)
    if (missing.length > 0) {
      throw new AppError(
        'config',
        `「${aiEngineLabel(config)}」缺少 ${missing.join('、')}，请到设置 → 服务里补齐`,
      )
    }
    return createAiProvider(config)
  }

  if (engineId.startsWith('mt:')) {
    const id = engineId.slice(3) as MtServiceId
    if (!MT_SERVICE_IDS.includes(id)) throw new AppError('config', `未知的翻译引擎：${engineId}`)
    const service = findMtService(id)
    const missing = missingMtFields(settings, id)
    if (missing.length > 0) {
      const reason = missing.length === 1 && missing[0] === '已停用' ? '已停用' : `缺少 ${missing.join('、')}`
      throw new AppError('config', `「${service?.label ?? id}」${reason}，请到设置 → 服务里配置`)
    }
    return createMtProvider(id, settings.services[id])
  }

  throw new AppError('config', `未知的翻译引擎：${engineId}`)
}

export function listAiEngines(settings: Settings): EngineOption[] {
  return listEngines(settings).filter((engine) => engine.kind === 'ai')
}

export function resolveAiProviderConfig(settings: Settings, preferredEngineId: string): AiProviderConfig {
  const preferred = preferredEngineId.trim()
  if (preferred.startsWith('ai:')) {
    const config = findAiProvider(settings, preferred)
    if (!config) throw new AppError('config', '选中的 AI 服务已被删除，请到设置 → 服务里重新选择')
    const missing = aiProviderMissing(config)
    if (missing.length > 0) {
      throw new AppError('config', `「${aiEngineLabel(config)}」缺少 ${missing.join('、')}，请到设置 → 服务里补齐`)
    }
    return config
  }

  if (settings.translateEngine.startsWith('ai:')) {
    const config = findAiProvider(settings, settings.translateEngine)
    if (config && aiProviderMissing(config).length === 0) return config
  }

  const first = settings.aiProviders.find((item) => aiProviderMissing(item).length === 0)
  if (first) return first

  throw new AppError('config', '还没有可用的 AI 服务，语法检查与润色需要它，请到设置 → 服务里添加')
}
