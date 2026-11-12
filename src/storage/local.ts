const memory = new Map<string, unknown>()

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local
}

export async function readLocal<T>(key: string, fallback: T): Promise<T> {
  if (!hasChromeStorage()) {
    return (memory.has(key) ? (memory.get(key) as T) : fallback) ?? fallback
  }
  const bag = await chrome.storage.local.get(key)
  const value = bag[key]
  if (value === undefined || value === null) return fallback
  return value as T
}

export async function writeLocal(key: string, value: unknown): Promise<void> {
  if (!hasChromeStorage()) {
    memory.set(key, value)
    return
  }
  await chrome.storage.local.set({ [key]: value })
}

export async function removeLocal(key: string): Promise<void> {
  if (!hasChromeStorage()) {
    memory.delete(key)
    return
  }
  await chrome.storage.local.remove(key)
}

export async function clearLocal(): Promise<void> {
  if (!hasChromeStorage()) {
    memory.clear()
    return
  }
  await chrome.storage.local.clear()
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
