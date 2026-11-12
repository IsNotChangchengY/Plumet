import { useEffect, useMemo, useState } from 'react'
import type { CheckJobResult } from '../core/messaging'
import type { IssueSeverity, LocatedIssue } from '../core/check'
import { applyIssues } from '../core/check'
import { issueMarks } from '../core/marks'
import { MarksView } from './marks/MarksView'

const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  error: '错误',
  warning: '警告',
  info: '建议',
}

const CATEGORY_LABEL: Record<string, string> = {
  grammar: '语法',
  spelling: '拼写',
  punctuation: '标点',
  'word-choice': '用词',
  style: '风格',
  other: '其他',
}

type View = 'highlight' | 'list' | 'final'

type Props = {
  text: string
  result: CheckJobResult
  onReplaceInput: (text: string) => void
}

export function CheckView({ text, result, onReplaceInput }: Props) {
  const [view, setView] = useState<View>('highlight')
  const [ignored, setIgnored] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setIgnored(new Set())
    setActiveId(null)
    setView('highlight')
    setCopied(false)
  }, [result])

  const issues = useMemo(() => result.issues as LocatedIssue[], [result])
  const marks = useMemo(() => issueMarks(text, issues, ignored), [text, issues, ignored])
  const finalText = useMemo(
    () => applyIssues(text, issues.filter((issue) => !ignored.has(issue.id))),
    [text, issues, ignored],
  )
  const keptCount = issues.length - ignored.size

  const toggleIgnore = (id: string) => {
    setIgnored((previous) => {
      const copy = new Set(previous)
      if (copy.has(id)) copy.delete(id)
      else copy.add(id)
      return copy
    })
  }

  const focusCard = (id: string) => {
    setActiveId(id)
    document.getElementById(`card-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  const focusMark = (id: string) => {
    setActiveId(id)
    document.getElementById(`issue-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  const copyFinal = () => {
    void navigator.clipboard.writeText(finalText)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  if (issues.length === 0) {
    return (
      <div className="stack">
        <div className="banner info">没有发现问题。检查引擎：{result.engineLabel}</div>
        <pre className="result-text">{text}</pre>
      </div>
    )
  }

  const renderCards = () =>
    issues.map((issue) => {
      const isIgnored = ignored.has(issue.id)
      return (
        <div
          key={issue.id}
          id={`card-${issue.id}`}
          className={`issue-item sev-${issue.severity}${activeId === issue.id ? ' active' : ''}${
            isIgnored ? ' ignored' : ''
          }`}
          onClick={() => setActiveId(issue.id)}
        >
          <div className="issue-head">
            <span className={`tag sev-${issue.severity}`}>{SEVERITY_LABEL[issue.severity]}</span>
            <span className="tag">{CATEGORY_LABEL[issue.category] ?? issue.category}</span>
            <span className="spacer" />
            {isIgnored ? <span className="tag">已忽略</span> : <span className="tag ok">保留改动</span>}
          </div>
          <div className="issue-diff">
            <span className={`mark-del sev-${issue.severity}`}>{issue.quote}</span>
            {issue.replacement ? (
              <span className="mark-ins">{issue.replacement}</span>
            ) : (
              <span className="issue-empty">（删除）</span>
            )}
          </div>
          {issue.explanation ? <div className="hint">{issue.explanation}</div> : null}
          <div className="row">
            <button
              type="button"
              className={`btn small${isIgnored ? ' primary' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                toggleIgnore(issue.id)
              }}
            >
              {isIgnored ? '恢复改动' : '忽略'}
            </button>
            <span className="spacer" />
            <button
              type="button"
              className="btn ghost small"
              onClick={(event) => {
                event.stopPropagation()
                focusMark(issue.id)
              }}
            >
              定位
            </button>
          </div>
        </div>
      )
    })

  return (
    <div className="stack">
      <div className="result-meta">
        <span className="tag">共 {issues.length} 处</span>
        <span className="tag ok">保留改动 {keptCount}</span>
        <span className="tag">已忽略 {ignored.size}</span>
        {result.dropped > 0 ? <span className="tag warn">{result.dropped} 条未能定位</span> : null}
        <span className="tag">{result.engineLabel}</span>
        <span className="tag">{Math.max(1, Math.round(result.elapsedMs / 100) / 10)}s</span>
        <span className="spacer" />
        <span className="view-tabs">
          <button
            type="button"
            className={`view-tab${view === 'highlight' ? ' active' : ''}`}
            onClick={() => setView('highlight')}
          >
            高亮
          </button>
          <button
            type="button"
            className={`view-tab${view === 'list' ? ' active' : ''}`}
            onClick={() => setView('list')}
          >
            列表
          </button>
          <button
            type="button"
            className={`view-tab${view === 'final' ? ' active' : ''}`}
            onClick={() => setView('final')}
          >
            终稿
          </button>
        </span>
      </div>

      {view === 'highlight' ? (
        <div className="card flat">
          <MarksView marks={marks} activeIssueId={activeId} onIssueClick={focusCard} />
          <div className="hint" style={{ marginTop: 8 }}>
            红色 = 错误，黄色 = 警告与建议，绿色 = 改法；点击下划线可跳到对应问题。
          </div>
        </div>
      ) : null}

      {view === 'final' ? (
        <div className="card flat">
          <pre className="result-text">{finalText}</pre>
        </div>
      ) : null}

      {view !== 'final' ? <div className="issue-list">{renderCards()}</div> : null}

      <div className="row wrap">
        <button type="button" className="btn small" onClick={() => setIgnored(new Set())}>
          全部恢复
        </button>
        <button type="button" className="btn small" onClick={copyFinal}>
          {copied ? '已复制' : '复制终稿'}
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => onReplaceInput(finalText)}
          title="把终稿写回上面的输入框"
        >
          替换输入
        </button>
      </div>
    </div>
  )
}
