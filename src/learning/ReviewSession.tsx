import { useState } from 'react'
import type { CardGrade, LearningCard } from '../storage/learning'
import { GRADES } from '../storage/learning'

type Props = {
  cards: LearningCard[]
  onGrade: (card: LearningCard, grade: CardGrade) => Promise<void>
  onExit: () => void
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function ReviewSession({ cards, onGrade, onExit }: Props) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tally, setTally] = useState({ kept: 0, missed: 0 })

  const card = index < cards.length ? cards[index] : null

  const handleGrade = async (grade: CardGrade) => {
    if (!card || busy) return
    setBusy(true)
    let saved = true
    try {
      await onGrade(card, grade)
    } catch {
      saved = false
    }
    setBusy(false)
    if (!saved) return
    setTally((previous) =>
      grade === 'again'
        ? { ...previous, missed: previous.missed + 1 }
        : { ...previous, kept: previous.kept + 1 },
    )
    setRevealed(false)
    setIndex((value) => value + 1)
  }

  if (!card) {
    return (
      <div className="review-done">
        <span className="review-done-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <div className="stack" style={{ gap: 4, alignItems: 'center' }}>
          <strong>这一轮复习完成</strong>
          <span className="hint">
            共 {cards.length} 张：记得 {tally.kept} 张，忘记 {tally.missed} 张。忘记的卡片 10 分钟后会再出现。
          </span>
        </div>
        <button type="button" className="btn primary" onClick={onExit}>
          返回列表
        </button>
      </div>
    )
  }

  return (
    <div className="review-stage">
      <div className="row">
        <span className="hint">
          第 {index + 1}/{cards.length} 张
        </span>
        <span className="spacer" />
        <button type="button" className="btn ghost small" onClick={onExit}>
          结束复习
        </button>
      </div>

      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${Math.round((index / cards.length) * 100)}%` }} />
      </div>

      <div className="review-card">
        <div className="review-word">{card.text}</div>
        {card.context ? <p className="review-context">{card.context}</p> : null}
        {card.sourceUrl ? (
          <a className="learn-source" href={card.sourceUrl} target="_blank" rel="noreferrer">
            {card.sourceTitle || hostOf(card.sourceUrl) || '来源'}
          </a>
        ) : null}
      </div>

      {revealed ? (
        <div className="review-answer">{card.translation || '（这张卡片没有译文）'}</div>
      ) : null}

      {revealed ? (
        <div className="review-grades">
          {GRADES.map((grade) => (
            <button
              key={grade.id}
              type="button"
              className={`btn review-grade${grade.id === 'good' ? ' primary' : ''}`}
              onClick={() => void handleGrade(grade.id)}
              disabled={busy}
            >
              {grade.label}
              <small>{grade.hint}</small>
            </button>
          ))}
        </div>
      ) : (
        <button type="button" className="btn primary" onClick={() => setRevealed(true)}>
          显示答案
        </button>
      )}
    </div>
  )
}
