import { containsMarkerSyntax, parseInlineMarkers } from '../../core/inline-markup'

export { stripInlineMarkers } from '../../core/inline-markup'

export type InlineMarkStyle = {
  backgroundColor?: string
  color?: string
}

export type InlineMark = {
  tag: string
  attrs?: Record<string, string>
  style?: InlineMarkStyle
}

export type InlineRun = {
  text: string
  marks: InlineMark[]
}

export type InlineTemplate = {
  text: string
  marked: string
  marks: InlineMark[][]
}

export const MAX_INLINE_MARKERS = 48

const MAX_STYLE_PROBES = 80
const SAFE_COLOR = /^(?:#[\da-f]{3,8}|(?:rgb|rgba|hsl|hsla|lab|lch|oklab|oklch|color)\([^()]*\))$/i
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const LINK_TARGETS = new Set(['_blank', '_self', '_parent', '_top'])

const FORMAT_TAGS: Record<string, string> = {
  B: 'b',
  STRONG: 'strong',
  I: 'i',
  EM: 'em',
  U: 'u',
  INS: 'ins',
  S: 's',
  DEL: 'del',
  STRIKE: 'strike',
  MARK: 'mark',
  SMALL: 'small',
  SUB: 'sub',
  SUP: 'sup',
  CODE: 'code',
  KBD: 'kbd',
  SAMP: 'samp',
  VAR: 'var',
  Q: 'q',
  CITE: 'cite',
  DFN: 'dfn',
}

const RENDER_TAGS = new Set(['a', 'abbr', 'b', 'strong', 'i', 'em', 'u', 'ins', 's', 'del', 'strike', 'mark', 'small', 'sub', 'sup', 'code', 'kbd', 'samp', 'var', 'q', 'cite', 'dfn', 'span'])

const SKIP_INLINE_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'])

type Aspect = 'bold' | 'italic' | 'underline' | 'strike'

type StyleProbe = {
  backgroundColor: string
  color: string
  fontWeight: number
  italic: boolean
  underline: boolean
  strike: boolean
}

type ProbeBudget = { used: number }

type ProbeCache = Map<Element, StyleProbe | null>

type BuildState = {
  probes: ProbeCache
  budget: ProbeBudget
}

type MarkedText = {
  text: string
  marks: InlineMark[]
}

function coveredAspects(tag: string): Aspect[] {
  if (tag === 'B' || tag === 'STRONG') return ['bold']
  if (tag === 'I' || tag === 'EM') return ['italic']
  if (tag === 'U' || tag === 'INS') return ['underline']
  if (tag === 'S' || tag === 'DEL' || tag === 'STRIKE') return ['strike']
  return []
}

function parseFontWeight(value: string): number {
  if (!value || value === 'normal') return 400
  if (value === 'bold') return 700
  const numeric = Number.parseInt(value, 10)
  return Number.isFinite(numeric) ? numeric : 400
}

function probeStyle(element: Element, cache: ProbeCache, budget: ProbeBudget): StyleProbe | null {
  const cached = cache.get(element)
  if (cached !== undefined) return cached
  if (budget.used >= MAX_STYLE_PROBES) {
    cache.set(element, null)
    return null
  }
  budget.used += 1
  try {
    const style = window.getComputedStyle(element)
    const decoration = style.textDecorationLine ?? ''
    const probe: StyleProbe = {
      backgroundColor: style.backgroundColor ?? '',
      color: style.color ?? '',
      fontWeight: parseFontWeight(style.fontWeight ?? ''),
      italic: /^(italic|oblique)/.test(style.fontStyle ?? ''),
      underline: decoration.includes('underline'),
      strike: decoration.includes('line-through'),
    }
    cache.set(element, probe)
    return probe
  } catch {
    cache.set(element, null)
    return null
  }
}

function alphaOfRgb(parts: string[]): number {
  if (parts.length < 4) return 1
  const alpha = Number.parseFloat(parts[3] ?? '1')
  return Number.isFinite(alpha) ? alpha : 1
}

function colorToken(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!normalized || normalized === 'transparent') return ''
  const rgb = /^rgba?\(([^)]+)\)$/.exec(normalized)
  if (!rgb) return normalized
  const parts = (rgb[1] ?? '').split(/[,/\s]+/).filter(Boolean)
  if (parts.length < 3) return normalized
  if (alphaOfRgb(parts) <= 0.05) return ''
  return parts.slice(0, 3).join(',')
}

