import type { ContextScope } from '../storage/settings'
import { MAX_SELECTION_CHARS, WINDOW_LABEL, buildContextWindowForRange, composeContext, isBlockElement } from './context'
import { isYuyiNode } from './ui-mark'

export const CONTEXT_LABELS = {
  headings: '章节：',
  previous: '上文：',
  next: '下文：',
  list: '列表：',
  table: '表格：',
  outline: '页面大纲：',
  intro: '页面首段：',
} as const

const HEADING_TAGS = 'h1, h2, h3, h4, h5, h6'
const HEADING_SCAN_LIMIT = 480
const HEADING_CHARS = 90
const NEIGHBOR_CHARS = 200
const NEIGHBOR_SENTENCES = 2
const NEIGHBOR_HOPS = 6
const NEIGHBOR_DEPTH = 4
const NEIGHBOR_UNIT_RATIO = 0.6
const NEIGHBOR_SIBLINGS = 3
const NEIGHBOR_MIN_CHARS = 12
const CONVERSATION_UNITS = 2
const CONVERSATION_SCAN = 8
const CONVERSATION_TAGS = /(comment|message|chat|reply|thread)/i
const CONVERSATION_EXCLUDE = /(body|content|text|header|meta|author|avatar|toolbar|action|footer|time|editor|input)/i
const SHADOW_TEXT_DEPTH = 8
const CHROME_TAGS = new Set(['HEADER', 'NAV', 'ASIDE', 'FOOTER', 'MENU'])
const CHROME_ROLES = new Set([
  'navigation',
  'complementary',
  'banner',
  'contentinfo',
  'menu',
  'menubar',
  'toolbar',
  'search',
])
const CHROME_NAMES = new Set([
  'header',
  'nav',
  'navbar',
  'navigation',
  'menu',
  'menubar',
  'sidebar',
  'footer',
  'masthead',
  'toolbar',
  'breadcrumb',
  'tabs',
  'topbar',
])
const LIST_ITEMS = 4
const LIST_ITEM_CHARS = 120
const TABLE_COLUMNS = 6
const TABLE_CELL_CHARS = 60
const OUTLINE_ITEMS = 12
const OUTLINE_CHARS = 80
const INTRO_CHARS = 240
const INTRO_MIN_CHARS = 40
const NOISE_TAGS = new Set([
  'NAV',
  'ASIDE',
  'FOOTER',
  'PRE',
  'CODE',
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'SVG',
  'CANVAS',
  'IFRAME',
  'BUTTON',
  'SELECT',
  'TEXTAREA',
  'INPUT',
  'FORM',
])
const TEXT_SKIP_TAGS = new Set(['STYLE', 'SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'TITLE', 'HEAD', 'BASE'])
const NOISE_SELECTOR = Array.from(NOISE_TAGS, (tag) => tag.toLowerCase()).join(',')
const HEADING_TEXT_CACHE = new WeakMap<Element, string>()

type Section = { label: string; text: string }

export type StructuredContextInput = {
  block: Element | null
  blockText?: string
  extra?: string
  selection: string
  title: string
  host: string
  contextChars: number
  scope: ContextScope
  range?: Range | null
}

function flattenText(text: string, limit: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= limit) return collapsed
  return collapsed.slice(0, Math.max(0, limit - 1)) + '…'
}

function collectText(node: Node, depth: number): string {
  if (depth > SHADOW_TEXT_DEPTH) return ''
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return ''
  let text = ''
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element: Element = node as Element
    if (TEXT_SKIP_TAGS.has(element.tagName)) return ''
    const shadow = element.shadowRoot
    if (shadow) text += collectText(shadow, depth + 1)
  }
  for (const child of Array.from(node.childNodes)) text += collectText(child, depth + 1)
  return text
}

function textOf(element: Element | null): string {
  if (!element) return ''
  return collectText(element, 0).replace(/\u00a0/g, ' ').trim()
}

