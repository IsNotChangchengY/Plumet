import type { PageState } from '../../core/messaging'
import { markUiHost } from '../ui-mark'

export type PillHandlers = {
  onCancel: () => void
  onRetry: () => void
  onRestore: () => void
  onClose: () => void
}

export type Pill = {
  element: HTMLElement
  render: (state: PageState) => void
  show: () => void
  hide: () => void
  destroy: () => void
}

const STYLE = `
  :host {
    all: initial;
    position: fixed;
    z-index: 2147483646;
    right: 16px;
    bottom: 16px;
    display: none;
    font-family: system-ui, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
  }
  :host([data-open="1"]) { display: block; }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: min(460px, calc(100vw - 32px));
    padding: 8px 10px;
    box-sizing: border-box;
    border: 1px solid #e1e6f0;
    border-radius: 12px;
    background: #ffffff;
    color: #1b2130;
    box-shadow: 0 8px 24px rgba(16, 24, 40, 0.18);
    font-size: 13px;
    line-height: 1.4;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #4c7dff;
    flex: none;
  }
  :host([data-state="done"]) .dot { background: #2f9e6a; }
  :host([data-state="error"]) .dot { background: #d9534f; }
  :host([data-state="cancelled"]) .dot { background: #98a2b3; }
  .text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button {
    flex: none;
    border: 1px solid #e1e6f0;
    border-radius: 8px;
    background: transparent;
    color: #4c7dff;
    font: inherit;
    font-size: 12px;
    padding: 3px 8px;
    cursor: pointer;
  }
  button:hover { background: #eef3ff; }
  button.close { border-color: transparent; color: #98a2b3; padding: 2px 6px; }
  @media (prefers-color-scheme: dark) {
    .bar { background: #1a1d25; color: #e8ebf2; border-color: #2f3542; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55); }
    button { border-color: #2f3542; color: #9db6ff; }
    button:hover { background: #232732; }
    .text { color: #cdd4e0; }
  }
`

function statusText(state: PageState): string {
  const failed = state.failed > 0 ? `，${state.failed} 段失败` : ''
  if (state.state === 'running') return `翻译中 ${state.done}/${state.total}`
  if (state.state === 'cancelled') return `已停止 ${state.done}/${state.total}${failed}`
  if (state.state === 'error') return state.message ?? '网页翻译失败'
  const engine = state.engineLabel ? ` · ${state.engineLabel}` : ''
  if (state.message) return `${state.message}${failed}`
  return `已译 ${state.done} 段${failed}${engine}`
}

export function createPill(handlers: PillHandlers): Pill {
  const host = document.createElement('div')
  markUiHost(host, 'pill')
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = [
    `<style>${STYLE}</style>`,
    '<div class="bar">',
    '<span class="dot"></span>',
    '<span class="text"></span>',
    '<button type="button" data-action="cancel">取消</button>',
    '<button type="button" data-action="retry" hidden>重试失败</button>',
    '<button type="button" data-action="restore" hidden>还原本页</button>',
    '<button type="button" class="close" data-action="close" aria-label="关闭">×</button>',
    '</div>',
  ].join('')

  const text = shadow.querySelector('.text')
  const buttons: Record<string, HTMLButtonElement | null> = {
    cancel: shadow.querySelector('button[data-action="cancel"]'),
    retry: shadow.querySelector('button[data-action="retry"]'),
    restore: shadow.querySelector('button[data-action="restore"]'),
  }

  const setVisible = (button: HTMLButtonElement | null, visible: boolean): void => {
    if (button) button.hidden = !visible
  }

  shadow.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const action = target.getAttribute('data-action')
    if (!action) return
    event.preventDefault()
    event.stopPropagation()
    if (action === 'cancel') handlers.onCancel()
    else if (action === 'retry') handlers.onRetry()
    else if (action === 'restore') handlers.onRestore()
    else if (action === 'close') handlers.onClose()
  })

  document.documentElement.appendChild(host)

  const show = (): void => {
    host.setAttribute('data-open', '1')
  }

  const hide = (): void => {
    host.removeAttribute('data-open')
  }

  const render = (state: PageState): void => {
    host.setAttribute('data-state', state.state)
    if (text) text.textContent = statusText(state)
    setVisible(buttons.cancel, state.state === 'running')
    setVisible(buttons.retry, state.failed > 0 && state.state !== 'running')
    setVisible(buttons.restore, state.total > 0 && state.state !== 'running')
    if (state.state !== 'idle') show()
  }

  const destroy = (): void => {
    host.remove()
  }

  return { element: host, render, show, hide, destroy }
}