function hasStyleHints(element: Element): boolean {
  return element.hasAttribute('style') || element.hasAttribute('class') || element.tagName === 'FONT'
}

function safeHref(raw: string | null): string | null {
  const value = raw?.trim()
  if (!value) return null
  try {
    const base = document.baseURI || 'https://example.invalid/'
    const url = new URL(value, base)
    if (LINK_PROTOCOLS.has(url.protocol)) return value
  } catch {
    return null
  }
  return null
}

function linkMark(element: Element): InlineMark | null {
  const href = safeHref(element.getAttribute('href'))
  if (!href) return null
  const attrs: Record<string, string> = { href }
  const target = element.getAttribute('target')
  if (target && LINK_TARGETS.has(target.toLowerCase())) attrs.target = target
  const rel = element.getAttribute('rel')
  if (rel) attrs.rel = rel
  const title = element.getAttribute('title')
  if (title) attrs.title = title
  return { tag: 'a', attrs }
}

function semanticMark(element: Element): InlineMark | null {
  const tag = element.tagName
  if (tag === 'A') return linkMark(element)
  if (tag === 'ABBR') {
    const title = element.getAttribute('title')
    return title ? { tag: 'abbr', attrs: { title } } : null
  }
  const rendered = FORMAT_TAGS[tag]
  return rendered ? { tag: rendered } : null
}

function highlightMark(probe: StyleProbe, parent: StyleProbe | null): InlineMark | null {
  const background = colorToken(probe.backgroundColor)
  if (!background) return null
  if (background === colorToken(parent?.backgroundColor ?? '')) return null
  if (!SAFE_COLOR.test(probe.backgroundColor.trim())) return null
  const style: InlineMarkStyle = { backgroundColor: probe.backgroundColor.trim() }
  const textColor = probe.color.trim()
  if (textColor && SAFE_COLOR.test(textColor) && colorToken(textColor) !== colorToken(parent?.color ?? '')) {
    style.color = textColor
  }
  return { tag: 'span', style }
}

function styleMarks(element: Element, probe: StyleProbe, parent: StyleProbe | null): InlineMark[] {
  const marks: InlineMark[] = []
  const covered = coveredAspects(element.tagName)
  const parentWeight = parent?.fontWeight ?? 400
  if (!covered.includes('bold') && probe.fontWeight >= 600 && parentWeight < 600) marks.push({ tag: 'strong' })
  if (!covered.includes('italic') && probe.italic && !(parent?.italic ?? false)) marks.push({ tag: 'em' })
  if (!covered.includes('underline') && probe.underline && !(parent?.underline ?? false)) {
    marks.push({ tag: 'u' })
  } else if (!covered.includes('strike') && probe.strike && !(parent?.strike ?? false)) {
    marks.push({ tag: 's' })
  }
  const highlight = highlightMark(probe, parent)
  if (highlight) marks.push(highlight)
  return marks
}

function collectRuns(element: Element, marks: InlineMark[], parentProbe: StyleProbe | null, state: BuildState, runs: MarkedText[]): void {
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 3) {
      const text = child.nodeValue ?? ''
      if (text) runs.push({ text, marks })
      continue
    }
    if (child.nodeType !== 1) continue
    const inline = child as Element
    const tag = inline.tagName
    if (tag === 'BR') {
      runs.push({ text: ' ', marks: [] })
      continue
    }
    if (SKIP_INLINE_TAGS.has(tag)) continue
    const semantic = semanticMark(inline)
    const probe = hasStyleHints(inline) ? probeStyle(inline, state.probes, state.budget) : null
    const extra = probe ? styleMarks(inline, probe, parentProbe) : []
    const nextMarks = semantic || extra.length > 0 ? [...marks, ...(semantic ? [semantic] : []), ...extra] : marks
    collectRuns(inline, nextMarks, probe ?? parentProbe, state, runs)
  }
}

function plainKey(marks: InlineMark[]): string {
  return marks.length === 0 ? '' : JSON.stringify(marks)
}

