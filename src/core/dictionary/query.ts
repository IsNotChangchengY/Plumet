import { dictionaryServiceSupportsChinese } from '../providers/dict/services'
import { parseDictionaryQuery } from './word'
import type { DictionaryQuery } from './word'
import type { DictionarySettings } from '../../storage/settings'

export function dictionaryQueryFor(settings: DictionarySettings, text: string): DictionaryQuery | null {
  if (!settings.enabled) return null
  const query = parseDictionaryQuery(text)
  if (!query) return null
  if (query.direction === 'zh-en' && !dictionaryServiceSupportsChinese(settings.service)) return null
  return query
}
