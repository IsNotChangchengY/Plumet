import { useEffect, useState } from 'react'
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

export function PageButton() {
  const [status, setStatus] = useState<PageState | null>(null)
  const [reason, setReason] = useState('')

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
  }

  const running = status?.state === 'running'
  const translated = status !== null && status.done > 0 && !running
  const label = running ? `取消 ${status?.done ?? 0}/${status?.total ?? 0}` : translated ? '重译本页' : '翻译本页'
  const disabled = reason !== '' && status === null

  return (
    <>
      <button
        type="button"
        className="btn ghost small"
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
    </>
  )
}