function normalizeRuns(raw: MarkedText[]): { runs: InlineRun[]; text: string } {
  const chars: MarkedText[] = []
  for (const run of raw) {
    for (const char of run.text) chars.push({ text: char, marks: run.marks })
  }
  const collapsed: MarkedText[] = []
  let pendingSpace = false
  let spaceMarks: InlineMark[] = []
  for (const item of chars) {
    if (/\s/.test(item.text)) {
      if (!pendingSpace) {
        pendingSpace = true
        spaceMarks = item.marks
      }
      continue
    }
    if (pendingSpace && collapsed.length > 0) collapsed.push({ text: ' ', marks: spaceMarks })
    pendingSpace = false
    collapsed.push(item)
  }
  const grouped: MarkedText[] = []
  let key = ''
  for (const item of collapsed) {
    const blank = item.text.trim() === ''
    const itemKey = blank ? '' : plainKey(item.marks)
    const last = grouped[grouped.length - 1]
    if (last && key === itemKey) {
      last.text += item.text
      continue
    }
    grouped.push({ text: item.text, marks: blank ? [] : item.marks })
    key = itemKey
  }
  const text = grouped.map((run) => run.text).join('')
  return { runs: grouped, text }
}

export function buildInlineTemplate(element: Element, expectedText: string): InlineTemplate | null {
  const raw: MarkedText[] = []
  collectRuns(element, [], null, { probes: new Map(), budget: { used: 0 } }, raw)
  if (raw.length === 0) return null
  const normalized = normalizeRuns(raw)
  if (!normalized.text || normalized.text !== expectedText) return null
  if (containsMarkerSyntax(normalized.text)) return null
  const markedRuns = normalized.runs.filter((run) => run.marks.length > 0 && run.text.trim() !== '')
  if (markedRuns.length === 0 || markedRuns.length > MAX_INLINE_MARKERS) return null
  const marks: InlineMark[][] = []
  const parts: string[] = []
  for (const run of normalized.runs) {
    if (run.marks.length === 0 || run.text.trim() === '') {
      parts.push(run.text)
      continue
    }
    const index = marks.length
    marks.push(run.marks)
    parts.push(`<y${index}>${run.text}</y${index}>`)
  }
  return { text: normalized.text, marked: parts.join(''), marks }
}

function mergePlainRuns(runs: InlineRun[]): InlineRun[] {
  const merged: InlineRun[] = []
  for (const run of runs) {
    const last = merged[merged.length - 1]
    if (last && last.marks.length === 0 && run.marks.length === 0) {
      last.text += run.text
      continue
    }
    merged.push({ text: run.text, marks: run.marks })
  }
  return merged
}

export function parseInlineTranslation(template: InlineTemplate, translated: string): InlineRun[] | null {
  const pieces = parseInlineMarkers(translated, template.marks.length)
  if (!pieces) return null
  const runs: InlineRun[] = pieces.map((piece) =>
    piece.mark === null
      ? { text: piece.text, marks: [] }
      : { text: piece.text, marks: template.marks[piece.mark] ?? [] },
  )
  return mergePlainRuns(runs)
}

function createMarkElement(mark: InlineMark): Element | null {
  if (!RENDER_TAGS.has(mark.tag)) return null
  const element = document.createElement(mark.tag)
  const attrs = mark.attrs
  if (attrs) {
    if (mark.tag === 'a') {
      const href = safeHref(attrs.href ?? null)
      if (!href) return null
      element.setAttribute('href', href)
      const target = attrs.target
      if (target && LINK_TARGETS.has(target.toLowerCase())) element.setAttribute('target', target)
      if (attrs.rel) element.setAttribute('rel', attrs.rel)
      if (attrs.title) element.setAttribute('title', attrs.title)
    } else if (mark.tag === 'abbr' && attrs.title) {
      element.setAttribute('title', attrs.title)
    }
  }
  if (mark.style) {
    const styled = element as HTMLElement
    const background = mark.style.backgroundColor?.trim()
    if (background && SAFE_COLOR.test(background)) styled.style.backgroundColor = background
    const color = mark.style.color?.trim()
    if (color && SAFE_COLOR.test(color)) styled.style.color = color
  }
  return element
}

export function renderInlineTranslation(template: InlineTemplate, translated: string): DocumentFragment | null {
  const runs = parseInlineTranslation(template, translated)
  if (!runs) return null
  const fragment = document.createDocumentFragment()
  for (const run of runs) {
    let container: Node = fragment
    for (const mark of run.marks) {
      const element = createMarkElement(mark)
      if (!element) continue
      container.appendChild(element)
      container = element
    }
    if (run.text) container.appendChild(document.createTextNode(run.text))
  }
  return fragment
}
