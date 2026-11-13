import { calculatePlacement } from './context'

export type BubbleView =
  | { status: 'loading' }
  | { status: 'streaming'; text: string }
  | { status: 'done'; text: string; engineLabel: string; elapsedMs: number; word: boolean }
  | { status: 'error'; message: string }

export type BubbleHandlers = {
  onCopy: (text: string) => void
  onSpeak: (text: string) => void
  onRetry: () => void
  onClose: () => void
}

export type Bubble = {
  element: HTMLElement
  ownsPath: (path: EventTarget[]) => boolean
  isOpen: () => boolean
  setSource: (text: string) => void
  render: (view: BubbleView) => void
  showAt: (anchor: { top: number; bottom: number; left: number }) => void
  reposition: () => void
  hide: () => void
  destroy: () => void
}

const STYLE = `
  :host {
    all: initial;
    position: fixed;
    z-index: 2147483646;
    left: 0;
    top: 0;
    display: none;
    font-family: system-ui, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
  }
  :host([data-open="1"]) { display: block; }
  .panel {
    width: min(340px, calc(100vw - 24px));
    max-height: min(60vh, 420px);
    overflow: auto;
    background: #ffffff;
    color: #1b2130;
    border: 1px solid #e1e6f0;
    border-radius: 12px;
    box-shadow: 0 10px 28px rgba(16, 24, 40, 0.18);
    padding: 10px 12px 8px;
    box-sizing: border-box;
    font-size: 14px;
    line-height: 1.6;
  }
  @media (prefers-color-scheme: dark) {
    .panel {
      background: #1a1d25;
      color: #e8ebf2;
      border-color: #2f3542;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
    }
    .head-label, .meta { color: #9aa4b6; }
    .btn { color: #cdd4e0; border-color: #2f3542; }
    .btn:hover { background: #232732; }
    .btn.primary { background: #6f96ff; border-color: #6f96ff; color: #10131a; }
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #667085;
    margin-bottom: 6px;
  }
  .head-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .close {
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 16px;
    line-height: 1;
    padding: 2px 4px;
    cursor: pointer;
    border-radius: 6px;
  }
  .close:hover { background: rgba(120, 130, 150, 0.14); }
  .word {
    font-size: 18px;
    font-weight: 650;
    margin-bottom: 4px;
    word-break: break-word;
  }
  .text {
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    font-family: inherit;
  }
  .text.empty { color: #8d95a5; }
  .word .text { font-size: 15px; font-weight: 400; }
  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #e1e6f0;
  }
  @media (prefers-color-scheme: dark) { .actions { border-top-color: #2f3542; } }
  .meta { flex: 1; font-size: 11px; color: #8d95a5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .btn {
    border: 1px solid #e1e6f0;
    background: transparent;
    color: #475467;
    border-radius: 7px;
    padding: 3px 9px;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
  }
  .btn:hover { background: #f1f3f9; }
  .btn.primary { background: #4c7dff; border-color: #4c7dff; color: #fff; }
  .btn[hidden] { display: none; }
  .error { color: #d92d20; font-size: 13px; }
  .dots::after {
    content: "";
    animation: yy-dots 1.2s steps(4, end) infinite;
  }
  @keyframes yy-dots { 0% { content: ""; } 25% { content: "."; } 50% { content: ".."; } 75% { content: "..."; } }
`

