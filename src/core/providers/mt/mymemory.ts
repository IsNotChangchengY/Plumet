import { AppError } from '../../errors'
import { resolveSourceLang } from '../../lang'
import type { TranslateProvider, TranslateRequest, TranslateResponse } from '../types'
import { ensureOk, fetchWithTimeout } from '../http'

const ENDPOINT = 'https://api.mymemory.translated.net/get'
const CHUNK_CHARS = 400
const PAUSE_MS = 150

type MyMemoryPayload = {
  responseStatus?: number | string
  responseData?: { translatedText?: string }
  responseDetails?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function chunkText(text: string, limit = CHUNK_CHARS): string[] {
  if (text.length <= limit) return [text]
  const parts: string[] = []
  let rest = text
  while (rest.length > limit) {
    const window = rest.slice(0, limit)
    const boundary = Math.max(window.lastIndexOf('. '), window.lastIndexOf('。'), window.lastIndexOf('\n'))
    const cut = boundary > limit * 0.5 ? boundary + 1 : limit
    parts.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  if (rest) parts.push(rest)
  return parts
}

function buildUrl(text: string, langPair: string): string {
  const params = new URLSearchParams({ q: text, langpair: langPair })
  return `${ENDPOINT}?${params.toString()}`
}

function parseMyMemory(payload: MyMemoryPayload): string {
  const text = payload.responseData?.translatedText
  if (!text) {
    throw new AppError('parse', `MyMemory 没有返回译文${payload.responseDetails ? `：${payload.responseDetails}` : ''}`)
  }
  const lowered = text.toLowerCase()
  if (lowered.includes('mymemory warning') || lowered.includes('quota')) {
    throw new AppError('quota', 'MyMemory 免费额度已用完，换用其他翻译服务')
  }
  return text
}

export function createMyMemoryProvider(): TranslateProvider {
  return {
    id: 'mt:mymemory',
    label: 'MyMemory（免费通道）',
    kind: 'mt',
    async translate(request: TranslateRequest): Promise<TranslateResponse> {
      const source = resolveSourceLang(request.sourceLang, request.segments.join(' '))
      const langPair = `${source}|${request.targetLang}`
      const results: string[] = []
      let first = true
      for (const segment of request.segments) {
        const pieces = chunkText(segment)
        const translatedPieces: string[] = []
        for (const piece of pieces) {
          if (!first) await sleep(PAUSE_MS)
          first = false
          const response = await fetchWithTimeout(buildUrl(piece, langPair), { method: 'GET' }, request.signal)
          await ensureOk(response)
          const payload = (await response.json()) as MyMemoryPayload
          translatedPieces.push(parseMyMemory(payload))
        }
        results.push(translatedPieces.join(''))
      }
      if (request.onDelta) request.onDelta(results.join('\n\n'))
      return { segments: results, engineLabel: 'MyMemory（免费通道）' }
    },
  }
}
