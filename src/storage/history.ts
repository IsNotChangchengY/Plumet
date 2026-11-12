import { loadSettings } from './settings'
import { newId, readLocal, writeLocal } from './local'

export type HistoryMode = 'translate' | 'check' | 'polish'

export type HistoryEntry = {
  id: string
  at: number
  mode: HistoryMode
  sourceText: string
  resultText: string
  engineLabel: string
  sourceLang: string
  targetLang: string
}

export const HISTORY_KEY = 'history.v1'
const MAX_TEXT_CHARS = 4000

export async function listHistory(): Promise<HistoryEntry[]> {
  const list = await readLocal<HistoryEntry[]>(HISTORY_KEY, [])
  return Array.isArray(list) ? list : []
}

function clampText(text: string): string {
  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text
}

export async function addHistory(
  entry: Omit<HistoryEntry, 'id' | 'at'> & { id?: string; at?: number },
): Promise<void> {
  const settings = await loadSettings()
  if (!settings.historyEnabled) return
  const list = await listHistory()
  const next: HistoryEntry = {
    ...entry,
    id: entry.id ?? newId(),
    at: entry.at ?? Date.now(),
    sourceText: clampText(entry.sourceText),
    resultText: clampText(entry.resultText),
  }
  list.unshift(next)
  const limited = list.slice(0, Math.max(10, settings.historyLimit || 200))
  await writeLocal(HISTORY_KEY, limited)
}

export async function removeHistory(id: string): Promise<void> {
  const list = await listHistory()
  await writeLocal(
    HISTORY_KEY,
    list.filter((item) => item.id !== id),
  )
}

export async function clearHistory(): Promise<void> {
  await writeLocal(HISTORY_KEY, [])
}
