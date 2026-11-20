import { useEffect, useMemo, useRef, useState } from 'react'
import { POLISH_CHIPS, buildPolishInstruction } from '../core/polish'
import { entryText } from '../core/dictionary/format'
import { dictionaryQueryFor } from '../core/dictionary/query'
import { resolveTargetLang } from '../core/lang'
import { listEngines } from '../core/providers/registry'
import { splitSegments } from '../core/text'
import type { Settings } from '../storage/settings'
import { saveCard } from '../storage/learning'
import { useJob } from './useJob'
import type { EngineRun } from './useJob'
import { openOptions } from '../ui/nav'
import { CheckView } from './CheckView'
import { DictCard } from './DictCard'
import { EnginePicker } from './EnginePicker'
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

function seconds(ms: number): string {
  return `${Math.max(1, Math.round(ms / 100) / 10)}s`
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copyTimer = useRef(0)
  const engines = useMemo(() => listEngines(settings), [settings])
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
    setCopiedKey(null)
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

  const engineRuns = (): { id: string; label: string }[] =>
    settings.translateEngines.map((id) => {
      const engine = engines.find((item) => item.id === id)
      return { id, label: engine ? engine.label : `${id}（已删除）` }
    })

  const startTranslate = () => {
    const segments = splitSegments(text)
    if (segments.length === 0) return
    setManual(null)
    setSubmitted(text)
    setSaved(false)
    setCopiedKey(null)
    setRunSeq((value) => value + 1)
    const query = dictionaryQueryFor(settings.dictionary, text)
    if (query) {
      job.run({
        kind: 'dict',
        word: query.word,
        sourceLang: settings.sourceLang,
        targetLang: resolveTargetLang(settings.targetLang, text),
        engines: engineRuns(),
      })
      return
    }
    job.run({
      kind: 'translate',
      segments,
      sourceLang: settings.sourceLang,
      targetLang: resolveTargetLang(settings.targetLang, text),
      engines: engineRuns(),
    })
  }

  const startCheck = () => {
    if (!text.trim()) return
    setManual(null)
    setSubmitted(text)
    setCopiedKey(null)
    setRunSeq((value) => value + 1)
    job.run({ kind: 'check', text })
  }

  const startPolish = () => {
    if (!text.trim()) return
    setManual(null)
    setSubmitted(text.trim())
    setCopiedKey(null)
    setRunSeq((value) => value + 1)
    void onPatch({ polishChips: chips, polishDirection: direction })
    job.run({ kind: 'polish', text: text.trim(), instruction: buildPolishInstruction(chips, direction) })
  }

  const copyText = (value: string, key: string) => {
    if (!value) return
    void navigator.clipboard
      .writeText(value)
      .then(() => {
        window.clearTimeout(copyTimer.current)
        setCopiedKey(key)
        copyTimer.current = window.setTimeout(() => setCopiedKey(null), 1500)
      })
      .catch(() => undefined)
  }

  const clear = () => {
    setText('')
    setManual(null)
    setSubmitted('')
    setSaved(false)
    setCopiedKey(null)
    job.reset()
    inputRef.current?.focus()
  }

  const swap = () => {
    void onPatch({ sourceLang: settings.targetLang, targetLang: settings.sourceLang })
  }

  const dictEntry = state.status === 'done' && state.kind === 'dict' ? state.result.entry : null
  const dictText = dictEntry ? entryText(dictEntry) : ''
  const finishedParts = state.status === 'done' && state.kind === 'translate' ? state.parts : []
  const runningParts =
    state.status === 'running' && (state.kind === 'translate' || state.kind === 'dict') ? state.parts : []
  const dictFallback =
    state.status === 'running' &&
    state.kind === 'dict' &&
    runningParts.some((part) => part.text !== '' || part.done || part.error)
  const primaryPart = finishedParts.find((part) => part.result) ?? null

  const translateText =
    dictText ||
    primaryPart?.text ||
    (state.status === 'idle' && manual ? manual.result : '')

  const saveSource =
    translateText === ''
      ? ''
      : dictEntry
        ? submitted
        : primaryPart
          ? submitted
          : (manual?.source ?? '')

  const saveTranslation = async () => {
    if (!saveSource.trim() || !translateText) return
    await saveCard({
      text: saveSource,
      translation: translateText,
      dictionary: dictEntry ?? undefined,
      sourceLang: settings.sourceLang,
      targetLang: resolveTargetLang(settings.targetLang, saveSource),
    })
    setSaved(true)
  }

  const progressLabel =
    state.status === 'running' && state.kind === 'check' && state.progress
      ? `已检查 ${Math.min(state.progress.done, state.progress.total)}/${state.progress.total} 段`
      : ''

  const canClear = text.trim() !== '' || state.status !== 'idle' || manual !== null

  const renderParts = (parts: EngineRun[], active: boolean) => {
    if (parts.length <= 1) return <pre className="result-text">{parts[0]?.text ?? ''}</pre>
    return (
      <div className="engine-results">
        {parts.map((part) => (
          <section className="engine-result" key={part.engineId || part.label}>
            <div className="engine-result-head">
              <span className={`dot ${part.error ? 'error' : part.done ? 'done' : 'running'}`} />
              <span className="engine-result-name" title={part.label}>
                {part.label}
              </span>
              {part.text ? (
                <button
                  type="button"
                  className="btn ghost xs"
                  onClick={() => copyText(part.text, part.engineId)}
                >
                  {copiedKey === part.engineId ? '已复制' : '复制'}
                </button>
              ) : null}
            </div>
            {part.result ? (
              <div className="engine-result-meta">
                <span className="tag">{seconds(part.result.elapsedMs)}</span>
                {part.result.cached ? <span className="tag ok">缓存命中</span> : null}
                {part.result.notice ? <span className="tag">{part.result.notice}</span> : null}
              </div>
            ) : null}
            {part.error ? (
              <div className="banner error">{part.error.message}</div>
            ) : (
              <pre className="result-text">{part.text || (active ? '翻译中…' : '')}</pre>
            )}
          </section>
        ))}
      </div>
    )
  }

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

        <div className="sb-engine">
          <span className="sb-elabel">引擎</span>
          <EnginePicker
            engines={engines}
            selected={settings.translateEngines}
            onChange={(ids) => void onPatch({ translateEngines: ids })}
          />
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
      </div>

      <div className="composer">
        <textarea
          className={`textarea composer-input${canClear ? ' has-clear' : ''}`}
          ref={inputRef}
          placeholder="输入或粘贴文本，Enter 翻译 · Shift+Enter 换行"
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
        {canClear ? (
          <button type="button" className="composer-clear" onClick={clear} title="清空输入与结果" aria-label="清空输入与结果">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="card result-card">
        <div className="result">
          <div className="result-meta">
            {state.status === 'running' ? (
              <>
                <span className="dot running" />
                <span>
                  {state.kind === 'translate'
                    ? state.parts.length > 1
                      ? `正在用 ${state.parts.length} 个引擎翻译…`
                      : '正在翻译…'
                    : state.kind === 'dict'
                      ? dictFallback
                        ? state.parts.length > 1
                          ? `正在用 ${state.parts.length} 个引擎翻译…`
                          : '正在翻译…'
                        : '正在查词…'
                      : state.kind === 'check'
                        ? '正在检查…'
                        : '正在润色…'}
                </span>
                {progressLabel ? <span className="tag">{progressLabel}</span> : null}
              </>
            ) : null}

            {state.status === 'done' && state.kind === 'translate' && state.parts.length === 1 && primaryPart ? (
              <>
                <span className="dot done" />
                <span>{primaryPart.result?.engineLabel}</span>
                {primaryPart.result ? <span className="tag">{seconds(primaryPart.result.elapsedMs)}</span> : null}
                {primaryPart.result?.cached ? <span className="tag ok">缓存命中</span> : null}
                {primaryPart.result?.notice ? <span className="tag">{primaryPart.result.notice}</span> : null}
              </>
            ) : null}

            {state.status === 'done' && state.kind === 'translate' && state.parts.length > 1 ? (
              <>
                <span className="dot done" />
                <span>已用 {state.parts.length} 个引擎翻译</span>
                <span className="tag ok">{state.parts.filter((part) => part.result).length} 个成功</span>
                {state.parts.some((part) => part.error) ? (
                  <span className="tag error">{state.parts.filter((part) => part.error).length} 个失败</span>
                ) : null}
                {primaryPart?.result?.notice ? <span className="tag">{primaryPart.result.notice}</span> : null}
              </>
            ) : null}

            {state.status === 'done' && state.kind === 'dict' ? (
              <>
                <span className="dot done" />
                <span>{state.result.engineLabel}</span>
                <span className="tag brand">词典</span>
                <span className="tag">{seconds(state.result.elapsedMs)}</span>
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

          {state.status === 'running' && state.kind === 'translate' ? renderParts(state.parts, true) : null}

          {state.status === 'running' && state.kind === 'dict' && dictFallback
            ? renderParts(state.parts, true)
            : null}

          {state.status === 'running' && state.kind === 'dict' && !dictFallback && state.text !== '' ? (
            <pre className="result-text">{state.text}</pre>
          ) : null}

          {state.status === 'running' && state.kind === 'polish' ? (
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

          {state.status === 'done' && state.kind === 'translate' ? renderParts(state.parts, false) : null}

          {state.status === 'done' && state.kind === 'dict' ? (
            <DictCard entry={state.result.entry} sections={settings.dictionary.sections} />
          ) : null}

          {state.status === 'idle' && manual ? <pre className="result-text">{manual.result}</pre> : null}

          {state.status === 'idle' && !manual ? (
            <div className="empty">
              <span className="re-title">结果会显示在这里</span>
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
                  title={
                    state.status === 'done' && state.kind === 'translate' && state.parts.length > 1
                      ? '收藏第一个成功的译文，之后在生词本页面复习'
                      : '收进生词本，之后在生词本页面复习'
                  }
                >
                  {saved ? '已收藏' : '收藏'}
                </button>
              ) : null}
              {translateText ? (
                <button type="button" className="btn ghost small" onClick={() => copyText(translateText, 'primary')}>
                  {copiedKey === 'primary' ? '已复制' : '复制'}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