function headingText(element: Element, limit: number): string {
  let text = HEADING_TEXT_CACHE.get(element)
  if (text === undefined) {
    text = textOf(element).replace(/\s+/g, ' ').trim()
    HEADING_TEXT_CACHE.set(element, text)
  }
  return text.length <= limit ? text : text.slice(0, Math.max(0, limit - 1)) + '…'
}

function isNoise(element: Element | null): boolean {
  if (!element) return false
  return NOISE_TAGS.has(element.tagName) || element.closest(NOISE_SELECTOR) !== null
}

function usable(element: Element | null): element is Element {
  if (!element) return false
  if ((element as HTMLElement).hidden) return false
  if (element.getAttribute('aria-hidden') === 'true') return false
  if (isYuyiNode(element)) return false
  const style = element.getAttribute('style') ?? ''
  return !/display\s*:\s*none|visibility\s*:\s*hidden/i.test(style)
}

function isChrome(element: Element | null): boolean {
  let node = element
  let hops = 0
  while (node && hops < 6) {
    if (CHROME_TAGS.has(node.tagName)) return true
    if (CHROME_ROLES.has((node.getAttribute('role') ?? '').toLowerCase())) return true
    if (node.id && CHROME_NAMES.has(node.id.toLowerCase())) return true
    for (const name of Array.from(node.classList)) {
      if (CHROME_NAMES.has(name.toLowerCase())) return true
    }
    node = node.parentElement
    hops += 1
  }
  return false
}

function interactiveDensity(element: Element): number {
  const total = textOf(element).replace(/\s+/g, '').length
  if (!total) return 0
  let linked = 0
  const controls = element.querySelectorAll('a, button, [role="button"], [role="link"], [role="menuitem"], [role="tab"]')
  for (const control of Array.from(controls)) linked += textOf(control).replace(/\s+/g, '').length
  return linked / total
}

function isContentLike(element: Element | null): element is Element {
  if (!element || !usable(element) || isNoise(element) || isChrome(element)) return false
  if (textOf(element).length < NEIGHBOR_MIN_CHARS) return false
  return interactiveDensity(element) < 0.5
}

function isConversationItem(element: Element): boolean {
  const tag = element.tagName.toLowerCase()
  const signature = [tag, element.id, ...Array.from(element.classList)].join(' ').toLowerCase()
  if (!CONVERSATION_TAGS.test(signature)) return false
  if (CONVERSATION_EXCLUDE.test(signature)) return false
  if (element.getAttribute('role') === 'listitem') return true
  if (tag === 'li' || tag.includes('-')) return true
  return /(comment|message|chat|reply|thread)[-_]?(item|row|card|thread|entry)/.test(signature)
}

function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?。！？；;])\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function scriptStats(text: string): { cjk: number; total: number } {
  let cjk = 0
  let total = 0
  for (const char of text) {
    if (/[\s\d\p{P}\p{S}]/u.test(char)) continue
    total += 1
    if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(char)) cjk += 1
  }
  return { cjk, total }
}

function crossesLanguage(neighbor: string, selection: string): boolean {
  if (neighbor.length < 20 || selection.length < 12) return false
  const a = scriptStats(neighbor)
  const b = scriptStats(selection)
  if (a.total < 12 || b.total < 12) return false
  const aCjk = a.cjk / a.total
  const bCjk = b.cjk / b.total
  if (aCjk >= 0.6 && bCjk <= 0.2) return true
  if (bCjk >= 0.6 && aCjk <= 0.2) return true
  return false
}

function clampHead(text: string, limit: number): string {
  if (limit <= 0) return ''
  return text.length <= limit ? text : text.slice(0, limit - 1) + '…'
}

function clampTail(text: string, limit: number): string {
  if (limit <= 0) return ''
  return text.length <= limit ? text : '…' + text.slice(text.length - limit + 1)
}

