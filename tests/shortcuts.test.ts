import { describe, expect, it } from 'vitest'
import type { ShortcutBinding } from '../src/core/shortcuts'
import {
  DEFAULT_SHORTCUTS,
  defaultShortcuts,
  isDefaultShortcut,
  isModifierCode,
  matchShortcut,
  normalizeShortcuts,
  sameShortcut,
  shortcutFromEvent,
  shortcutLabels,
  shortcutText,
  validateShortcut,
} from '../src/core/shortcuts'
import { normalizeSettings } from '../src/storage/settings'

function key(
  code: string,
  modifiers: Partial<Pick<ShortcutBinding, 'alt' | 'ctrl' | 'shift' | 'meta'>> = {},
): KeyboardEvent {
  return {
    code,
    altKey: modifiers.alt === true,
    ctrlKey: modifiers.ctrl === true,
    shiftKey: modifiers.shift === true,
    metaKey: modifiers.meta === true,
  } as KeyboardEvent
}

describe('defaultShortcuts', () => {
  it('返回独立的默认副本', () => {
    const shortcuts = defaultShortcuts()
    expect(shortcuts.selection).toEqual(DEFAULT_SHORTCUTS.selection)
    shortcuts.selection = null
    expect(DEFAULT_SHORTCUTS.selection?.code).toBe('KeyT')
    expect(defaultShortcuts().page?.code).toBe('KeyP')
  })
})

describe('shortcutFromEvent', () => {
  it('记录物理键与四个修饰键', () => {
    expect(shortcutFromEvent(key('KeyT', { alt: true }))).toEqual({
      code: 'KeyT',
      alt: true,
      ctrl: false,
      shift: false,
      meta: false,
    })
  })

  it('只按修饰键或缺少 code 时返回 null', () => {
    expect(shortcutFromEvent(key('ShiftLeft', { shift: true }))).toBeNull()
    expect(shortcutFromEvent(key('', { alt: true }))).toBeNull()
    expect(isModifierCode('ControlRight')).toBe(true)
    expect(isModifierCode('KeyT')).toBe(false)
  })
})

describe('shortcutLabels', () => {
  it('按 Ctrl、Alt、Shift、键的顺序给标签', () => {
    expect(shortcutLabels({ code: 'KeyT', alt: true, ctrl: false, shift: false, meta: false })).toEqual([
      'Alt',
      'T',
    ])
    expect(
      shortcutLabels({ code: 'Digit1', alt: false, ctrl: true, shift: true, meta: false }),
    ).toEqual(['Ctrl', 'Shift', '1'])
    expect(
      shortcutLabels({ code: 'ArrowUp', alt: true, ctrl: false, shift: false, meta: false }),
    ).toEqual(['Alt', '↑'])
  })

  it('文本拼接与空值', () => {
    expect(shortcutText(DEFAULT_SHORTCUTS.selection)).toBe('Alt + T')
    expect(shortcutText(null)).toBe('')
  })
})

describe('validateShortcut', () => {
  it('拒绝 Win 键、无 Ctrl/Alt 与不支持的键', () => {
    expect(validateShortcut({ code: 'KeyK', alt: true, ctrl: false, shift: false, meta: true })).toBe(
      'Win / Command 键不能用作快捷键',
    )
    expect(validateShortcut({ code: 'KeyK', alt: false, ctrl: false, shift: true, meta: false })).toBe(
      '快捷键需要同时按下 Ctrl 或 Alt',
    )
    expect(validateShortcut({ code: 'KeyK', alt: false, ctrl: true, shift: false, meta: false })).toBe(
      '',
    )
  })

  it('拒绝浏览器保留组合', () => {
    expect(validateShortcut({ code: 'KeyT', alt: false, ctrl: true, shift: false, meta: false })).toBe(
      '这个组合已经被浏览器占用',
    )
    expect(validateShortcut({ code: 'F4', alt: true, ctrl: false, shift: false, meta: false })).toBe(
      '这个组合已经被浏览器占用',
    )
    expect(
      validateShortcut({ code: 'KeyK', alt: true, ctrl: true, shift: true, meta: false }),
    ).toBe('')
  })
})

