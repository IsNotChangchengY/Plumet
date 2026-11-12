import { useEffect, useMemo, useState } from 'react'
import { listEngines } from '../core/providers/registry'
import { splitSegments } from '../core/text'
import type { Settings } from '../storage/settings'
import { useTranslateJob } from '../sidepanel/useTranslateJob'
import { LangBar } from './LangBar'

export type ExternalResult = {
  source: string
  result: string
  engineLabel: string
} | null

type Props = {
  settings: Settings
  onPatch: (patch: Partial<Settings>) => void
  external: ExternalResult
}

export function TranslatePanel({ settings, onPatch, external }: Props) {
  const job = useTranslateJob()
  const [text, setText] = useState('')
  const [manual, setManual] = useState<ExternalResult>(null)
  const engines = useMemo(() => listEngines(settings), [settings])

  useEffect(() => {
    if (!external) return
    setText(external.source)
    setManual(external)
    job.reset()
  }, [external])

  const running = job.state.status === 'running'
  const displayText =
    job.state.status === 'running' || job.state.status === 'done' ? job.state.text : (manual?.result ?? '')

  const submit = () => {
    const segments = splitSegments(text)
    if (segments.length === 0) return
    setManual(null)
    job.run({
      segments,
      sourceLang: settings.sourceLang,
      targetLang: settings.targetLang,
    })
  }

  const copy = () => {
    if (!displayText) return
    void navigator.clipboard.writeText(displayText)
  }

  const clear = () => {
    setText('')
    setManual(null)
    job.reset()
  }

  const swap = () => {
    const source = settings.sourceLang
    const target = settings.targetLang
    void onPatch({ sourceLang: target, targetLang: source })
  }

  return (
    <div className="stack">
      <LangBar
        sourceLang={settings.sourceLang}
        targetLang={settings.targetLang}
        onChangeSource={(code) => void onPatch({ sourceLang: code })}
        onChangeTarget={(code) => void onPatch({ targetLang: code })}
        onSwap={swap}
      />

      <div className="row">
        <span className="field-label">引擎</span>
        <select
          className="select"
          style={{ flex: 1 }}
          value={settings.translateEngine}
          onChange={(event) => void onPatch({ translateEngine: event.target.value })}
        >
          {engines.map((engine) => (
            <option key={engine.id} value={engine.id}>
              {engine.label}
              {engine.configured ? '' : '（未配置）'}
            </option>
          ))}
        </select>
      </div>

      <textarea
        className="textarea"
        placeholder="输入或粘贴要翻译的内容，Ctrl+Enter 直接翻译"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            submit()
          }
        }}
      />

      <div className="actions">
        <button type="button" className="btn primary" onClick={submit} disabled={running || !text.trim()}>
          {running ? '翻译中…' : '翻译'}
        </button>
        {running ? (
          <button type="button" className="btn" onClick={job.cancel}>
            停止
          </button>
        ) : null}
        <button
          type="button"
          className="btn"
          disabled
          title="语法检查在 M2 实现：用红黄荧光笔标出问题并给出绿色修改"
        >
          检查
        </button>
        <button
          type="button"
          className="btn"
          disabled
          title="润色在 M2 实现：荧光笔 diff + 自定义润色方向"
        >
          润色
        </button>
        <span className="spacer" />
        <span className="hint">{text.length > 0 ? `${text.length} 字符` : ''}</span>
      </div>

      <div className="card">
        <div className="result">
          <div className="result-meta">
            {job.state.status === 'running' ? (
              <span className="row">
                <span className="dot running" />
                正在翻译…
              </span>
            ) : null}
            {job.state.status === 'done' ? (
              <>
                <span className="dot done" />
                <span>{job.state.result.engineLabel}</span>
                <span className="tag">{Math.max(1, Math.round(job.state.result.elapsedMs / 100) / 10)}s</span>
                {job.state.result.cached ? <span className="tag ok">缓存命中</span> : null}
                {job.state.result.usedFallback ? <span className="tag warn">已自动降级</span> : null}
              </>
            ) : null}
            {job.state.status === 'idle' && manual ? <span className="tag">来自历史</span> : null}
            {job.state.status === 'error' ? (
              <span className="row">
                <span className="dot error" />
                <span>{job.state.message}</span>
              </span>
            ) : null}
            {job.state.status === 'idle' && !manual ? (
              <span className="hint">译文会显示在这里</span>
            ) : null}
            <span className="spacer" />
            {displayText ? (
              <button type="button" className="btn ghost small" onClick={copy}>
                复制
              </button>
            ) : null}
            {text || displayText ? (
              <button type="button" className="btn ghost small" onClick={clear}>
                清空
              </button>
            ) : null}
          </div>
          <pre className={`result-text${displayText ? '' : ' empty'}`}>{displayText}</pre>
        </div>
      </div>
    </div>
  )
}
