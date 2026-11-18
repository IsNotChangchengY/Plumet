import type { ContextScope } from '../storage/settings'
import { isBlockElement, normalizeSelectionText } from './context'
import { buildStructuredContext } from './structure'
import { isYuyiNode } from './ui-mark'

export type SelectionRect = { top: number; bottom: number; left: number; right: number }

export type SelectionHit = {
  text: string
  context: string
  rect: SelectionRect | null
  range: Range | null
  element: HTMLInputElement | HTMLTextAreaElement | null
  block: Element | null
  scope: ContextScope
  point?: { x: number; y: number }
}

export type SelectionProbe = {
  contextChars: number
  scope?: ContextScope
  point?: { x: number; y: number }
  path?: EventTarget[]
  roots?: ShadowRoot[]
}

type RawHit = {
  text: string
  range: Range | null
  element: HTMLInputElement | HTMLTextAreaElement | null
  rect: SelectionRect | null
  extraContext?: string
}

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email'])

export function toRect(rect: { top: number; bottom: number; left: number; right: number }): SelectionRect | null {
  if (rect.right - rect.left === 0 && rect.bottom - rect.top === 0) return null
  return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
}

export function readSelection(probe: SelectionProbe): SelectionHit | null {
  const selection = window.getSelection()
  const roots = probe.roots ?? []
  const scope = probe.scope ?? 'section'
  const page = pageContext()
  const readers: Array<() => RawHit | null> = [
    () => readTextControl(probe.path),
    () => readRange(selection),
    () => readShadowRange(selection, roots),
  ]
  for (const read of readers) {
    const raw = read()
    if (!raw) continue
    const text = normalizeSelectionText(raw.text)
    if (!text) continue
    const block = raw.element ? null : pickBlock(raw.range)
    return {
      text,
      context: buildStructuredContext({
        block,
        extra: raw.extraContext,
        selection: text,
        title: page.title,
        host: page.host,
        contextChars: probe.contextChars,
        scope,
        range: raw.range,
      }),
      rect: raw.rect,
      range: raw.range,
      element: raw.element,
      block,
      scope,
      point: probe.point,
    }
  }
  return readShadowText(selection, roots, probe)
}

function readShadowText(selection: Selection | null, roots: ShadowRoot[], probe: SelectionProbe): SelectionHit | null {
  if (!selection || roots.length === 0) return null
  if (!touchesRoots(selection, roots)) return null
  const text = normalizeSelectionText(selection.toString())
  if (!text) return null
  const scope = probe.scope ?? 'section'
  const page = pageContext()
  const block = touchedRoot(selection, roots)?.host ?? null
  return {
    text,
    context: buildStructuredContext({
      block,
      selection: text,
      title: page.title,
      host: page.host,
      contextChars: probe.contextChars,
      scope,
    }),
    rect: null,
    range: null,
    element: null,
    block,
    scope,
    point: probe.point,
  }
}

function touchedRoot(selection: Selection, roots: ShadowRoot[]): ShadowRoot | null {
  if (typeof selection.getComposedRanges !== 'function') return null
  try {
    for (const range of selection.getComposedRanges({ shadowRoots: roots })) {
      const start = range.startContainer.getRootNode()
      if (start instanceof ShadowRoot && roots.includes(start)) return start
      const end = range.endContainer.getRootNode()
      if (end instanceof ShadowRoot && roots.includes(end)) return end
    }
  } catch {
    return null
  }
  return null
}

export function pageContext(): { title: string; host: string } {
  try {
    const top = window.top
    if (top && top !== window) {
      const title = top.document.title.trim()
      const host = top.location.hostname
      if (title || host) return { title: title || document.title, host: host || location.hostname }
    }
  } catch {
    return { title: document.title, host: location.hostname }
  }
  return { title: document.title, host: location.hostname }
}

function touchesRoots(selection: Selection, roots: ShadowRoot[]): boolean {
  if (typeof selection.getComposedRanges !== 'function') return false
  try {
    for (const range of selection.getComposedRanges({ shadowRoots: roots })) {
      if (roots.includes(range.startContainer.getRootNode() as ShadowRoot)) return true
      if (roots.includes(range.endContainer.getRootNode() as ShadowRoot)) return true
    }
  } catch {
    return false
  }
  return false
}

export function rectOf(hit: SelectionHit): SelectionRect | null {
  if (hit.range) {
    const rect = toRect(hit.range.getBoundingClientRect())
    if (rect) return rect
  }
  if (hit.element) {
    const rect = toRect(hit.element.getBoundingClientRect())
    if (rect) return rect
  }
  return hit.rect
}

export function endPointOf(hit: SelectionHit): { x: number; y: number } | null {
  if (hit.range) {
    const rects = hit.range.getClientRects()
    const last = toRect(rects[rects.length - 1] ?? hit.range.getBoundingClientRect())
    if (last) return { x: last.right, y: last.bottom }
  }
  if (hit.element) {
    const rect = toRect(hit.element.getBoundingClientRect())
    if (rect) return { x: rect.right, y: rect.bottom }
  }
  return hit.rect ? { x: hit.rect.right, y: hit.rect.bottom } : null
}

