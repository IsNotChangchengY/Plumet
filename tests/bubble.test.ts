import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBubble } from '../src/content/bubble'
import { clampBubbleWidth } from '../src/content/context'

type Bubble = ReturnType<typeof createBubble>

const calls: string[] = []
let copied = ''
let spoken: { text: string; lang?: string } | null = null
let played = ''

const handlers = {
  onCopy: (text: string) => {
    copied = text
    calls.push('copy')
  },
  onSpeak: (text: string, lang?: string) => {
    spoken = { text, lang }
    calls.push('speak')
  },
  onAudio: (url: string) => {
    played = url
    calls.push('audio')
  },
  onSave: () => calls.push('save'),
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
  spoken = null
  played = ''
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

  it('完成态显示引擎耗时与朗读/复制/收藏，且只有右上角一个关闭入口', () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({ status: 'done', text: '已推迟发布。', engineLabel: 'DeepSeek', elapsedMs: 1400, word: false })
    expect(partOf<HTMLElement>(view, '.meta').textContent).toBe('DeepSeek · 1.4s')
    expect(partOf<HTMLElement>(view, '.foot').hidden).toBe(false)
    expect(buttonOf(view, 'copy').hidden).toBe(false)
    expect(buttonOf(view, 'speak').hidden).toBe(false)
    expect(buttonOf(view, 'save').hidden).toBe(false)
    expect(rootOf(view).querySelectorAll('.close').length).toBe(1)
    expect(rootOf(view).querySelector('[data-action="close"]')).toBe(null)
  })

  it('收藏按钮触发 onSave，收藏后按钮变已收藏并禁用', () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({ status: 'done', text: '已推迟发布。', engineLabel: 'DeepSeek', elapsedMs: 1400, word: false })
    buttonOf(view, 'save').click()
    expect(calls).toEqual(['save'])
    view.setSaved(true)
    expect(buttonOf(view, 'save').disabled).toBe(true)
    expect(buttonOf(view, 'save').textContent).toContain('已收藏')
    view.render({ status: 'loading' })
    expect(buttonOf(view, 'save').hidden).toBe(true)
    expect(buttonOf(view, 'save').disabled).toBe(false)
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

  it('词典卡展示音标、释义与词形，按设置裁剪', () => {
    const view = mount()
    view.setSource('hello')
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({
      status: 'done',
      text: 'int. 喂，你好',
      engineLabel: '有道词典',
      elapsedMs: 800,
      word: true,
      dictionary: {
        word: 'hello',
        direction: 'en-zh',
        phonetics: [{ label: '英', text: 'həˈləʊ', audio: 'https://dict.youdao.com/dictvoice?audio=hello&type=1' }],
        translations: [{ pos: 'int.', text: '喂，你好' }],
        definitions: [],
        forms: [{ name: '复数', value: 'hellos' }],
        examples: [],
        phrases: [],
      },
      display: {
        phonetic: true,
        translation: true,
        definition: true,
        forms: true,
        examples: true,
        phrases: true,
      },
    })
    expect(partOf<HTMLElement>(view, '.dict-word').textContent).toBe('hello')
    expect(partOf<HTMLElement>(view, '.dict-phon').textContent).toContain('həˈləʊ')
    expect(partOf<HTMLElement>(view, '.dict-tr').textContent).toBe('int.喂，你好')
    expect(partOf<HTMLElement>(view, '.dict-form').textContent).toContain('hellos')
    expect(rootOf(view).querySelector('.dict-def')).toBe(null)
  })

  it('词典卡点音标按钮播放发音，底栏朗读读单词', () => {
    const view = mount()
    view.setSource('hello')
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({
      status: 'done',
      text: 'int. 喂，你好',
      engineLabel: '有道词典',
      elapsedMs: 800,
      word: true,
      dictionary: {
        word: 'hello',
        direction: 'en-zh',
        phonetics: [{ label: '英', text: 'həˈləʊ', audio: 'https://dict.youdao.com/dictvoice?audio=hello&type=1' }],
        translations: [{ pos: 'int.', text: '喂，你好' }],
        definitions: [],
        forms: [],
        examples: [],
        phrases: [],
      },
    })
    const phon = partOf<HTMLElement>(view, '.dict-phon')
    phon.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(played).toBe('https://dict.youdao.com/dictvoice?audio=hello&type=1')
    buttonOf(view, 'speak').click()
    expect(spoken).toEqual({ text: 'hello', lang: 'en' })
  })

  it('中文词气泡卡片的释义标题是英文释义', () => {
    const view = mount()
    view.setSource('你好')
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({
      status: 'done',
      text: 'hello',
      engineLabel: '有道词典',
      elapsedMs: 800,
      word: true,
      dictionary: {
        word: '你好',
        direction: 'zh-en',
        phonetics: [{ label: '拼音', text: 'nǐ hǎo', audio: '' }],
        translations: [{ pos: '', text: 'hello' }],
        definitions: [],
        forms: [],
        examples: [],
        phrases: [],
      },
    })
    expect(partOf<HTMLElement>(view, '.dict-sec h4').textContent).toBe('英文释义')
    expect(partOf<HTMLElement>(view, '.dict-tr').textContent).toBe('hello')
  })

  it('关闭全部展示项时给出设置提示', () => {
    const view = mount()
    view.setSource('hello')
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({
      status: 'done',
      text: 'hello',
      engineLabel: '有道词典',
      elapsedMs: 500,
      word: true,
      dictionary: {
        word: 'hello',
        direction: 'en-zh',
        phonetics: [],
        translations: [{ pos: '', text: '你好' }],
        definitions: [],
        forms: [],
        examples: [],
        phrases: [],
      },
      display: {
        phonetic: false,
        translation: false,
        definition: false,
        forms: false,
        examples: false,
        phrases: false,
      },
    })
    expect(partOf<HTMLElement>(view, '.dict-hint').textContent).toContain('设置')
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

  it('复制成功后按钮短暂显示已复制，重渲染恢复原样', () => {
    vi.useFakeTimers()
    try {
      const view = mount()
      view.showAt({ top: 200, bottom: 220, left: 100 })
      view.render({ status: 'done', text: '已推迟发布。', engineLabel: 'DeepSeek', elapsedMs: 1400, word: false })
      view.setCopied()
      expect(buttonOf(view, 'copy').textContent).toContain('已复制')
      expect(buttonOf(view, 'copy').classList.contains('copied')).toBe(true)
      vi.advanceTimersByTime(1600)
      expect(buttonOf(view, 'copy').textContent).not.toContain('已复制')
      view.setCopied()
      view.render({ status: 'loading' })
      expect(buttonOf(view, 'copy').textContent).not.toContain('已复制')
      expect(buttonOf(view, 'copy').classList.contains('copied')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('流式只追加文本节点，不重建正文', () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({ status: 'streaming', text: '委员会' })
    const pre = partOf<HTMLElement>(view, '.text')
    const first = pre.firstChild
    view.render({ status: 'streaming', text: '委员会已决定' })
    expect(partOf<HTMLElement>(view, '.text')).toBe(pre)
    expect(pre.firstChild).toBe(first)
    expect(pre.textContent).toBe('委员会已决定')
    expect(pre.lastElementChild?.className).toBe('cursor')
  })

  it('流式文本不是前缀时整块重建', () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({ status: 'streaming', text: 'abc' })
    const pre = partOf<HTMLElement>(view, '.text')
    view.render({ status: 'streaming', text: 'xyz' })
    expect(partOf<HTMLElement>(view, '.text')).not.toBe(pre)
    expect(partOf<HTMLElement>(view, '.text').textContent).toBe('xyz')
  })

  it('气泡宽度贴合选区宽度', () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100, width: 300 })
    view.render({ status: 'done', text: '已推迟发布。', engineLabel: 'DeepSeek', elapsedMs: 1400, word: false })
    expect(partOf<HTMLElement>(view, '.panel').style.width).toBe('300px')
  })

  it('选区过宽时按视口三分之一截断', () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100, width: 2000 })
    view.render({ status: 'done', text: '已推迟发布。', engineLabel: 'DeepSeek', elapsedMs: 1400, word: false })
    expect(partOf<HTMLElement>(view, '.panel').style.width).toBe(`${clampBubbleWidth(2000, window.innerWidth)}px`)
  })

  it('词典卡用默认宽度，不跟短选区收窄', () => {
    const view = mount()
    view.setSource('hello')
    view.showAt({ top: 200, bottom: 220, left: 100, width: 90 })
    view.render({
      status: 'done',
      text: 'int. 喂，你好',
      engineLabel: '有道词典',
      elapsedMs: 800,
      word: true,
      dictionary: {
        word: 'hello',
        direction: 'en-zh',
        phonetics: [],
        translations: [{ pos: 'int.', text: '喂，你好' }],
        definitions: [],
        forms: [],
        examples: [],
        phrases: [],
      },
    })
    expect(partOf<HTMLElement>(view, '.panel').style.width).toBe(`${clampBubbleWidth(undefined, window.innerWidth)}px`)
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
