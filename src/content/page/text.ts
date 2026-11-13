import { detectLang } from '../../core/lang'

export const MAX_UNIT_CHARS = 3000
export const MAX_BATCH_CHARS = 1200
export const MAX_BATCH_ITEMS = 8
export const MAX_UNITS = 400
export const MAX_SCAN_ROOTS = 20

export type SkipKind = 'empty' | 'tooLong' | 'noLetter' | 'url' | 'targetLang'

export function normalizeUnitText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function collectText(node: Node, parts: string[]): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      parts.push(child.nodeValue ?? '')
      continue
    }
    if (child.nodeType !== 1) continue
    const element = child as Element
    const tag = element.tagName
    if (tag === 'BR') {
      parts.push(' ')
      continue
    }
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') continue
    collectText(element, parts)
  }
}

export function readUnitText(element: Node): string {
  const parts: string[] = []
  collectText(element, parts)
  return normalizeUnitText(parts.join(''))
}

export function isTargetLanguageText(text: string, targetLang: string): boolean {
  const target = targetLang.toLowerCase()
  if (!target || target === 'auto') return false
  const detected = detectLang(text)
  if (target.startsWith('zh')) return detected === 'zh-CN'
  if (target.startsWith('ja')) return detected === 'ja'
  if (target.startsWith('ko')) return detected === 'ko'
  if (target.startsWith('ru')) return detected === 'ru'
  if (target.startsWith('ar')) return detected === 'ar'
  return false
}

export function classifyText(text: string, targetLang: string): SkipKind | null {
  if (!text) return 'empty'
  if (text.length > MAX_UNIT_CHARS) return 'tooLong'
  if (!/\p{L}/u.test(text)) return 'noLetter'
  if (/^(https?:\/\/|www\.)\S+$/i.test(text)) return 'url'
  if (isTargetLanguageText(text, targetLang)) return 'targetLang'
  return null
}

export function groupUnits<T extends { text: string }>(
  units: T[],
  maxChars = MAX_BATCH_CHARS,
  maxItems = MAX_BATCH_ITEMS,
): T[][] {
  const groups: T[][] = []
  let current: T[] = []
  let chars = 0
  for (const unit of units) {
    const tooLong = chars + unit.text.length > maxChars
    const tooMany = current.length >= maxItems
    if (current.length > 0 && (tooLong || tooMany)) {
      groups.push(current)
      current = []
      chars = 0
    }
    current.push(unit)
    chars += unit.text.length
  }
  if (current.length > 0) groups.push(current)
  return groups
}

export function pickScanRoots(
  records: MutationRecord[],
  isOwn: (element: Element) => boolean,
  limit = MAX_SCAN_ROOTS,
): Element[] {
  const roots: Element[] = []
  const seen = new Set<Element>()
  for (const record of records) {
    for (const node of Array.from(record.addedNodes)) {
      if (node.nodeType !== 1) continue
      const element = node as Element
      if (seen.has(element)) continue
      if (isOwn(element)) continue
      seen.add(element)
      roots.push(element)
      if (roots.length >= limit) return roots
    }
  }
  return roots
}
