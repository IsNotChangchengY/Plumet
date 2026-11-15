export type DictionaryDirection = 'en-zh' | 'zh-en'

export type DictionaryQuery = {
  word: string
  direction: DictionaryDirection
}

const ENGLISH_PATTERN = /^[A-Za-z][A-Za-z'’-]{0,39}$/
const CHINESE_PATTERN = /^\p{Script=Han}{1,4}$/u
const EDGE_PUNCTUATION = /^[\s"'“”‘’《》「」『』()（）\[\]{}<>.,;:!?，。；：！？、·…—]+|[\s"'“”‘’《》「」『』()（）\[\]{}<>.,;:!?，。；：！？、·…—]+$/g

function trimEdges(text: string): string {
  return text.trim().replace(EDGE_PUNCTUATION, '').trim()
}

export function parseDictionaryQuery(text: string): DictionaryQuery | null {
  const word = trimEdges(text)
  if (!word) return null
  if (ENGLISH_PATTERN.test(word)) return { word, direction: 'en-zh' }
  if (CHINESE_PATTERN.test(word)) return { word, direction: 'zh-en' }
  return null
}

export function isDictionaryWord(text: string): boolean {
  return parseDictionaryQuery(text) !== null
}

export function normalizeDictionaryWord(text: string): string {
  return parseDictionaryQuery(text)?.word ?? ''
}