function pushHeading(chain: Array<{ level: number; text: string }>, heading: Element): void {
  const level = Number(heading.tagName.slice(1))
  if (!Number.isFinite(level) || level < 1) return
  const text = headingText(heading, HEADING_CHARS)
  if (!text) return
  while (chain.length > 0 && chain[chain.length - 1].level >= level) chain.pop()
  chain.push({ level, text })
}

export function headingChain(block: Element | null, root: ParentNode = document): string {
  if (!block || !block.isConnected) return ''
  const chain: Array<{ level: number; text: string }> = []
  const headings = Array.from(root.querySelectorAll(HEADING_TAGS))
  let scanned = 0
  for (const heading of headings) {
    if (scanned >= HEADING_SCAN_LIMIT) break
    scanned += 1
    if (!usable(heading) || isNoise(heading)) continue
    if (heading.contains(block)) {
      pushHeading(chain, heading)
      continue
    }
    const position = block.compareDocumentPosition(heading)
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) break
    if (!(position & Node.DOCUMENT_POSITION_PRECEDING)) continue
    pushHeading(chain, heading)
  }
  return chain.map((entry) => entry.text).join(' › ')
}

function unitContext(unit: Element, direction: 'previous' | 'next', selection: string): string {
  const raw = textOf(unit)
  if (crossesLanguage(raw, selection)) return ''
  const sentences = sentencesOf(raw)
  if (sentences.length === 0) return ''
  if (direction === 'previous') {
    return clampTail(sentences.slice(-NEIGHBOR_SENTENCES).join(' '), NEIGHBOR_CHARS)
  }
  return clampHead(sentences.slice(0, NEIGHBOR_SENTENCES).join(' '), NEIGHBOR_CHARS)
}

function conversationUnits(block: Element | null, direction: 'previous' | 'next'): Element[] {
  let current = block
  let hops = 0
  while (current && hops <= NEIGHBOR_HOPS) {
    if (isConversationItem(current)) {
      const units: Element[] = []
      const sameTagOnly = current.tagName === 'LI' || current.tagName.includes('-')
      let sibling = direction === 'previous' ? current.previousElementSibling : current.nextElementSibling
      let scanned = 0
      while (sibling && units.length < CONVERSATION_UNITS && scanned < CONVERSATION_SCAN) {
        scanned += 1
        if ((!sameTagOnly || sibling.tagName === current.tagName) && isConversationItem(sibling) && isContentLike(sibling)) {
          units.push(sibling)
        }
        sibling = direction === 'previous' ? sibling.previousElementSibling : sibling.nextElementSibling
      }
      if (units.length > 0) return direction === 'previous' ? units.reverse() : units
    }
    current = parentAcrossShadow(current)
    hops += 1
  }
  return []
}

export function neighborContext(block: Element | null, direction: 'previous' | 'next', selection = ''): string {
  const units = conversationUnits(block, direction)
  if (units.length > 0) {
    return units
      .map((unit) => unitContext(unit, direction, selection))
      .filter(Boolean)
      .join('\n')
  }
  const unit = edgeUnit(block, direction)
  return unit ? unitContext(unit, direction, selection) : ''
}

function parentAcrossShadow(element: Element): Element | null {
  const parent = element.parentElement
  if (parent) return parent
  const root = element.getRootNode()
  return root instanceof ShadowRoot ? root.host : null
}

function edgeUnit(block: Element | null, direction: 'previous' | 'next'): Element | null {
  let current = block
  let hops = 0
  while (current && hops <= NEIGHBOR_HOPS) {
    let sibling = direction === 'previous' ? current.previousElementSibling : current.nextElementSibling
    let scanned = 0
    while (sibling && scanned < NEIGHBOR_SIBLINGS) {
      scanned += 1
      if (!/^H[1-6]$/.test(sibling.tagName) && usable(sibling) && !isNoise(sibling) && !isChrome(sibling)) {
        const unit = edgeNode(sibling, direction)
        if (unit && isContentLike(unit)) return unit
      }
      sibling = direction === 'previous' ? sibling.previousElementSibling : sibling.nextElementSibling
    }
    current = parentAcrossShadow(current)
    hops += 1
  }
  return null
}

