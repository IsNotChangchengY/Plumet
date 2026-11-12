// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CheckView } from '../src/app/CheckView'
import { PolishView } from '../src/app/PolishView'
import type { CheckJobResult } from '../src/core/messaging'

const checkResult: CheckJobResult = {
  issues: [
    {
      id: 'c0-0',
      quote: 'teh',
      replacement: 'the',
      category: 'spelling',
      severity: 'error',
      explanation: '拼写错误',
      start: 7,
      end: 10,
    },
    {
      id: 'c0-1',
      quote: 'design scheme',
      replacement: 'design idea',
      category: 'word-choice',
      severity: 'warning',
      explanation: '用词不自然',
      start: 15,
      end: 28,
    },
  ],
  corrected: 'I have the book and my design idea works.',
  engineLabel: 'Mock AI',
  elapsedMs: 1234,
  chunks: 1,
  dropped: 0,
}

describe('CheckView 渲染', () => {
  it('输出划掉的原文与绿色的改法', () => {
    const html = renderToStaticMarkup(
      <CheckView
        text="I have teh book and my design scheme works."
        result={checkResult}
        onReplaceInput={() => undefined}
      />,
    )
    expect(html).toContain('mark-del')
    expect(html).toContain('mark-ins')
    expect(html).toContain('teh')
    expect(html).toContain('the')
    expect(html).toContain('拼写')
    expect(html).toContain('高亮')
    expect(html).toContain('终稿')
  })

  it('没有问题时不渲染问题卡片', () => {
    const html = renderToStaticMarkup(
      <CheckView
        text="All good."
        result={{ ...checkResult, issues: [], corrected: 'All good.' }}
        onReplaceInput={() => undefined}
      />,
    )
    expect(html).toContain('没有发现问题')
    expect(html).not.toContain('mark-del')
  })
})

describe('PolishView 渲染', () => {
  it('输出 diff 标记与视图切换', () => {
    const html = renderToStaticMarkup(
      <PolishView
        original="这个设计很好。"
        result={{ polished: '这个设计真的很不错。', engineLabel: 'Mock AI', elapsedMs: 800 }}
        onRerun={() => undefined}
        onReplaceInput={() => undefined}
      />,
    )
    expect(html).toContain('mark-del')
    expect(html).toContain('mark-ins')
    expect(html).toContain('合并')
    expect(html).toContain('纯净稿')
    expect(html).toContain('再来一版')
  })
})
