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

export type GlossaryEntry = {
  source: string
  target: string
}

export type ThemeMode = 'auto' | 'light' | 'dark'
export type SelectionTrigger = 'icon' | 'shortcut' | 'off'
export type PageMode = 'bilingual' | 'replace'

export type Settings = {
  version: 1
  sourceLang: string
  targetLang: string
  translateEngine: string
  checkEngine: string
  polishEngine: string
  pageEngine: string
  aiProviders: AiProviderConfig[]
  mtEnabled: Record<string, boolean>
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

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  sourceLang: 'auto',
  targetLang: 'zh-CN',
  translateEngine: 'mt:google-free',
  checkEngine: '',
  polishEngine: '',
  pageEngine: 'mt:google-free',
  aiProviders: [],
  mtEnabled: { 'google-free': true, mymemory: true },
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

export function normalizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const stored = raw as Partial<Settings>
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    version: 1,
    aiProviders: Array.isArray(stored.aiProviders) ? stored.aiProviders : [],
    mtEnabled: { ...DEFAULT_SETTINGS.mtEnabled, ...(stored.mtEnabled ?? {}) },
    glossary: Array.isArray(stored.glossary) ? stored.glossary : [],
    polishChips: Array.isArray(stored.polishChips) ? stored.polishChips : [],
    polishDirection: typeof stored.polishDirection === 'string' ? stored.polishDirection : '',
    checkEngine: typeof stored.checkEngine === 'string' ? stored.checkEngine : '',
    polishEngine: typeof stored.polishEngine === 'string' ? stored.polishEngine : '',
  }
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

export function newAiProvider(presetId: string, baseUrl: string, model: string): AiProviderConfig {
  return {
    id: newId(),
    label: '',
    presetId,
    baseUrl,
    apiKey: '',
    model,
    temperature: 0.3,
  }
}
