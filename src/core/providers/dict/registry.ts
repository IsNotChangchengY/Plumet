import type { DictionaryServiceId } from '../../../storage/settings'
import type { DictionaryProvider } from '../../dictionary/types'
import { createFreeDictionary } from './freedict'
import { createYoudaoDictionary } from './youdao'

export function createDictionaryProvider(id: DictionaryServiceId): DictionaryProvider {
  if (id === 'freedict') return createFreeDictionary()
  return createYoudaoDictionary()
}
