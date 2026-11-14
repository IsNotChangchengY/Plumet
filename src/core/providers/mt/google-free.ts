import { AppError } from '../../errors'
import type { TranslateProvider, TranslateRequest, TranslateResponse } from '../types'
import { ensureOk, fetchWithTimeout } from '../http'
import { chunkByLimits } from '../batch'

export { chunkByLimits } from '../batch'

const ENDPOINT = 'https://clients5.google.com/translate_a/t'
const MAX_ITEMS_PER_REQUEST = 20
const MAX_CHARS_PER_REQUEST = 3000

type GoogleItem = [translation: string, detectedLang: string]

function buildUrl(sourceLang: string, targetLang: string, segments: string[]): string {
  const parts = [
    'client=dict-chrome-ex',
    `sl=${encodeURIComponent(sourceLang || 'auto')}`,
    `tl=${encodeURIComponent(targetLang)}`,
  ]
  for (const segment of segments) parts.push(`q=${encodeURIComponent(segment)}`)
  return `${ENDPOINT}?${parts.join('&')}`
}

export function parseGoogleFree(raw: unknown): GoogleItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AppError('parse', '谷歌免费通道返回了意外的数据格式')
  }
  if (typeof raw[0] === 'string') {
    return [[raw[0], typeof raw[1] === 'string' ? raw[1] : '']]
  }
  const items: GoogleItem[] = []
  for (const entry of raw) {
    if (Array.isArray(entry) && typeof entry[0] === 'string') {
      items.push([entry[0], typeof entry[1] === 'string' ? entry[1] : ''])
    }
  }
  if (items.length === 0) {
    throw new AppError('parse', '谷歌免费通道没有返回可用的译文')
  }
  return items
}

export function createGoogleFreeProvider(): TranslateProvider {
  return {
    id: 'mt:google-free',
    label: '谷歌翻译（免费通道）',
    kind: 'mt',
    async translate(request: TranslateRequest): Promise<TranslateResponse> {
      const groups = chunkByLimits(request.segments, MAX_ITEMS_PER_REQUEST, MAX_CHARS_PER_REQUEST)
      const translations: string[] = []
      let detectedLang = ''
      for (const group of groups) {
        const response = await fetchWithTimeout(
          buildUrl(request.sourceLang, request.targetLang, group),
          { method: 'GET' },
          request.signal,
        )
        await ensureOk(response)
        const raw = (await response.json()) as unknown
        const items = parseGoogleFree(raw)
        if (items.length !== group.length) {
          throw new AppError('parse', `谷歌免费通道返回了 ${items.length} 段，但请求了 ${group.length} 段`)
        }
        for (const item of items) {
          translations.push(item[0])
          if (!detectedLang && item[1]) detectedLang = item[1]
        }
        if (request.onDelta) request.onDelta(items.map((item) => item[0]).join('\n\n'))
      }
      return {
        segments: translations,
        engineLabel: '谷歌翻译（免费通道）',
        detectedLang: detectedLang || undefined,
      }
    },
  }
}
