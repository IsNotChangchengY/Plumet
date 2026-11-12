import { diffArrays } from 'diff'
import type { IssueSeverity, LocatedIssue } from './check'

export type MarkKind = 'equal' | 'del' | 'ins' | 'warn'
export type MarkState = 'pending' | 'applied' | 'ignored'

export type Mark = {
  kind: MarkKind
  text: string
  issueId?: string
  severity?: IssueSeverity
  state?: MarkState
}

export type ChangeEntry = {
  before: string
  after: string
}

let segmenter: Intl.Segmenter | null = null

function getSegmenter(): Intl.Segmenter | null {
  if (segmenter) return segmenter
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null
  segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
  return segmenter
}

export function tokenize(text: string): string[] {
  if (!text) return []
  const current = getSegmenter()
  if (!current) return Array.from(text)
  const tokens: string[] = []
  for (const part of current.segment(text)) tokens.push(part.segment)
  return tokens
}

export function mergeMarks(marks: Mark[]): Mark[] {
  const merged: Mark[] = []
  for (const mark of marks) {
    if (!mark.text) continue
    const last = merged[merged.length - 1]
    const sameAsLast =
      last !== undefined &&
      last.kind === mark.kind &&
      last.severity === mark.severity &&
      last.state === mark.state &&
      last.issueId === mark.issueId
    if (sameAsLast && last) {
      last.text += mark.text
    } else {
      merged.push({ ...mark })
    }
  }
  return merged
}

export function diffMarks(before: string, after: string): Mark[] {
  const parts = diffArrays(tokenize(before), tokenize(after))
  const marks: Mark[] = []
  for (const part of parts) {
    const text = part.value.join('')
    if (!text) continue
    marks.push({ kind: part.added ? 'ins' : part.removed ? 'del' : 'equal', text })
  }
  return mergeMarks(marks)
}

export function issueMarks(text: string, issues: LocatedIssue[], ignoredIds: ReadonlySet<string>): Mark[] {
  const marks: Mark[] = []
  let cursor = 0
  for (const issue of issues) {
    if (issue.start < cursor) continue
    if (issue.start > cursor) marks.push({ kind: 'equal', text: text.slice(cursor, issue.start) })
    const original = text.slice(issue.start, issue.end)
    if (ignoredIds.has(issue.id)) {
      marks.push({
        kind: 'warn',
        text: original,
        issueId: issue.id,
        severity: issue.severity,
        state: 'ignored',
      })
    } else {
      marks.push({ kind: 'del', text: original, issueId: issue.id, severity: issue.severity })
      if (issue.replacement) {
        marks.push({ kind: 'ins', text: issue.replacement, issueId: issue.id })
      }
    }
    cursor = issue.end
  }
  if (cursor < text.length) marks.push({ kind: 'equal', text: text.slice(cursor) })
  return mergeMarks(marks)
}

export function resultText(marks: Mark[]): string {
  return marks
    .filter((mark) => mark.kind !== 'del')
    .map((mark) => mark.text)
    .join('')
}

export function changeEntries(marks: Mark[], limit = 40): ChangeEntry[] {
  const entries: ChangeEntry[] = []
  let before = ''
  let after = ''
  const flush = () => {
    if (!before && !after) return
    if (before.trim() || after.trim()) entries.push({ before, after })
    before = ''
    after = ''
  }
  for (const mark of marks) {
    if (mark.kind === 'del') before += mark.text
    else if (mark.kind === 'ins') after += mark.text
    else flush()
  }
  flush()
  return entries.slice(0, limit)
}
