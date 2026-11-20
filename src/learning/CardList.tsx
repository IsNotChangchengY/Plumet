import { useState } from 'react'
import type { LearningCard } from '../storage/learning'
import { CardDictionary } from './CardDictionary'

type Props = {
  cards: LearningCard[]
  onRemove: (id: string) => void
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function formatDate(at: number): string {
  return new Date(at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function formatDue(card: LearningCard): string {
  const days = Math.max(1, Math.round((card.dueAt - Date.now()) / 86400000))
  return `${days} 天后`
}

export function CardList({ cards, onRemove }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  if (cards.length === 0) {
    return (
      <div className="empty">
        <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
          <span className="re-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
            </svg>
          </span>
          <span className="re-title">还没有收藏</span>
          <span className="re-hint">划词后点气泡底栏「收藏」，或在弹窗结果卡点「收藏」。</span>
        </div>
      </div>
    )
  }

  return (
    <div className="learn-list">
      {cards.map((card) => {
        const due = card.dueAt <= Date.now()
        const open = expanded[card.id] === true
        return (
          <article key={card.id} className={`learn-card${open ? ' open' : ''}`}>
            <div className="learn-card-head">
              <button
                type="button"
                className="learn-card-toggle"
                aria-expanded={open}
                onClick={() => setExpanded((prev) => ({ ...prev, [card.id]: !open }))}
              >
                <span className="learn-caret" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </span>
                <span className="learn-card-text">{card.text}</span>
                {due ? <span className="tag brand">待复习</span> : <span className="tag">{formatDue(card)}</span>}
              </button>
              <button type="button" className="btn ghost small" onClick={() => onRemove(card.id)}>
                删除
              </button>
            </div>
            {open ? (
              <>
                {card.dictionary ? (
                  <CardDictionary entry={card.dictionary} />
                ) : card.translation ? (
                  <p className="learn-card-trans">{card.translation}</p>
                ) : null}
                <div className="learn-meta">
                  {card.sourceUrl ? (
                    <a className="learn-source" href={card.sourceUrl} target="_blank" rel="noreferrer">
                      {card.sourceTitle || hostOf(card.sourceUrl) || '来源'}
                    </a>
                  ) : (
                    <span>手动收藏</span>
                  )}
                  <span>{formatDate(card.createdAt)}</span>
                  <span>
                    {card.sourceLang} → {card.targetLang}
                  </span>
                  <span>已复习 {card.reps} 次</span>
                  {card.lapses > 0 ? <span>忘记 {card.lapses} 次</span> : null}
                </div>
              </>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