function readTextControl(path?: EventTarget[]): RawHit | null {
  const element = textControlFromPath(path) ?? asTextControl(deepActiveElement())
  if (!element) return null
  const start = element.selectionStart
  const end = element.selectionEnd
  if (start === null || end === null || end <= start) return null
  const text = element.value.slice(start, end)
  if (!text.trim()) return null
  const label = controlLabel(element)
  return {
    text,
    range: null,
    element,
    rect: toRect(element.getBoundingClientRect()),
    extraContext: label ? `输入框：${label}` : '',
  }
}

function controlLabel(element: HTMLInputElement | HTMLTextAreaElement): string {
  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ')
    if (text) return text
  }
  const aria = element.getAttribute('aria-label')
  if (aria?.trim()) return aria.trim()
  const id = element.id
  if (id) {
    for (const label of Array.from(element.ownerDocument.querySelectorAll('label'))) {
      if ((label as HTMLLabelElement).htmlFor !== id) continue
      const text = label.textContent?.trim()
      if (text) return text
    }
  }
  const wrapping = element.closest('label')?.textContent?.trim()
  if (wrapping) return wrapping
  const placeholder = element.getAttribute('placeholder')
  if (placeholder?.trim()) return placeholder.trim()
  const legend = element.closest('fieldset')?.querySelector('legend')?.textContent?.trim()
  if (legend) return legend
  return ''
}

function readRange(selection: Selection | null): RawHit | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (range.collapsed) return null
  const text = range.toString()
  if (!text.trim()) return null
  if (isYuyiNode(range.commonAncestorContainer) || isYuyiNode(range.startContainer)) return null
  return { text, range, element: null, rect: toRect(range.getBoundingClientRect()) }
}

function readShadowRange(selection: Selection | null, roots: ShadowRoot[]): RawHit | null {
  if (!selection) return null
  const candidates = roots.slice()
  const anchored = shadowRootFromSelection(selection)
  if (anchored && !candidates.includes(anchored)) candidates.push(anchored)
  if (candidates.length === 0) return null
  const range = shadowRange(selection, candidates)
  if (!range) return null
  const text = range.toString()
  if (!text.trim()) return null
  if (isYuyiNode(range.commonAncestorContainer)) return null
  return { text, range, element: null, rect: toRect(range.getBoundingClientRect()) }
}

function shadowRange(selection: Selection, roots: ShadowRoot[]): Range | null {
  if (typeof selection.getComposedRanges === 'function') {
    const first = selection.getComposedRanges({ shadowRoots: roots })[0]
    if (first && !first.collapsed) {
      const rebuilt = rebuildRange(first)
      if (rebuilt) return rebuilt
    }
  }
  for (const root of roots) {
    const scoped = (root as ShadowRoot & { getSelection?: () => Selection | null }).getSelection?.()
    if (!scoped || scoped.rangeCount === 0) continue
    const range = scoped.getRangeAt(0)
    if (!range.collapsed) return range
  }
  return null
}

function rebuildRange(source: StaticRange): Range | null {
  try {
    const range = document.createRange()
    range.setStart(source.startContainer, source.startOffset)
    range.setEnd(source.endContainer, source.endOffset)
    return range.collapsed ? null : range
  } catch {
    return null
  }
}

function textControlFromPath(path?: EventTarget[]): HTMLInputElement | HTMLTextAreaElement | null {
  if (!path) return null
  for (const target of path) {
    const control = asTextControl(target)
    if (control) return control
  }
  return null
}

function asTextControl(node: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | null {
  if (node instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(node.type) ? node : null
  if (node instanceof HTMLTextAreaElement) return node
  return null
}

function deepActiveElement(): Element | null {
  let element: Element | null = document.activeElement
  let hops = 0
  while (element && element.shadowRoot && element.shadowRoot.activeElement && hops < 8) {
    element = element.shadowRoot.activeElement
    hops += 1
  }
  return element
}

function shadowRootFromSelection(selection: Selection): ShadowRoot | null {
  const node = selection.anchorNode ?? selection.focusNode
  if (!node) return null
  const root = node.getRootNode()
  return root instanceof ShadowRoot ? root : null
}

export function pickBlock(range: Range | null): Element | null {
  if (!range) return null
  const shadow = range.startContainer.getRootNode()
  if (shadow instanceof ShadowRoot) return shadow.host
  let current: Node | null = range.startContainer
  while (current && current !== document.body) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const element: Element = current as Element
      if (isBlockElement(element) && (element.textContent ?? '').trim()) return element
    }
    const owner: Node = current.getRootNode()
    if (owner instanceof ShadowRoot) {
      const hostElement: Element = owner.host
      const hostText: string = owner.textContent ?? ''
      if (isBlockElement(hostElement) && hostText.trim()) return hostElement
      current = hostElement
      continue
    }
    current = current.parentNode
  }
  return null
}
