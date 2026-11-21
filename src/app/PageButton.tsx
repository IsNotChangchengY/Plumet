import { useEffect, useRef, useState } from 'react'
import type { PageCommandName, PageCommandResult, PageState } from '../core/messaging'
import { isPageStateEvent } from '../core/messaging'
import type { PageMode } from '../storage/settings'

async function sendPageCommand(command: PageCommandName, mode?: PageMode): Promise<PageCommandResult> {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
    return { ok: false, reason: '当前环境不支持网页翻译' }
  }
  try {
    const result = (await chrome.runtime.sendMessage({
      type: 'yuyi:page-command',
      command,
      mode,
    })) as PageCommandResult | undefined
    if (!result || typeof result !== 'object') return { ok: false, reason: '页面没有返回网页翻译状态' }
    return result
  } catch {
    return { ok: false, reason: '无法连接到扩展后台，请重新加载扩展后再试' }
  }
}

function statusLabel(state: PageState): string {
  if (state.state === 'running') return state.done + '/' + state.total
  if (state.failed > 0) return '已译 ' + state.done + '，失败 ' + state.failed
  return '已译 ' + state.done + ' 段'
}

const MODE_OPTIONS: { value: PageMode; label: string }[] = [
  { value: 'bilingual', label: '双语显示' },
  { value: 'replace', label: '覆盖原文' },
]

type Props = {
  mode?: PageMode
  onModeChange?: (mode: PageMode) => void
  onStarted?: () => void
}

export function PageButton({ mode = 'bilingual', onModeChange, onStarted }: Props = {}) {
  const [status, setStatus] = useState<PageState | null>(null)
  const [reason, setReason] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  useEffect(() => {
    let alive = true
    void sendPageCommand('status').then((result) => {
      if (!alive) return
      if (result.state) setStatus(result.state)
      if (!result.ok) setReason(result.reason ?? '')
    })
    const listener = (message: unknown): void => {
      if (isPageStateEvent(message)) setStatus(message.state)
    }
    try {
      chrome.runtime.onMessage.addListener(listener)
    } catch {
      return () => undefined
    }
    return () => {
      alive = false
      try {
        chrome.runtime.onMessage.removeListener(listener)
      } catch {
        // 忽略移除失败
      }
    }
  }, [])

  const run = async (command: PageCommandName, nextMode?: PageMode): Promise<void> => {
    const result = await sendPageCommand(command, nextMode)
    if (result.state) setStatus(result.state)
    setReason(result.ok ? '' : (result.reason ?? '网页翻译没有执行'))
    if (result.ok && command === 'translate') onStarted?.()
  }

  const running = status?.state === 'running'
  const translated = status !== null && status.done > 0 && !running
  const activeMode = status && status.state !== 'idle' ? status.mode : mode
  const label = running
    ? '取消 ' + (status?.done ?? 0) + '/' + (status?.total ?? 0)
    : translated
      ? '重译本页'
      : '翻译本页'
  const disabled = reason !== '' && status === null
  const title = disabled ? reason : translated ? '重新翻译当前网页' : '把当前网页的正文翻译成目标语言'

  const selectMode = (next: PageMode): void => {
    setMenuOpen(false)
    if (next === activeMode) return
    onModeChange?.(next)
    if (status && status.state !== 'idle') void run('mode', next)
  }

  return (
    <div className="page-ctl" ref={menuRef}>
      <button
        type="button"
        className="page-run"
        disabled={disabled}
        title={title}
        onClick={() => {
          void run(running ? 'cancel' : 'translate')
        }}
      >
        {label}
      </button>
      <button
        type="button"
        className="page-more"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="网页翻译设置"
        aria-label="网页翻译设置"
        onClick={() => setMenuOpen((value) => !value)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {menuOpen ? (
        <div className="page-menu-list" role="menu" aria-label="网页翻译设置">
          <div className="page-menu-head">
            <span className="page-menu-title">页面显示</span>
            {status && status.state !== 'idle' ? <span className="page-menu-count">{statusLabel(status)}</span> : null}
          </div>
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="page-menu-item"
              role="menuitemradio"
              aria-checked={activeMode === option.value}
              onClick={() => selectMode(option.value)}
            >
              <span>{option.label}</span>
              <span className="page-menu-check" aria-hidden="true">
                {activeMode === option.value ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7" />
                  </svg>
                ) : null}
              </span>
            </button>
          ))}
          {translated ? (
            <span className="page-menu-sep" role="separator" />
          ) : null}
          {translated ? (
            <button
              type="button"
              className="page-menu-item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                void run('restore')
              }}
            >
              <span>还原本页</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
