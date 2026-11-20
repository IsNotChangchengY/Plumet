import { newId, readLocal, writeLocal } from './local'
import { SMART_TARGET_LANG } from '../core/lang'
import type { ShortcutSettings } from '../core/shortcuts'
import { defaultShortcuts, normalizeShortcuts } from '../core/shortcuts'

export type ReasoningEffort = '' | 'low' | 'medium' | 'high'

export type AiProviderConfig = {
  id: string
  label: string
  presetId: string
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  reasoningEffort: ReasoningEffort
}

export type MtServiceId = 'google-free' | 'mymemory' | 'baidu' | 'microsoft'

export type MtServiceConfig = {
  enabled: boolean
  appId: string
  secret: string
  key: string
  region: string
  endpoint: string
}

export type GlossaryEntry = {
  source: string
  target: string
}

export type DictionaryServiceId = 'youdao' | 'freedict'

export type DictionarySections = {
  phonetic: boolean
  translation: boolean
  definition: boolean
  forms: boolean
  examples: boolean
  phrases: boolean
}

export type DictionarySettings = {
  enabled: boolean
  service: DictionaryServiceId
  sections: DictionarySections
}

export type ThemeMode = 'auto' | 'light' | 'dark'
export type SelectionTrigger = 'icon' | 'shortcut' | 'off'
export type PageMode = 'bilingual' | 'replace'
export type ContextScope = 'segment' | 'section' | 'page'

export type Settings = {
  version: 2
  sourceLang: string
  targetLang: string
  translateEngines: string[]
  checkEngine: string
  polishEngine: string
  pageEngine: string
  services: Record<MtServiceId, MtServiceConfig>
  dictionary: DictionarySettings
  aiProviders: AiProviderConfig[]
  theme: ThemeMode
  selectionTrigger: SelectionTrigger
  selectionContextChars: number
  selectionContextScope: ContextScope
  pageMode: PageMode
  historyEnabled: boolean
  historyLimit: number
  glossary: GlossaryEntry[]
  polishChips: string[]
  polishDirection: string
  shortcuts: ShortcutSettings
}

export const SETTINGS_KEY = 'settings.v1'

export const DEFAULT_TRANSLATE_ENGINE = 'mt:google-free'

export const MT_SERVICE_IDS: MtServiceId[] = ['google-free', 'mymemory', 'baidu', 'microsoft']

export function defaultServices(): Record<MtServiceId, MtServiceConfig> {
  const empty = (): MtServiceConfig => ({
    enabled: true,
    appId: '',
    secret: '',
    key: '',
    region: '',
    endpoint: '',
  })
  return {
    'google-free': empty(),
    mymemory: empty(),
    baidu: empty(),
    microsoft: empty(),
  }
}

export function defaultDictionary(): DictionarySettings {
  return {
    enabled: true,
    service: 'youdao',
    sections: {
      phonetic: true,
      translation: true,
      definition: true,
      forms: true,
      examples: false,
      phrases: false,
    },
  }
}

