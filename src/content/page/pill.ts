import type { PageState } from '../../core/messaging'
import type { ThemeMode } from '../../storage/settings'
import { applyHostTheme, CONTENT_THEME_CSS } from '../theme'
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
  setTheme: (theme: ThemeMode) => void
  show: () => void
  hide: () => void
  destroy: () => void
}

const STYLE = `
  ${CONTENT_THEME_CSS}

  :host {
    all: initial;
    position: fixed;
    z-index: 2147483646;
    right: 16px;
    bottom: 16px;
    display: none;
    font-family: var(--font);
  }
  :host([data-open="1"]) { display: block; }

  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: min(460px, calc(100vw - 32px));
    padding: 8px 10px;
    box-sizing: border-box;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-md);
    font-size: 12px;
    line-height: 1.4;
  }
  .dot {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    background: var(--brand);
  }
  :host([data-state="done"]) .dot { background: var(--ok); }
  :host([data-state="error"]) .dot { background: var(--danger); }
  :host([data-state="cancelled"]) .dot { background: var(--text-faint); }
  :host([data-state="running"]) .dot { animation: yy-pill-pulse 1.4s var(--ease) infinite; }

  .text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  button {
    flex: none;
    height: 24px;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font-family: inherit;
    font-size: 11.5px;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
  }
  button:hover { background: var(--surface-2); color: var(--text); border-color: var(--brand); }
  button.close {
    padding: 0 6px;
    border-color: transparent;
    color: var(--text-faint);
  }
  button.close:hover { background: var(--surface-2); color: var(--text); border-color: transparent; }

  @keyframes yy-pill-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.55; transform: scale(0.86); }
  }
  @media (prefers-reduced-motion: reduce) {
    :host([data-state="running"]) .dot { animation: none; }
    button { transition: none; }
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

  return {
    element: host,
    render,
    setTheme(theme: ThemeMode) {
      applyHostTheme(host, theme)
    },
    show,
    hide,
    destroy,
  }
}
