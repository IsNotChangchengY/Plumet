import type { GlossaryEntry } from '../../../storage/settings'
import { langLabel } from '../../lang'

export type ChatMessage = {
  role: 'system' | 'user'
  content: string
}

const SYSTEM_PROMPT = [
  '你是一名专业翻译引擎。',
  '规则：',
  '1. 只输出译文本身，不要解释、不要加引号、不要重复原文。',
  '2. 保持原文的语气、格式与换行，列表与编号要保留。',
  '3. 原文中的 Markdown 标记要保留。',
  '4. 如果提供了术语表，术语必须按术语表翻译。',
  '5. 如果提供了页面上下文，上下文只用于理解语气，不要翻译它。',
].join('\n')

function glossaryBlock(glossary?: GlossaryEntry[]): string {
  if (!glossary || glossary.length === 0) return ''
  const lines = glossary
    .filter((item) => item.source.trim() && item.target.trim())
    .map((item) => `- ${item.source} => ${item.target}`)
  if (lines.length === 0) return ''
  return `【术语表】\n${lines.join('\n')}\n`
}

function targetBlock(sourceLang: string, targetLang: string): string {
  const target = langLabel(targetLang)
  if (sourceLang === 'auto') return `【目标语言】${target}\n`
  return `【源语言】${langLabel(sourceLang)} → 【目标语言】${target}\n`
}

export function buildSingleMessages(input: {
  text: string
  sourceLang: string
  targetLang: string
  context?: string
  glossary?: GlossaryEntry[]
}): ChatMessage[] {
  const sections = [
    targetBlock(input.sourceLang, input.targetLang),
    glossaryBlock(input.glossary),
    input.context?.trim() ? `【页面上下文，仅用于理解】\n${input.context.trim()}\n` : '',
    `【原文】\n${input.text}`,
  ].filter(Boolean)
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: sections.join('\n') },
  ]
}

const BATCH_SYSTEM_PROMPT = [
  '你是一名专业翻译引擎，负责批量翻译网页段落。',
  '规则：',
  '1. 只返回 JSON，不要输出任何解释，不要使用 Markdown 代码块。',
  '2. 返回格式固定为 {"translations":["第一段译文","第二段译文"]}。',
  '3. translations 的条数与顺序必须和输入 texts 完全一致。',
  '4. 每段译文只包含该段自己的译文，不要合并、不要拆分、不要加编号。',
  '5. 如果提供了术语表，术语必须按术语表翻译。',
].join('\n')

export function buildBatchMessages(input: {
  segments: string[]
  sourceLang: string
  targetLang: string
  context?: string
  glossary?: GlossaryEntry[]
}): ChatMessage[] {
  const sections = [
    targetBlock(input.sourceLang, input.targetLang),
    glossaryBlock(input.glossary),
    input.context?.trim() ? `【页面上下文，仅用于理解】\n${input.context.trim()}\n` : '',
    `【输入】\n${JSON.stringify({ texts: input.segments })}`,
  ].filter(Boolean)
  return [
    { role: 'system', content: BATCH_SYSTEM_PROMPT },
    { role: 'user', content: sections.join('\n') },
  ]
}
