import type { PageMode } from '../../storage/settings'
import type { PageUnit } from './collect'
import { normalizeUnitText } from './text'

const PAGE_STYLE = `
[data-yuyi="trans"] {
  display: block;
  margin-top: .18em;
  font: inherit;
  color: inherit;
  line-height: inherit;
  letter-spacing: inherit;
  white-space: normal;
}
[data-yuyi="orig"] { display: none !important; }
[data-yuyi-state="failed"] { outline: 1px dashed rgba(255, 122, 89, .6); outline-offset: 2px; border-radius: 2px; }
`

export type RenderOutcome = 'done' | 'same'

type WriteRecord = {
  unit: PageUnit
  trans: HTMLElement | null
  orig: HTMLElement | null
}

const records = new Map<string, WriteRecord>()
let styleElement: HTMLStyleElement | null = null

export function ensurePageStyle(): void {
  if (styleElement && styleElement.isConnected) return
  const style = document.createElement('style')
  style.setAttribute('data-yuyi', 'style')
  style.textContent = PAGE_STYLE
  document.head.appendChild(style)
  styleElement = style
}

function markState(unit: PageUnit, state: string): void {
  unit.element.setAttribute('data-yuyi-unit', unit.id)
  unit.element.setAttribute('data-yuyi-state', state)
}

export function markUnitFailed(unit: PageUnit): void {
  markState(unit, 'failed')
  if (!records.has(unit.id)) records.set(unit.id, { unit, trans: null, orig: null })
}

function wrapOriginal(unit: PageUnit, keep: HTMLElement | null): HTMLElement {
  const anchor = keep && keep.parentNode === unit.element ? keep : null
  const orig = document.createElement('span')
  orig.setAttribute('data-yuyi', 'orig')
  for (const child of Array.from(unit.element.childNodes)) {
    if (child === anchor) continue
    orig.appendChild(child)
  }
  unit.element.insertBefore(orig, anchor)
  return orig
}

function unwrapOriginal(element: HTMLElement, orig: HTMLElement): void {
  while (orig.firstChild) element.insertBefore(orig.firstChild, orig)
  orig.remove()
}

export function renderTranslation(
  unit: PageUnit,
  translated: string,
  mode: PageMode,
  targetLang: string,
): RenderOutcome {
  ensurePageStyle()
  const text = translated.trim()
  const existing = records.get(unit.id)
  if (!text) {
    markUnitFailed(unit)
    return 'same'
  }
  if (normalizeUnitText(text) === unit.text) {
    markState(unit, 'same')
    records.set(unit.id, { unit, trans: null, orig: existing?.orig ?? null })
    return 'same'
  }
  if (existing?.trans && existing.trans.isConnected) {
    existing.trans.textContent = text
    markState(unit, 'done')
    return 'done'
  }
  let orig = existing?.orig ?? null
  if (mode === 'replace' && !(orig && orig.isConnected)) {
    orig = wrapOriginal(unit, null)
  }
  const trans = document.createElement('span')
  trans.setAttribute('data-yuyi', 'trans')
  trans.setAttribute('lang', targetLang)
  trans.textContent = text
  unit.element.appendChild(trans)
  markState(unit, 'done')
  records.set(unit.id, { unit, trans, orig })
  return 'done'
}

export function switchPageMode(mode: PageMode): void {
  for (const record of records.values()) {
    const { unit, trans } = record
    if (!trans || !trans.isConnected || !unit.element.isConnected) continue
    if (mode === 'replace') {
      if (record.orig && record.orig.isConnected) continue
      record.orig = wrapOriginal(unit, trans)
      continue
    }
    if (record.orig && record.orig.isConnected) unwrapOriginal(unit.element, record.orig)
    record.orig = null
  }
}

export function restorePage(): void {
  for (const record of records.values()) {
    const element = record.unit.element
    if (record.trans && record.trans.isConnected) record.trans.remove()
    if (record.orig && record.orig.isConnected) unwrapOriginal(element, record.orig)
    if (element.isConnected) {
      element.removeAttribute('data-yuyi-unit')
      element.removeAttribute('data-yuyi-state')
    }
  }
  records.clear()
  if (styleElement) {
    styleElement.remove()
    styleElement = null
  }
}

export function hasPageTranslations(): boolean {
  return records.size > 0
}
