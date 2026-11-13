import { beforeEach, describe, expect, it } from 'vitest'
import { collectUnits } from '../src/content/page/collect'
import { hasPageTranslations, markUnitFailed, renderTranslation, restorePage } from '../src/content/page/render'

function setup(html: string): void {
  document.body.innerHTML = html
}

function collect(targetLang = 'zh-CN') {
  return collectUnits(document.body, { targetLang, limit: 50 })
}

beforeEach(() => {
  restorePage()
  document.body.innerHTML = ''
})

describe('collectUnits', () => {
  it('跳过代码、输入框、隐藏内容与自己的节点', () => {
    setup(
      [
        '<h1>Page title</h1>',
        '<p>Body paragraph.</p>',
        '<pre><code>const answer = 42</code></pre>',
        '<p style="display:none">Hidden paragraph</p>',
        '<p translate="no">Do not translate this</p>',
        '<div contenteditable="true">Editable draft</div>',
        '<div data-yuyi="trans">我们已经写好的译文</div>',
        '<textarea>Draft note</textarea>',
      ].join(''),
    )
    const result = collect()
    expect(result.units.map((unit) => unit.text)).toEqual(['Page title', 'Body paragraph.'])
    expect(result.skipped.hidden).toBe(1)
  })

  it('嵌套块级容器按叶子块切成多个单元', () => {
    setup('<div><p>Alpha section</p><p>Beta section</p></div>')
    expect(collect().units.map((unit) => unit.text)).toEqual(['Alpha section', 'Beta section'])
  })

  it('列表与表格逐项成单元', () => {
    setup('<ul><li>First item</li><li>Second item</li></ul><table><tbody><tr><td>Cell one</td><td>Cell two</td></tr></tbody></table>')
    expect(collect().units.map((unit) => unit.text)).toEqual([
      'First item',
      'Second item',
      'Cell one',
      'Cell two',
    ])
  })

  it('内联链接与换行合成为一个单元', () => {
    setup('<p>Hello <a href="#">world</a><br>again</p>')
    const result = collect()
    expect(result.units).toHaveLength(1)
    expect(result.units[0]?.text).toBe('Hello world again')
  })

  it('同一元素不会重复采集', () => {
    setup('<p>Only once</p>')
    const seen = new Set<Element>()
    const first = collectUnits(document.body, { targetLang: 'zh-CN', limit: 50, seen })
    const second = collectUnits(document.body, { targetLang: 'zh-CN', limit: 50, seen })
    expect(first.units).toHaveLength(1)
    expect(second.units).toHaveLength(0)
  })

  it('中文页面在目标中文时整体跳过并计数', () => {
    setup('<p>这是一段中文内容，用来测试跳过逻辑。</p>')
    const result = collect('zh-CN')
    expect(result.units).toHaveLength(0)
    expect(result.skipped.targetLang).toBe(1)
  })
})

describe('renderTranslation', () => {
  it('双语模式把译文追加在原文后面', () => {
    setup('<p>Hello world</p>')
    const unit = collect().units[0]
    if (!unit) throw new Error('缺少单元')
    expect(renderTranslation(unit, '你好世界', 'bilingual', 'zh-CN')).toBe('done')
    const paragraph = document.querySelector('p')
    const translation = paragraph?.querySelector('[data-yuyi="trans"]')
    expect(translation?.textContent).toBe('你好世界')
    expect(translation?.getAttribute('lang')).toBe('zh-CN')
    expect(paragraph?.getAttribute('data-yuyi-state')).toBe('done')
    expect(paragraph?.firstChild?.textContent).toBe('Hello world')
  })

  it('仅译文模式把原文包进 orig 容器', () => {
    setup('<p>Hello world</p>')
    const unit = collect().units[0]
    if (!unit) throw new Error('缺少单元')
    renderTranslation(unit, '你好世界', 'replace', 'zh-CN')
    const paragraph = document.querySelector('p')
    const orig = paragraph?.querySelector('[data-yuyi="orig"]')
    expect(orig?.textContent).toBe('Hello world')
    expect(paragraph?.querySelector('[data-yuyi="trans"]')?.textContent).toBe('你好世界')
  })

  it('译文与原文相同时不插入重复段落', () => {
    setup('<p>Hello world</p>')
    const unit = collect().units[0]
    if (!unit) throw new Error('缺少单元')
    expect(renderTranslation(unit, 'Hello world', 'bilingual', 'zh-CN')).toBe('same')
    expect(document.querySelector('[data-yuyi="trans"]')).toBeNull()
    expect(document.querySelector('p')?.getAttribute('data-yuyi-state')).toBe('same')
  })

  it('重复渲染同一单元只保留一个译文节点', () => {
    setup('<p>Hello world</p>')
    const unit = collect().units[0]
    if (!unit) throw new Error('缺少单元')
    renderTranslation(unit, '你好', 'bilingual', 'zh-CN')
    renderTranslation(unit, '你好呀', 'bilingual', 'zh-CN')
    expect(document.querySelectorAll('[data-yuyi="trans"]')).toHaveLength(1)
    expect(document.querySelector('[data-yuyi="trans"]')?.textContent).toBe('你好呀')
  })

  it('失败单元只打标记', () => {
    setup('<p>Hello world</p>')
    const unit = collect().units[0]
    if (!unit) throw new Error('缺少单元')
    markUnitFailed(unit)
    expect(document.querySelector('p')?.getAttribute('data-yuyi-state')).toBe('failed')
    expect(document.querySelector('[data-yuyi="trans"]')).toBeNull()
  })

  it('还原后 DOM 与翻译前完全一致', () => {
    setup('<div><p>Hello <b>world</b></p><ul><li>One</li><li>Two</li></ul></div>')
    const before = document.body.innerHTML
    const units = collect().units
    for (const unit of units) renderTranslation(unit, `译文：${unit.text}`, 'replace', 'zh-CN')
    expect(hasPageTranslations()).toBe(true)
    restorePage()
    expect(document.body.innerHTML).toBe(before)
    expect(hasPageTranslations()).toBe(false)
    expect(document.querySelector('style[data-yuyi="style"]')).toBeNull()
  })
})
