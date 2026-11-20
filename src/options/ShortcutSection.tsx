import { useEffect, useState } from 'react'
import { SectionTitle } from '../app/SectionTitle'
import type { ShortcutAction, ShortcutBinding, ShortcutSettings } from '../core/shortcuts'
import {
  defaultShortcuts,
  isDefaultShortcut,
  isModifierCode,
  sameShortcut,
  shortcutFromEvent,
  shortcutLabels,
  validateShortcut,
} from '../core/shortcuts'
import type { Settings } from '../storage/settings'

const ROWS: { action: ShortcutAction; label: string }[] = [
  { action: 'selection', label: '翻译选中内容' },
  { action: 'page', label: '翻译当前页面' },
]

const ACTION_LABELS: Record<ShortcutAction, string> = {
  selection: '翻译选中内容',
  page: '翻译当前页面',
}

type Props = {
  settings: Settings
  onPatch: (patch: Partial<Settings>) => void
}

function conflictReason(
  action: ShortcutAction,
  candidate: ShortcutBinding,
  shortcuts: ShortcutSettings,
): string {
  const other: ShortcutAction = action === 'selection' ? 'page' : 'selection'
  const otherBinding = shortcuts[other]
  if (otherBinding && sameShortcut(candidate, otherBinding)) {
    return `与「${ACTION_LABELS[other]}」的快捷键重复`
  }
  return ''
}

function Chips({ binding }: { binding: ShortcutBinding }) {
  return (
    <>
      {shortcutLabels(binding).flatMap((label, index) => {
        const chip = (
          <span className="kbd" key={`key-${label}-${index}`}>
            {label}
          </span>
        )
        if (index === 0) return [chip]
        return [
          <span className="shortcut-plus" key={`plus-${index}`} aria-hidden="true">
            +
          </span>,
          chip,
        ]
      })}
    </>
  )
}

export function ShortcutSection({ settings, onPatch }: Props) {
  const [recording, setRecording] = useState<ShortcutAction | null>(null)
  const [error, setError] = useState<{ action: ShortcutAction; message: string } | null>(null)

  useEffect(() => {
    if (!recording) return
    const action = recording

    const commit = (next: ShortcutBinding | null): void => {
      onPatch({ shortcuts: { ...settings.shortcuts, [action]: next } })
      setRecording(null)
      setError(null)
    }

    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      if (event.repeat || event.isComposing) return
      if (event.key === 'Escape') {
        setRecording(null)
        setError(null)
        return
      }
      const plain = !event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey
      if (plain && (event.key === 'Backspace' || event.key === 'Delete')) {
        commit(null)
        return
      }
      if (isModifierCode(event.code)) return
      const candidate = shortcutFromEvent(event)
      if (!candidate) {
        setError({ action, message: '这个键不能用作快捷键' })
        return
      }
      const problem = validateShortcut(candidate)
      if (problem) {
        setError({ action, message: problem })
        return
      }
      const conflict = conflictReason(action, candidate, settings.shortcuts)
      if (conflict) {
        setError({ action, message: conflict })
        return
      }
      commit(candidate)
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, settings.shortcuts, onPatch])

  const reset = (action: ShortcutAction): void => {
    const fallback = defaultShortcuts()[action]
    if (!fallback) return
    const conflict = conflictReason(action, fallback, settings.shortcuts)
    if (conflict) {
      setError({ action, message: conflict })
      return
    }
    onPatch({ shortcuts: { ...settings.shortcuts, [action]: fallback } })
    setRecording(null)
    setError(null)
  }

  return (
    <section className="card section">
      <SectionTitle icon="type">快捷键</SectionTitle>
      <p className="hint">点「修改」后按下组合键；自定义快捷键在网页有焦点时生效。</p>
      {ROWS.map(({ action, label }) => {
        const binding = settings.shortcuts[action]
        const isRecording = recording === action
        const rowError = error?.action === action ? error.message : ''
        return (
          <div className="kv-row shortcut-row" key={action}>
            <span className="k">{label}</span>
            <span className="d shortcut-cell">
              {isRecording ? (
                <span className="shortcut-live">按下新的快捷键…</span>
              ) : binding ? (
                <Chips binding={binding} />
              ) : (
                <span className="shortcut-empty">未设置</span>
              )}
              <span className="shortcut-acts">
                {isRecording ? (
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => {
                      setRecording(null)
                      setError(null)
                    }}
                  >
                    取消
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => {
                      setRecording(action)
                      setError(null)
                    }}
                  >
                    修改
                  </button>
                )}
                {!isRecording && !isDefaultShortcut(action, binding) ? (
                  <button type="button" className="btn ghost small" onClick={() => reset(action)}>
                    恢复默认
                  </button>
                ) : null}
              </span>
              {rowError ? <span className="shortcut-error">{rowError}</span> : null}
            </span>
          </div>
        )
      })}
      <p className="hint">浏览器占用的组合不能录入；录制时按 Backspace 清除当前快捷键。</p>
    </section>
  )
}
