import { AppError } from '../../errors'
import type { AiProviderConfig } from '../../../storage/settings'
import { ensureOk, fetchWithTimeout } from '../http'
import type { ChatMessage } from './prompts'

type ChatPayload = {
  choices?: Array<{
    delta?: { content?: string | null }
    message?: { content?: string | null }
  }>
}

export function chatUrl(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}/chat/completions`
}

export function authHeaders(apiKey: string): Record<string, string> {
  const result: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = apiKey.trim()
  if (key) result.Authorization = `Bearer ${key}`
  return result
}

export async function postChat(
  config: AiProviderConfig,
  messages: ChatMessage[],
  options: { stream: boolean; signal?: AbortSignal },
): Promise<Response> {
  const response = await fetchWithTimeout(
    chatUrl(config.baseUrl),
    {
      method: 'POST',
      headers: authHeaders(config.apiKey),
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: options.stream,
        temperature: typeof config.temperature === 'number' ? config.temperature : 0.3,
      }),
    },
    options.signal,
  )
  await ensureOk(response)
  return response
}

export async function readStream(response: Response, onDelta?: (delta: string) => void): Promise<string> {
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
        onDelta?.(piece)
      }
    }
  }
  return whole
}

export async function readCompletion(response: Response): Promise<string> {
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

export async function chatText(
  config: AiProviderConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const response = await postChat(config, messages, { stream: false, signal })
  return readCompletion(response)
}

export async function chatStream(
  config: AiProviderConfig,
  messages: ChatMessage[],
  onDelta: ((delta: string) => void) | undefined,
  signal?: AbortSignal,
): Promise<string> {
  const response = await postChat(config, messages, { stream: true, signal })
  return readStream(response, onDelta)
}
