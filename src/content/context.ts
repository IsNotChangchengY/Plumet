export const MAX_SELECTION_CHARS = 2000
export const DEFAULT_CONTEXT_CHARS = 600

const BLOCK_TAGS = new Set([
  'P',
  'LI',
  'TD',
  'TH',
  'DD',
  'DT',
  'FIGCAPTION',
  'BLOCKQUOTE',
  'PRE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'ARTICLE',
  'SECTION',
  'MAIN',
  'ASIDE',
  'DIV',
])

export function normalizeSelectionText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function looksLikeWord(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/\s/.test(trimmed)) return false
  if (/\p{Script=Han}/u.test(trimmed)) return /^\p{Script=Han}{1,4}$/u.test(trimmed)
  return /^[\p{L}\p{M}\p{N}'’\-·_]{1,24}$/u.test(trimmed)
}

export const WINDOW_LABEL = '段落上下文：'

const ELLIPSIS = '…'

function findSelectionIndex(clean: string, selectionText: string): number {
  const needle = flatten(selectionText)
  if (!needle) return -1
  const exact = clean.indexOf(needle)
  if (exact >= 0) return exact
  const foldedClean = clean.toLowerCase()
  const foldedNeedle = needle.toLowerCase()
  if (foldedClean.length !== clean.length || foldedNeedle.length !== needle.length) return -1
  return foldedClean.indexOf(foldedNeedle)
}

export function buildContextWindow(blockText: string, selectionText: string, maxChars: number): string {
  const clean = flatten(blockText)
  const limit = Math.max(0, Math.trunc(maxChars))
  if (!clean || limit === 0) return ''
  const index = findSelectionIndex(clean, selectionText)
  if (index < 0) return ''
  const length = Math.max(1, flatten(selectionText).length)
  const start = Math.max(0, index - limit)
  const end = Math.min(clean.length, index + length + limit)
  const head = start > 0 ? ELLIPSIS : ''
  const tail = end < clean.length ? ELLIPSIS : ''
  return head + clean.slice(start, end) + tail
}

function blockContaining(node: Node | null, stop: Element | null): Element | null {
  let current: Node | null = node
  while (current) {
    if (current === stop) return null
    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as Element
      if (isBlockElement(element) && (element.textContent ?? '').trim()) return element
    }
    const root = current.getRootNode()
    if (root instanceof ShadowRoot && root.host) {
      current = root.host
      continue
    }
    current = current.parentNode
  }
  return null
}

function rangeWindowText(range: Range, startBlock: Element, endBlock: Element, limit: number): string {
  try {
    const documentNode = startBlock.ownerDocument ?? document
    const head = documentNode.createRange()
    head.setStartBefore(startBlock)
    head.setEnd(range.startContainer, range.startOffset)
    const tail = documentNode.createRange()
    tail.setStart(range.endContainer, range.endOffset)
    tail.setEndAfter(endBlock)
    const before = flatten(head.toString())
    const after = flatten(tail.toString())
    const parts: string[] = []
    if (before) parts.push(before.length > limit ? ELLIPSIS + before.slice(before.length - limit + 1) : before)
    const selected = flatten(range.toString())
    if (selected) parts.push(selected)
    if (after) parts.push(after.length > limit ? after.slice(0, Math.max(0, limit - 1)) + ELLIPSIS : after)
    return parts.join(' ')
  } catch {
    return ''
  }
}

export function buildContextWindowForRange(input: {
  range?: Range | null
  block: Element | null
  blockText?: string
  selection: string
  maxChars: number
}): string {
  const limit = Math.max(0, Math.trunc(input.maxChars))
  if (!input.block || limit === 0) return ''
  const range = input.range
  if (range && !range.collapsed) {
    const endBlock = blockContaining(range.endContainer, input.block)
    if (endBlock) {
      const windowText = rangeWindowText(range, input.block, endBlock, limit)
      if (windowText) return windowText
    }
  }
  return buildContextWindow(input.blockText ?? '', input.selection, limit)
}

