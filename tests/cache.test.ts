import { describe, expect, it } from 'vitest'
import { hashKey, makeCacheKey } from '../src/core/cache'

describe('hashKey', () => {
  it('同样的输入得到同样的键', () => {
    expect(hashKey(['a', 'b'])).toBe(hashKey(['a', 'b']))
  })

  it('不同输入得到不同的键', () => {
    expect(hashKey(['a', 'b'])).not.toBe(hashKey(['a', 'c']))
  })

  it('支持中文与空字符串', () => {
    expect(hashKey(['你好', ''])).toBe(hashKey(['你好', '']))
  })
})

describe('makeCacheKey', () => {
  it('引擎不同则缓存键不同', () => {
    const base = { sourceLang: 'en', targetLang: 'zh-CN', segments: ['hello'] }
    expect(makeCacheKey({ ...base, engineId: 'mt:google-free' })).not.toBe(
      makeCacheKey({ ...base, engineId: 'mt:mymemory' }),
    )
  })

  it('上下文不同则缓存键不同', () => {
    const base = {
      engineId: 'mt:google-free',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      segments: ['hello'],
    }
    expect(makeCacheKey(base)).not.toBe(makeCacheKey({ ...base, context: 'page title' }))
  })
})
