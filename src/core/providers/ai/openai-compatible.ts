import { z } from 'zod'
import { AppError } from '../../errors'
import type { AiProviderConfig } from '../../../storage/settings'
import type { TranslateProvider, TranslateRequest, TranslateResponse } from '../types'
import { ensureOk, extractJsonObject, fetchWithTimeout } from '../http'
import { buildBatchMessages, buildSingleMessages } from './prompts'

const BATCH_MAX_CHARS = 2200
const BATCH_MAX_ITEMS = 16

const batchSchema = z.object({
  translations: z.array(z.string()),
})

type ChatPayload = {
  choices?: Array<{
    delta?: { content?: string | null }
    message?: { content?: string | null }
  }>
}

function chatUrl(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}/chat/completions`
}

function headers(apiKey: string): Record<string, string> {
  const result: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = apiKey.trim()
  if (key) result.Authorization = `Bearer ${key}`
  return result
}

function bodyOf(config: AiProviderConfig, messages: unknown, stream: boolean): string {
  return JSON.stringify({
    model: config.model,
    messages,
    stream,
    temperature: typeof config.temperature === 'number' ? config.temperature : 0.3,
  })
}

async function readStream(response: Response, onDelta: (delta: string) => void): Promise<string> {
  const body = response.body
  if (!body) throw new AppError('parse', '服务端没有返回可读取的数据流')
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let whole = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let lineEnd = buffer.indexOf('\n')
    while (lineEnd >= 0) {
      const line = buffer.slice(0, lineEnd).trim()
      buffer = buffer.slice(lineEnd + 1)
      lineEnd = buffer.indexOf('\n')
      if (!line || line.startsWith(':') || !line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return whole
      let payload: ChatPayload
      try {
        payload = JSON.parse(data) as ChatPayload
      } catch {
        continue
      }
      const piece = payload.choices?.[0]?.delta?.content ?? ''
      if (piece) {
        whole += piece
        onDelta(piece)
      }
    }
  }
  return whole
}

async function readCompletion(response: Response): Promise<string> {
  let payload: ChatPayload
  try {
    payload = (await response.json()) as ChatPayload
  } catch {
    throw new AppError('parse', 'AI 服务返回的内容不是合法 JSON')
  }
  const text = payload.choices?.[0]?.message?.content ?? ''
  if (!text) throw new AppError('parse', 'AI 服务返回了空结果')
  return text.trim()
}

function parseBatch(raw: string, expected: number): string[] {
  let data: unknown
  try {
    data = JSON.parse(extractJsonObject(raw))
  } catch {
    throw new AppError('parse', 'AI 返回的内容不是合法 JSON，请试着换一个更稳的模型或重试')
  }
  const parsed = batchSchema.safeParse(data)
  if (!parsed.success) {
    throw new AppError('parse', 'AI 返回的 JSON 结构不对：缺少 translations 数组')
  }
  if (parsed.data.translations.length !== expected) {
    throw new AppError(
      'parse',
      `AI 返回了 ${parsed.data.translations.length} 段译文，但输入是 ${expected} 段，可能导致段落错位`,
    )
  }
  return parsed.data.translations.map((item) => item.trim())
}

export function groupSegments(segments: string[], maxChars: number, maxItems: number): string[][] {
  const groups: string[][] = []
  let current: string[] = []
  let chars = 0
  for (const segment of segments) {
    const tooLong = chars + segment.length > maxChars
    const tooMany = current.length >= maxItems
    if (current.length > 0 && (tooLong || tooMany)) {
      groups.push(current)
      current = []
      chars = 0
    }
    current.push(segment)
    chars += segment.length
  }
  if (current.length > 0) groups.push(current)
  return groups
}

export function createAiProvider(config: AiProviderConfig): TranslateProvider {
  const label = config.label.trim() || config.model.trim() || 'AI 服务'

  async function callStreaming(request: TranslateRequest, messages: unknown): Promise<string> {
    const response = await fetchWithTimeout(
      chatUrl(config.baseUrl),
      { method: 'POST', headers: headers(config.apiKey), body: bodyOf(config, messages, true) },
      request.signal,
    )
    await ensureOk(response)
    return readStream(response, (delta) => request.onDelta?.(delta))
  }

  async function callJson(request: TranslateRequest, messages: unknown): Promise<string> {
    const response = await fetchWithTimeout(
      chatUrl(config.baseUrl),
      { method: 'POST', headers: headers(config.apiKey), body: bodyOf(config, messages, false) },
      request.signal,
    )
    await ensureOk(response)
    return readCompletion(response)
  }

  return {
    id: `ai:${config.id}`,
    label,
    kind: 'ai',
    async translate(request: TranslateRequest): Promise<TranslateResponse> {
      const base = {
        engineLabel: label,
        model: config.model,
      }
      if (request.segments.length === 1) {
        const text = request.segments[0] ?? ''
        const messages = buildSingleMessages({
          text,
          sourceLang: request.sourceLang,
          targetLang: request.targetLang,
          context: request.context,
          glossary: request.glossary,
        })
        if (request.onDelta) {
          const whole = await callStreaming(request, messages)
          return { ...base, segments: [whole.trim()] }
        }
        const plain = await callJson(request, messages)
        return { ...base, segments: [plain] }
      }

      const groups = groupSegments(request.segments, BATCH_MAX_CHARS, BATCH_MAX_ITEMS)
      const output: string[] = []
      for (const group of groups) {
        const messages = buildBatchMessages({
          segments: group,
          sourceLang: request.sourceLang,
          targetLang: request.targetLang,
          context: request.context,
          glossary: request.glossary,
        })
        const raw = await callJson(request, messages)
        const translated = parseBatch(raw, group.length)
        output.push(...translated)
        if (request.onDelta && translated.length > 0) {
          request.onDelta(translated.join('\n\n'))
        }
      }
      return { ...base, segments: output }
    },
  }
}

export async function testAiProvider(config: AiProviderConfig): Promise<{ latencyMs: number; sample: string }> {
  const started = Date.now()
  const messages = buildSingleMessages({
    text: 'Hello world',
    sourceLang: 'en',
    targetLang: 'zh-CN',
  })
  const response = await fetchWithTimeout(chatUrl(config.baseUrl), {
    method: 'POST',
    headers: headers(config.apiKey),
    body: bodyOf(config, messages, false),
  })
  await ensureOk(response)
  const text = await readCompletion(response)
  return { latencyMs: Date.now() - started, sample: text.slice(0, 60) }
}
