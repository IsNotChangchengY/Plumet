import { describe, expect, it } from 'vitest'
import { chunkByLimits, parseGoogleFree } from '../src/core/providers/mt/google-free'
import { chunkText } from '../src/core/providers/mt/mymemory'
import { groupSegments } from '../src/core/providers/ai/openai-compatible'
import { extractJsonObject } from '../src/core/providers/http'

describe('parseGoogleFree', () => {
  it('解析多段结果', () => {
    const raw = [
      ['你好世界', 'en'],
      ['第二句话在这里。', 'en'],
    ]
    expect(parseGoogleFree(raw)).toEqual([
      ['你好世界', 'en'],
      ['第二句话在这里。', 'en'],
    ])
  })

  it('解析扁平单段结果', () => {
    expect(parseGoogleFree(['hello', 'en'])).toEqual([['hello', 'en']])
  })

  it('结构不对时抛错', () => {
    expect(() => parseGoogleFree({ oops: true })).toThrow()
    expect(() => parseGoogleFree([])).toThrow()
  })
})

describe('chunkByLimits', () => {
  it('按条数切分', () => {
    const segments = Array.from({ length: 5 }, (_, index) => `text-${index}`)
    expect(chunkByLimits(segments, 2, 10_000)).toEqual([
      ['text-0', 'text-1'],
      ['text-2', 'text-3'],
      ['text-4'],
    ])
  })

  it('按字符数切分', () => {
    const segments = ['aaaa', 'bbbb', 'cccc']
    expect(chunkByLimits(segments, 10, 8)).toEqual([['aaaa', 'bbbb'], ['cccc']])
  })
})

describe('groupSegments', () => {
  it('空输入返回空数组', () => {
    expect(groupSegments([], 100, 3)).toEqual([])
  })

  it('超长单段自己成组', () => {
    expect(groupSegments(['x'.repeat(50), 'short'], 10, 5)).toEqual([['x'.repeat(50)], ['short']])
  })
})

describe('extractJsonObject', () => {
  it('从代码块里取 JSON', () => {
    const text = '好的：\n```json\n{"translations":["a"]}\n```\n完成'
    expect(extractJsonObject(text)).toBe('{"translations":["a"]}')
  })

  it('从普通文本里取 JSON', () => {
    expect(extractJsonObject('前缀 {"translations":[]} 后缀')).toBe('{"translations":[]}')
  })
})

describe('chunkText', () => {
  it('短文本不切分', () => {
    expect(chunkText('short text')).toEqual(['short text'])
  })

  it('长文本切分后能拼回原文且每片不超过上限', () => {
    const text = 'This is a sentence. '.repeat(60)
    const parts = chunkText(text, 200)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.join('')).toBe(text)
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(200)
  })
})
