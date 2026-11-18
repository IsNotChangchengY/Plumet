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
import { pickBlock, toRect } from '../src/content/selection-hit'

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

  it('围绕选区截取前后 N 个字符，被截断的一侧标省略号', () => {
    const context = buildContextWindow(block, 'lazy dog', 10)
    expect(context).toContain('lazy dog')
    expect(context.startsWith('…')).toBe(true)
    expect(context.endsWith('…')).toBe(true)
    expect(context.length).toBeLessThan(block.length)
  })

  it('选区出现在开头时不越界', () => {
    const context = buildContextWindow(block, 'The quick', 10)
    expect(context.startsWith('The quick')).toBe(true)
    expect(context.startsWith('…')).toBe(false)
  })

  it('选区在块里找不到时返回空串，不编造上下文', () => {
    expect(buildContextWindow(block, 'not here', 5)).toBe('')
  })

  it('上下文长度为 0 时不带段落窗口', () => {
    expect(buildContextWindow(block, 'lazy dog', 0)).toBe('')
  })

  it('选区大小写与原文不一致时仍能定位', () => {
    const context = buildContextWindow(block, 'LAZY DOG', 10)
    expect(context).toContain('lazy dog')
  })

  it('空原文返回空串', () => {
    expect(buildContextWindow('   ', 'x', 10)).toBe('')
  })
})

describe('composeContext', () => {
  it('把标题、网站与段落窗口拼起来', () => {
    const context = composeContext({ title: 'Example', host: 'example.com', window: 'lazy dog 附近的一段' })
    expect(context).toBe('页面标题：Example\n网站：example.com\n段落上下文：lazy dog 附近的一段')
  })

  it('缺项时跳过对应行', () => {
    expect(composeContext({ window: 'only window' })).toBe('段落上下文：only window')
    expect(composeContext({})).toBe('')
  })

  it('输入框来源的窗口不加段落标签', () => {
    expect(composeContext({ title: 'Example', window: '输入框：搜索', windowLabel: '' })).toBe(
      '页面标题：Example\n输入框：搜索',
    )
  })

  it('超长时截断并标出省略号', () => {
    const context = composeContext({ window: 'x'.repeat(5000), maxLength: 100 })
    expect(context.length).toBe(100)
    expect(context.endsWith('…')).toBe(true)
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
  it('比选区宽一点，给卡片内边距留空间', () => {
    expect(clampBubbleWidth(300, 1200)).toBe(356)
    expect(clampBubbleWidth(300.6, 1200)).toBe(357)
  })

  it('上限是视口宽度的二分之一', () => {
    expect(clampBubbleWidth(720, 1200)).toBe(600)
    expect(clampBubbleWidth(400, 1200)).toBe(456)
  })

  it('短选区有下限，避免压成窄条', () => {
    expect(clampBubbleWidth(40, 1200)).toBe(240)
  })

  it('拿不到选区宽度时用默认宽度', () => {
    expect(clampBubbleWidth(undefined, 1200)).toBe(340)
    expect(clampBubbleWidth(0, 1200)).toBe(340)
  })

  it('窄视口下二分之一不足下限时保留下限', () => {
    expect(clampBubbleWidth(400, 480)).toBe(240)
    expect(clampBubbleWidth(400, 300)).toBe(240)
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

describe('pickBlock', () => {
  function rangeAt(node: Node, start = 0, end = 5): Range {
    const range = document.createRange()
    range.setStart(node, start)
    range.setEnd(node, end)
    return range
  }

  it('取选区所在的最近块级元素，不向外扩到整个列表容器', () => {
    document.body.innerHTML =
      '<div id="feed"><div class="comment"><p id="text">hello world from one comment</p></div></div>'
    const text = document.getElementById('text')?.firstChild as Text
    expect(pickBlock(rangeAt(text))).toBe(document.getElementById('text'))
  })

  it('选区落在行内元素里时回到所在段落', () => {
    document.body.innerHTML =
      '<div id="outer"><p id="para">text with a <b id="bold">bold part</b> after it</p></div>'
    const bold = document.getElementById('bold')?.firstChild as Text
    expect(pickBlock(rangeAt(bold))).toBe(document.getElementById('para'))
  })

  it('Shadow DOM 里没有块级祖先时退回宿主元素', () => {
    document.body.innerHTML = ''
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<span id="inline">shadow text</span>'
    const text = shadow.getElementById('inline')?.firstChild as Text
    expect(pickBlock(rangeAt(text))).toBe(host)
  })

  it('Shadow DOM 选区直接返回宿主，即使宿主是行内元素', () => {
    document.body.innerHTML = ''
    const host = document.createElement('span')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<span id="inline">shadow text</span>'
    const text = shadow.getElementById('inline')?.firstChild as Text
    expect(pickBlock(rangeAt(text))).toBe(host)
  })

  it('嵌套 Shadow DOM 里外层宿主没有文字时仍返回内层宿主', () => {
    document.body.innerHTML = ''
    const outer = document.createElement('div')
    document.body.appendChild(outer)
    const wrapper = document.createElement('span')
    outer.attachShadow({ mode: 'open' }).append(wrapper)
    wrapper.attachShadow({ mode: 'open' }).innerHTML = '<span id="inline">shadow text</span>'
    const text = wrapper.shadowRoot?.getElementById('inline')?.firstChild as Text
    expect(pickBlock(rangeAt(text))).toBe(wrapper)
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