describe('matchShortcut', () => {
  it('严格比对物理键与修饰键', () => {
    const binding = DEFAULT_SHORTCUTS.selection
    expect(matchShortcut(key('KeyT', { alt: true }), binding)).toBe(true)
    expect(matchShortcut(key('KeyT', { alt: true, shift: true }), binding)).toBe(false)
    expect(matchShortcut(key('KeyP', { alt: true }), binding)).toBe(false)
    expect(matchShortcut(key('KeyT', { alt: true }), null)).toBe(false)
  })

  it('空值相等判定', () => {
    expect(sameShortcut(null, null)).toBe(true)
    expect(sameShortcut(null, DEFAULT_SHORTCUTS.page)).toBe(false)
    expect(sameShortcut(DEFAULT_SHORTCUTS.page, { ...DEFAULT_SHORTCUTS.page })).toBe(true)
  })
})

describe('isDefaultShortcut', () => {
  it('默认值、清除态与自定义值的区分', () => {
    expect(isDefaultShortcut('selection', DEFAULT_SHORTCUTS.selection)).toBe(true)
    expect(isDefaultShortcut('selection', null)).toBe(false)
    expect(
      isDefaultShortcut('page', { code: 'KeyY', alt: true, ctrl: false, shift: false, meta: false }),
    ).toBe(false)
  })
})

describe('normalizeShortcuts', () => {
  it('缺字段回到默认，显式 null 保留为未设置', () => {
    expect(normalizeShortcuts(undefined)).toEqual(DEFAULT_SHORTCUTS)
    expect(normalizeShortcuts({ page: null }).page).toBeNull()
    expect(normalizeShortcuts({ selection: null }).selection).toBeNull()
  })

  it('非法对象与保留组合回退到默认', () => {
    expect(normalizeShortcuts({ selection: 'KeyT' }).selection).toEqual(DEFAULT_SHORTCUTS.selection)
    expect(
      normalizeShortcuts({
        selection: { code: 'KeyT', ctrl: true, alt: false, shift: false, meta: false },
      }).selection,
    ).toEqual(DEFAULT_SHORTCUTS.selection)
  })

  it('保留合法自定义值并把布尔字段收敛', () => {
    const shortcuts = normalizeShortcuts({
      selection: { code: 'KeyK', alt: true, ctrl: true, shift: 1, meta: false },
    })
    expect(shortcuts.selection).toEqual({
      code: 'KeyK',
      alt: true,
      ctrl: true,
      shift: false,
      meta: false,
    })
  })

  it('两个动作同键时 page 回退默认', () => {
    const custom = { code: 'KeyY', alt: true, ctrl: false, shift: false, meta: false }
    expect(normalizeShortcuts({ selection: custom, page: { ...custom } }).page).toEqual(
      DEFAULT_SHORTCUTS.page,
    )
    expect(normalizeShortcuts({ selection: { ...custom }, page: { ...custom } }).selection).toEqual(
      custom,
    )
  })

  it('选择键占用了默认页面键时 page 清空', () => {
    const pageDefault = { ...DEFAULT_SHORTCUTS.page }
    const shortcuts = normalizeShortcuts({ selection: pageDefault, page: pageDefault })
    expect(shortcuts.selection).toEqual(pageDefault)
    expect(shortcuts.page).toBeNull()
  })
})

describe('normalizeSettings.shortcuts', () => {
  it('空数据带默认快捷键', () => {
    expect(normalizeSettings(undefined).shortcuts).toEqual(DEFAULT_SHORTCUTS)
  })

  it('读取已存快捷键并保留清除态', () => {
    const custom = { code: 'KeyK', alt: false, ctrl: true, shift: true, meta: false }
    const settings = normalizeSettings({ shortcuts: { selection: custom, page: null } })
    expect(settings.shortcuts.selection).toEqual(custom)
    expect(settings.shortcuts.page).toBeNull()
  })
})
