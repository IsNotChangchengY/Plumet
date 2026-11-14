import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { CardGrade, LearningBook, LearningCard } from '../storage/learning'
import {
  REVIEW_LIMIT,
  bookStats,
  clearCards,
  dueCards,
  exportBook,
  gradeCard,
  importCards,
  loadBook,
  removeCard,
} from '../storage/learning'
import type { Settings } from '../storage/settings'
import { loadSettings } from '../storage/settings'
import { applyTheme } from '../ui/apply-theme'
import { SectionTitle } from '../app/SectionTitle'
import { CardList } from './CardList'
import { ReviewSession } from './ReviewSession'
import './learning.css'

export default function App() {
  const [book, setBook] = useState<LearningBook | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [session, setSession] = useState<LearningCard[] | null>(null)
  const [notice, setNotice] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadBook().then(setBook)
    void loadSettings().then(setSettings)
  }, [])

  useEffect(() => {
    if (settings) applyTheme(settings.theme)
  }, [settings])

  const refresh = useCallback(async () => {
    setBook(await loadBook())
  }, [])

  const stats = useMemo(() => (book ? bookStats(book) : null), [book])

  const startReview = () => {
    if (!book) return
    const cards = dueCards(book.cards)
    if (cards.length === 0) {
      setNotice('现在没有到期的卡片，去网页上多收藏几句吧')
      return
    }
    setSession(cards)
  }

  const handleGrade = async (card: LearningCard, grade: CardGrade) => {
    await gradeCard(card.id, grade)
    await refresh()
  }

  const handleRemove = async (id: string) => {
    await removeCard(id)
    await refresh()
  }

  const handleExport = () => {
    if (!book) return
    const blob = new Blob([exportBook(book)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `yuyi-cards-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setNotice('卡片已导出为 JSON 文件')
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as unknown
      const result = await importCards(parsed)
      await refresh()
      setNotice(`导入完成：新增 ${result.added} 张，跳过 ${result.skipped} 张`)
    } catch (error) {
      setNotice(`导入失败：${error instanceof Error ? error.message : '文件格式不对'}`)
    }
  }

  const handleClear = async () => {
    if (!window.confirm('清空生词本？卡片与复习记录会一起删除，且不能撤销。')) return
    await clearCards()
    await refresh()
    setNotice('生词本已清空')
  }

  if (!book || !stats) {
    return <div className="container">正在加载生词本…</div>
  }

  return (
    <div className="container">
      <header className="opts-head">
        <div className="stack" style={{ gap: 4 }}>
          <h1 className="page-title">羽译 · 生词本</h1>
          <p className="page-subtitle">
            划词或翻译时点「收藏」，词句连同上下文一起进这里。先回忆原文，再按记忆强度安排下次复习。
          </p>
        </div>
      </header>

      {notice ? (
        <div className="banner info">
          <span>{notice}</span>
          <span className="spacer" />
          <button type="button" className="btn ghost small" onClick={() => setNotice('')}>
            知道了
          </button>
        </div>
      ) : null}

      {session ? (
        <section className="card section">
          <SectionTitle icon="zap">复习</SectionTitle>
          <ReviewSession
            cards={session}
            onGrade={handleGrade}
            onExit={() => {
              setSession(null)
              void refresh()
            }}
          />
        </section>
      ) : (
        <>
          <section className="card section">
            <SectionTitle icon="zap">学习概况</SectionTitle>
            <div className="learn-stats">
              <div className="learn-stat">
                <span className="learn-stat-value">{stats.addedToday}</span>
                <span className="learn-stat-label">今日新增</span>
              </div>
              <div className="learn-stat">
                <span className="learn-stat-value">{stats.due}</span>
                <span className="learn-stat-label">待复习</span>
              </div>
              <div className="learn-stat">
                <span className="learn-stat-value">{stats.streak}</span>
                <span className="learn-stat-label">连续天数</span>
              </div>
              <div className="learn-stat">
                <span className="learn-stat-value">{Math.round(stats.correctRate * 100)}%</span>
                <span className="learn-stat-label">正确率（累计 {stats.reviews} 次）</span>
              </div>
            </div>
          </section>

          <div className="row wrap learn-toolbar">
            <button type="button" className="btn primary" onClick={startReview} disabled={stats.due === 0}>
              开始复习
              {stats.due > 0 ? `（${Math.min(stats.due, REVIEW_LIMIT)} 张）` : ''}
            </button>
            <span className="spacer" />
            <button type="button" className="btn" onClick={handleExport} disabled={stats.total === 0}>
              导出 JSON
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              导入 JSON
            </button>
            <button type="button" className="btn danger" onClick={() => void handleClear()} disabled={stats.total === 0}>
              清空
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => void handleImport(event)}
            />
          </div>

          <section className="card section">
            <SectionTitle icon="book">卡片（{stats.total}）</SectionTitle>
            <CardList cards={book.cards} onRemove={(id) => void handleRemove(id)} />
          </section>
        </>
      )}
    </div>
  )
}
