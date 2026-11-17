import { describe, expect, it } from 'vitest'
import { buildContextWindow, composeContext } from '../src/content/context'
import { buildSingleMessages } from '../src/core/providers/ai/prompts'

const block = 'The bank raised its rates today. She sat on the bank of the river. The bank closes at five.'

function contextFor(selection: string, blockText = block, chars = 30) {
  return composeContext({
    title: 'Example',
    host: 'example.com',
    window: buildContextWindow(blockText, selection, chars),
  })
}

describe('划词上下文链路', () => {
  it('上下文按「标题 → 网站 → 段落窗口」进入 AI 请求，且位于原文之前', () => {
    const context = contextFor('She sat on the bank of the river.')
    expect(context).toContain('页面标题：Example')
    expect(context).toContain('网站：example.com')
    expect(context).toContain('段落上下文：')
    const user = buildSingleMessages({
      sourceLang: 'auto',
      targetLang: 'zh-CN',
      text: 'She sat on the bank of the river.',
      context,
    })[1].content
    expect(user.indexOf('【页面上下文，仅用于理解】')).toBeLessThan(user.indexOf('【原文】'))
    expect(user).toContain('bank of the river')
  })

  it('选区在块里定位不到时不带段落窗口，也不混进块首无关内容', () => {
    const context = contextFor('text from another paragraph')
    expect(context).toBe('页面标题：Example\n网站：example.com')
    const user = buildSingleMessages({
      sourceLang: 'auto',
      targetLang: 'zh-CN',
      text: 'text from another paragraph',
      context,
    })[1].content
    expect(user).not.toContain('The bank raised')
  })

  it('上下文长度为 0 时只带标题与网站', () => {
    expect(contextFor('The bank', block, 0)).toBe('页面标题：Example\n网站：example.com')
  })

  it('输入框来源用「输入框：」标签，不叠加段落标签', () => {
    const context = composeContext({ title: 'Example', window: '输入框：搜索框', windowLabel: '' })
    expect(context).toBe('页面标题：Example\n输入框：搜索框')
  })
})
