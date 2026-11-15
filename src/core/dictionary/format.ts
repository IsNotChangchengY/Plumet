import type { DictionaryEntry } from './types'

export function entryText(entry: DictionaryEntry): string {
  const translations = entry.translations.map((item) => (item.pos ? `${item.pos} ${item.text}` : item.text))
  const lines = translations.length > 0
    ? translations
    : entry.definitions.map((item) => (item.pos ? `${item.pos} ${item.text}` : item.text))
  return lines.join('\n')
}
