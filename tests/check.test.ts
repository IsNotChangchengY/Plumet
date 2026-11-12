import { describe, expect, it } from 'vitest'
import {
  applyIssues,
  locateIssue,
  locateIssues,
  mergeIssues,
  parseIssues,
  splitForCheck,
} from '../src/core/check'
import type { LocatedIssue, RawIssue } from '../src/core/check'

describe('parseIssues', () => {
  it('解析合法 JSON', () => {
    const raw =
      '{"issues":[{"quote":"teh","replacement":"the","category":"spelling","severity":"error","explanation":"拼写错误"}]}'
    expect(parseIssues(raw)).toEqual([
      { quote: 'teh', replacement: 'the', category: 'spelling', severity: 'error', explanation: '拼写错误' },
    ])
  })

  it('容忍代码块包裹', () => {
    const raw = '```json\n{"issues":[]}\n```'
    expect(parseIssues(raw)).toEqual([])
  })

  it('非法 JSON 抛出 parse 错误', () => {
    expect(() => parseIssues('抱歉，我无法检查')).toThrow(/JSON/)
  })

  it('缺少 issues 数组时抛错', () => {
    expect(() => parseIssues('{"foo":1}')).toThrow()
  })

  it('未知分类与严重度回退到默认值', () => {
    const raw = '{"issues":[{"quote":"abc","category":"weird","severity":"bad"}]}'
    const [issue] = parseIssues(raw)
    expect(issue?.category).toBe('other')
    expect(issue?.severity).toBe('warning')
    expect(issue?.replacement).toBe('')
  })

  it('丢掉空白 quote', () => {
    expect(parseIssues('{"issues":[{"quote":"   "}]}')).toEqual([])
  })
})

describe('locateIssue', () => {
  it('精确匹配', () => {
    expect(locateIssue('teh', 'I have teh book')).toEqual({ start: 7, end: 10 })
  })

  it('忽略大小写', () => {
    expect(locateIssue('Teh', 'i have teh book')).toEqual({ start: 7, end: 10 })
  })

  it('忽略多余空白与换行', () => {
    const text = 'I have teh\nbook'
    const span = locateIssue('teh book', text)
    expect(span).not.toBeNull()
    expect(text.slice(span?.start, span?.end)).toBe('teh\nbook')
  })

  it('找不到时返回 null', () => {
    expect(locateIssue('xyz', 'hello')).toBeNull()
  })

  it('支持最小起始位置', () => {
    expect(locateIssue('abc', 'abc abc', 1)).toEqual({ start: 4, end: 7 })
  })
})

describe('locateIssues', () => {
  const rawIssues: RawIssue[] = [
    { quote: 'teh', replacement: 'the', category: 'spelling', severity: 'error', explanation: '' },
    { quote: '不存在的句子', replacement: 'x', category: 'other', severity: 'info', explanation: '' },
  ]

  it('把片段偏移映射回全文并统计丢弃数', () => {
    const result = locateIssues(rawIssues, 'I have teh book', 100, 'c0')
    expect(result.located).toHaveLength(1)
    expect(result.located[0]?.start).toBe(107)
    expect(result.located[0]?.end).toBe(110)
    expect(result.dropped).toBe(1)
  })
})

describe('mergeIssues', () => {
  const issue = (id: string, start: number, end: number): LocatedIssue => ({
    id,
    quote: 'x',
    replacement: 'y',
    category: 'other',
    severity: 'warning',
    explanation: '',
    start,
    end,
  })

  it('按位置排序并丢掉重叠项', () => {
    const merged = mergeIssues([issue('b', 10, 14), issue('a', 2, 5), issue('c', 12, 18)])
    expect(merged.map((item) => item.id)).toEqual(['a', 'b'])
  })
})

describe('applyIssues', () => {
  const make = (start: number, end: number, replacement: string): LocatedIssue => ({
    id: `i-${start}`,
    quote: '',
    replacement,
    category: 'other',
    severity: 'warning',
    explanation: '',
    start,
    end,
  })

  it('替换与删除同时生效', () => {
    const text = 'I have teh very book'
    expect(applyIssues(text, [make(7, 10, 'the'), make(11, 16, '')])).toBe('I have the book')
  })

  it('没有问题时原样返回', () => {
    expect(applyIssues('hello', [])).toBe('hello')
  })
})

describe('splitForCheck', () => {
  it('短文只切一段', () => {
    expect(splitForCheck('hello')).toEqual([{ text: 'hello', offset: 0 }])
  })

  it('空白文本返回空数组', () => {
    expect(splitForCheck('   \n  ')).toEqual([])
  })

  it('切分后的 offset 与原文严格对应，且不超过上限', () => {
    const text = 'First sentence here. Second sentence here. Third one.\n\nAnother paragraph for testing. '.repeat(20)
    const chunks = splitForCheck(text, 300)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.text).toBe(text.slice(chunk.offset, chunk.offset + chunk.text.length))
      expect(chunk.text.length).toBeLessThanOrEqual(300)
    }
  })
})
