import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { clearHistory, listHistory, removeHistory } from '../storage/history'
import type { HistoryEntry } from '../storage/history'

const MODE_LABEL: Record<string, string> = {
  translate: '翻译',
  check: '检查',
  polish: '润色',
}

type Props = {
  refreshKey: number
  onPick: (entry: HistoryEntry) => void
}

function formatTime(at: number): string {
  const date = new Date(at)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function HistoryList({ refreshKey, onPick }: Props) {
  const [items, setItems] = useState<HistoryEntry[] | null>(null)

  useEffect(() => {
    let alive = true
    void listHistory().then((list) => {
      if (alive) setItems(list)
    })
    return () => {
      alive = false
    }
  }, [refreshKey])

  const handleRemove = async (event: MouseEvent, id: string) => {
    event.stopPropagation()
    await removeHistory(id)
    setItems(await listHistory())
  }

  const handleClear = async () => {
    if (!window.confirm('清空全部翻译历史？这个操作不能撤销。')) return
    await clearHistory()
    setItems([])
  }

  if (items === null) {
    return <div className="empty">加载中…</div>
  }

  if (items.length === 0) {
    return <div className="empty">还没有历史记录</div>
  }

  return (
    <div className="stack">
      <div className="row">
        <span className="hint">最近 {items.length} 条</span>
        <span className="spacer" />
        <button type="button" className="btn ghost small" onClick={() => void handleClear()}>
          清空
        </button>
      </div>
      <div className="history-list">
        {items.map((item) => (
          <div key={item.id} className="history-item" onClick={() => onPick(item)}>
            <div className="history-source">{item.sourceText.replace(/\s+/g, ' ').slice(0, 120)}</div>
            <div className="history-result">{item.resultText.replace(/\s+/g, ' ').slice(0, 120)}</div>
            <div className="history-meta">
              <span className="tag">{MODE_LABEL[item.mode] ?? item.mode}</span>
              <span>{formatTime(item.at)}</span>
              <span>{item.engineLabel}</span>
              <span className="spacer" />
              <button
                type="button"
                className="btn ghost small"
                onClick={(event) => void handleRemove(event, item.id)}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
