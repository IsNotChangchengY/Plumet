import { useEffect, useMemo, useRef, useState } from 'react'
import { POLISH_CHIPS, buildPolishInstruction } from '../core/polish'
import { resolveTargetLang } from '../core/lang'
import { listEngines } from '../core/providers/registry'
import { splitSegments } from '../core/text'
import type { Settings } from '../storage/settings'
import { saveCard } from '../storage/learning'
import { useJob } from './useJob'
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
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const [manual, setManual] = useState<ExternalResult>(null)
  const [submitted, setSubmitted] = useState('')
  const [runSeq, setRunSeq] = useState(0)
  const [chips, setChips] = useState<string[]>(() => settings.polishChips)
  const [direction, setDirection] = useState(() => settings.polishDirection)
  const [saved, setSaved] = useState(false)
  const engines = useMemo(() => listEngines(settings), [settings])
  const readyEngines = useMemo(() => engines.filter((engine) => engine.ready), [engines])
  const currentEngine = engines.find((engine) => engine.id === settings.translateEngine)
  const state = job.state
  const running = state.status === 'running'

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!external) return
    setText(external.source)
    setSubmitted(external.source)
    setManual(external)
    setSaved(false)
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
    setSaved(false)
    setRunSeq((value) => value + 1)
    job.run({
      kind: 'translate',
      segments,
      sourceLang: settings.sourceLang,
      targetLang: resolveTargetLang(settings.targetLang, text),
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
    setSaved(false)
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

  const saveSource =
    translateText === ''
      ? ''
      : state.status === 'done' && state.kind === 'translate'
        ? submitted
        : (manual?.source ?? '')

  const saveTranslation = async () => {
    if (!saveSource.trim() || !translateText) return
    await saveCard({
      text: saveSource,
      translation: translateText,
      sourceLang: settings.sourceLang,
      targetLang: resolveTargetLang(settings.targetLang, saveSource),
    })
    setSaved(true)
  }

  const progressLabel =
    state.status === 'running' && state.kind === 'check' && state.progress
      ? `已检查 ${Math.min(state.progress.done, state.progress.total)}/${state.progress.total} 段`
      : ''

  return (
    <div className="stack">
      <div className="setbar">
        <LangBar
          sourceLang={settings.sourceLang}
          targetLang={settings.targetLang}
          onChangeSource={(code) => void onPatch({ sourceLang: code })}
          onChangeTarget={(code) => void onPatch({ targetLang: code })}
          onSwap={swap}
        />

        <label className="sb-engine">
          <span className="sb-elabel">引擎</span>
          <select
            className="sb-eval"
            value={settings.translateEngine}
            onChange={(event) => void onPatch({ translateEngine: event.target.value })}
            aria-label="翻译引擎"
          >
            {settings.translateEngine && !currentEngine ? (
              <option value={settings.translateEngine}>{settings.translateEngine}（已删除）</option>
            ) : null}
            {currentEngine && !currentEngine.ready ? (
              <option value={currentEngine.id}>{currentEngine.label}（未配置）</option>
            ) : null}
            {readyEngines.map((engine) => (
              <option key={engine.id} value={engine.id}>
                {engine.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="composer">
        <textarea
          className="textarea composer-input"
          ref={inputRef}
          placeholder="输入或粘贴文本，Enter 翻译"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return
            if (event.nativeEvent.isComposing) return
            event.preventDefault()
            startTranslate()
          }}
        />
        <div className="composer-actions">
          {running ? (
            <button type="button" className="btn ghost small" onClick={job.cancel}>
              停止
            </button>
          ) : null}
          <button
            type="button"
            className="btn small"
            onClick={startCheck}
            disabled={running || !text.trim()}
            title="红黄荧光笔标出问题，绿底给出改法"
          >
            检查
          </button>
          <button
            type="button"
            className="btn small"
            onClick={startPolish}
            disabled={running || !text.trim()}
            title="荧光笔 diff：划掉表示删除，绿底表示新增"
          >
            润色
          </button>
          <button type="button" className="btn primary small" onClick={startTranslate} disabled={running || !text.trim()}>
            翻译
          </button>
        </div>
      </div>

      <details className="polish-config">
        <summary>润色方向{chips.length > 0 ? `（已选 ${chips.length}）` : ''}</summary>
        <div className="stack" style={{ gap: 6, marginTop: 8 }}>
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
      </details>

      <div className="card result-card">
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
              </>
            ) : null}

            {state.status === 'idle' && manual ? <span className="tag">来自历史</span> : null}

            {state.status === 'error' ? (
              <>
                <span className="dot error" />
                <span>出错了</span>
                {state.code === 'config' || state.code === 'auth' ? (
                  <button type="button" className="btn ghost small" onClick={() => openOptions('engines')}>
                    去设置
                  </button>
                ) : null}
              </>
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

          {state.status === 'idle' && !manual ? (
            <div className="empty">
              <span className="re-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v4" />
                  <path d="M12 17v4" />
                  <path d="M3 12h4" />
                  <path d="M17 12h4" />
                  <path d="m5.6 5.6 2.8 2.8" />
                  <path d="m15.6 15.6 2.8 2.8" />
                  <path d="m18.4 5.6-2.8 2.8" />
                  <path d="m8.4 15.6-2.8 2.8" />
                </svg>
              </span>
              <span className="re-title">结果会显示在这里</span>
              <span className="re-hint">Shift+Enter 换行</span>
            </div>
          ) : null}

          {translateText || text ? (
            <div className="result-actions">
              {saveSource ? (
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => void saveTranslation()}
                  disabled={saved}
                  title="收进生词本，之后在生词本页面复习"
                >
                  {saved ? '已收藏' : '收藏'}
                </button>
              ) : null}
              {translateText ? (
                <button type="button" className="btn ghost small" onClick={() => copyText(translateText)}>
                  复制
                </button>
              ) : null}
              <button type="button" className="btn ghost small" onClick={clear}>
                清空
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
