import { z } from 'zod'
import { AppError } from '../../errors'
import type { AiProviderConfig } from '../../../storage/settings'
import type { TranslateProvider, TranslateRequest, TranslateResponse } from '../types'
import { extractJsonObject } from '../http'
import { chatStream, chatText } from './client'
import { buildBatchMessages, buildSingleMessages } from './prompts'

const BATCH_MAX_CHARS = 2200
const BATCH_MAX_ITEMS = 16

const batchSchema = z.object({
  translations: z.array(z.string()),
})

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

export function parseBatch(raw: string, expected: number): string[] {
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

export function createAiProvider(config: AiProviderConfig): TranslateProvider {
  const label = config.label.trim() || config.model.trim() || 'AI 服务'

  return {
    id: `ai:${config.id}`,
    label,
    kind: 'ai',
    async translate(request: TranslateRequest): Promise<TranslateResponse> {
      const base = { engineLabel: label, model: config.model }
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
          const whole = await chatStream(config, messages, request.onDelta, request.signal)
          return { ...base, segments: [whole.trim()] }
        }
        const plain = await chatText(config, messages, request.signal)
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
        const raw = await chatText(config, messages, request.signal)
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
  const text = await chatText(config, messages)
  return { latencyMs: Date.now() - started, sample: text.slice(0, 60) }
}
