export type ShortcutBinding = {
  code: string
  alt: boolean
  ctrl: boolean
  shift: boolean
  meta: boolean
}

export type ShortcutAction = 'selection' | 'page'

export type ShortcutSettings = Record<ShortcutAction, ShortcutBinding | null>

const MODIFIER_CODES = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
])

const KEY_LABELS: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  Backquote: '\u0060',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
}

type Modifiers = Partial<Pick<ShortcutBinding, 'alt' | 'ctrl' | 'shift' | 'meta'>>

function binding(code: string, modifiers: Modifiers = {}): ShortcutBinding {
  return {
    code,
    alt: modifiers.alt ?? false,
    ctrl: modifiers.ctrl ?? false,
    shift: modifiers.shift ?? false,
    meta: modifiers.meta ?? false,
  }
}

export const DEFAULT_SHORTCUTS: { selection: ShortcutBinding; page: ShortcutBinding } = {
  selection: binding('KeyT', { alt: true }),
  page: binding('KeyP', { alt: true }),
}

export function defaultShortcuts(): ShortcutSettings {
  return {
    selection: { ...DEFAULT_SHORTCUTS.selection },
    page: { ...DEFAULT_SHORTCUTS.page },
  }
}

const RESERVED_SHORTCUTS: ShortcutBinding[] = [
  binding('KeyT', { ctrl: true }),
  binding('KeyN', { ctrl: true }),
  binding('KeyN', { ctrl: true, shift: true }),
  binding('KeyW', { ctrl: true }),
  binding('KeyW', { ctrl: true, shift: true }),
  binding('KeyT', { ctrl: true, shift: true }),
  binding('Tab', { ctrl: true }),
  binding('Tab', { ctrl: true, shift: true }),
  binding('KeyL', { ctrl: true }),
  binding('KeyD', { ctrl: true }),
  binding('KeyH', { ctrl: true }),
  binding('KeyJ', { ctrl: true }),
  binding('KeyF', { ctrl: true }),
  binding('KeyG', { ctrl: true }),
  binding('KeyP', { ctrl: true }),
  binding('KeyS', { ctrl: true }),
  binding('KeyO', { ctrl: true }),
  binding('KeyU', { ctrl: true }),
  binding('KeyR', { ctrl: true }),
  binding('KeyR', { ctrl: true, shift: true }),
  binding('KeyI', { ctrl: true, shift: true }),
  binding('KeyJ', { ctrl: true, shift: true }),
  binding('KeyC', { ctrl: true, shift: true }),
  binding('KeyB', { ctrl: true, shift: true }),
  binding('KeyO', { ctrl: true, shift: true }),
  binding('Digit0', { ctrl: true }),
  binding('Equal', { ctrl: true }),
  binding('Minus', { ctrl: true }),
  binding('F5', { ctrl: true }),
  binding('F5', { ctrl: true, shift: true }),
  binding('F11', { ctrl: true }),
  binding('F12', { ctrl: true }),
  binding('F12', { ctrl: true, shift: true }),
  binding('KeyD', { alt: true }),
  binding('KeyE', { alt: true }),
  binding('KeyF', { alt: true }),
  binding('KeyD', { alt: true, shift: true }),
  binding('F4', { alt: true }),
  binding('Space', { alt: true }),
  binding('ArrowLeft', { alt: true }),
  binding('ArrowRight', { alt: true }),
  binding('Home', { alt: true }),
]

function signature(value: ShortcutBinding): string {
  const parts = [
    value.ctrl ? 'ctrl' : '',
    value.alt ? 'alt' : '',
    value.shift ? 'shift' : '',
    value.meta ? 'meta' : '',
  ].filter(Boolean)
  return `${parts.join('+')}:${value.code}`
}

const RESERVED_SIGNATURES = new Set(RESERVED_SHORTCUTS.map(signature))

export function isModifierCode(code: string): boolean {
  return MODIFIER_CODES.has(code)
}

function supportedKey(code: string): boolean {
  return (
    /^Key[A-Z]$/.test(code) ||
    /^Digit[0-9]$/.test(code) ||
    /^F([1-9]|1[0-2])$/.test(code) ||
    Object.prototype.hasOwnProperty.call(KEY_LABELS, code)
  )
}

function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1[0-2])$/.test(code)) return code
  return KEY_LABELS[code] ?? code
}

export function shortcutLabels(value: ShortcutBinding): string[] {
  const labels: string[] = []
  if (value.ctrl) labels.push('Ctrl')
  if (value.alt) labels.push('Alt')
  if (value.shift) labels.push('Shift')
  labels.push(keyLabel(value.code))
  return labels
}

export function shortcutText(value: ShortcutBinding | null): string {
  return value ? shortcutLabels(value).join(' + ') : ''
}

export function shortcutFromEvent(event: KeyboardEvent): ShortcutBinding | null {
  const code = event.code
  if (!code || MODIFIER_CODES.has(code)) return null
  return {
    code,
    alt: event.altKey,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  }
}

export function sameShortcut(
  left: ShortcutBinding | null,
  right: ShortcutBinding | null,
): boolean {
  if (!left || !right) return left === right
  return (
    left.code === right.code &&
    left.alt === right.alt &&
    left.ctrl === right.ctrl &&
    left.shift === right.shift &&
    left.meta === right.meta
  )
}

export function validateShortcut(value: ShortcutBinding): string {
  if (value.meta) return 'Win / Command 键不能用作快捷键'
  if (!supportedKey(value.code)) return '这个键不能用作快捷键'
  if (!value.ctrl && !value.alt) return '快捷键需要同时按下 Ctrl 或 Alt'
  if (RESERVED_SIGNATURES.has(signature(value))) return '这个组合已经被浏览器占用'
  return ''
}

export function matchShortcut(event: KeyboardEvent, value: ShortcutBinding | null): boolean {
  if (!value) return false
  return (
    event.code === value.code &&
    event.altKey === value.alt &&
    event.ctrlKey === value.ctrl &&
    event.shiftKey === value.shift &&
    event.metaKey === value.meta
  )
}

export function isDefaultShortcut(
  action: ShortcutAction,
  value: ShortcutBinding | null,
): boolean {
  return sameShortcut(value, DEFAULT_SHORTCUTS[action])
}

function parseBinding(raw: unknown): ShortcutBinding | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (typeof value.code !== 'string' || !value.code) return null
  return {
    code: value.code,
    alt: value.alt === true,
    ctrl: value.ctrl === true,
    shift: value.shift === true,
    meta: value.meta === true,
  }
}

export function normalizeShortcuts(raw: unknown): ShortcutSettings {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const pick = (action: ShortcutAction): ShortcutBinding | null => {
    const value = source[action]
    if (value === null) return null
    if (value === undefined) return { ...DEFAULT_SHORTCUTS[action] }
    const parsed = parseBinding(value)
    if (!parsed || validateShortcut(parsed)) return { ...DEFAULT_SHORTCUTS[action] }
    return parsed
  }
  const selection = pick('selection')
  let page = pick('page')
  if (selection && page && sameShortcut(selection, page)) {
    page = sameShortcut(selection, DEFAULT_SHORTCUTS.page) ? null : { ...DEFAULT_SHORTCUTS.page }
  }
  return { selection, page }
}
