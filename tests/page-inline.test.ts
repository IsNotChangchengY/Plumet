import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildInlineTemplate,
  parseInlineTranslation,
  renderInlineTranslation,
  stripInlineMarkers,
} from '../src/content/page/inline'
import { readUnitText } from '../src/content/page/text'

function element(html: string): HTMLElement {
  document.body.innerHTML = html
  const target = document.querySelector('p')
  if (!target) throw new Error('缺少段落')
  return target as HTMLElement
}

function build(html: string) {
  const target = element(html)
  return buildInlineTemplate(target, readUnitText(target))
}

function render(html: string, translated: string): HTMLElement | null {
  const template = build(html)
  if (!template) return null
  const fragment = renderInlineTranslation(template, translated)
  if (!fragment) return null
  const host = document.createElement('div')
  host.setAttribute('data-host', '1')
  host.appendChild(fragment)
  document.body.appendChild(host)
  return host
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('buildInlineTemplate', () => {
  it('纯文本单元不生成标记模板', () => {
    expect(build('<p>Hello world</p>')).toBeNull()
  })

  it('链接保留 href、target、rel 与 title', () => {
    const template = build('<p>Read <a href="/docs" target="_blank" rel="noopener" title="手册">docs</a> now.</p>')
    expect(template?.marked).toBe('Read <y0>docs</y0> now.')
    expect(template?.marks).toEqual([
      [{ tag: 'a', attrs: { href: '/docs', target: '_blank', rel: 'noopener', title: '手册' } }],
    ])
  })

  it('不安全或缺失的链接不作为标记', () => {
    expect(build('<p>Click <a href="javascript:alert(1)">here</a>.</p>')).toBeNull()
    expect(build('<p>Click <a>here</a>.</p>')).toBeNull()
  })

  it('语义格式标签直接映射成同名标记', () => {
    const template = build('<p>a <b>b</b> <strong>c</strong> <i>d</i> <em>e</em> <u>f</u> <s>g</s> <code>h</code> <mark>i</mark></p>')
    expect(template?.marks.map((marks) => marks.map((mark) => mark.tag))).toEqual([
      ['b'],
      ['strong'],
      ['i'],
      ['em'],
      ['u'],
      ['s'],
      ['code'],
      ['mark'],
    ])
    expect(template?.marked).toBe('a <y0>b</y0> <y1>c</y1> <y2>d</y2> <y3>e</y3> <y4>f</y4> <y5>g</y5> <y6>h</y6> <y7>i</y7>')
  })

  it('嵌套格式合并到同一个片段', () => {
    const template = build('<p><strong>bold <em>both</em></strong></p>')
    expect(template?.marked).toBe('<y0>bold</y0> <y1>both</y1>')
    expect(template?.marks[1]?.map((mark) => mark.tag)).toEqual(['strong', 'em'])
  })

  it('内联样式识别为格式', () => {
    const template = build('<p>A <span style="font-weight: 700">w</span> <span style="font-style: italic">x</span> <span style="text-decoration-line: underline">y</span> <span style="text-decoration-line: line-through">z</span></p>')
    expect(template?.marks.map((marks) => marks[0]?.tag)).toEqual(['strong', 'em', 'u', 's'])
  })

  it('背景色可见且与父元素不同才算高亮', () => {
    const template = build('<p>a <span style="background-color: rgb(255, 255, 0)">hi</span> <span style="background-color: transparent">no</span> <span>plain</span></p>')
    expect(template?.marked).toBe('a <y0>hi</y0> no plain')
    expect(template?.marks).toEqual([[{ tag: 'span', style: { backgroundColor: 'rgb(255, 255, 0)' } }]])
  })

  it('原文里已经有标记样式时不生成模板', () => {
    expect(build('<p>Use &lt;y0&gt; as a marker.</p>')).toBeNull()
  })

  it('原文里已经有占位符语法时不生成模板，避免与引擎占位符混淆', () => {
    expect(build('<p>Keep 【0】 and 【/1】 as placeholders.</p>')).toBeNull()
  })

  it('与预期文本不一致或标记过多时不生成模板', () => {
    const target = element('<p>Hello <b>world</b></p>')
    expect(buildInlineTemplate(target, 'Hello there')).toBeNull()
    const many = Array.from({ length: 49 }, (_, index) => `<b>w${index}</b>`).join(' ')
    expect(build(`<p>${many}</p>`)).toBeNull()
  })
})

describe('parseInlineTranslation', () => {
  const html = '<p>Read the <a href="/docs">documentation</a> before <b>installing</b>.</p>'

  it('允许标记按译文语序重排', () => {
    const template = build(html)
    if (!template) throw new Error('缺少模板')
    const runs = parseInlineTranslation(template, '请在<y1>安装</y1>之前阅读<y0>文档</y0>。')
    expect(runs?.map((run) => run.text)).toEqual(['请在', '安装', '之前阅读', '文档', '。'])
    expect(runs?.[1]?.marks[0]?.tag).toBe('b')
    expect(runs?.[3]?.marks[0]?.tag).toBe('a')
  })

  it('标记缺失、重复、嵌套或越界时返回空', () => {
    const template = build(html)
    if (!template) throw new Error('缺少模板')
    expect(parseInlineTranslation(template, '请在安装之前阅读文档。')).toBeNull()
    expect(parseInlineTranslation(template, '<y0>文档</y0>')).toBeNull()
    expect(parseInlineTranslation(template, '<y0><y1>文档</y1></y0>')).toBeNull()
    expect(parseInlineTranslation(template, '<y2>文档</y2><y0>x</y0>')).toBeNull()
    expect(parseInlineTranslation(template, '<y0>文档</y0><y0>文档</y0>')).toBeNull()
  })
})

describe('renderInlineTranslation', () => {
  const html = '<p>Read the <a href="/docs" title="手册">documentation</a> before <b>installing</b>.</p>'

  it('按本地节点重建链接与加粗，href 与原文一致', () => {
    const host = render(html, '请在<y1>安装</y1>之前阅读<y0>文档</y0>。')
    if (!host) throw new Error('缺少译文')
    const link = host.querySelector('a')
    const bold = host.querySelector('b')
    expect(link?.getAttribute('href')).toBe('/docs')
    expect(link?.getAttribute('title')).toBe('手册')
    expect(link?.textContent).toBe('文档')
    expect(bold?.textContent).toBe('安装')
    expect(host.textContent).toBe('请在安装之前阅读文档。')
  })

  it('标记里的 HTML 只会成为文本节点', () => {
    const host = render('<p>a <b>x</b></p>', '<y0><img src=x onerror=alert(1)>y</y0>')
    if (!host) throw new Error('缺少译文')
    expect(host.querySelector('img')).toBeNull()
    expect(host.textContent).toBe('<img src=x onerror=alert(1)>y')
  })

  it('解析失败时返回空让调用方降级', () => {
    const template = build(html)
    if (!template) throw new Error('缺少模板')
    expect(renderInlineTranslation(template, '请在安装之前阅读文档。')).toBeNull()
    expect(renderInlineTranslation(template, '')).toBeNull()
  })
})

describe('stripInlineMarkers', () => {
  it('删除标记并还原转义', () => {
    expect(stripInlineMarkers('在<y0>文档</y0>里&lt;y1&gt;x&lt;/y1&gt;')).toBe('在文档里x')
  })

  it('没有标记时原样返回', () => {
    expect(stripInlineMarkers('普通译文')).toBe('普通译文')
  })
})
