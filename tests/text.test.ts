import { describe, expect, it } from 'vitest'
import { splitSegments } from '../src/core/text'

describe('splitSegments', () => {
  it('空文本返回空数组', () => {
    expect(splitSegments('   ')).toEqual([])
  })

  it('短文只返回一段', () => {
    expect(splitSegments('Hello world')).toEqual(['Hello world'])
  })

  it('长文按段落切分且每段不超过上限', () => {
    const paragraph = 'a'.repeat(2000)
    const text = `${paragraph}\n\n${paragraph}\n\n${paragraph}`
    const segments = splitSegments(text)
    expect(segments.length).toBeGreaterThan(1)
    for (const segment of segments) {
      expect(segment.length).toBeLessThanOrEqual(2500)
    }
    expect(segments.join('\n\n').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''))
  })

  it('超长单段会被硬切', () => {
    const text = 'b'.repeat(6000)
    const segments = splitSegments(text)
    expect(segments.length).toBe(3)
    expect(segments.every((segment) => segment.length <= 2500)).toBe(true)
    expect(segments.join('')).toBe(text)
  })
})
