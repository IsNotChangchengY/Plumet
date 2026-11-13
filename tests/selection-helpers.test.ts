import { describe, expect, it } from 'vitest'
import {
  buildContextWindow,
  calculatePlacement,
  composeContext,
  isBlockElement,
  isEditableElement,
  looksLikeWord,
  normalizeSelectionText,
} from '../src/content/context'

describe('normalizeSelectionText', () => {
  it('把换行与多余空格压成单空格', () => {
    expect(normalizeSelectionText('  hello\n\n  world  ')).toBe('hello world')
  })

  it('空白文本返回空串', () => {
    expect(normalizeSelectionText('   \n\t ')).toBe('')
  })
})

describe('looksLikeWord', () => {
  it('单个单词算词', () => {
    expect(looksLikeWord('hello')).toBe(true)
    expect(looksLikeWord("don't")).toBe(true)
    expect(looksLikeWord('羽译')).toBe(true)
  })

  it('带空格的句子不算词', () => {
    expect(looksLikeWord('hello world')).toBe(false)
  })

  it('空串与超长 token 不算词', () => {
    expect(looksLikeWord('')).toBe(false)
    expect(looksLikeWord('a'.repeat(30))).toBe(false)
  })
})

describe('buildContextWindow', () => {
  const block = 'The quick brown fox jumps over the lazy dog. It was a sunny day in the park.'

  it('围绕选区截取前后 N 个字符', () => {
    const context = buildContextWindow(block, 'lazy dog', 10)
    expect(context).toContain('lazy dog')
    expect(context.startsWith(' over')).toBe(true)
    expect(context.length).toBeLessThan(block.length)
  })

  it('选区出现在开头时不越界', () => {
    const context = buildContextWindow(block, 'The quick', 10)
    expect(context.startsWith('The quick')).toBe(true)
  })

  it('原文里找不到选区时退回开头', () => {
    const context = buildContextWindow(block, 'not here', 5)
    expect(context.length).toBeLessThanOrEqual(10)
    expect(context.startsWith('The quick')).toBe(true)
  })

  it('上下文长度为 0 时只返回选区本身', () => {
    expect(buildContextWindow(block, 'lazy dog', 0)).toBe('lazy dog')
  })

  it('空原文返回空串', () => {
    expect(buildContextWindow('   ', 'x', 10)).toBe('')
  })
})

describe('composeContext', () => {
  it('把标题、网站与段落窗口拼起来', () => {
    const context = composeContext({ title: 'Example', host: 'example.com', window: 'lazy dog 附近的一段' })
    expect(context).toBe('页面标题：Example\n网站：example.com\nlazy dog 附近的一段')
  })

  it('缺项时跳过对应行', () => {
    expect(composeContext({ window: 'only window' })).toBe('only window')
    expect(composeContext({})).toBe('')
  })

  it('超长时截断', () => {
    const context = composeContext({ window: 'x'.repeat(5000), maxLength: 100 })
    expect(context.length).toBe(100)
  })
})

describe('isEditableElement', () => {
  it('输入框与文本域', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    expect(isEditableElement(input)).toBe(true)
    expect(isEditableElement(textarea)).toBe(true)
  })

  it('contenteditable 及其子节点', () => {
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    const child = document.createElement('span')
    editable.appendChild(child)
    expect(isEditableElement(child)).toBe(true)
  })

  it('普通段落返回 false', () => {
    const paragraph = document.createElement('p')
    const text = document.createTextNode('hello')
    paragraph.appendChild(text)
    expect(isEditableElement(text)).toBe(false)
  })
})

describe('isBlockElement', () => {
  it('识别常见块级标签', () => {
    expect(isBlockElement(document.createElement('p'))).toBe(true)
    expect(isBlockElement(document.createElement('h2'))).toBe(true)
    expect(isBlockElement(document.createElement('li'))).toBe(true)
  })
})

describe('calculatePlacement', () => {
  const viewport = { width: 800, height: 600 }

  it('上方空间足够时放上方', () => {
    const placement = calculatePlacement({ top: 300, bottom: 320, left: 100 }, { width: 300, height: 120 }, viewport)
    expect(placement.side).toBe('above')
    expect(placement.top).toBe(172)
    expect(placement.left).toBe(100)
  })

  it('上方空间不足时放下方', () => {
    const placement = calculatePlacement({ top: 10, bottom: 40, left: 100 }, { width: 300, height: 120 }, viewport)
    expect(placement.side).toBe('below')
    expect(placement.top).toBe(48)
  })

  it('靠近右边缘时向左收', () => {
    const placement = calculatePlacement({ top: 300, bottom: 320, left: 700 }, { width: 300, height: 120 }, viewport)
    expect(placement.left).toBe(492)
  })

  it('靠近顶部且下方也放不下时仍留在视口内', () => {
    const placement = calculatePlacement({ top: 10, bottom: 590, left: 10 }, { width: 300, height: 120 }, viewport)
    expect(placement.top).toBeGreaterThanOrEqual(8)
    expect(placement.top).toBeLessThanOrEqual(600 - 120)
  })
})