export function composeContext(input: {
  title?: string
  host?: string
  window?: string
  windowLabel?: string
  maxLength?: number
}): string {
  const parts: string[] = []
  const title = (input.title ?? '').trim()
  const host = (input.host ?? '').trim()
  const windowText = (input.window ?? '').trim()
  const windowLabel = input.windowLabel ?? WINDOW_LABEL
  if (title) parts.push(`页面标题：${title}`)
  if (host) parts.push(`网站：${host}`)
  if (windowText) parts.push(windowLabel + windowText)
  const merged = parts.join('\n')
  const limit = Math.max(0, input.maxLength ?? 2000)
  if (merged.length <= limit) return merged
  if (limit === 0) return ''
  return merged.slice(0, limit - 1) + ELLIPSIS
}

export function isBlockElement(element: Element): boolean {
  if (BLOCK_TAGS.has(element.tagName)) return true
  try {
    const display = window.getComputedStyle(element).display
    return display === 'block' || display === 'list-item' || display === 'table-cell' || display === 'flex'
  } catch {
    return false
  }
}

export type Placement = {
  left: number
  top: number
  side: 'above' | 'below'
}

export function calculatePlacement(
  anchor: { top: number; bottom: number; left: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  options: { gap?: number; prefer?: Placement['side'] } = {},
): Placement {
  const gap = options.gap ?? 8
  const prefer = options.prefer ?? 'above'
  const other: Placement['side'] = prefer === 'above' ? 'below' : 'above'
  const roomAbove = anchor.top - gap * 2
  const roomBelow = viewport.height - anchor.bottom - gap * 2
  const fitsPreferred = (prefer === 'above' ? roomAbove : roomBelow) >= size.height
  const fitsOther = (prefer === 'above' ? roomBelow : roomAbove) >= size.height
  const side = fitsPreferred
    ? prefer
    : fitsOther
      ? other
      : roomAbove >= roomBelow
        ? 'above'
        : 'below'
  const top = side === 'above' ? anchor.top - size.height - gap : anchor.bottom + gap
  const maxTop = Math.max(gap, viewport.height - size.height - gap)
  const maxLeft = Math.max(gap, viewport.width - size.width - gap)
  const left = Math.min(Math.max(gap, anchor.left), maxLeft)
  return { left, top: Math.min(Math.max(gap, top), maxTop), side }
}

const BUBBLE_MIN_WIDTH = 240
const BUBBLE_DEFAULT_WIDTH = 340
const BUBBLE_WIDTH_EXTRA = 56
const BUBBLE_MAX_VIEWPORT_RATIO = 1 / 2
const BUBBLE_VIEWPORT_MARGIN = 24

export function clampBubbleWidth(selectionWidth: number | undefined, viewportWidth: number): number {
  const ratioLimit = Math.max(0, viewportWidth * BUBBLE_MAX_VIEWPORT_RATIO)
  const max = Math.max(BUBBLE_MIN_WIDTH, Math.min(ratioLimit, viewportWidth - BUBBLE_VIEWPORT_MARGIN))
  const desired =
    selectionWidth && selectionWidth > 0 ? selectionWidth + BUBBLE_WIDTH_EXTRA : BUBBLE_DEFAULT_WIDTH
  return Math.round(Math.min(Math.max(desired, BUBBLE_MIN_WIDTH), max))
}

export function clampIconPosition(
  point: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  options: { gap?: number; margin?: number } = {},
): { left: number; top: number } {
  const gap = options.gap ?? 8
  const margin = options.margin ?? 6
  const maxLeft = Math.max(margin, viewport.width - size.width - gap)
  const maxTop = Math.max(margin, viewport.height - size.height - gap)
  const left = point.x + gap > maxLeft ? point.x - size.width - gap : point.x + gap
  const top = point.y + gap > maxTop ? point.y - size.height - gap : point.y + gap
  return {
    left: Math.round(Math.min(Math.max(margin, left), maxLeft)),
    top: Math.round(Math.min(Math.max(margin, top), maxTop)),
  }
}
