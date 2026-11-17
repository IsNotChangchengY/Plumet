import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_SELECTION_CHARS, WINDOW_LABEL, buildContextWindowForRange } from '../src/content/context'
import {
  CONTEXT_LABELS,
  buildStructuredContext,
  headingChain,
  listContext,
  neighborContext,
  pageIntro,
  pageOutline,
  tableContext,
} from '../src/content/structure'

const BLOCK_ID = 'block'

function mount(html: string): HTMLElement {
  document.body.innerHTML = html
  const block = document.getElementById(BLOCK_ID)
  if (!block) throw new Error('missing block')
  return block
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('structured selection context', () => {
  it('标题链保留层级一致性，进入新章节后丢掉更深层旧标题', () => {
    const block = mount(`
      <h1>Guide</h1>
      <h2>Setup</h2>
      <h3>Install</h3>
      <p>intro</p>
      <h2>Usage</h2>
      <h3>Run</h3>
      <p id="block">selected</p>
    `)
    expect(headingChain(block)).toBe('Guide › Usage › Run')
  })

  it('标题链忽略块之后的标题与羽译自己的节点', () => {
    const block = mount(`
      <h1>Guide</h1>
      <h2 data-yuyi="trans">Injected</h2>
      <p id="block">selected</p>
      <h2>Later</h2>
    `)
    expect(headingChain(block)).toBe('Guide')
  })

  it('上文取前一段末尾两句，下文取后一段开头两句', () => {
    const block = mount(`
      <p>Alpha one. Alpha two. Alpha three.</p>
      <p id="block">Selected paragraph.</p>
      <p>Beta one. Beta two. Beta three.</p>
    `)
    expect(neighborContext(block, 'previous')).toBe('Alpha two. Alpha three.')
    expect(neighborContext(block, 'next')).toBe('Beta one. Beta two.')
  })

  it('相邻段落跨过包裹容器也能找到', () => {
    const block = mount(`
      <section><p>Previous wrapper sentence one. Previous wrapper sentence two.</p></section>
      <section><div><p id="block">Selected paragraph.</p></div><p>Next paragraph.</p></section>
    `)
    expect(neighborContext(block, 'previous')).toBe('Previous wrapper sentence one. Previous wrapper sentence two.')
    expect(neighborContext(block, 'next')).toBe('Next paragraph.')
  })

  it('列表给出前几项，单项列表不当作上下文', () => {
    const block = mount(`
      <ul>
        <li>First item about setup.</li>
        <li>Second item about <b>usage</b>.</li>
        <li id="block">Third selected item.</li>
        <li>Fourth item.</li>
        <li>Fifth item.</li>
      </ul>
    `)
    expect(listContext(block)).toBe(
      '· First item about setup.\n· Second item about usage.\n· Third selected item.\n· Fourth item.',
    )
    const single = mount('<ul><li id="block">Only item.</li></ul>')
    expect(listContext(single)).toBe('')
  })

  it('表格给出表头与所在行，表头行自身不重复', () => {
    const cell = mount(`
      <table>
        <thead><tr><th>Name</th><th>Value</th></tr></thead>
        <tbody><tr><td>alpha</td><td id="block">42</td></tr></tbody>
      </table>
    `)
    expect(tableContext(cell)).toBe('表头：Name | Value\n本行：alpha | 42\n列：Value')
    const header = mount(`
      <table>
        <thead><tr><th id="block">Name</th><th>Value</th></tr></thead>
        <tbody><tr><td>alpha</td><td>42</td></tr></tbody>
      </table>
    `)
    expect(tableContext(header)).toBe('')
  })

  it('相邻段跳过导航、代码块这类噪音', () => {
    const block = mount(`
      <p>Alpha one. Alpha two.</p>
      <pre><code>const x = 1</code></pre>
      <p id="block">Selected paragraph.</p>
      <nav><p>Nav one. Nav two.</p></nav>
      <p>Beta one. Beta two.</p>
    `)
    expect(neighborContext(block, 'previous')).toBe('Alpha one. Alpha two.')
    expect(neighborContext(block, 'next')).toBe('Beta one. Beta two.')
  })

  it('双语页面里与选区语言不一致的邻段不注入', () => {
    const block = mount(`
      <p>这是一段看起来很长的中文说明文字，用来模拟双语对照页面上的译文段落内容。</p>
      <p id="block">Choose the right plan for your team today.</p>
      <p>这是另一段很长的中文说明文字，同样用来模拟页面上的译文段落内容。</p>
    `)
    const selection = 'Choose the right plan for your team today.'
    expect(neighborContext(block, 'previous', selection)).toBe('')
    expect(neighborContext(block, 'next', selection)).toBe('')
    expect(neighborContext(block, 'previous')).toContain('这是一段')
  })

  it('跨块选区把选区前后的段落文字都带进窗口', () => {
    document.body.innerHTML =
      '<p id="a">Alpha before the selection.</p><p id="b">Beta after the selection.</p>'
    const a = document.getElementById('a') as HTMLElement
    const b = document.getElementById('b') as HTMLElement
    const range = document.createRange()
    range.setStart(a.firstChild as Text, 0)
    range.setEnd(b.firstChild as Text, 4)
    const context = buildContextWindowForRange({
      range,
      block: a,
      selection: range.toString(),
      maxChars: 200,
    })
    expect(context).toContain('Alpha before the selection.')
    expect(context).toContain('Beta after the selection.')
  })

  it('超长选区只带标题与网站，不再装配结构', () => {
    const block = mount('<h1>Handbook</h1><p id="block">body</p>')
    const context = buildStructuredContext({
      block,
      selection: 'x'.repeat(MAX_SELECTION_CHARS + 1),
      title: 'Example',
      host: 'example.com',
      contextChars: 600,
      scope: 'page',
    })
    expect(context).toBe('页面标题：Example\n网站：example.com')
  })

  it('页面大纲按标题层级缩进，页面首段跳过过短的段落', () => {
    document.body.innerHTML = `
      <main>
        <h1>Book</h1>
        <h2>Part</h2>
        <p>short</p>
        <p>${'长'.repeat(50)}</p>
      </main>
      <h3>Deep</h3>
    `
    expect(pageOutline(document)).toBe('- Book\n  - Part\n    - Deep')
    expect(pageIntro(document)).toBe('长'.repeat(50))
  })

  it('上下文范围决定是否附带结构，页面范围再加整页大纲', () => {
    const block = mount(`
      <h1>Handbook</h1>
      <h2>Billing</h2>
      <p>Alpha one. Alpha two. Alpha three.</p>
      <p id="block">Choose the right plan for your team today.</p>
      <p>Beta one. Beta two.</p>
    `)
    const base = {
      block,
      selection: 'Choose the right plan',
      title: 'Example',
      host: 'example.com',
      contextChars: 100,
    }
    const segment = buildStructuredContext({ ...base, scope: 'segment' })
    expect(segment).toContain('页面标题：Example')
    expect(segment).toContain('网站：example.com')
    expect(segment).toContain(WINDOW_LABEL)
    for (const label of [
      CONTEXT_LABELS.headings,
      CONTEXT_LABELS.previous,
      CONTEXT_LABELS.list,
      CONTEXT_LABELS.table,
      CONTEXT_LABELS.outline,
      CONTEXT_LABELS.intro,
    ]) {
      expect(segment).not.toContain(label)
    }
    expect(segment).not.toMatch(/^下文：/m)
    const section = buildStructuredContext({ ...base, scope: 'section' })
    expect(section).toContain('章节：Handbook › Billing')
    expect(section).toContain('上文：Alpha two. Alpha three.')
    expect(section).toContain('下文：Beta one. Beta two.')
    expect(section).not.toContain(CONTEXT_LABELS.outline)
    const page = buildStructuredContext({ ...base, scope: 'page' })
    expect(page).toContain('页面大纲：')
    expect(page).toContain('- Handbook')
    expect(page).toContain('页面首段：')
  })

  it('上下文长度为 0 且只看段落时只剩标题与网站', () => {
    const block = mount('<h1>Handbook</h1><p>Before.</p><p id="block">Selected text.</p>')
    const context = buildStructuredContext({
      block,
      selection: 'Selected text.',
      title: 'Example',
      host: 'example.com',
      contextChars: 0,
      scope: 'segment',
    })
    expect(context).toBe('页面标题：Example\n网站：example.com')
  })

  it('上下文长度为 0 时结构上下文也一并关掉', () => {
    const block = mount('<h1>Handbook</h1><p>Before.</p><p id="block">Selected text.</p><p>After.</p>')
    const context = buildStructuredContext({
      block,
      selection: 'Selected text.',
      title: 'Example',
      host: 'example.com',
      contextChars: 0,
      scope: 'page',
    })
    expect(context).toBe('页面标题：Example\n网站：example.com')
  })

  it('上下文总长不超过上限，超预算时截断并标省略号', () => {
    const block = mount(`<h1>Handbook</h1><p id="block">${'a'.repeat(1200)}needle${'b'.repeat(3800)}</p>`)
    const context = buildStructuredContext({
      block,
      selection: 'needle',
      title: 'Example',
      host: 'example.com',
      contextChars: 2000,
      scope: 'page',
    })
    expect(context.length).toBeLessThanOrEqual(2000)
    expect(context.endsWith('…')).toBe(true)
  })

  it('没有块元素时只给页面级信息', () => {
    document.body.innerHTML = '<h1>Handbook</h1><p>' + '长'.repeat(50) + '</p>'
    const context = buildStructuredContext({
      block: null,
      selection: 'something',
      title: 'Example',
      host: 'example.com',
      contextChars: 600,
      scope: 'page',
    })
    expect(context).toContain('页面标题：Example')
    expect(context).toContain('页面大纲：')
    expect(context).toContain('- Handbook')
    expect(context).not.toContain(WINDOW_LABEL)
  })
})
