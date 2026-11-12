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

const CHECK_SYSTEM_PROMPT = [
  '你是一名严格的语法与用词检查器。',
  '规则：',
  '1. 只返回 JSON，不要解释、不要使用 Markdown 代码块、不要输出其它文字。',
  '2. 返回格式固定为 {"issues":[{"quote":"原文片段","replacement":"修改后片段","category":"grammar|spelling|punctuation|word-choice|style|other","severity":"error|warning|info","explanation":"一句中文说明"}]}。',
  '3. quote 必须是原文里逐字出现的连续片段，尽量短（3–20 字），不要带上下文。',
  '4. replacement 是替换 quote 的文本；只删除时用空字符串。',
  '5. 只报真正需要修改的问题，最多 40 条；没有问题就返回 {"issues":[]}。',
  '6. 不要翻译原文，不要改写成另一种语言，不要整段重写。',
  '7. 纯风格偏好不要报；明显影响可读性时才用 info。',
].join('\n')

export function buildCheckMessages(input: { text: string }): ChatMessage[] {
  return [
    { role: 'system', content: CHECK_SYSTEM_PROMPT },
    { role: 'user', content: `【原文】\n${input.text}` },
  ]
}

export function buildCheckRepairMessages(input: { text: string; previous: string }): ChatMessage[] {
  return [
    { role: 'system', content: CHECK_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        '上一次的输出无法解析为 JSON。请重新检查并严格只输出 JSON 对象，不要任何多余文字。',
        `【原文】\n${input.text}`,
        `【上一次的错误输出（截断）】\n${input.previous.slice(0, 800)}`,
      ].join('\n\n'),
    },
  ]
}

const POLISH_SYSTEM_PROMPT = [
  '你是一名写作润色师。',
  '规则：',
  '1. 只输出润色后的全文，不要标题、不要解释、不要加引号、不要使用 Markdown 代码块。',
  '2. 保留原文的事实与信息，不增加原文没有的内容；除非用户明确要求。',
  '3. 保持原文的段落划分与换行。',
  '4. 严格遵循【润色方向】里的全部要求。',
  '5. 输出语言与原文一致：原文是中文就输出中文，原文是英文就输出英文。',
].join('\n')

export function buildPolishMessages(input: {
  text: string
  instruction: string
}): ChatMessage[] {
  const direction = input.instruction.trim() || '在不改变原意的前提下，让表达更自然、准确、流畅。'
  return [
    { role: 'system', content: POLISH_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `【润色方向】\n${direction}\n\n【原文】\n${input.text}`,
    },
  ]
}
