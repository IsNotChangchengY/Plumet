import { AppError } from '../../errors'
import type { MtServiceConfig } from '../../../storage/settings'
import type { TranslateProvider, TranslateRequest, TranslateResponse } from '../types'
import { ensureOk, fetchWithTimeout } from '../http'
import { chunkByLimits } from '../batch'
import { toAzureLang } from '../lang-map'

const DEFAULT_ENDPOINT = 'https://api.cognitive.microsofttranslator.com'
const MAX_ITEMS = 100
const MAX_CHARS = 50_000

type AzureItem = {
  translations?: { text?: string; to?: string }[]
  detectedLanguage?: { language?: string }
}

export function azureEndpoint(config: MtServiceConfig): string {
  const raw = config.endpoint.trim() || DEFAULT_ENDPOINT
  return raw.replace(/\/+$/, '')
}

export function buildAzureUrl(endpoint: string, to: string, from: string): string {
  const params = new URLSearchParams({ 'api-version': '3.0', to })
  if (from && from !== 'auto') params.set('from', from)
  return `${endpoint}/translate?${params.toString()}`
}

export function parseAzure(raw: unknown, expected: number): { segments: string[]; detectedLang: string } {
  if (!Array.isArray(raw)) throw new AppError('parse', '微软翻译返回了意外的数据')
  const segments: string[] = []
  let detectedLang = ''
  for (const entry of raw as AzureItem[]) {
    const text = entry?.translations?.[0]?.text
    if (typeof text !== 'string') throw new AppError('parse', '微软翻译没有返回译文')
    segments.push(text)
    if (!detectedLang && entry?.detectedLanguage?.language) detectedLang = entry.detectedLanguage.language
  }
  if (segments.length !== expected) {
    throw new AppError('parse', `微软翻译返回了 ${segments.length} 段，但请求了 ${expected} 段`)
  }
  return { segments, detectedLang }
}

export function createMicrosoftProvider(config: MtServiceConfig): TranslateProvider {
  return {
    id: 'mt:microsoft',
    label: '微软 / 必应',
    kind: 'mt',
    async translate(request: TranslateRequest): Promise<TranslateResponse> {
      const key = config.key.trim()
      if (!key) throw new AppError('config', '微软翻译还没填订阅 Key')

      const endpoint = azureEndpoint(config)
      const to = toAzureLang(request.targetLang)
      const from = request.sourceLang === 'auto' ? 'auto' : toAzureLang(request.sourceLang)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': key,
      }
      if (config.region.trim()) headers['Ocp-Apim-Subscription-Region'] = config.region.trim()

      const groups = chunkByLimits(request.segments, MAX_ITEMS, MAX_CHARS)
      const output: string[] = []
      let detected = ''
      for (const group of groups) {
        const response = await fetchWithTimeout(
          buildAzureUrl(endpoint, to, from),
          {
            method: 'POST',
            headers,
            body: JSON.stringify(group.map((text) => ({ text }))),
          },
          request.signal,
        )
        await ensureOk(response)
        const parsed = parseAzure((await response.json()) as unknown, group.length)
        output.push(...parsed.segments)
        if (!detected) detected = parsed.detectedLang
        request.onDelta?.(parsed.segments.join('\n\n'))
      }
      return { segments: output, engineLabel: '微软 / 必应', detectedLang: detected || undefined }
    },
  }
}
