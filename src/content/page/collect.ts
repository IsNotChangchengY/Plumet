import { isBlockElement } from '../context'
import { isYuyiNode } from '../ui-mark'
import type { SkipKind } from './text'
import { classifyText, readUnitText } from './text'

const MAX_VISITED = 12000

const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'CODE',
  'PRE',
  'KBD',
  'SAMP',
  'VAR',
  'SVG',
  'CANVAS',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'TEXTAREA',
  'INPUT',
  'SELECT',
  'OPTION',
  'AUDIO',
  'VIDEO',
])

const SKIP_SELECTOR = [
  '[contenteditable]',
  '[translate="no"]',
  '.notranslate',
  '[aria-hidden="true"]',
  '[data-yuyi]',
  '[data-yuyi-ui]',
].join(',')

const EXTRA_BLOCK_TAGS = new Set([
  'UL',
  'OL',
  'DL',
  'TABLE',
  'CAPTION',
  'THEAD',
  'TBODY',
  'TFOOT',
  'TR',
  'HEADER',
  'FOOTER',
  'NAV',
  'FIGURE',
  'FORM',
  'FIELDSET',
  'DETAILS',
  'SUMMARY',
  'ADDRESS',
  'HR',
  'MENU',
  'DIALOG',
  'HGROUP',
  'CENTER',
])

const BLOCKISH_DISPLAY = new Set(['block', 'list-item', 'table-cell', 'table-caption', 'flow-root', '', 'none'])

export type PageUnit = {
  id: string
  element: HTMLElement
  text: string
}

export type CollectOptions = {
  targetLang: string
  limit: number
  seen?: Set<Element>
}

export type SkipCounts = Partial<Record<SkipKind | 'hidden', number>>

export type CollectResult = {
  units: PageUnit[]
  skipped: SkipCounts
  skippedTotal: number
  truncated: boolean
}

let unitSeq = 0

function nextUnitId(): string {
  unitSeq += 1
  return `u${unitSeq}`
}

function displayOf(element: Element): string {
  try {
    return window.getComputedStyle(element).display
  } catch {
    return ''
  }
}

function isBlockLike(element: Element): boolean {
  if (element.tagName === 'BODY' || element.tagName === 'HTML') return true
  if (EXTRA_BLOCK_TAGS.has(element.tagName)) return true
  if (isBlockElement(element)) return true
  const display = displayOf(element)
  if (!display) return false
  if (display === 'block' || display === 'list-item' || display === 'flex' || display === 'grid') return true
  if (display === 'flow-root' || display === 'table') return true
  return display.startsWith('table-')
}

function isBlockishDisplay(element: Element): boolean {
  const display = displayOf(element)
  return BLOCKISH_DISPLAY.has(display)
}

function isUnitCandidate(element: Element): boolean {
  if (element.tagName === 'BODY' || element.tagName === 'HTML') return false
  const raw = element.textContent
  if (!raw || !raw.trim()) return false
  for (const child of Array.from(element.children)) {
    if (isBlockLike(child)) return false
  }
  return isBlockishDisplay(element)
}

function shouldSkip(element: Element): boolean {
  if (SKIP_TAGS.has(element.tagName)) return true
  if (typeof element.matches === 'function' && element.matches(SKIP_SELECTOR)) return true
  return isYuyiNode(element)
}

function isVisible(element: Element): boolean {
  const checker = (element as unknown as { checkVisibility?: (options?: object) => boolean }).checkVisibility
  if (typeof checker === 'function') {
    try {
      return Boolean(checker.call(element, { checkOpacity: true, checkVisibilityCSS: true }))
    } catch {
      return true
    }
  }
  let cursor: Element | null = element
  while (cursor) {
    const style = window.getComputedStyle(cursor)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    cursor = cursor.parentElement
  }
  return true
}

export function collectUnits(root: ParentNode, options: CollectOptions): CollectResult {
  const seen = options.seen ?? new Set<Element>()
  const units: PageUnit[] = []
  const skipped: SkipCounts = {}
  let skippedTotal = 0
  let truncated = false
  let visited = 0

  const bump = (kind: SkipKind | 'hidden'): void => {
    skipped[kind] = (skipped[kind] ?? 0) + 1
    skippedTotal += 1
  }

  const visit = (element: Element): void => {
    if (units.length >= options.limit) {
      truncated = true
      return
    }
    visited += 1
    if (visited > MAX_VISITED) {
      truncated = true
      return
    }
    if (shouldSkip(element)) return
    if (isUnitCandidate(element)) {
      if (seen.has(element)) return
      seen.add(element)
      if (!isVisible(element)) {
        bump('hidden')
        return
      }
      const text = readUnitText(element)
      const reason = classifyText(text, options.targetLang)
      if (reason) {
        bump(reason)
        return
      }
      units.push({ id: nextUnitId(), element: element as HTMLElement, text })
      return
    }
    for (const child of Array.from(element.children)) {
      if (truncated) return
      visit(child)
    }
  }

  const start = root.nodeType === 1 ? [root as Element] : Array.from(root.children ?? [])
  for (const element of start) {
    if (truncated) break
    visit(element)
  }

  return { units, skipped, skippedTotal, truncated }
}
