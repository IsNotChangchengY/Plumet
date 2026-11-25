export type InlinePiece = {
  mark: number | null
  text: string
}

const MARKER_TOKEN = /<y(\d+)>|<\/y(\d+)>/gi
const MARKER_ANY = /<\/?y\d+>/i
const MARKER_ALL = /<\/?y\d+>/gi
const ESCAPED_MARKER = /&lt;(\/?y\d+)&gt;/gi
const PLACEHOLDER_ALL = /【\/?\d+】/g
const PLACEHOLDER_ANY = /【\/?\d+】/

export function decodeInlineEscapes(text: string): string {
  return text.replace(ESCAPED_MARKER, '<$1>')
}

export function stripInlineMarkers(text: string): string {
  return decodeInlineEscapes(text).replace(MARKER_ALL, '').replace(PLACEHOLDER_ALL, '')
}

export function hasInlineMarkers(text: string): boolean {
  return MARKER_ANY.test(text)
}

export function containsMarkerSyntax(text: string): boolean {
  return MARKER_ANY.test(text) || PLACEHOLDER_ANY.test(text)
}

type InlineScan = {
  pieces: InlinePiece[]
  ids: number[]
}

function scanMarked(text: string): InlineScan | null {
  const pieces: InlinePiece[] = []
  const ids: number[] = []
  let open: number | null = null
  let pending = ''
  let last = 0
  let match: RegExpExecArray | null
  MARKER_TOKEN.lastIndex = 0
  while ((match = MARKER_TOKEN.exec(text)) !== null) {
    pending += text.slice(last, match.index)
    last = match.index + match[0].length
    const closing = match[2] !== undefined
    const index = Number(closing ? match[2] : match[1])
    if (!closing) {
      if (open !== null || ids.includes(index)) return null
      if (pending) pieces.push({ mark: null, text: pending })
      pending = ''
      open = index
      continue
    }
    if (open === null || open !== index) return null
    pieces.push({ mark: index, text: pending })
    ids.push(index)
    pending = ''
    open = null
  }
  if (open !== null) return null
  pending += text.slice(last)
  if (pending) pieces.push({ mark: null, text: pending })
  return { pieces, ids }
}

export function parseInlineMarkers(text: string, count: number): InlinePiece[] | null {
  if (!Number.isInteger(count) || count < 0) return null
  const scan = scanMarked(decodeInlineEscapes(text))
  if (!scan || scan.ids.length !== count) return null
  for (const id of scan.ids) {
    if (id < 0 || id >= count) return null
  }
  return scan.pieces
}

function templateIds(source: string): number[] | null {
  const scan = scanMarked(decodeInlineEscapes(source))
  if (!scan) return null
  if (scan.ids.length === 0) return []
  const sorted = scan.ids.slice().sort((a, b) => a - b)
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index] !== index) return null
  }
  return scan.ids
}

export function inlineMarkupIntact(source: string, translated: string): boolean {
  const ids = templateIds(source)
  if (!ids || ids.length === 0) return true
  return parseInlineMarkers(translated, ids.length) !== null
}

export function toPlaceholderMarkup(text: string): string {
  return text
    .replace(/<y(\d+)>/gi, (_match, index: string) => `【${index}】`)
    .replace(/<\/y(\d+)>/gi, (_match, index: string) => `【/${index}】`)
}

function restorePlaceholders(text: string): string | null {
  let output = ''
  let open: number | null = null
  let openText = ''
  let last = 0
  let match: RegExpExecArray | null
  const pattern = /【\/(\d+)】|【(\d+)】/g
  while ((match = pattern.exec(text)) !== null) {
    const between = text.slice(last, match.index)
    last = match.index + match[0].length
    const index = Number(match[1] !== undefined ? match[1] : match[2])
    if (match[1] !== undefined) {
      if (open === null || open !== index) return null
      output += `<y${index}>${openText}${between}</y${index}>`
      open = null
      openText = ''
      continue
    }
    if (open !== null) return null
    output += between
    open = index
    openText = ''
  }
  if (open !== null) return null
  return output + text.slice(last)
}

export function fromPlaceholderMarkup(text: string): string {
  const restored = restorePlaceholders(text)
  if (restored === null) return text.replace(PLACEHOLDER_ALL, '')
  return restored
}
