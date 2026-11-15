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
  return /^[\p{L}\p{M}\p{N}'’\-·_]{1,24}$/u.test(trimmed)
}

export function buildContextWindow(blockText: string, selectionText: string, maxChars: number): string {
  const clean = flatten(blockText)
  if (!clean) return ''
  const needle = flatten(selectionText)
  const limit = Math.max(0, maxChars)
  if (!needle) return clean.slice(0, limit * 2)
  const index = clean.indexOf(needle)
  if (index < 0) return clean.slice(0, limit * 2)
  const start = Math.max(0, index - limit)
  const end = Math.min(clean.length, index + needle.length + limit)
  return clean.slice(start, end)
}

export function composeContext(input: {
  title?: string
  host?: string
  window?: string
  maxLength?: number
}): string {
  const parts: string[] = []
  const title = (input.title ?? '').trim()
  const host = (input.host ?? '').trim()
  const windowText = (input.window ?? '').trim()
  if (title) parts.push(`页面标题：${title}`)
  if (host) parts.push(`网站：${host}`)
  if (windowText) parts.push(windowText)
  const merged = parts.join('\n')
  const limit = input.maxLength ?? 2000
  return merged.length > limit ? merged.slice(0, limit) : merged
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
