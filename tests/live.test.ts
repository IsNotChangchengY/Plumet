// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { translateText } from '../src/core/engine'
import { DEFAULT_SETTINGS } from '../src/storage/settings'

const live = process.env.YUYI_LIVE === '1'

describe.skipIf(!live)('真实网络：谷歌免费通道', () => {
  it('通过引擎层翻译一句英文', async () => {
    const result = await translateText(
      { segments: ['Hello world, this is a translation test.'], sourceLang: 'auto', targetLang: 'zh-CN' },
      DEFAULT_SETTINGS,
      'mt:google-free',
    )
    expect(result.segments[0]).toMatch(/[\u4e00-\u9fff]/)
  }, 30_000)

  it('同一句第二次命中缓存', async () => {
    const result = await translateText(
      { segments: ['Hello world, this is a translation test.'], sourceLang: 'auto', targetLang: 'zh-CN' },
      DEFAULT_SETTINGS,
      'mt:google-free',
    )
    expect(result.cached).toBe(true)
  }, 30_000)
})
