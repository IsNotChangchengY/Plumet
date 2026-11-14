import { afterEach, describe, expect, it } from 'vitest'
import { createBubble } from '../src/content/bubble'

type Bubble = ReturnType<typeof createBubble>

const calls: string[] = []
let copied = ''

const handlers = {
  onCopy: (text: string) => {
    copied = text
    calls.push('copy')
  },
  onSpeak: () => calls.push('speak'),
  onRetry: () => calls.push('retry'),
  onClose: () => calls.push('close'),
}

let bubble: Bubble | null = null

function mount(): Bubble {
  bubble = createBubble(handlers)
  return bubble
}

function rootOf(view: Bubble): ShadowRoot {
  const root = view.element.shadowRoot
  if (!root) throw new Error('shadow root missing')
  return root
}

function partOf<T extends Element>(view: Bubble, selector: string): T {
  const node = rootOf(view).querySelector(selector)
  if (!node) throw new Error(`missing ${selector}`)
  return node as T
}

function buttonOf(view: Bubble, action: string): HTMLButtonElement {
  return partOf<HTMLButtonElement>(view, `[data-action="${action}"]`)
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 60))

afterEach(() => {
  bubble?.destroy()
  bubble = null
  calls.length = 0
  copied = ''
  document.documentElement.querySelectorAll('[data-yuyi-ui="bubble"]').forEach((node) => node.remove())
})

describe('selection bubble', () => {
  it('加载态不显示原文，底栏整条隐藏', () => {
    const view = mount()
    view.setSource('The committee has decided to postpone the release.')
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({ status: 'loading' })
    expect(partOf<HTMLElement>(view, '.meta').textContent).toBe('')
    expect(partOf<HTMLElement>(view, '.foot').hidden).toBe(true)
  })

  it('完成态显示引擎耗时与朗读/复制，且只有右上角一个关闭入口', () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({ status: 'done', text: '已推迟发布。', engineLabel: 'DeepSeek', elapsedMs: 1400, word: false })
    expect(partOf<HTMLElement>(view, '.meta').textContent).toBe('DeepSeek · 1.4s')
    expect(partOf<HTMLElement>(view, '.foot').hidden).toBe(false)
    expect(buttonOf(view, 'copy').hidden).toBe(false)
    expect(buttonOf(view, 'speak').hidden).toBe(false)
    expect(rootOf(view).querySelectorAll('.close').length).toBe(1)
    expect(rootOf(view).querySelector('[data-action="close"]')).toBe(null)
  })

  it('错误态只留重试，不显示原文', () => {
    const view = mount()
    view.setSource('The committee has decided to postpone the release.')
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({ status: 'error', message: '请求超时，请稍后重试' })
    expect(partOf<HTMLElement>(view, '.meta').textContent).toBe('')
    expect(buttonOf(view, 'retry').hidden).toBe(false)
    expect(buttonOf(view, 'copy').hidden).toBe(true)
  })

  it('单词卡仍以原词为标题', () => {
    const view = mount()
    view.setSource('ephemeral')
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({ status: 'done', text: '短暂的', engineLabel: 'DeepSeek', elapsedMs: 900, word: true })
    expect(partOf<HTMLElement>(view, '.word-h').textContent).toBe('ephemeral')
    expect(partOf<HTMLElement>(view, '.word-def').textContent).toBe('短暂的')
  })

  it('点关闭图标里的 svg 也能关掉', () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100 })
    const path = partOf<SVGPathElement>(view, '.close svg path')
    path.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(calls).toEqual(['close'])
  })

  it('点复制图标里的 svg 也能复制译文', () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({ status: 'done', text: '已推迟发布。', engineLabel: 'DeepSeek', elapsedMs: 1400, word: false })
    const path = buttonOf(view, 'copy').querySelector('svg')
    path?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(calls).toEqual(['copy'])
    expect(copied).toBe('已推迟发布。')
  })

  it('默认出现在选区下方', async () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({ status: 'done', text: '已推迟发布。', engineLabel: 'DeepSeek', elapsedMs: 1400, word: false })
    await flush()
    expect(view.element.style.top).toBe('228px')
    expect(view.element.style.left).toBe('100px')
  })

  it('拖动标题栏后固定位置，关掉重开才恢复跟随选区', async () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({ status: 'done', text: '已推迟发布。', engineLabel: 'DeepSeek', elapsedMs: 1400, word: false })
    await flush()

    const head = partOf<HTMLElement>(view, '.head')
    head.setPointerCapture = () => undefined
    head.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 100, clientY: 100 }))
    head.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 160, clientY: 190 }))
    head.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 160, clientY: 190 }))
    expect(view.element.style.left).toBe('60px')
    expect(view.element.style.top).toBe('90px')

    view.showAt({ top: 300, bottom: 320, left: 120 })
    await flush()
    expect(view.element.style.left).toBe('60px')
    expect(view.element.style.top).toBe('90px')

    view.hide()
    view.showAt({ top: 300, bottom: 320, left: 120 })
    view.render({ status: 'done', text: '已推迟发布。', engineLabel: 'DeepSeek', elapsedMs: 1400, word: false })
    await flush()
    expect(view.element.style.top).toBe('328px')
  })
})
