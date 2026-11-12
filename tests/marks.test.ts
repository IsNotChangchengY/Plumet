import { describe, expect, it } from 'vitest'
import {
  changeEntries,
  diffMarks,
  issueMarks,
  mergeMarks,
  resultText,
  tokenize,
} from '../src/core/marks'
import type { Mark } from '../src/core/marks'
import type { LocatedIssue } from '../src/core/check'

describe('tokenize', () => {
  it('空文本返回空数组', () => {
    expect(tokenize('')).toEqual([])
  })

  it('中文切词后能拼回原文', () => {
    const tokens = tokenize('我喜欢这个设计')
    expect(tokens.join('')).toBe('我喜欢这个设计')
    expect(tokens.length).toBeGreaterThan(1)
  })

  it('英文保留单词', () => {
    const tokens = tokenize('hello world')
    expect(tokens).toContain('hello')
    expect(tokens).toContain('world')
  })
})

describe('diffMarks', () => {
  it('相同文本只产生一个 equal', () => {
    const marks = diffMarks('same text', 'same text')
    expect(marks).toHaveLength(1)
    expect(marks[0]?.kind).toBe('equal')
  })

  it('新增内容标为 ins', () => {
    const marks = diffMarks('I like it', 'I really like it')
    expect(marks.some((mark) => mark.kind === 'ins' && mark.text.includes('really'))).toBe(true)
    expect(resultText(marks)).toBe('I really like it')
  })

  it('删除内容标为 del', () => {
    const marks = diffMarks('I really like it', 'I like it')
    expect(marks.some((mark) => mark.kind === 'del' && mark.text.includes('really'))).toBe(true)
    expect(resultText(marks)).toBe('I like it')
  })

  it('中文改写也能还原润色稿', () => {
    const marks = diffMarks('这个设计很好', '这个设计真的很不错')
    expect(marks.some((mark) => mark.kind === 'ins')).toBe(true)
    expect(resultText(marks)).toBe('这个设计真的很不错')
  })
})

describe('mergeMarks', () => {
  it('相邻同类合并', () => {
    const marks: Mark[] = [
      { kind: 'equal', text: 'a' },
      { kind: 'equal', text: 'b' },
      { kind: 'ins', text: 'c' },
    ]
    expect(mergeMarks(marks)).toEqual([
      { kind: 'equal', text: 'ab' },
      { kind: 'ins', text: 'c' },
    ])
  })

  it('不同问题不合并', () => {
    const marks: Mark[] = [
      { kind: 'warn', text: 'a', issueId: '1' },
      { kind: 'warn', text: 'b', issueId: '2' },
    ]
    expect(mergeMarks(marks)).toHaveLength(2)
  })
})

describe('issueMarks', () => {
  const text = 'I have teh book.'
  const issue: LocatedIssue = {
    id: 'i1',
    quote: 'teh',
    replacement: 'the',
    category: 'spelling',
    severity: 'error',
    explanation: '拼写错误',
    start: 7,
    end: 10,
  }

  it('默认按 diff 呈现：原片段划掉 + 绿色改法', () => {
    const marks = issueMarks(text, [issue], new Set())
    expect(marks.map((mark) => mark.kind)).toEqual(['equal', 'del', 'ins', 'equal'])
    expect(marks[1]?.severity).toBe('error')
  })

  it('忽略后恢复成原文，并标记为已忽略', () => {
    const marks = issueMarks(text, [issue], new Set(['i1']))
    expect(marks.map((mark) => mark.kind)).toEqual(['equal', 'warn', 'equal'])
    expect(marks[1]?.state).toBe('ignored')
  })
})

describe('changeEntries', () => {
  it('把 diff 聚成修改清单', () => {
    const entries = changeEntries(diffMarks('I like it', 'I really like it'))
    expect(entries.some((entry) => entry.after.includes('really'))).toBe(true)
  })

  it('相同文本没有条目', () => {
    expect(changeEntries(diffMarks('same', 'same'))).toEqual([])
  })
})
