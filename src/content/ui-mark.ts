const UI_ATTR = 'data-yuyi-ui'
const CONTENT_ATTR = 'data-yuyi'

export function markUiHost(element: HTMLElement, kind: string): void {
  element.setAttribute(UI_ATTR, kind)
}

function isMarked(element: Element): boolean {
  if (typeof element.hasAttribute !== 'function') return false
  return element.hasAttribute(UI_ATTR) || element.hasAttribute(CONTENT_ATTR)
}

export function isYuyiNode(node: Node | null): boolean {
  let cursor: Node | null = node
  while (cursor) {
    if (cursor.nodeType === 1 && isMarked(cursor as Element)) return true
    const root: Node = typeof cursor.getRootNode === 'function' ? cursor.getRootNode() : cursor
    if (root !== cursor && root.nodeType === 11) {
      const host: Node = (root as ShadowRoot).host
      if (!host) {
        cursor = cursor.parentNode
        continue
      }
      if (host.nodeType === 1 && isMarked(host as Element)) return true
      cursor = host
      continue
    }
    cursor = cursor.parentNode
  }
  return false
}

export function isYuyiPath(path: EventTarget[]): boolean {
  for (const target of path) {
    if (!(target instanceof Element)) continue
    if (isMarked(target)) return true
    const root = target.getRootNode()
    if (root.nodeType === 11) {
      const host = (root as ShadowRoot).host
      if (host && isMarked(host)) return true
    }
  }
  return false
}
