import type { DictionaryEntry } from '../core/dictionary/types'
import type { DictionarySections, ThemeMode } from '../storage/settings'
import { calculatePlacement, clampBubbleWidth } from './context'
import { applyHostTheme, CONTENT_THEME_CSS } from './theme'
import { markUiHost } from './ui-mark'

export type BubbleAnchor = { top: number; bottom: number; left: number; width?: number }

export type BubbleView =
  | { status: 'loading'; label?: string }
  | { status: 'streaming'; text: string }
  | {
      status: 'done'
      text: string
      engineLabel: string
      elapsedMs: number
      word: boolean
      dictionary?: DictionaryEntry
      display?: DictionarySections
      expandable?: boolean
      cached?: boolean
      context?: string
    }
  | { status: 'error'; message: string }

export type BubbleHandlers = {
  onCopy: (text: string) => void
  onSpeak: (text: string, lang?: string) => void
  onAudio: (url: string, word: string) => void
  onSave: () => void
  onRetry: () => void
  onMoreContext: () => void
  onClose: () => void
}

export type Bubble = {
  element: HTMLElement
  ownsPath: (path: EventTarget[]) => boolean
  isOpen: () => boolean
  setSource: (text: string) => void
  setSaved: (saved: boolean) => void
  setCopied: () => void
  setTheme: (theme: ThemeMode) => void
  render: (view: BubbleView) => void
  showAt: (anchor: BubbleAnchor) => void
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
    user-select: text;
  }
  .panel::-webkit-scrollbar { width: 8px; height: 8px; }
  .panel::-webkit-scrollbar-track { background: transparent; }
  .panel::-webkit-scrollbar-thumb {
    background: var(--surface-3);
    border: 2px solid transparent;
    border-radius: 999px;
    background-clip: content-box;
  }
  .panel::-webkit-scrollbar-thumb:hover {
    background-color: var(--text-faint);
    background-clip: content-box;
  }
  .panel ::selection {
    background: color-mix(in srgb, var(--brand) 40%, transparent);
    color: var(--text);
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

  .body {
    padding: 8px 12px 12px;
    min-height: 56px;
    background: var(--brand-soft);
    border-top: 1px solid color-mix(in srgb, var(--brand) 12%, transparent);
  }
  .error-state .body { background: transparent; border-top: 0; }
  .text {
    margin: 0;
    font-family: inherit;
    font-size: 14.5px;
    line-height: 1.62;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text);
    cursor: text;
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
    background: color-mix(in srgb, var(--brand) 22%, transparent);
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
    padding: 0;
    border: 0;
    background: transparent;
    font-family: inherit;
    font-size: 10.5px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: default;
  }
  .meta[hidden] { display: none; }
  .meta[data-expandable="1"] { cursor: pointer; }
  .meta[data-expandable="1"]:hover { color: var(--text); }
  .meta-caret { margin-left: 4px; font-size: 9px; }
  .ctx {
    padding: 6px 12px 8px;
    border-top: 1px dashed color-mix(in srgb, var(--brand) 22%, transparent);
    background: var(--surface-2);
  }
  .ctx[hidden] { display: none; }
  .ctx-text {
    margin: 0;
    max-height: 120px;
    overflow: auto;
    font-family: inherit;
    font-size: 11.5px;
    line-height: 1.55;
    color: var(--text-muted);
    white-space: pre-wrap;
    word-break: break-word;
    cursor: text;
    user-select: text;
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
  .act.copied { color: var(--brand); background: var(--brand-soft); }
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

  .dict { display: flex; flex-direction: column; gap: 11px; }
  .dict-head { display: flex; flex-direction: column; gap: 7px; }
  .dict-word {
    font-size: 19px;
    line-height: 1.35;
    font-weight: 650;
    letter-spacing: 0;
    color: var(--text);
    word-break: break-word;
  }
  .dict-phonetics { display: flex; flex-wrap: wrap; gap: 5px; }
  .dict-phon {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 8px;
    border: 1px solid color-mix(in srgb, var(--brand) 16%, var(--border));
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text-muted);
    font-family: inherit;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
  }
  .dict-phon:hover { color: var(--brand); border-color: color-mix(in srgb, var(--brand) 40%, var(--border)); }
  .dict-phon-label { font-size: 10.5px; color: var(--text-faint); }
  .dict-phon:hover .dict-phon-label { color: inherit; }
  .dict-phon-audio { display: grid; place-items: center; width: 11px; height: 11px; }
  .dict-phon-audio svg { width: 11px; height: 11px; }
  .dict-sec { display: flex; flex-direction: column; gap: 5px; }
  .dict-sec h4 {
    margin: 0;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }
  .dict-sec-body { display: flex; flex-direction: column; gap: 5px; }
  .dict-tr, .dict-def, .dict-ex, .dict-phrase { margin: 0; font-size: 13.5px; line-height: 1.6; color: var(--text); word-break: break-word; }
  .dict-pos { display: inline-block; margin-right: 5px; font-size: 11px; font-weight: 600; color: var(--brand); }
  .dict-def { font-size: 12.5px; line-height: 1.55; }
  .dict-def-ex { display: block; margin-top: 2px; font-size: 11.5px; font-style: normal; color: var(--text-muted); }
  .dict-forms { display: flex; flex-wrap: wrap; gap: 4px 12px; }
  .dict-form { font-size: 12px; line-height: 1.5; color: var(--text); }
  .dict-form-name { margin-right: 5px; color: var(--text-muted); }
  .dict-ex { font-size: 12px; line-height: 1.55; }
  .dict-ex-src { display: block; color: var(--text); }
  .dict-ex-dst { display: block; color: var(--text-muted); }
  .dict-phrase { font-size: 12.5px; }
  .dict-phrase b { margin-right: 6px; font-weight: 600; color: var(--text); }
  .dict-hint { margin: 0; font-size: 12px; line-height: 1.5; color: var(--text-muted); }

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
const ICON_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
const ICON_RETRY =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.4 5.7"/><path d="M20 5.5V11h-5.6"/></svg>'
const ICON_SAVE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>'
const ICON_MORE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/></svg>'
const ICON_CLOSE =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
const ICON_ERROR =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 7.5v6"/><path d="M12 16.6v.4"/><circle cx="12" cy="12" r="9"/></svg>'

