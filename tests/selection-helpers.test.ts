import { describe, expect, it } from 'vitest'
import {
  buildContextWindow,
  calculatePlacement,
  clampBubbleWidth,
  clampIconPosition,
  composeContext,
  isBlockElement,
  looksLikeWord,
  normalizeSelectionText,
} from '../src/content/context'
import { toRect } from '../src/content/selection-hit'

describe('normalizeSelectionText', () => {
  it('保留换行，压掉行内多余空白', () => {
    expect(normalizeSelectionText('  hello\n\n  world  ')).toBe('hello\n\nworld')
    expect(normalizeSelectionText('line one\nline two')).toBe('line one\nline two')
  })

  it('最多保留一个空行', () => {
    expect(normalizeSelectionText('a\n\n\n\nb')).toBe('a\n\nb')
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

describe('isBlockElement', () => {
  it('识别常见块级标签', () => {
    expect(isBlockElement(document.createElement('p'))).toBe(true)
    expect(isBlockElement(document.createElement('h2'))).toBe(true)
    expect(isBlockElement(document.createElement('li'))).toBe(true)
  })
})

describe('clampIconPosition', () => {
  const viewport = { width: 800, height: 600 }
  const size = { width: 28, height: 28 }

  it('默认落在光标右下角', () => {
    expect(clampIconPosition({ x: 100, y: 100 }, size, viewport)).toEqual({ left: 108, top: 108 })
  })

  it('靠近右边缘时翻到光标左侧', () => {
    expect(clampIconPosition({ x: 790, y: 100 }, size, viewport).left).toBe(790 - 28 - 8)
  })

  it('靠近底部时翻到光标上方', () => {
    expect(clampIconPosition({ x: 100, y: 590 }, size, viewport).top).toBe(590 - 28 - 8)
  })

  it('越界坐标仍留在视口内', () => {
    const position = clampIconPosition({ x: -50, y: -50 }, size, viewport)
    expect(position.left).toBe(6)
    expect(position.top).toBe(6)
  })
})

describe('clampBubbleWidth', () => {
  it('贴合选区宽度', () => {
    expect(clampBubbleWidth(300, 1200)).toBe(300)
    expect(clampBubbleWidth(300.6, 1200)).toBe(301)
  })

  it('上限是视口宽度的三分之一', () => {
    expect(clampBubbleWidth(720, 1200)).toBe(400)
    expect(clampBubbleWidth(400, 1200)).toBe(400)
  })

  it('短选区有下限，避免压成窄条', () => {
    expect(clampBubbleWidth(40, 1200)).toBe(200)
  })

  it('拿不到选区宽度时用默认宽度', () => {
    expect(clampBubbleWidth(undefined, 1200)).toBe(340)
    expect(clampBubbleWidth(0, 1200)).toBe(340)
  })

  it('窄视口下三分之一不足下限时保留下限', () => {
    expect(clampBubbleWidth(400, 480)).toBe(200)
    expect(clampBubbleWidth(400, 300)).toBe(200)
  })
})

describe('toRect', () => {
  it('零尺寸视为拿不到位置', () => {
    expect(toRect({ top: 10, bottom: 10, left: 20, right: 20 })).toBeNull()
  })

  it('正常矩形原样返回', () => {
    expect(toRect({ top: 10, bottom: 30, left: 20, right: 80 })).toEqual({
      top: 10,
      bottom: 30,
      left: 20,
      right: 80,
    })
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

  it('prefer 下方时贴着选区底边展开', () => {
    const placement = calculatePlacement(
      { top: 200, bottom: 220, left: 100 },
      { width: 300, height: 120 },
      viewport,
      { prefer: 'below' },
    )
    expect(placement.side).toBe('below')
    expect(placement.top).toBe(228)
  })

  it('prefer 下方但下方放不下时翻到上方', () => {
    const placement = calculatePlacement(
      { top: 500, bottom: 560, left: 100 },
      { width: 300, height: 120 },
      viewport,
      { prefer: 'below' },
    )
    expect(placement.side).toBe('above')
    expect(placement.top).toBe(372)
  })

  it('gap 可调', () => {
    const placement = calculatePlacement(
      { top: 200, bottom: 220, left: 100 },
      { width: 300, height: 120 },
      viewport,
      { gap: 16, prefer: 'below' },
    )
    expect(placement.top).toBe(236)
  })
})
