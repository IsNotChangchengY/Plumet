import type { ThemeMode } from '../storage/settings'
import { calculatePlacement } from './context'
import { applyHostTheme, CONTENT_THEME_CSS } from './theme'
import { markUiHost } from './ui-mark'

export type BubbleView =
  | { status: 'loading' }
  | { status: 'streaming'; text: string }
  | { status: 'done'; text: string; engineLabel: string; elapsedMs: number; word: boolean }
  | { status: 'error'; message: string }

export type BubbleHandlers = {
  onCopy: (text: string) => void
  onSpeak: (text: string) => void
  onSave: () => void
  onRetry: () => void
  onClose: () => void
}

export type Bubble = {
  element: HTMLElement
  ownsPath: (path: EventTarget[]) => boolean
  isOpen: () => boolean
  setSource: (text: string) => void
  setSaved: (saved: boolean) => void
  setTheme: (theme: ThemeMode) => void
  render: (view: BubbleView) => void
  showAt: (anchor: { top: number; bottom: number; left: number }) => void
  reposition: () => void
  hide: () => void
  destroy: () => void
}

const STYLE = `
  ${CONTENT_THEME_CSS}

  :host {
    all: initial;
    position: fixed;
    z-index: 2147483646;
    left: 0;
    top: 0;
    display: none;
    font-family: var(--font);
  }
  :host([data-open="1"]) { display: block; }

  .panel {
    width: min(340px, calc(100vw - 24px));
    max-height: min(60vh, 420px);
    overflow: auto;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    box-sizing: border-box;
    font-size: 13px;
    line-height: 1.6;
  }
  :host([data-open="1"]) .panel {
    animation: yy-pop var(--dur-pop) var(--ease-pop) both;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px 0;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .head.dragging { cursor: grabbing; }
  .title {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 12px;
    color: var(--text-muted);
  }
  .feather {
    width: 13px;
    height: 13px;
    flex: none;
    border-radius: 3px;
    background: var(--brand-grad);
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .close {
    width: 22px;
    height: 22px;
    flex: none;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }
  .close:hover { background: var(--surface-2); color: var(--text); }

  .body { padding: 8px 12px 12px; min-height: 56px; }
  .text {
    margin: 0;
    font-family: inherit;
    font-size: 14.5px;
    line-height: 1.62;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text);
  }
  .text.empty { color: var(--text-faint); }

  .loading {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 22px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .dots { display: inline-flex; align-items: center; gap: 4px; }
  .dots i {
    width: 5px;
    height: 5px;
    display: block;
    border-radius: 50%;
    background: var(--brand);
    animation: yy-breathe 1.2s var(--ease) infinite;
  }
  .dots i:nth-child(2) { animation-delay: 0.16s; }
  .dots i:nth-child(3) { animation-delay: 0.32s; }
  .skel { display: flex; flex-direction: column; gap: 7px; margin-top: 11px; }
  .skel i {
    display: block;
    height: 8px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .skel i:nth-child(1) { width: 100%; }
  .skel i:nth-child(2) { width: 72%; }

  .cursor {
    display: inline-block;
    width: 2px;
    height: 1.02em;
    vertical-align: -0.16em;
    margin-left: 2px;
    border-radius: 1px;
    background: var(--brand);
    animation: yy-blink 1s steps(1, end) infinite;
  }

  .word-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .word-h {
    font-size: 19px;
    line-height: 1.35;
    font-weight: 650;
    letter-spacing: 0;
    color: var(--text);
    word-break: break-word;
  }
  .word-def { font-size: 14px; line-height: 1.6; margin-top: 10px; }

  .error { display: flex; align-items: center; gap: 8px; }
  .err-ico {
    width: 24px;
    height: 24px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: var(--radius-sm);
    background: var(--danger-soft);
    color: var(--danger);
  }
  .err-text { font-size: 12.5px; line-height: 1.5; color: var(--text); }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--border);
    background: linear-gradient(180deg, rgba(0, 0, 0, 0), var(--surface-2));
  }
  .foot[hidden] { display: none; }
  .error-state .foot { background: transparent; }
  .meta {
    flex: 1;
    min-width: 0;
    font-size: 10.5px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .acts { display: flex; align-items: center; gap: 1px; flex: none; }
  .act {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
    height: 24px;
    padding: 0 5px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font-family: inherit;
    font-size: 10.5px;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }
  .act:hover { background: var(--surface-3); color: var(--text); }
  .act[hidden] { display: none; }
  .act:disabled { color: var(--text-faint); cursor: default; background: transparent; }
  .act svg { width: 11px; height: 11px; }

  @keyframes yy-pop {
    from { opacity: 0; transform: scale(0.96) translateY(6px); }
    to { opacity: 1; transform: none; }
  }
  @keyframes yy-breathe {
    0%, 100% { opacity: 0.32; transform: translateY(0); }
    50% { opacity: 1; transform: translateY(-2px); }
  }
  @keyframes yy-blink {
    0%, 58% { opacity: 1; }
    59%, 100% { opacity: 0.34; }
  }

  @media (prefers-reduced-motion: reduce) {
    :host([data-open="1"]) .panel { animation: none; }
    .dots i, .cursor { animation: none; opacity: 1; }
    .close, .act { transition: none; }
  }
`

