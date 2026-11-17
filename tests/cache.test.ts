import { describe, expect, it } from 'vitest'
import { CACHE_LIMIT, clearCache, getCached, hashKey, makeCacheKey, setCached } from '../src/core/cache'

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