export function createBubble(handlers: BubbleHandlers): Bubble {
  const host = document.createElement('div')
  host.setAttribute('data-yuyi-ui', 'bubble')
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = STYLE
  const panel = document.createElement('div')
  panel.className = 'panel'
  panel.innerHTML = [
    '<div class="head"><span class="head-label"></span><button class="close" type="button" aria-label="关闭">×</button></div>',
    '<div class="body"></div>',
    '<div class="actions">',
    '<span class="meta"></span>',
    '<button class="btn" type="button" data-action="speak" hidden>朗读</button>',
    '<button class="btn" type="button" data-action="copy" hidden>复制</button>',
    '<button class="btn primary" type="button" data-action="retry" hidden>重试</button>',
    '<button class="btn" type="button" data-action="close">关闭</button>',
    '</div>',
  ].join('')
  shadow.append(style, panel)

  const headLabel = panel.querySelector('.head-label') as HTMLElement
  const body = panel.querySelector('.body') as HTMLElement
  const meta = panel.querySelector('.meta') as HTMLElement
  const speakButton = panel.querySelector('[data-action="speak"]') as HTMLButtonElement
  const copyButton = panel.querySelector('[data-action="copy"]') as HTMLButtonElement
  const retryButton = panel.querySelector('[data-action="retry"]') as HTMLButtonElement
  const closeButton = panel.querySelector('.close') as HTMLButtonElement

  let open = false
  let anchor: { top: number; bottom: number; left: number } | null = null
  let latestText = ''
  let latestSource = ''
  let frame = 0
  let mounted = false

  function mount(): void {
    if (mounted) return
    mounted = true
    document.documentElement.appendChild(host)
  }

  function position(): void {
    if (!open || !anchor) return
    const rect = panel.getBoundingClientRect()
    const placement = calculatePlacement(anchor, { width: rect.width, height: rect.height }, {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    host.style.left = `${Math.round(placement.left)}px`
    host.style.top = `${Math.round(placement.top)}px`
    host.setAttribute('data-side', placement.side)
  }

  function schedulePosition(): void {
    if (frame) return
    frame = window.requestAnimationFrame(() => {
      frame = 0
      position()
    })
  }

  function render(view: BubbleView): void {
    open = true
    host.setAttribute('data-open', '1')
    body.className = 'body'
    speakButton.hidden = true
    copyButton.hidden = true
    retryButton.hidden = true

    if (view.status === 'loading') {
      headLabel.textContent = '羽译 · 划词翻译'
      body.innerHTML = '<div class="text empty dots">正在翻译</div>'
      meta.textContent = latestSource
    } else if (view.status === 'streaming') {
      latestText = view.text
      headLabel.textContent = '羽译 · 划词翻译'
      body.innerHTML = ''
      const pre = document.createElement('pre')
      pre.className = 'text'
      pre.textContent = view.text
      body.appendChild(pre)
      meta.textContent = '生成中…'
    } else if (view.status === 'done') {
      latestText = view.text
      headLabel.textContent = '羽译 · 划词翻译'
      body.innerHTML = ''
      if (view.word) {
        const title = document.createElement('div')
        title.className = 'word'
        title.textContent = latestSource
        body.appendChild(title)
      }
      const pre = document.createElement('pre')
      pre.className = 'text'
      pre.textContent = view.text
      body.appendChild(pre)
      meta.textContent = `${view.engineLabel} · ${Math.max(1, Math.round(view.elapsedMs / 100) / 10)}s`
      speakButton.hidden = false
      copyButton.hidden = false
    } else {
      headLabel.textContent = '羽译 · 划词翻译'
      body.innerHTML = ''
      const error = document.createElement('div')
      error.className = 'error'
      error.textContent = view.message
      body.appendChild(error)
      meta.textContent = latestSource
      retryButton.hidden = false
    }
    schedulePosition()
  }

  shadow.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    const action = target?.getAttribute?.('data-action')
    if (target === closeButton || action === 'close') {
      handlers.onClose()
      return
    }
    if (action === 'copy') {
      handlers.onCopy(latestText)
      return
    }
    if (action === 'speak') {
      handlers.onSpeak(latestText)
      return
    }
    if (action === 'retry') {
      handlers.onRetry()
    }
  })

  return {
    element: host,
    ownsPath(path: EventTarget[]): boolean {
      return path.includes(host)
    },
    isOpen: () => open,
    setSource(text: string) {
      latestSource = text
    },
    render,
    showAt(nextAnchor) {
      mount()
      anchor = nextAnchor
      open = true
      host.setAttribute('data-open', '1')
      schedulePosition()
    },
    reposition: schedulePosition,
    hide() {
      open = false
      host.removeAttribute('data-open')
      anchor = null
    },
    destroy() {
      open = false
      mounted = false
      host.remove()
    },
  }
}
