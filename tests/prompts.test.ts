import { describe, expect, it } from 'vitest'
import { buildBatchMessages, buildSingleMessages } from '../src/core/providers/ai/prompts'

const langs = { sourceLang: 'auto', targetLang: 'zh-CN' }

describe('buildSingleMessages', () => {
  it('上下文块排在原文之前', () => {
    const messages = buildSingleMessages({ ...langs, text: 'Hello world', context: '页面标题：示例\n段落上下文：前面 后面' })
    expect(messages).toHaveLength(2)
    const user = messages[1].content
    expect(user).toContain('【页面上下文，仅用于理解】')
    expect(user).toContain('前面 后面')
    expect(user.indexOf('【页面上下文，仅用于理解】')).toBeLessThan(user.indexOf('【原文】'))
    expect(user).toContain('【原文】\nHello world')
  })

  it('没有上下文时不出现上下文块', () => {
    const user = buildSingleMessages({ ...langs, text: 'Hello world' })[1].content
    expect(user).not.toContain('【页面上下文')
  })

  it('空白上下文视为没有', () => {
    const user = buildSingleMessages({ ...langs, text: 'Hello world', context: '   ' })[1].content
    expect(user).not.toContain('【页面上下文')
  })

  it('系统提示要求用上下文消除歧义而不是只参考语气', () => {
    const system = buildSingleMessages({ ...langs, text: 'Hello world' })[0].content
    expect(system).toContain('消除歧义')
    expect(system).toContain('只翻译【原文】')
    expect(system).toContain('不要把上下文里的标题、域名与句子写进译文')
  })
})

describe('buildBatchMessages', () => {
  it('批量上下文同样只用于理解', () => {
    const messages = buildBatchMessages({ ...langs, segments: ['one', 'two'], context: '页面标题：示例' })
    const user = messages[1].content
    expect(user).toContain('【页面上下文，仅用于理解】')
    expect(user.indexOf('【页面上下文，仅用于理解】')).toBeLessThan(user.indexOf('【输入】'))
    expect(messages[0].content).toContain('不要写进任何一段译文')
  })

  it('批次里保留原有 JSON 输入格式', () => {
    const user = buildBatchMessages({ ...langs, segments: ['one', 'two'] })[1].content
    expect(user).toContain('{"texts":["one","two"]}')
  })
})
