import type { DictionaryServiceId } from '../../../storage/settings'
import type { DictionaryCapabilities } from '../../dictionary/types'

export type DictionaryServiceDef = {
  id: DictionaryServiceId
  label: string
  tag: string
  note: string
  testWord: string
  capabilities: DictionaryCapabilities
  supportsChinese: boolean
}

export const DICTIONARY_SERVICES: DictionaryServiceDef[] = [
  {
    id: 'youdao',
    label: '有道词典',
    tag: '免 Key · 中英',
    note: '一次返回音标与发音、中英释义、词形变化、双语例句和常用词组，覆盖最全，也支持中文词查英文。',
    testWord: 'hello',
    capabilities: {
      phonetic: true,
      translation: true,
      definition: true,
      forms: true,
      examples: true,
      phrases: true,
    },
    supportsChinese: true,
  },
  {
    id: 'freedict',
    label: '免费英英词典',
    tag: '免 Key · 英英',
    note: 'Free Dictionary API，只有英英释义、音标与例句，不提供中文释义与词形变化，也不能查中文词。',
    testWord: 'hello',
    capabilities: {
      phonetic: true,
      translation: false,
      definition: true,
      forms: false,
      examples: true,
      phrases: false,
    },
    supportsChinese: false,
  },
]

export function findDictionaryService(id: string): DictionaryServiceDef | undefined {
  return DICTIONARY_SERVICES.find((service) => service.id === id)
}

export function dictionaryServiceSupportsChinese(id: DictionaryServiceId): boolean {
  return findDictionaryService(id)?.supportsChinese ?? false
}

export function dictionaryCapabilities(id: DictionaryServiceId): DictionaryCapabilities {
  return findDictionaryService(id)?.capabilities ?? {
    phonetic: false,
    translation: false,
    definition: false,
    forms: false,
    examples: false,
    phrases: false,
  }
}
