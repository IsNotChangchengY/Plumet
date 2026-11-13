import { describe, expect, it } from 'vitest'
import {
  MAX_BATCH_CHARS,
  classifyText,
  groupUnits,
  isTargetLanguageText,
  normalizeUnitText,
  pickScanRoots,
  readUnitText,
} from '../src/content/page/text'

function element(html: string, tag = 'p'): HTMLElement {
  const host = document.createElement(tag)
  host.innerHTML = html
  return host
}

describe('normalizeUnitText', () => {
  it('压掉多余空白', () => {
    expect(normalizeUnitText('  hello \n\n world  ')).toBe('hello world')
  })

  it('全空白返回空串', () => {
    expect(normalizeUnitText(' \n\t ')).toBe('')
  })
})

describe('readUnitText', () => {
  it('把 br 读成空格，不粘连单词', () => {
    expect(readUnitText(element('Hello<br>world'))).toBe('Hello world')
  })

  it('拼接内联元素里的文字', () => {
    expect(readUnitText(element('Hello <b>bold</b> text'))).toBe('Hello bold text')
  })

  it('跳过 script 与 style', () => {
    expect(readUnitText(element('Hi<script>var a = 1</script><style>.a{}</style> there'))).toBe('Hi there')
  })
})

describe('isTargetLanguageText', () => {
  it('中文内容在目标中文时判为已是目标语言', () => {
    expect(isTargetLanguageText('这是一段中文内容，用来测试判断。', 'zh-CN')).toBe(true)
    expect(isTargetLanguageText('这是一段中文内容，用来测试判断。', 'zh-TW')).toBe(true)
  })

  it('英文内容在目标中文时不跳过', () => {
    expect(isTargetLanguageText('This is an English sentence.', 'zh-CN')).toBe(false)
  })

  it('日文假名能被识别', () => {
    expect(isTargetLanguageText('これはテストです。', 'ja')).toBe(true)
    expect(isTargetLanguageText('This is an English sentence.', 'ja')).toBe(false)
  })

  it('目标语言是拉丁语系时不跳过（已知限制）', () => {
    expect(isTargetLanguageText('This is an English sentence.', 'en')).toBe(false)
    expect(isTargetLanguageText('Ceci est une phrase française.', 'fr')).toBe(false)
  })
})

describe('classifyText', () => {
  it('空文本', () => {
    expect(classifyText('', 'zh-CN')).toBe('empty')
  })

  it('超长文本跳过', () => {
    expect(classifyText('a'.repeat(MAX_BATCH_CHARS * 3), 'zh-CN')).toBe('tooLong')
  })

  it('没有字母的文本跳过', () => {
    expect(classifyText('1234567890 —— 42', 'zh-CN')).toBe('noLetter')
  })

  it('纯链接跳过', () => {
    expect(classifyText('https://example.com/a/b', 'zh-CN')).toBe('url')
  })

  it('已是目标语言时跳过', () => {
    expect(classifyText('这是一段中文内容。', 'zh-CN')).toBe('targetLang')
  })

  it('正常英文句子保留', () => {
    expect(classifyText('The quick brown fox jumps over the lazy dog.', 'zh-CN')).toBeNull()
  })
})

describe('groupUnits', () => {
  const unit = (text: string) => ({ id: text, text })

  it('按字符预算分组并保序', () => {
    const groups = groupUnits([unit('aaaa'), unit('bbbb'), unit('cccc')], 8, 10)
    expect(groups.map((group) => group.map((item) => item.id))).toEqual([['aaaa', 'bbbb'], ['cccc']])
  })

  it('按条数上限分组', () => {
    const groups = groupUnits([unit('a'), unit('b'), unit('c')], 100, 2)
    expect(groups.map((group) => group.length)).toEqual([2, 1])
  })

  it('单个超长单元独占一批', () => {
    const groups = groupUnits([unit('a'), unit('x'.repeat(50)), unit('b')], 20, 8)
    expect(groups.map((group) => group.map((item) => item.id))).toEqual([['a'], ['x'.repeat(50)], ['b']])
  })

  it('空输入返回空数组', () => {
    expect(groupUnits([])).toEqual([])
  })
})

describe('pickScanRoots', () => {
  const record = (nodes: Node[]): MutationRecord => ({ addedNodes: nodes }) as unknown as MutationRecord

  it('过滤掉自己的节点', () => {
    const own = document.createElement('span')
    own.setAttribute('data-yuyi', 'trans')
    const page = document.createElement('div')
    const roots = pickScanRoots([record([own, page])], (node) => node.hasAttribute('data-yuyi'))
    expect(roots).toEqual([page])
  })

  it('同一次变化里去重', () => {
    const first = document.createElement('div')
    const roots = pickScanRoots([record([first]), record([first])], () => false)
    expect(roots).toEqual([first])
  })

  it('超过上限时截断', () => {
    const nodes = Array.from({ length: 5 }, () => document.createElement('div'))
    expect(pickScanRoots([record(nodes)], () => false, 3)).toHaveLength(3)
  })

  it('文本节点不算扫描根', () => {
    expect(pickScanRoots([record([document.createTextNode('x')])], () => false)).toEqual([])
  })
})
