import { z } from 'zod'
import { AppError } from './errors'
import { extractJsonObject } from './providers/http'

export type IssueCategory = 'grammar' | 'spelling' | 'punctuation' | 'word-choice' | 'style' | 'other'
export type IssueSeverity = 'error' | 'warning' | 'info'

export type RawIssue = {
  quote: string
  replacement: string
  category: IssueCategory
  severity: IssueSeverity
  explanation: string
}

export type LocatedIssue = RawIssue & {
  id: string
  start: number
  end: number
}

export type CheckChunk = {
  text: string
  offset: number
}

const issueSchema = z.object({
  quote: z.string().min(1),
  replacement: z.string().default(''),
  category: z.enum(['grammar', 'spelling', 'punctuation', 'word-choice', 'style', 'other']).catch('other'),
  severity: z.enum(['error', 'warning', 'info']).catch('warning'),
  explanation: z.string().default(''),
})

const payloadSchema = z.object({
  issues: z.array(issueSchema),
})

export function parseIssues(raw: string): RawIssue[] {
  let data: unknown
  try {
    data = JSON.parse(extractJsonObject(raw))
  } catch {
    throw new AppError('parse', 'AI 返回的内容不是合法 JSON')
  }
  const parsed = payloadSchema.safeParse(data)
  if (!parsed.success) {
    throw new AppError('parse', 'AI 返回的 JSON 里缺少 issues 数组')
  }
  return parsed.data.issues
    .map((issue) => ({
      quote: issue.quote.trim(),
      replacement: issue.replacement.trim(),
      category: issue.category,
      severity: issue.severity,
      explanation: issue.explanation.trim(),
    }))
    .filter((issue) => issue.quote.length > 0)
}

function normalizeWithMap(text: string): { normalized: string; map: number[] } {
  let normalized = ''
  const map: number[] = []
  let lastWasSpace = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] as string
    if (/\s/.test(char)) {
      if (!lastWasSpace) {
        normalized += ' '
        map.push(index)
        lastWasSpace = true
      }
      continue
    }
    normalized += char.toLowerCase()
    map.push(index)
    lastWasSpace = false
  }
  return { normalized, map }
}

function lowerBound(values: number[], target: number): number {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((values[middle] as number) < target) low = middle + 1
    else high = middle
  }
  return low
}

export function locateIssue(quote: string, text: string, minStart = 0): { start: number; end: number } | null {
  const needle = quote.trim()
  if (!needle) return null

  const exact = text.indexOf(needle, minStart)
  if (exact >= 0) return { start: exact, end: exact + needle.length }

  const caseInsensitive = text.toLowerCase().indexOf(needle.toLowerCase(), minStart)
  if (caseInsensitive >= 0) return { start: caseInsensitive, end: caseInsensitive + needle.length }

  const index = normalizeWithMap(text)
  const normalizedNeedle = normalizeWithMap(needle).normalized.trim()
  if (!normalizedNeedle) return null
  const from = lowerBound(index.map, minStart)
  const found = index.normalized.indexOf(normalizedNeedle, from)
  if (found < 0) return null
  const start = index.map[found]
  const lastIndex = found + normalizedNeedle.length - 1
  const end = (index.map[lastIndex] ?? text.length - 1) + 1
  if (start === undefined || start >= end) return null
  return { start, end }
}

export function locateIssues(
  rawIssues: RawIssue[],
  chunkText: string,
  chunkOffset: number,
  idPrefix: string,
): { located: LocatedIssue[]; dropped: number } {
  const located: LocatedIssue[] = []
  let dropped = 0
  rawIssues.forEach((issue, index) => {
    const span = locateIssue(issue.quote, chunkText)
    if (!span) {
      dropped += 1
      return
    }
    located.push({
      ...issue,
      id: `${idPrefix}-${index}`,
      start: chunkOffset + span.start,
      end: chunkOffset + span.end,
    })
  })
  return { located, dropped }
}

export function mergeIssues(issues: LocatedIssue[]): LocatedIssue[] {
  const sorted = [...issues].sort((left, right) => left.start - right.start || right.end - left.end)
  const kept: LocatedIssue[] = []
  for (const issue of sorted) {
    const last = kept[kept.length - 1]
    if (last && issue.start < last.end) continue
    kept.push(issue)
  }
  return kept
}

export function applyIssues(text: string, issues: LocatedIssue[]): string {
  const kept = mergeIssues(issues)
  let output = ''
  let cursor = 0
  for (const issue of kept) {
    output += text.slice(cursor, issue.start)
    output += issue.replacement
    cursor = issue.end
  }
  output += text.slice(cursor)
  return output
}

export function splitForCheck(text: string, maxChars = 1400): CheckChunk[] {
  const chunks: CheckChunk[] = []
  let cursor = 0
  while (cursor < text.length) {
    const hardEnd = Math.min(text.length, cursor + maxChars)
    let end = hardEnd
    if (hardEnd < text.length) {
      const window = text.slice(cursor, hardEnd)
      const newline = window.lastIndexOf('\n')
      const sentence = Math.max(
        window.lastIndexOf('。'),
        window.lastIndexOf('！'),
        window.lastIndexOf('？'),
        window.lastIndexOf('. '),
        window.lastIndexOf('; '),
      )
      if (newline > maxChars * 0.4) end = cursor + newline + 1
      else if (sentence > maxChars * 0.5) end = cursor + sentence + 1
    }
    const piece = text.slice(cursor, end)
    if (piece.trim()) chunks.push({ text: piece, offset: cursor })
    cursor = end
  }
  if (chunks.length === 0) return text.trim() ? [{ text, offset: 0 }] : []
  return chunks
}