const FULL_DISPLAY: DictionarySections = {
  phonetic: true,
  translation: true,
  definition: true,
  forms: true,
  examples: true,
  phrases: true,
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function sectionBlock(title: string): { root: HTMLElement; list: HTMLElement } {
  const root = element('section', 'dict-sec')
  root.appendChild(element('h4', undefined, title))
  const list = element('div', 'dict-sec-body')
  root.appendChild(list)
  return { root, list }
}

function buildDictionaryCard(entry: DictionaryEntry, display: DictionarySections): HTMLElement {
  const card = element('div', 'dict')
  const head = element('div', 'dict-head')
  head.appendChild(element('span', 'dict-word', entry.word))

  if (display.phonetic && entry.phonetics.length > 0) {
    const row = element('div', 'dict-phonetics')
    for (const item of entry.phonetics) {
      const button = element('button', 'dict-phon')
      button.type = 'button'
      button.dataset.audio = item.audio
      button.title = '播放发音'
      if (item.label) button.appendChild(element('span', 'dict-phon-label', item.label))
      if (item.text) button.appendChild(element('span', 'dict-phon-text', item.text))
      const icon = element('span', 'dict-phon-audio')
      icon.innerHTML = ICON_SPEAK
      button.appendChild(icon)
      row.appendChild(button)
    }
    head.appendChild(row)
  }
  card.appendChild(head)

  if (display.translation && entry.translations.length > 0) {
    const block = sectionBlock(entry.direction === 'zh-en' ? '英文释义' : '中文释义')
    for (const item of entry.translations) {
      const line = element('p', 'dict-tr')
      if (item.pos) line.appendChild(element('span', 'dict-pos', item.pos))
      line.appendChild(document.createTextNode(item.text))
      block.list.appendChild(line)
    }
    card.appendChild(block.root)
  }

  if (display.definition && entry.definitions.length > 0) {
    const block = sectionBlock('英英释义')
    for (const item of entry.definitions) {
      const line = element('p', 'dict-def')
      if (item.pos) line.appendChild(element('span', 'dict-pos', item.pos))
      line.appendChild(document.createTextNode(item.text))
      if (item.example) line.appendChild(element('em', 'dict-def-ex', item.example))
      block.list.appendChild(line)
    }
    card.appendChild(block.root)
  }

  if (display.forms && entry.forms.length > 0) {
    const block = sectionBlock('词形变化')
    const row = element('div', 'dict-forms')
    for (const item of entry.forms) {
      const form = element('span', 'dict-form')
      form.appendChild(element('span', 'dict-form-name', item.name))
      form.appendChild(document.createTextNode(item.value))
      row.appendChild(form)
    }
    block.list.appendChild(row)
    card.appendChild(block.root)
  }

  if (display.examples && entry.examples.length > 0) {
    const block = sectionBlock('例句')
    for (const item of entry.examples) {
      const line = element('p', 'dict-ex')
      line.appendChild(element('span', 'dict-ex-src', item.source))
      if (item.target) line.appendChild(element('span', 'dict-ex-dst', item.target))
      block.list.appendChild(line)
    }
    card.appendChild(block.root)
  }

  if (display.phrases && entry.phrases.length > 0) {
    const block = sectionBlock('词组')
    for (const item of entry.phrases) {
      const line = element('p', 'dict-phrase')
      line.appendChild(element('b', undefined, item.phrase))
      line.appendChild(document.createTextNode(item.meaning))
      block.list.appendChild(line)
    }
    card.appendChild(block.root)
  }

  const empty =
    !(display.phonetic && entry.phonetics.length > 0) &&
    !(display.translation && entry.translations.length > 0) &&
    !(display.definition && entry.definitions.length > 0) &&
    !(display.forms && entry.forms.length > 0) &&
    !(display.examples && entry.examples.length > 0) &&
    !(display.phrases && entry.phrases.length > 0)
  if (empty) card.appendChild(element('p', 'dict-hint', '在设置 → 词典里选择要展示的内容'))

  return card
}

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
    '<div class="ctx" hidden><pre class="ctx-text"></pre></div>',
    '<div class="foot">',
    '<button class="meta" type="button" aria-expanded="false"></button>',
    '<div class="acts">',
    `<button class="act" type="button" data-action="speak" hidden>${ICON_SPEAK}朗读</button>`,
    `<button class="act" type="button" data-action="copy" hidden>${ICON_COPY}复制</button>`,
    `<button class="act" type="button" data-action="save" hidden>${ICON_SAVE}收藏</button>`,
    `<button class="act" type="button" data-action="more" hidden>${ICON_MORE}扩上下文</button>`,
    `<button class="act" type="button" data-action="retry" hidden>${ICON_RETRY}重试</button>`,
    '</div>',
    '</div>',
  ].join('')
  shadow.append(style, panel)

  const head = panel.querySelector('.head') as HTMLElement
  const body = panel.querySelector('.body') as HTMLElement
  const ctx = panel.querySelector('.ctx') as HTMLElement
  const ctxText = panel.querySelector('.ctx-text') as HTMLElement
  const foot = panel.querySelector('.foot') as HTMLElement
  const meta = panel.querySelector('.meta') as HTMLButtonElement
  const speakButton = panel.querySelector('[data-action="speak"]') as HTMLButtonElement
  const copyButton = panel.querySelector('[data-action="copy"]') as HTMLButtonElement
  const saveButton = panel.querySelector('[data-action="save"]') as HTMLButtonElement
  const moreButton = panel.querySelector('[data-action="more"]') as HTMLButtonElement
  const retryButton = panel.querySelector('[data-action="retry"]') as HTMLButtonElement

  let open = false
  let anchor: BubbleAnchor | null = null
  let latestText = ''
  let latestSource = ''
  let latestWord = ''
  let latestContext = ''
  let streamedText = ''
  let dictOpen = false
  let frame = 0
  let pinned = false
  let drag: { id: number; dx: number; dy: number } | null = null

  function mountParent(): Element {
    const fullscreen = document.fullscreenElement
    return fullscreen && !(fullscreen instanceof HTMLMediaElement) ? fullscreen : document.documentElement
  }

  function mount(): void {
    const parent = mountParent()
    if (host.parentNode !== parent) parent.appendChild(host)
  }

  function applyWidth(): void {
    if (!anchor) return
    panel.style.width = `${clampBubbleWidth(dictOpen ? undefined : anchor.width, window.innerWidth)}px`
  }

  function position(): void {
    if (!open || !anchor || pinned) return
    applyWidth()
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
    moreButton.hidden = true
    retryButton.hidden = true
    applySaved(false)
    applyCopied(false)
    latestContext = ''
    ctx.hidden = true
    ctxText.textContent = ''
    meta.hidden = true
    meta.dataset.expandable = ''
    meta.setAttribute('aria-expanded', 'false')
    meta.textContent = ''
  }

  let copiedTimer = 0

  function applyCopied(copied: boolean): void {
    window.clearTimeout(copiedTimer)
    copiedTimer = 0
    copyButton.classList.toggle('copied', copied)
    copyButton.innerHTML = `${copied ? ICON_CHECK : ICON_COPY}${copied ? '已复制' : '复制'}`
    if (copied) {
      copiedTimer = window.setTimeout(() => {
        copiedTimer = 0
        applyCopied(false)
      }, 1500)
    }
  }

  function applySaved(saved: boolean): void {
    saveButton.disabled = saved
    saveButton.innerHTML = `${ICON_SAVE}${saved ? '已收藏' : '收藏'}`
  }

  function syncFoot(): void {
    foot.hidden =
      !meta.textContent &&
      speakButton.hidden &&
      copyButton.hidden &&
      saveButton.hidden &&
      moreButton.hidden &&
      retryButton.hidden
  }

  function renderStreaming(text: string): void {
    const pre = body.firstElementChild as HTMLElement | null
    const cursor = pre?.querySelector('.cursor')
    if (pre && cursor && text.startsWith(streamedText)) {
      const added = text.slice(streamedText.length)
      if (added) pre.insertBefore(document.createTextNode(added), cursor)
      streamedText = text
      return
    }
    streamedText = text
    body.innerHTML = ''
    const next = document.createElement('pre')
    next.className = 'text'
    next.appendChild(document.createTextNode(text))
    const caret = document.createElement('span')
    caret.className = 'cursor'
    next.appendChild(caret)
    body.appendChild(next)
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
    dictOpen = false
    if (view.status !== 'streaming') streamedText = ''

    if (view.status === 'loading') {
      body.innerHTML =
        `<div class="loading"><span class="dots"><i></i><i></i><i></i></span>${view.label ?? '正在翻译'}</div><div class="skel"><i></i><i></i></div>`
    } else if (view.status === 'streaming') {
      latestText = view.text
      renderStreaming(view.text)
      meta.textContent = '生成中…'
    } else if (view.status === 'done') {
      latestText = view.text
      if (view.dictionary) {
        dictOpen = true
        latestWord = view.dictionary.word
        body.innerHTML = ''
        body.className = 'body dict-body'
        body.appendChild(buildDictionaryCard(view.dictionary, view.display ?? FULL_DISPLAY))
        applyWidth()
      } else if (view.word) {
        renderWordCard(latestSource, view.text)
      } else {
        body.innerHTML = ''
        const pre = document.createElement('pre')
        pre.className = 'text'
        pre.textContent = view.text
        body.appendChild(pre)
      }
      meta.hidden = false
      meta.textContent = `${view.engineLabel} · ${Math.max(1, Math.round(view.elapsedMs / 100) / 10)}s${view.cached ? ' · 缓存' : ''}`
      if (!view.word && view.context) {
        latestContext = view.context
        ctxText.textContent = view.context
        meta.dataset.expandable = '1'
        meta.appendChild(element('span', 'meta-caret', '▾'))
      }
      speakButton.hidden = false
      copyButton.hidden = false
      saveButton.hidden = false
      moreButton.hidden = !view.expandable
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
    const audioButton = target?.closest?.('[data-audio]') as HTMLElement | null
    if (audioButton) {
      const url = audioButton.dataset.audio ?? ''
      if (url) handlers.onAudio(url, latestWord)
      else handlers.onSpeak(latestWord, 'en')
      return
    }
    if (target?.closest?.('.meta')) {
      if (!latestContext) return
      ctx.hidden = !ctx.hidden
      meta.setAttribute('aria-expanded', String(!ctx.hidden))
      const caret = meta.querySelector('.meta-caret')
      if (caret) caret.textContent = ctx.hidden ? '▾' : '▴'
      schedulePosition()
      return
    }
    const action = (target?.closest?.('[data-action]') as HTMLElement | null)?.dataset.action
    if (action === 'copy') {
      handlers.onCopy(latestText)
      return
    }
    if (action === 'speak') {
      if (dictOpen) handlers.onSpeak(latestWord, 'en')
      else handlers.onSpeak(latestText)
      return
    }
    if (action === 'save') {
      handlers.onSave()
      return
    }
    if (action === 'more') {
      handlers.onMoreContext()
      return
    }
    if (action === 'retry') {
      handlers.onRetry()
    }
  })

  const stopSelectionHijack = (event: Event): void => {
    event.stopPropagation()
  }
  for (const type of ['mousedown', 'mouseup', 'selectstart']) {
    shadow.addEventListener(type, stopSelectionHijack, true)
  }

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
    setCopied() {
      applyCopied(true)
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
      applyWidth()
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
      pinned = false
      host.remove()
    },
  }
}