export const DEFAULT_SETTINGS: Settings = {
  version: 2,
  sourceLang: 'auto',
  targetLang: SMART_TARGET_LANG,
  translateEngines: [DEFAULT_TRANSLATE_ENGINE],
  checkEngine: '',
  polishEngine: '',
  pageEngine: 'mt:google-free',
  services: defaultServices(),
  dictionary: defaultDictionary(),
  aiProviders: [],
  theme: 'auto',
  selectionTrigger: 'icon',
  selectionContextChars: 600,
  selectionContextScope: 'section',
  pageMode: 'bilingual',
  historyEnabled: true,
  historyLimit: 200,
  glossary: [],
  polishChips: [],
  polishDirection: '',
  shortcuts: defaultShortcuts(),
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asReasoningEffort(value: unknown): ReasoningEffort {
  return value === 'low' || value === 'medium' || value === 'high' ? value : ''
}

function asContextScope(value: unknown): ContextScope {
  return value === 'segment' || value === 'page' ? value : 'section'
}

function normalizeServices(stored: Record<string, unknown>, legacy: unknown): Record<MtServiceId, MtServiceConfig> {
  const defaults = defaultServices()
  const legacyEnabled = legacy && typeof legacy === 'object' ? (legacy as Record<string, unknown>) : null
  const result = {} as Record<MtServiceId, MtServiceConfig>
  for (const id of MT_SERVICE_IDS) {
    const entry = stored[id]
    const raw = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
    result[id] = {
      enabled: asBoolean(raw.enabled, asBoolean(legacyEnabled?.[id], defaults[id].enabled)),
      appId: asString(raw.appId),
      secret: asString(raw.secret),
      key: asString(raw.key),
      region: asString(raw.region),
      endpoint: asString(raw.endpoint),
    }
  }
  return result
}

function normalizeDictionary(raw: unknown): DictionarySettings {
  const defaults = defaultDictionary()
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const sectionsRaw =
    source.sections && typeof source.sections === 'object'
      ? (source.sections as Record<string, unknown>)
      : {}
  const service = asString(source.service)
  return {
    enabled: asBoolean(source.enabled, defaults.enabled),
    service: service === 'youdao' || service === 'freedict' ? service : defaults.service,
    sections: {
      phonetic: asBoolean(sectionsRaw.phonetic, defaults.sections.phonetic),
      translation: asBoolean(sectionsRaw.translation, defaults.sections.translation),
      definition: asBoolean(sectionsRaw.definition, defaults.sections.definition),
      forms: asBoolean(sectionsRaw.forms, defaults.sections.forms),
      examples: asBoolean(sectionsRaw.examples, defaults.sections.examples),
      phrases: asBoolean(sectionsRaw.phrases, defaults.sections.phrases),
    },
  }
}

function normalizeTranslateEngines(raw: unknown, legacy: unknown): string[] {
  const list = Array.isArray(raw) ? raw : []
  const seen = new Set<string>()
  const engines: string[] = []
  for (const item of list) {
    const id = asString(item).trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    engines.push(id)
  }
  if (engines.length > 0) return engines
  const fallback = asString(legacy).trim()
  return [fallback || DEFAULT_TRANSLATE_ENGINE]
}

export function normalizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_SETTINGS,
      translateEngines: [...DEFAULT_SETTINGS.translateEngines],
      services: defaultServices(),
      dictionary: defaultDictionary(),
      shortcuts: defaultShortcuts(),
    }
  }
  const stored = raw as Record<string, unknown>
  const servicesRaw =
    stored.services && typeof stored.services === 'object'
      ? (stored.services as Record<string, unknown>)
      : {}
  const next: Settings & { mtEnabled?: unknown; translateEngine?: unknown } = {
    ...DEFAULT_SETTINGS,
    ...(stored as Partial<Settings>),
    version: 2,
    selectionContextScope: asContextScope(stored.selectionContextScope),
    translateEngines: normalizeTranslateEngines(stored.translateEngines, stored.translateEngine),
    services: normalizeServices(servicesRaw, stored.mtEnabled),
    dictionary: normalizeDictionary(stored.dictionary),
    aiProviders: Array.isArray(stored.aiProviders)
      ? (stored.aiProviders as AiProviderConfig[]).map((provider) => ({
          id: asString(provider.id) || newId(),
          label: asString(provider.label),
          presetId: asString(provider.presetId) || 'custom',
          baseUrl: asString(provider.baseUrl),
          apiKey: asString(provider.apiKey),
          model: asString(provider.model),
          temperature: typeof provider.temperature === 'number' ? provider.temperature : 0.3,
          reasoningEffort: asReasoningEffort(provider.reasoningEffort),
        }))
      : [],
    glossary: Array.isArray(stored.glossary) ? (stored.glossary as GlossaryEntry[]) : [],
    polishChips: Array.isArray(stored.polishChips) ? (stored.polishChips as string[]) : [],
    polishDirection: asString(stored.polishDirection),
    shortcuts: normalizeShortcuts(stored.shortcuts),
    checkEngine: asString(stored.checkEngine),
    polishEngine: asString(stored.polishEngine),
  }
  delete next.mtEnabled
  delete next.translateEngine
  return next
}

export function primaryTranslateEngine(settings: Settings): string {
  return settings.translateEngines[0] || DEFAULT_TRANSLATE_ENGINE
}

export async function loadSettings(): Promise<Settings> {
  return normalizeSettings(await readLocal<unknown>(SETTINGS_KEY, DEFAULT_SETTINGS))
}

export async function saveSettings(settings: Settings): Promise<void> {
  await writeLocal(SETTINGS_KEY, normalizeSettings(settings))
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings()
  const next = normalizeSettings({ ...current, ...patch })
  await saveSettings(next)
  return next
}

export function patchMtService(
  settings: Settings,
  id: MtServiceId,
  patch: Partial<MtServiceConfig>,
): Record<MtServiceId, MtServiceConfig> {
  return { ...settings.services, [id]: { ...settings.services[id], ...patch } }
}