function edgeNode(start: Element, direction: 'previous' | 'next'): Element | null {
  if (!usable(start) || isNoise(start)) return null
  const total = textOf(start)
  const threshold = Math.max(20, total.length * NEIGHBOR_UNIT_RATIO)
  let node = start
  let hops = 0
  while (hops < NEIGHBOR_DEPTH) {
    const children = Array.from(node.children).filter(
      (child) => usable(child) && !isNoise(child) && !isChrome(child) && textOf(child),
    )
    if (children.length === 0) break
    const ordered = direction === 'previous' ? children.reverse() : children
    const child = ordered.find((entry) => isBlockElement(entry) && textOf(entry).length >= threshold)
    if (!child) break
    node = child
    hops += 1
  }
  return textOf(node) ? node : null
}

export function listContext(block: Element | null): string {
  if (!block) return ''
  const item = block.closest('li')
  if (!item || !usable(item)) return ''
  const list = item.parentElement
  if (!list || (list.tagName !== 'UL' && list.tagName !== 'OL')) return ''
  if (isNoise(list)) return ''
  const items = Array.from(list.children).filter((child) => child.tagName === 'LI' && usable(child))
  if (items.length < 2) return ''
  const lines: string[] = []
  for (const entry of items.slice(0, LIST_ITEMS)) {
    const text = flattenText(textOf(entry), LIST_ITEM_CHARS)
    if (text) lines.push('· ' + text)
  }
  return lines.join('\n')
}

function cellColumn(row: Element, cell: Element): number {
  let index = 0
  for (const entry of Array.from(row.children)) {
    const span = Math.max(1, Number((entry as HTMLTableCellElement).colSpan) || 1)
    if (entry === cell) return index
    index += span
  }
  return index
}

function headerColumns(headerRow: Element): string[] {
  const columns: string[] = []
  for (const cell of Array.from(headerRow.querySelectorAll('th, td'))) {
    const span = Math.max(1, Number((cell as HTMLTableCellElement).colSpan) || 1)
    const text = flattenText(textOf(cell), TABLE_CELL_CHARS)
    for (let index = 0; index < span && columns.length < TABLE_COLUMNS; index += 1) columns.push(text)
  }
  return columns
}

export function tableContext(block: Element | null): string {
  if (!block) return ''
  const cell = block.closest('td, th')
  if (!cell || !usable(cell)) return ''
  const row = cell.closest('tr')
  const table = cell.closest('table')
  if (!row || !table || isNoise(table)) return ''
  const rows = Array.from(table.querySelectorAll('tr'))
  const headerRow = table.tHead?.querySelector('tr') ?? (rows.length > 1 ? rows[0] : null)
  if (!headerRow || headerRow === row) return ''
  const headers = headerColumns(headerRow)
  const cells = Array.from(row.querySelectorAll('th, td'))
    .map((entry) => flattenText(textOf(entry), TABLE_CELL_CHARS))
    .slice(0, TABLE_COLUMNS)
  if (headers.length === 0 || cells.length === 0) return ''
  if (headers.every((entry) => !entry) || cells.every((entry) => !entry)) return ''
  const column = headers[cellColumn(row, cell)]
  const lines = ['表头：' + headers.join(' | '), '本行：' + cells.join(' | ')]
  if (column) lines.push('列：' + column)
  return lines.join('\n')
}

