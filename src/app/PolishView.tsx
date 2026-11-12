import { useEffect, useMemo, useState } from 'react'
import type { PolishJobResult } from '../core/messaging'
import { changeEntries, diffMarks } from '../core/marks'
import { MarksView } from './marks/MarksView'

type View = 'inline' | 'side' | 'clean'

type Props = {
  original: string
  result: PolishJobResult
  onRerun: () => void
  onReplaceInput: (text: string) => void
}

export function PolishView({ original, result, onRerun, onReplaceInput }: Props) {
  const [view, setView] = useState<View>('inline')
  const [wide, setWide] = useState(false)
  const [showChanges, setShowChanges] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const update = () => setWide(window.innerWidth >= 560)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    setShowChanges(false)
    setCopied(false)
  }, [result])

  const marks = useMemo(() => diffMarks(original, result.polished), [original, result.polished])
  const changes = useMemo(() => changeEntries(marks), [marks])

  const copyPolished = () => {
    void navigator.clipboard.writeText(result.polished)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="stack">
      <div className="result-meta">
        <span className="tag">共 {changes.length} 处修改</span>
        <span className="tag">{result.engineLabel}</span>
        <span className="tag">{Math.max(1, Math.round(result.elapsedMs / 100) / 10)}s</span>
        <span className="spacer" />
        <span className="view-tabs">
          <button
            type="button"
            className={`view-tab${view === 'inline' ? ' active' : ''}`}
            onClick={() => setView('inline')}
          >
            合并
          </button>
          <button
            type="button"
            className={`view-tab${view === 'side' ? ' active' : ''}`}
            onClick={() => setView('side')}
            disabled={!wide}
            title={wide ? '左右并排对照' : '侧栏太窄，拉宽窗口后可用'}
          >
            并排
          </button>
          <button
            type="button"
            className={`view-tab${view === 'clean' ? ' active' : ''}`}
            onClick={() => setView('clean')}
          >
            纯净稿
          </button>
        </span>
      </div>

      {view === 'inline' ? (
        <div className="card flat">
          <MarksView marks={marks} />
        </div>
      ) : null}

      {view === 'clean' ? (
        <div className="card flat">
          <pre className="result-text">{result.polished}</pre>
        </div>
      ) : null}

      {view === 'side' && wide ? (
        <div className="side-by-side">
          <div className="card flat side-column">
            <div className="hint">原文</div>
            <pre className="result-text">{original}</pre>
          </div>
          <div className="card flat side-column">
            <div className="hint">润色稿</div>
            <pre className="result-text">{result.polished}</pre>
          </div>
        </div>
      ) : null}

      <div className="row wrap">
        <button type="button" className="btn primary small" onClick={copyPolished}>
          {copied ? '已复制' : '复制润色稿'}
        </button>
        <button type="button" className="btn small" onClick={() => onReplaceInput(result.polished)}>
          替换输入
        </button>
        <button type="button" className="btn small" onClick={onRerun}>
          再来一版
        </button>
        <span className="spacer" />
        <button type="button" className="btn ghost small" onClick={() => setShowChanges((value) => !value)}>
          {showChanges ? '收起修改清单' : '修改清单'}
        </button>
      </div>

      {showChanges ? (
        <div className="change-list">
          {changes.length === 0 ? <div className="hint">没有检测到改动。</div> : null}
          {changes.map((change, index) => (
            <div key={index} className="change-item">
              <span className="mark-del">{change.before || '（无）'}</span>
              <span className="change-arrow">→</span>
              <span className="mark-ins">{change.after || '（删除）'}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
