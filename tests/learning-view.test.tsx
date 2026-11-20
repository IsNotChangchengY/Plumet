import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { CardList } from '../src/learning/CardList'
import { ReviewSession } from '../src/learning/ReviewSession'
import type { LearningCard } from '../src/storage/learning'

const globalWithAct = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
globalWithAct.IS_REACT_ACT_ENVIRONMENT = true

const card: LearningCard = {
  id: 'c1',
  text: 'serendipity',
  translation: '意外的幸运',
  dictionary: null,
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

const wordCard: LearningCard = {
  ...card,
  id: 'c2',
  dictionary: {
    word: 'serendipity',
    direction: 'en-zh',
    phonetics: [
      { label: '英', text: '/ˌserənˈdɪpəti/', audio: 'https://dict.youdao.com/dictvoice?audio=serendipity&type=1' },
    ],
    translations: [{ pos: 'n.', text: '意外的幸运' }],
    definitions: [
      { pos: 'n.', text: 'the occurrence of events by chance', example: 'a moment of serendipity' },
    ],
    forms: [{ name: '复数', value: 'serendipities' }],
    examples: [{ source: 'It was pure serendipity.', target: '纯属意外之喜。' }],
    phrases: [{ phrase: 'serendipity effect', meaning: '意外发现效应' }],
  },
}

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderCards(cards: LearningCard[]): void {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(<CardList cards={cards} onRemove={() => undefined} />)
  })
}

function expandFirst(): void {
  const toggle = container?.querySelector<HTMLButtonElement>('.learn-card-toggle')
  if (!toggle) throw new Error('missing learn-card-toggle')
  act(() => {
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  container?.remove()
  container = null
})

describe('CardList 渲染', () => {
  it('空列表给出收藏入口提示', () => {
    const html = renderToStaticMarkup(<CardList cards={[]} onRemove={() => undefined} />)
    expect(html).toContain('还没有收藏')
    expect(html).toContain('气泡底栏')
  })

  it('卡片默认收起，只显示原文与到期状态', () => {
    const html = renderToStaticMarkup(<CardList cards={[card]} onRemove={() => undefined} />)
    expect(html).toContain('serendipity')
    expect(html).toContain('待复习')
    expect(html).toContain('删除')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('意外的幸运')
    expect(html).not.toContain('example.com')
  })

  it('点开后显示译文、来源与复习信息', () => {
    renderCards([card])
    expect(container?.textContent).not.toContain('意外的幸运')
    expandFirst()
    expect(container?.textContent).toContain('意外的幸运')
    expect(container?.textContent).toContain('Example')
    expect(container?.querySelector('.learn-source')?.getAttribute('href')).toBe('https://example.com/post')
    expect(container?.querySelector('.learn-card-toggle')?.getAttribute('aria-expanded')).toBe('true')
  })

  it('有词典快照时点开显示音标、释义、词形与例句', () => {
    renderCards([wordCard])
    expandFirst()
    const html = container?.innerHTML ?? ''
    expect(html).toContain('learn-dict')
    expect(html).toContain('/ˌserənˈdɪpəti/')
    expect(html).toContain('意外的幸运')
    expect(html).toContain('词形变化')
    expect(html).toContain('serendipities')
    expect(html).toContain('例句')
    expect(html).toContain('纯属意外之喜。')
    expect(html).not.toContain('learn-card-trans')
  })

  it('旧卡没有词典快照时仍是纯文本译文', () => {
    renderCards([card])
    expandFirst()
    const html = container?.innerHTML ?? ''
    expect(html).toContain('learn-card-trans')
    expect(html).toContain('意外的幸运')
  })
})

describe('ReviewSession 渲染', () => {
  it('未揭示时只给原文，不出现评分档位', () => {
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
