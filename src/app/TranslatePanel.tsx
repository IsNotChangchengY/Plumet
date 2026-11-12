import { useEffect, useMemo, useState } from 'react'
import { POLISH_CHIPS, buildPolishInstruction } from '../core/polish'
import { listEngines } from '../core/providers/registry'
import { splitSegments } from '../core/text'
import type { Settings } from '../storage/settings'
import { useJob } from '../sidepanel/useJob'
import { openOptions } from '../ui/nav'
import { CheckView } from './CheckView'
import { LangBar } from './LangBar'
import { PolishView } from './PolishView'

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
  const job = useJob()
  const [text, setText] = useState('')
  const [manual, setManual] = useState<ExternalResult>(null)
  const [submitted, setSubmitted] = useState('')
  const [runSeq, setRunSeq] = useState(0)
  const [chips, setChips] = useState<string[]>(() => settings.polishChips)
  const [direction, setDirection] = useState(() => settings.polishDirection)
  const engines = useMemo(() => listEngines(settings), [settings])
  const state = job.state
  const running = state.status === 'running'

  useEffect(() => {
    if (!external) return
    setText(external.source)
    setSubmitted(external.source)
    setManual(external)
    job.reset()
  }, [external])

  const persistDirection = () => {
    void onPatch({ polishChips: chips, polishDirection: direction })
  }

  const toggleChip = (id: string) => {
    const next = chips.includes(id) ? chips.filter((item) => item !== id) : [...chips, id]
    setChips(next)
    void onPatch({ polishChips: next, polishDirection: direction })
  }

  const startTranslate = () => {
    const segments = splitSegments(text)
    if (segments.length === 0) return
    setManual(null)
    setSubmitted(text)
    setRunSeq((value) => value + 1)
    job.run({
      kind: 'translate',
      segments,
      sourceLang: settings.sourceLang,
      targetLang: settings.targetLang,
    })
  }

  const startCheck = () => {
    if (!text.trim()) return
    setManual(null)
    setSubmitted(text)
    setRunSeq((value) => value + 1)
    job.run({ kind: 'check', text })
  }

  const startPolish = () => {
    if (!text.trim()) return
    setManual(null)
    setSubmitted(text.trim())
    setRunSeq((value) => value + 1)
    void onPatch({ polishChips: chips, polishDirection: direction })
    job.run({ kind: 'polish', text: text.trim(), instruction: buildPolishInstruction(chips, direction) })
  }

  const copyText = (value: string) => {
    if (!value) return
    void navigator.clipboard.writeText(value)
  }

  const clear = () => {
    setText('')
    setManual(null)
    setSubmitted('')
    job.reset()
  }

  const swap = () => {
    void onPatch({ sourceLang: settings.targetLang, targetLang: settings.sourceLang })
  }

  const translateText =
    state.status === 'done' && state.kind === 'translate'
      ? state.text
      : state.status === 'idle' && manual
        ? manual.result
        : ''

  const progressLabel =
    state.status === 'running' && state.kind === 'check' && state.progress
      ? `已检查 ${Math.min(state.progress.done, state.progress.total)}/${state.progress.total} 段`
      : ''

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
        <span className="field-label">翻译引擎</span>
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
        placeholder="输入或粘贴文本：可翻译、检查语法、润色。Ctrl+Enter 直接翻译"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            startTranslate()
          }
        }}
      />

      <div className="stack" style={{ gap: 6 }}>
        <div className="row">
          <span className="field-label">润色方向</span>
          <span className="hint">可多选，检查与润色使用设置里指定的 AI</span>
        </div>
        <div className="chips">
          {POLISH_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`chip${chips.includes(chip.id) ? ' active' : ''}`}
              onClick={() => toggleChip(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <input
          className="input"
          placeholder="自定义要求，例如：更诗意一点、写给中学生看"
          value={direction}
          onChange={(event) => setDirection(event.target.value)}
          onBlur={persistDirection}
        />
      </div>

      <div className="actions">
        <button type="button" className="btn primary" onClick={startTranslate} disabled={running || !text.trim()}>
          翻译
        </button>
        <button
          type="button"
          className="btn"
          onClick={startCheck}
          disabled={running || !text.trim()}
          title="红黄荧光笔标出问题，绿底给出改法"
        >
          检查
        </button>
        <button
          type="button"
          className="btn"
          onClick={startPolish}
          disabled={running || !text.trim()}
          title="荧光笔 diff：划掉表示删除，绿底表示新增"
        >
          润色
        </button>
        {running ? (
          <button type="button" className="btn" onClick={job.cancel}>
            停止
          </button>
        ) : null}
        <span className="spacer" />
        <span className="hint">{text.length > 0 ? `${text.length} 字符` : ''}</span>
      </div>

      <div className="card">
        <div className="result">
          <div className="result-meta">
            {state.status === 'running' ? (
              <>
                <span className="dot running" />
                <span>
                  {state.kind === 'translate' ? '正在翻译…' : state.kind === 'check' ? '正在检查…' : '正在润色…'}
                </span>
                {progressLabel ? <span className="tag">{progressLabel}</span> : null}
              </>
            ) : null}

            {state.status === 'done' && state.kind === 'translate' ? (
              <>
                <span className="dot done" />
                <span>{state.result.engineLabel}</span>
                <span className="tag">{Math.max(1, Math.round(state.result.elapsedMs / 100) / 10)}s</span>
                {state.result.cached ? <span className="tag ok">缓存命中</span> : null}
                {state.result.usedFallback ? <span className="tag warn">已自动降级</span> : null}
              </>
            ) : null}

            {state.status === 'idle' && manual ? <span className="tag">来自历史</span> : null}

            {state.status === 'idle' && !manual ? <span className="hint">结果会显示在这里</span> : null}

            {state.status === 'error' ? (
              <>
                <span className="dot error" />
                <span>出错了</span>
                {state.code === 'config' || state.code === 'auth' ? (
                  <button type="button" className="btn ghost small" onClick={openOptions}>
                    去设置
                  </button>
                ) : null}
              </>
            ) : null}

            <span className="spacer" />
            {translateText ? (
              <button type="button" className="btn ghost small" onClick={() => copyText(translateText)}>
                复制
              </button>
            ) : null}
            {text || translateText ? (
              <button type="button" className="btn ghost small" onClick={clear}>
                清空
              </button>
            ) : null}
          </div>

          {state.status === 'running' && state.kind === 'check' ? (
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${state.progress && state.progress.total > 0 ? Math.round((state.progress.done / state.progress.total) * 100) : 0}%`,
                }}
              />
            </div>
          ) : null}

          {state.status === 'running' && state.kind !== 'check' ? (
            <pre className="result-text">{state.text}</pre>
          ) : null}

          {state.status === 'error' ? <div className="banner error">{state.message}</div> : null}

          {state.status === 'done' && state.kind === 'check' ? (
            <CheckView key={runSeq} text={submitted} result={state.result} onReplaceInput={setText} />
          ) : null}

          {state.status === 'done' && state.kind === 'polish' ? (
            <PolishView
              key={runSeq}
              original={submitted}
              result={state.result}
              onRerun={startPolish}
              onReplaceInput={setText}
            />
          ) : null}

          {state.status === 'done' && state.kind === 'translate' ? (
            <pre className="result-text">{state.text}</pre>
          ) : null}

          {state.status === 'idle' && manual ? <pre className="result-text">{manual.result}</pre> : null}
        </div>
      </div>
    </div>
  )
}
