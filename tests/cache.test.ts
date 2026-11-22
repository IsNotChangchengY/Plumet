import { describe, expect, it, vi } from 'vitest'
import {
  CACHE_LIMIT,
  SEGMENT_CACHE_LIMIT,
  clearCache,
  getCached,
  getCachedSegment,
  hashKey,
  makeCacheKey,
  makeSegmentCacheKey,
  setCached,
  setCachedSegment,
} from '../src/core/cache'

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

  it('模型与提示词版本不同则缓存键不同', () => {
    const base = {
      engineId: 'ai:deepseek',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      segments: ['hello'],
    }
    expect(makeCacheKey({ ...base, revision: '2:model-a' })).not.toBe(
      makeCacheKey({ ...base, revision: '2:model-b' }),
    )
    expect(makeCacheKey(base)).toBe(makeCacheKey({ ...base, revision: '' }))
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

describe('缓存键的文本规范化', () => {
  const base = { engineId: 'mt:google-free', sourceLang: 'en', targetLang: 'zh-CN' }

  it('行内空白差异不产生新键', () => {
    expect(makeCacheKey({ ...base, segments: ['hello  world '] })).toBe(
      makeCacheKey({ ...base, segments: ['hello world'] }),
    )
  })

  it('换行符、不可见字符与特殊空格归一', () => {
    expect(makeCacheKey({ ...base, segments: ['a\r\nb\u200bc\u00a0d'] })).toBe(
      makeCacheKey({ ...base, segments: ['a\nbc d'] }),
    )
  })

  it('段落结构仍然区分', () => {
    expect(makeCacheKey({ ...base, segments: ['a\n\nb'] })).not.toBe(
      makeCacheKey({ ...base, segments: ['a\nb'] }),
    )
  })

  it('上下文的空白与不可见字符同样归一', () => {
    const context = { ...base, segments: ['hello'] }
    expect(makeCacheKey({ ...context, context: '页面标题：甲   网站：a' })).toBe(
      makeCacheKey({ ...context, context: '页面标题：甲 网站：a' }),
    )
    expect(makeCacheKey({ ...context, context: '页面标题：甲\u200b\u00a0网站：a' })).toBe(
      makeCacheKey({ ...context, context: '页面标题：甲 网站：a' }),
    )
    expect(makeCacheKey({ ...context, context: '页面标题：乙 网站：a' })).not.toBe(
      makeCacheKey({ ...context, context: '页面标题：甲 网站：a' }),
    )
  })
})

describe('makeSegmentCacheKey', () => {
  const base = { engineId: 'mt:google-free', sourceLang: 'en', targetLang: 'zh-CN' }

  it('同一段落在不同批次、不同语言对下的键', () => {
    expect(makeSegmentCacheKey({ ...base, segment: 'hello  world' })).toBe(
      makeSegmentCacheKey({ ...base, segment: 'hello world' }),
    )
    expect(makeSegmentCacheKey({ ...base, segment: 'hello' })).not.toBe(
      makeSegmentCacheKey({ ...base, targetLang: 'ja', segment: 'hello' }),
    )
    expect(makeSegmentCacheKey({ ...base, segment: 'hello' })).not.toBe(
      makeSegmentCacheKey({ ...base, engineId: 'mt:mymemory', segment: 'hello' }),
    )
  })
})

describe('缓存淘汰', () => {
  it('命中会刷新顺序，超出上限时淘汰最久未使用的条目', async () => {
    await clearCache()
    await setCached('first', '甲', '测试')
    for (let index = 0; index < CACHE_LIMIT - 2; index += 1) {
      await setCached(`fill-${index}`, '乙', '测试')
    }
    await setCached('last', '丙', '测试')
    expect(await getCached('first')).not.toBeNull()
    await setCached('overflow', '丁', '测试')
    expect(await getCached('fill-0')).toBeNull()
    expect(await getCached('first')).not.toBeNull()
    expect(await getCached('last')).not.toBeNull()
  })
})

describe('滑动过期', () => {
  it('命中会刷新过期时间，长期不用才失效', async () => {
    const day = 24 * 60 * 60 * 1000
    vi.useFakeTimers()
    try {
      await clearCache()
      await setCached('slide', '甲', '测试')
      await vi.advanceTimersByTimeAsync(6 * day)
      expect(await getCached('slide')).not.toBeNull()
      await vi.advanceTimersByTimeAsync(6 * day)
      expect(await getCached('slide')).not.toBeNull()
      await vi.advanceTimersByTimeAsync(8 * day)
      expect(await getCached('slide')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('段缓存', () => {
  it('按段读写，超出上限时淘汰最久未使用的段落', async () => {
    await clearCache()
    await setCachedSegment('seg-0', '甲', '测试')
    for (let index = 1; index < SEGMENT_CACHE_LIMIT; index += 1) {
      await setCachedSegment(`seg-${index}`, '乙', '测试')
    }
    expect(await getCachedSegment('seg-0')).not.toBeNull()
    await setCachedSegment('seg-overflow', '丙', '测试')
    expect(await getCachedSegment('seg-1')).toBeNull()
    expect(await getCachedSegment('seg-0')).not.toBeNull()
  })

  it('clearCache 同时清空批次缓存与段缓存', async () => {
    await clearCache()
    await setCached('batch', '甲', '测试')
    await setCachedSegment('segment', '乙', '测试')
    await clearCache()
    expect(await getCached('batch')).toBeNull()
    expect(await getCachedSegment('segment')).toBeNull()
  })
})