const ICON_SPEAK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a4.5 4.5 0 0 1 0 7"/></svg>'
const ICON_COPY =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg>'
const ICON_RETRY =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.4 5.7"/><path d="M20 5.5V11h-5.6"/></svg>'
const ICON_SAVE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>'
const ICON_CLOSE =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
const ICON_ERROR =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 7.5v6"/><path d="M12 16.6v.4"/><circle cx="12" cy="12" r="9"/></svg>'

export function createBubble(handlers: BubbleHandlers): Bubble {
  const host = document.createElement('div')
  markUiHost(host, 'bubble')
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = STYLE
  const panel = document.createElement('div')
  panel.className = 'panel'
  panel.innerHTML = [
    '<div class="head">',
    '<div class="title"><span class="feather"></span><span class="label">羽译 · 划词翻译</span></div>',
    `<button class="close" type="button" aria-label="关闭">${ICON_CLOSE}</button>`,
    '</div>',
    '<div class="body"></div>',
    '<div class="foot">',
    '<span class="meta"></span>',
    '<div class="acts">',
    `<button class="act" type="button" data-action="speak" hidden>${ICON_SPEAK}朗读</button>`,
    `<button class="act" type="button" data-action="copy" hidden>${ICON_COPY}复制</button>`,
    `<button class="act" type="button" data-action="save" hidden>${ICON_SAVE}收藏</button>`,
    `<button class="act" type="button" data-action="retry" hidden>${ICON_RETRY}重试</button>`,
    '</div>',
    '</div>',
  ].join('')
  shadow.append(style, panel)

  const head = panel.querySelector('.head') as HTMLElement
  const body = panel.querySelector('.body') as HTMLElement
  const foot = panel.querySelector('.foot') as HTMLElement
  const meta = panel.querySelector('.meta') as HTMLElement
  const speakButton = panel.querySelector('[data-action="speak"]') as HTMLButtonElement
  const copyButton = panel.querySelector('[data-action="copy"]') as HTMLButtonElement
  const saveButton = panel.querySelector('[data-action="save"]') as HTMLButtonElement
  const retryButton = panel.querySelector('[data-action="retry"]') as HTMLButtonElement

  let open = false
  let anchor: { top: number; bottom: number; left: number } | null = null
  let latestText = ''
  let latestSource = ''
  let frame = 0
  let mounted = false
  let pinned = false
  let drag: { id: number; dx: number; dy: number } | null = null

  function mount(): void {
    if (mounted) return
    mounted = true
    document.documentElement.appendChild(host)
  }

  function position(): void {
    if (!open || !anchor || pinned) return
    const rect = panel.getBoundingClientRect()
    const placement = calculatePlacement(
      anchor,
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
      { prefer: 'below' },
    )
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

  function resetActions(): void {
    speakButton.hidden = true
    copyButton.hidden = true
    saveButton.hidden = true
    retryButton.hidden = true
    applySaved(false)
    meta.textContent = ''
  }

  function applySaved(saved: boolean): void {
    saveButton.disabled = saved
    saveButton.innerHTML = `${ICON_SAVE}${saved ? '已收藏' : '收藏'}`
  }

  function syncFoot(): void {
    foot.hidden =
      !meta.textContent && speakButton.hidden && copyButton.hidden && saveButton.hidden && retryButton.hidden
  }

  function renderStreaming(text: string): void {
    body.innerHTML = ''
    const pre = document.createElement('pre')
    pre.className = 'text'
    pre.textContent = text
    const cursor = document.createElement('span')
    cursor.className = 'cursor'
    pre.appendChild(cursor)
    body.appendChild(pre)
  }

  function renderWordCard(source: string, text: string): void {
    body.innerHTML = ''
    body.className = 'body word-card'
    const line = document.createElement('div')
    line.className = 'word-line'
    const title = document.createElement('span')
    title.className = 'word-h'
    title.textContent = source
    line.appendChild(title)
    body.appendChild(line)
    const def = document.createElement('pre')
    def.className = 'text word-def'
    def.textContent = text
    body.appendChild(def)
  }

  function render(view: BubbleView): void {
    open = true
    host.setAttribute('data-open', '1')
    body.className = 'body'
    panel.className = 'panel'
    resetActions()

    if (view.status === 'loading') {
      body.innerHTML =
        '<div class="loading"><span class="dots"><i></i><i></i><i></i></span>正在翻译</div><div class="skel"><i></i><i></i></div>'
    } else if (view.status === 'streaming') {
      latestText = view.text
      renderStreaming(view.text)
      meta.textContent = '生成中…'
    } else if (view.status === 'done') {
      latestText = view.text
      if (view.word) {
        renderWordCard(latestSource, view.text)
      } else {
        body.innerHTML = ''
        const pre = document.createElement('pre')
        pre.className = 'text'
        pre.textContent = view.text
        body.appendChild(pre)
      }
      meta.textContent = `${view.engineLabel} · ${Math.max(1, Math.round(view.elapsedMs / 100) / 10)}s`
      speakButton.hidden = false
      copyButton.hidden = false
      saveButton.hidden = false
    } else {
      panel.className = 'panel error-state'
      body.innerHTML = ''
      const error = document.createElement('div')
      error.className = 'error'
      error.innerHTML = `<span class="err-ico">${ICON_ERROR}</span><span class="err-text"></span>`
      const message = error.querySelector('.err-text') as HTMLElement
      message.textContent = view.message
      body.appendChild(error)
      retryButton.hidden = false
    }
    syncFoot()
    schedulePosition()
  }

  function startDrag(event: PointerEvent): void {
    if (event.button !== 0) return
    const target = event.target as Element | null
    if (target?.closest?.('.close')) return
    const rect = host.getBoundingClientRect()
    drag = { id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top }
    head.classList.add('dragging')
    head.setPointerCapture(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
  }

  function moveDrag(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.id) return
    pinned = true
    const rect = panel.getBoundingClientRect()
    const left = Math.min(Math.max(4, event.clientX - drag.dx), Math.max(4, window.innerWidth - rect.width - 4))
    const top = Math.min(Math.max(4, event.clientY - drag.dy), Math.max(4, window.innerHeight - rect.height - 4))
    host.style.left = `${Math.round(left)}px`
    host.style.top = `${Math.round(top)}px`
    event.stopPropagation()
  }

  function endDrag(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.id) return
    drag = null
    head.classList.remove('dragging')
  }

  head.addEventListener('pointerdown', startDrag)
  head.addEventListener('pointermove', moveDrag)
  head.addEventListener('pointerup', endDrag)
  head.addEventListener('pointercancel', endDrag)

  shadow.addEventListener('click', (event) => {
    const target = event.target as Element | null
    if (target?.closest?.('.close')) {
      handlers.onClose()
      return
    }
    const action = (target?.closest?.('[data-action]') as HTMLElement | null)?.dataset.action
    if (action === 'copy') {
      handlers.onCopy(latestText)
      return
    }
    if (action === 'speak') {
      handlers.onSpeak(latestText)
      return
    }
    if (action === 'save') {
      handlers.onSave()
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
    setSaved(saved: boolean) {
      applySaved(saved)
    },
    setTheme(theme: ThemeMode) {
      applyHostTheme(host, theme)
    },
    render,
    showAt(nextAnchor) {
      mount()
      if (!open) pinned = false
      anchor = nextAnchor
      open = true
      host.setAttribute('data-open', '1')
      schedulePosition()
    },
    reposition: schedulePosition,
    hide() {
      open = false
      pinned = false
      drag = null
      head.classList.remove('dragging')
      host.removeAttribute('data-open')
      anchor = null
    },
    destroy() {
      open = false
      mounted = false
      pinned = false
      host.remove()
    },
  }
}