export function pageOutline(root: ParentNode = document): string {
  const headings = Array.from(root.querySelectorAll('h1, h2, h3'))
  const lines: string[] = []
  let scanned = 0
  for (const heading of headings) {
    if (lines.length >= OUTLINE_ITEMS || scanned >= HEADING_SCAN_LIMIT) break
    scanned += 1
    if (!usable(heading) || isNoise(heading)) continue
    const level = Math.min(3, Math.max(1, Number(heading.tagName.slice(1)) || 1))
    const text = headingText(heading, OUTLINE_CHARS)
    if (!text) continue
    lines.push('  '.repeat(level - 1) + '- ' + text)
  }
  return lines.join('\n')
}

export function pageIntro(root: ParentNode = document): string {
  const scope = root.querySelector('article, main') ?? root
  const paragraphs = Array.from(scope.querySelectorAll('p'))
  for (const paragraph of paragraphs) {
    if (!usable(paragraph) || isNoise(paragraph)) continue
    const text = flattenText(textOf(paragraph), INTRO_CHARS)
    if (text.length < INTRO_MIN_CHARS) continue
    return text
  }
  return ''
}

function mergeSection(section: Section): string {
  const text = section.text.trim()
  if (!text) return ''
  if (!section.label) return text
  return text.includes('\n') ? section.label + '\n' + text : section.label + text
}

function assemble(sections: Section[], budget: number): string {
  const lines: string[] = []
  let used = 0
  for (const section of sections) {
    const merged = mergeSection(section)
    if (!merged) continue
    const left = budget - used
    if (left <= 0) break
    const separator = lines.length > 0 ? 1 : 0
    if (merged.length + separator <= left) {
      lines.push(merged)
      used += merged.length + separator
      continue
    }
    if (left - separator > 12) lines.push(clampHead(merged, left - separator))
    break
  }
  return lines.join('\n')
}

export function buildStructuredContext(input: StructuredContextInput): string {
  const title = flattenText(input.title, 160)
  const host = flattenText(input.host, 120)
  if (input.selection.length > MAX_SELECTION_CHARS) {
    return composeContext({ title, host, maxLength: MAX_SELECTION_CHARS })
  }
  const header = [title ? '页面标题：' + title : '', host ? '网站：' + host : ''].filter(Boolean).join('\n')
  if (input.contextChars <= 0) return composeContext({ title, host, maxLength: MAX_SELECTION_CHARS })
  const budget = Math.max(0, MAX_SELECTION_CHARS - (header ? header.length + 1 : 0))
  const sections: Section[] = []
  if (input.extra) sections.push({ label: '', text: input.extra })
  if (input.block && input.contextChars > 0) {
    const blockText = input.blockText ?? textOf(input.block)
    const windowText = buildContextWindowForRange({
      range: input.range,
      block: input.block,
      blockText,
      selection: input.selection,
      maxChars: input.contextChars,
    })
    if (windowText) sections.push({ label: WINDOW_LABEL, text: windowText })
  }
  const block = input.block
  if (block && input.scope !== 'segment') {
    const headings = headingChain(block)
    if (headings) sections.push({ label: CONTEXT_LABELS.headings, text: headings })
    const previous = neighborContext(block, 'previous', input.selection)
    if (previous) sections.push({ label: CONTEXT_LABELS.previous, text: previous })
    const next = neighborContext(block, 'next', input.selection)
    if (next) sections.push({ label: CONTEXT_LABELS.next, text: next })
    const list = listContext(block)
    if (list) sections.push({ label: CONTEXT_LABELS.list, text: list })
    const table = tableContext(block)
    if (table) sections.push({ label: CONTEXT_LABELS.table, text: table })
  }
  if (input.scope === 'page') {
    const root = block?.ownerDocument ?? document
    const outline = pageOutline(root)
    if (outline) sections.push({ label: CONTEXT_LABELS.outline, text: outline })
    const intro = pageIntro(root)
    if (intro) sections.push({ label: CONTEXT_LABELS.intro, text: intro })
  }
  return composeContext({
    title,
    host,
    window: assemble(sections, budget),
    windowLabel: '',
    maxLength: MAX_SELECTION_CHARS,
  })
}
