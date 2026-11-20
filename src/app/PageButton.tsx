import { useEffect, useRef, useState } from 'react'
import type { PageCommandName, PageCommandResult, PageState } from '../core/messaging'
import { isPageStateEvent } from '../core/messaging'

async function sendPageCommand(command: PageCommandName): Promise<PageCommandResult> {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
    return { ok: false, reason: '当前环境不支持网页翻译' }
  }
  try {
    const result = (await chrome.runtime.sendMessage({
      type: 'yuyi:page-command',
      command,
    })) as PageCommandResult | undefined
    if (!result || typeof result !== 'object') return { ok: false, reason: '页面没有返回网页翻译状态' }
    return result
  } catch {
    return { ok: false, reason: '无法连接到扩展后台，请重新加载扩展后再试' }
  }
}

function statusLabel(state: PageState): string {
  if (state.state === 'running') return `${state.done}/${state.total}`
  if (state.failed > 0) return `已译 ${state.done}，失败 ${state.failed}`
  return `已译 ${state.done} 段`
}

type Props = {
  onStarted?: () => void
}

export function PageButton({ onStarted }: Props = {}) {
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

  const run = async (command: PageCommandName): Promise<void> => {
    const result = await sendPageCommand(command)
    if (result.state) setStatus(result.state)
    setReason(result.ok ? '' : (result.reason ?? '网页翻译没有执行'))
    if (result.ok && command === 'translate') onStarted?.()
  }

  const running = status?.state === 'running'
  const translated = status !== null && status.done > 0 && !running
  const label = running ? `取消 ${status?.done ?? 0}/${status?.total ?? 0}` : translated ? '重译本页' : '翻译本页'
  const disabled = reason !== '' && status === null

  return (
    <>
      <button
        type="button"
        className="btn primary"
        disabled={disabled}
        title={disabled ? reason : '把当前网页的正文翻译成目标语言'}
        onClick={() => {
          void run(running ? 'cancel' : 'translate')
        }}
      >
        {label}
      </button>
      {translated ? (
        <button
          type="button"
          className="btn ghost small"
          title="还原本页译文"
          onClick={() => {
            void run('restore')
          }}
        >
          还原
        </button>
      ) : null}
      {status && status.state !== 'idle' ? <span className="hint">{statusLabel(status)}</span> : null}
      <div className="page-menu" ref={menuRef}>
        <button
          type="button"
          className="page-menu-btn"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="网页翻译设置"
          aria-label="网页翻译设置"
          onClick={() => setMenuOpen((value) => !value)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7h10" />
            <path d="M18 7h2" />
            <path d="M4 17h4" />
            <path d="M12 17h8" />
            <circle cx="16" cy="7" r="2" />
            <circle cx="10" cy="17" r="2" />
          </svg>
        </button>
        {menuOpen ? (
          <div className="page-menu-list" role="menu" aria-label="网页翻译设置">
            <span className="page-menu-title">页面显示</span>
            <button type="button" className="page-menu-item" role="menuitem" disabled title="尚未实现">
              双语显示
              <span>待实现</span>
            </button>
            <button type="button" className="page-menu-item" role="menuitem" disabled title="尚未实现">
              覆盖原文
              <span>待实现</span>
            </button>
          </div>
        ) : null}
      </div>
    </>
  )
}
