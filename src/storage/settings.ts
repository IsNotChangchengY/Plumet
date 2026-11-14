import { newId, readLocal, writeLocal } from './local'

export type AiProviderConfig = {
  id: string
  label: string
  presetId: string
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
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

export type ThemeMode = 'auto' | 'light' | 'dark'
export type SelectionTrigger = 'icon' | 'shortcut' | 'off'
export type PageMode = 'bilingual' | 'replace'

export type Settings = {
  version: 2
  sourceLang: string
  targetLang: string
  translateEngine: string
  checkEngine: string
  polishEngine: string
  pageEngine: string
  services: Record<MtServiceId, MtServiceConfig>
  aiProviders: AiProviderConfig[]
  theme: ThemeMode
  selectionTrigger: SelectionTrigger
  selectionContextChars: number
  pageMode: PageMode
  historyEnabled: boolean
  historyLimit: number
  glossary: GlossaryEntry[]
  polishChips: string[]
  polishDirection: string
}

export const SETTINGS_KEY = 'settings.v1'

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

export const DEFAULT_SETTINGS: Settings = {
  version: 2,
  sourceLang: 'auto',
  targetLang: 'zh-CN',
  translateEngine: 'mt:google-free',
  checkEngine: '',
  polishEngine: '',
  pageEngine: 'mt:google-free',
  services: defaultServices(),
  aiProviders: [],
  theme: 'auto',
  selectionTrigger: 'icon',
  selectionContextChars: 600,
  pageMode: 'bilingual',
  historyEnabled: true,
  historyLimit: 200,
  glossary: [],
  polishChips: [],
  polishDirection: '',
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
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

export function normalizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS, services: defaultServices() }
  const stored = raw as Record<string, unknown>
  const servicesRaw =
    stored.services && typeof stored.services === 'object'
      ? (stored.services as Record<string, unknown>)
      : {}
  const next: Settings & { mtEnabled?: unknown } = {
    ...DEFAULT_SETTINGS,
    ...(stored as Partial<Settings>),
    version: 2,
    services: normalizeServices(servicesRaw, stored.mtEnabled),
    aiProviders: Array.isArray(stored.aiProviders)
      ? (stored.aiProviders as AiProviderConfig[]).map((provider) => ({
          id: asString(provider.id) || newId(),
          label: asString(provider.label),
          presetId: asString(provider.presetId) || 'custom',
          baseUrl: asString(provider.baseUrl),
          apiKey: asString(provider.apiKey),
          model: asString(provider.model),
          temperature: typeof provider.temperature === 'number' ? provider.temperature : 0.3,
        }))
      : [],
    glossary: Array.isArray(stored.glossary) ? (stored.glossary as GlossaryEntry[]) : [],
    polishChips: Array.isArray(stored.polishChips) ? (stored.polishChips as string[]) : [],
    polishDirection: asString(stored.polishDirection),
    checkEngine: asString(stored.checkEngine),
    polishEngine: asString(stored.polishEngine),
  }
  delete next.mtEnabled
  return next
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

