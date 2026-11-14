// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CardList } from '../src/learning/CardList'
import { ReviewSession } from '../src/learning/ReviewSession'
import type { LearningCard } from '../src/storage/learning'

const card: LearningCard = {
  id: 'c1',
  text: 'serendipity',
  translation: '意外的幸运',
  context: 'Finding this cafe was pure serendipity.',
  sourceUrl: 'https://example.com/post',
  sourceTitle: 'Example',
  sourceLang: 'en',
  targetLang: 'zh-CN',
  tags: [],
  createdAt: Date.now(),
  ease: 2.5,
  interval: 0,
  dueAt: Date.now(),
  reps: 0,
  lapses: 0,
  reviewedAt: null,
}

describe('CardList 渲染', () => {
  it('空列表给出收藏入口提示', () => {
    const html = renderToStaticMarkup(<CardList cards={[]} onRemove={() => undefined} />)
    expect(html).toContain('还没有收藏')
    expect(html).toContain('气泡底栏')
  })

  it('卡片显示原文、译文、上下文与来源', () => {
    const html = renderToStaticMarkup(<CardList cards={[card]} onRemove={() => undefined} />)
    expect(html).toContain('serendipity')
    expect(html).toContain('意外的幸运')
    expect(html).toContain('pure serendipity')
    expect(html).toContain('example.com')
    expect(html).toContain('待复习')
    expect(html).toContain('删除')
  })
})

describe('ReviewSession 渲染', () => {
  it('未揭示时只给原文与上下文，不出现评分档位', () => {
    const html = renderToStaticMarkup(
      <ReviewSession cards={[card]} onGrade={async () => undefined} onExit={() => undefined} />,
    )
    expect(html).toContain('serendipity')
    expect(html).toContain('第 1/1 张')
    expect(html).toContain('显示答案')
    expect(html).not.toContain('忘记了')
    expect(html).not.toContain('意外的幸运')
  })

  it('没有卡片时直接是完成态', () => {
    const html = renderToStaticMarkup(
      <ReviewSession cards={[]} onGrade={async () => undefined} onExit={() => undefined} />,
    )
    expect(html).toContain('这一轮复习完成')
    expect(html).toContain('返回列表')
  })
})
