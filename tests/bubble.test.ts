import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBubble } from '../src/content/bubble'
import { clampBubbleWidth } from '../src/content/context'

type Bubble = ReturnType<typeof createBubble>

const calls: string[] = []
let copied = ''
let spoken: { text: string; lang?: string } | null = null
let played = ''
let savedText = ''
let saveResult = true

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
  onSave: (text: string) => {
    savedText = text
    calls.push('save')
    return Promise.resolve(saveResult)
  },
  onRetry: () => calls.push('retry'),
  onEngineTranslate: () => calls.push('engine'),
  onDictionaryTranslate: () => calls.push('dictionary'),
  onMoreContext: () => calls.push('more'),
  onContinue: () => calls.push('continue'),
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

function cardOf(view: Bubble, index = 0): HTMLElement {
  const cards = rootOf(view).querySelectorAll<HTMLElement>('.engine-result')
  const card = cards[index]
  if (!card) throw new Error(`missing card ${index}`)
  return card
}

function cardButtonOf(view: Bubble, index: number, action: string): HTMLButtonElement {
  const button = cardOf(view, index).querySelector<HTMLButtonElement>(`[data-card-action="${action}"]`)
  if (!button) throw new Error(`missing card action ${action}`)
  return button
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 60))

afterEach(() => {
  bubble?.destroy()
  bubble = null
  calls.length = 0
  copied = ''
  spoken = null
  played = ''
  savedText = ''
  saveResult = true
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

  it('完成态用一张结果卡显示服务名、译文与右上角图标动作', () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({ status: 'done', text: '已推迟发布。', engineLabel: 'DeepSeek', elapsedMs: 1400, word: false })
    const card = cardOf(view)
    expect(card.querySelector('.engine-name')?.textContent).toBe('DeepSeek')
    expect(card.querySelector('.engine-text')?.textContent).toBe('已推迟发布。')
    expect(cardButtonOf(view, 0, 'speak').hidden).toBe(false)
    expect(cardButtonOf(view, 0, 'copy').hidden).toBe(false)
    expect(cardButtonOf(view, 0, 'save').hidden).toBe(false)
    expect(cardButtonOf(view, 0, 'copy').title).toBe('复制')
    expect(partOf<HTMLElement>(view, '.meta').hidden).toBe(true)
    expect(partOf<HTMLElement>(view, '.foot').hidden).toBe(true)
    expect(buttonOf(view, 'copy').hidden).toBe(true)
    expect(rootOf(view).querySelectorAll('.close').length).toBe(1)
    expect(rootOf(view).querySelector('[data-action="close"]')).toBe(null)
  })

  it('AI 卡可按需带上更多上下文重译，机器翻译卡不显示这个入口', () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({
      status: 'done',
      text: '已推迟发布。',
      engineLabel: 'DeepSeek',
      elapsedMs: 1400,
      word: false,
      expandable: true,
      runs: [
        { engineId: 'ai:a', label: 'DeepSeek', text: '已推迟发布。', done: true, elapsedMs: 1400 },
        { engineId: 'mt:baidu', label: '百度翻译', text: '发布推迟。', done: true, elapsedMs: 800 },
      ],
    })
    expect(cardButtonOf(view, 0, 'more').hidden).toBe(false)
    expect(cardButtonOf(view, 1, 'more').hidden).toBe(true)
    cardButtonOf(view, 0, 'more').click()
    expect(calls).toEqual(['more'])
    view.render({
      status: 'done',
      text: '已推迟发布。',
      engineLabel: 'DeepSeek',
      elapsedMs: 1400,
      word: false,
      runs: [{ engineId: 'ai:a', label: 'DeepSeek', text: '已推迟发布。', done: true, elapsedMs: 1400 }],
    })
    expect(rootOf(view).querySelectorAll('.engine-result').length).toBe(1)
    expect(cardButtonOf(view, 0, 'more').hidden).toBe(true)
    view.render({ status: 'loading' })
    expect(rootOf(view).querySelector('.engine-result')).toBe(null)
  })

  it('完成态标出缓存命中，底栏只留上下文预览并可展开', () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100 })
    const context = '页面标题：Example\n章节：Guide › Setup\n上文：Alpha one.'
    view.render({
      status: 'done',
      text: '已推迟发布。',
      engineLabel: 'DeepSeek',
      elapsedMs: 1400,
      word: false,
      cached: true,
      context,
      runs: [
        { engineId: 'ai:a', label: 'DeepSeek', text: '已推迟发布。', done: true, elapsedMs: 1400, cached: true },
      ],
    })
    const meta = partOf<HTMLElement>(view, '.meta')
    expect(meta.textContent).toContain('上下文预览')
    expect(cardOf(view).querySelector('.engine-tag.ok')?.textContent).toBe('缓存命中')
    const ctx = partOf<HTMLElement>(view, '.ctx')
    expect(ctx.hidden).toBe(true)
    meta.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(ctx.hidden).toBe(false)
    expect(partOf<HTMLElement>(view, '.ctx-text').textContent).toBe(context)
    expect(meta.getAttribute('aria-expanded')).toBe('true')
    meta.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(ctx.hidden).toBe(true)
    view.render({ status: 'loading' })
    expect(ctx.hidden).toBe(true)
    expect(meta.hidden).toBe(true)
  })

  it('单词卡不显示语境展开入口', () => {
    const view = mount()
    view.setSource('ephemeral')
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({
      status: 'done',
      text: '短暂的',
      engineLabel: 'DeepSeek',
      elapsedMs: 900,
      word: true,
      context: '页面标题：Example',
    })
    expect(partOf<HTMLElement>(view, '.ctx').hidden).toBe(true)
    expect(partOf<HTMLElement>(view, '.meta').dataset.expandable).toBe('')
  })

  it('卡片收藏触发 onSave，保存成功后按钮变已收藏并禁用', async () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({
      status: 'done',
      text: '已推迟发布。',
      engineLabel: 'DeepSeek',
      elapsedMs: 1400,
      word: false,
      runs: [{ engineId: 'ai:a', label: 'DeepSeek', text: '已推迟发布。', done: true, elapsedMs: 1400 }],
    })
    const save = cardButtonOf(view, 0, 'save')
    save.click()
    await flush()
    expect(calls).toEqual(['save'])
    expect(savedText).toBe('已推迟发布。')
    expect(save.disabled).toBe(true)
    expect(save.title).toBe('已收藏')
    view.render({ status: 'loading' })
    expect(rootOf(view).querySelector('.engine-result')).toBe(null)
  })

  it('单词卡底栏收藏也走同一条保存链路', async () => {
    const view = mount()
    view.setSource('ephemeral')
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({ status: 'done', text: '短暂的', engineLabel: 'DeepSeek', elapsedMs: 900, word: true })
    const save = buttonOf(view, 'save')
    save.click()
    await flush()
    expect(savedText).toBe('短暂的')
    expect(save.disabled).toBe(true)
    expect(save.textContent).toContain('已收藏')
  })

  it('保存失败时卡片收藏按钮保持可点', async () => {
    saveResult = false
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({
      status: 'done',
      text: '已推迟发布。',
      engineLabel: 'DeepSeek',
      elapsedMs: 1400,
      word: false,
      runs: [{ engineId: 'ai:a', label: 'DeepSeek', text: '已推迟发布。', done: true, elapsedMs: 1400 }],
    })
    const save = cardButtonOf(view, 0, 'save')
    save.click()
    await flush()
    expect(save.disabled).toBe(false)
    expect(save.title).toBe('收藏')
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

  it('词典卡底栏最左多一枚引擎翻译，点击切走后按钮收起', () => {
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
        phonetics: [],
        translations: [{ pos: 'int.', text: '喂，你好' }],
        definitions: [],
        forms: [],
        examples: [],
        phrases: [],
      },
    })
    const engine = buttonOf(view, 'engine')
    expect(engine.hidden).toBe(false)
    expect(engine.textContent).toContain('引擎翻译')
    expect(engine.title).toContain('词典')
    expect(engine.querySelector('svg')).not.toBeNull()
    const acts = partOf<HTMLElement>(view, '.acts')
    expect(acts.querySelector('.act:not([hidden])')?.getAttribute('data-action')).toBe('engine')
    engine.click()
    expect(calls).toEqual(['engine'])
    view.render({ status: 'loading' })
    expect(buttonOf(view, 'engine').hidden).toBe(true)
  })

  it('不是词典卡时不出现引擎翻译与词典翻译按钮', () => {
    const view = mount()
    view.setSource('ephemeral')
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({ status: 'done', text: '短暂的', engineLabel: 'DeepSeek', elapsedMs: 900, word: true })
    expect(buttonOf(view, 'engine').hidden).toBe(true)
    expect(buttonOf(view, 'dictionary').hidden).toBe(true)
    view.render({ status: 'done', text: '已推迟发布。', engineLabel: 'DeepSeek', elapsedMs: 1400, word: false })
    expect(buttonOf(view, 'engine').hidden).toBe(true)
    expect(buttonOf(view, 'dictionary').hidden).toBe(true)
  })

  it('引擎结果底栏最左多一枚词典翻译，点击切回词典', () => {
    const view = mount()
    view.setSource('ephemeral')
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({
      status: 'done',
      text: '短暂的',
      engineLabel: 'DeepSeek',
      elapsedMs: 900,
      word: true,
      dictionaryAvailable: true,
    })
    const back = buttonOf(view, 'dictionary')
    expect(back.hidden).toBe(false)
    expect(back.textContent).toContain('词典翻译')
    expect(back.title).toContain('切回')
    expect(back.querySelector('svg')).not.toBeNull()
    const acts = partOf<HTMLElement>(view, '.acts')
    expect(acts.querySelector('.act:not([hidden])')?.getAttribute('data-action')).toBe('dictionary')
    expect(buttonOf(view, 'engine').hidden).toBe(true)
    expect(buttonOf(view, 'speak').hidden).toBe(false)
    expect(partOf<HTMLElement>(view, '.foot').hidden).toBe(false)
    back.click()
    expect(calls).toEqual(['dictionary'])
    view.render({ status: 'loading' })
    expect(buttonOf(view, 'dictionary').hidden).toBe(true)
  })

  it('多引擎的引擎结果卡也能切回词典', () => {
    const view = mount()
    view.setSource('ephemeral')
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({
      status: 'done',
      text: '短暂的',
      engineLabel: '谷歌翻译',
      elapsedMs: 700,
      word: true,
      dictionaryAvailable: true,
      runs: [
        { engineId: 'mt:google-free', label: '谷歌翻译', text: '短暂的', done: true },
        { engineId: 'ai:deepseek', label: 'DeepSeek', text: '转瞬即逝的', done: true },
      ],
    })
    expect(cardOf(view, 0).querySelector('.engine-name')?.textContent).toBe('谷歌翻译')
    expect(buttonOf(view, 'dictionary').hidden).toBe(false)
    expect(partOf<HTMLElement>(view, '.foot').hidden).toBe(false)
  })

  it('词典卡只显示引擎翻译，不显示词典翻译', () => {
    const view = mount()
    view.setSource('hello')
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({
      status: 'done',
      text: 'int. 喂，你好',
      engineLabel: '有道词典',
      elapsedMs: 800,
      word: true,
      dictionaryAvailable: true,
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
    expect(buttonOf(view, 'engine').hidden).toBe(false)
    expect(buttonOf(view, 'dictionary').hidden).toBe(true)
  })

  it('引擎翻译失败时底栏也能切回词典', () => {
    const view = mount()
    view.setSource('ephemeral')
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({ status: 'error', message: '请求失败，请稍后重试', dictionaryAvailable: true })
    expect(buttonOf(view, 'retry').hidden).toBe(false)
    expect(buttonOf(view, 'dictionary').hidden).toBe(false)
    expect(partOf<HTMLElement>(view, '.foot').hidden).toBe(false)
    buttonOf(view, 'dictionary').click()
    expect(calls).toEqual(['dictionary'])
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

  it('点卡片复制图标里的 svg 也能复制该引擎译文', () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({
      status: 'done',
      text: '已推迟发布。',
      engineLabel: 'DeepSeek',
      elapsedMs: 1400,
      word: false,
      runs: [{ engineId: 'ai:a', label: 'DeepSeek', text: '已推迟发布。', done: true, elapsedMs: 1400 }],
    })
    const path = cardButtonOf(view, 0, 'copy').querySelector('svg')
    path?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(calls).toEqual(['copy'])
    expect(copied).toBe('已推迟发布。')
  })

  it('卡片复制成功后短暂显示对勾，重渲染恢复原样', () => {
    vi.useFakeTimers()
    try {
      const view = mount()
      view.showAt({ top: 200, bottom: 220, left: 100 })
      view.render({
        status: 'done',
        text: '已推迟发布。',
        engineLabel: 'DeepSeek',
        elapsedMs: 1400,
        word: false,
        runs: [{ engineId: 'ai:a', label: 'DeepSeek', text: '已推迟发布。', done: true, elapsedMs: 1400 }],
      })
      const copy = cardButtonOf(view, 0, 'copy')
      copy.click()
      expect(copy.title).toBe('已复制')
      expect(copy.classList.contains('copied')).toBe(true)
      vi.advanceTimersByTime(1600)
      expect(copy.title).toBe('复制')
      expect(copy.classList.contains('copied')).toBe(false)
      copy.click()
      view.render({ status: 'loading' })
      expect(rootOf(view).querySelector('.engine-result')).toBe(null)
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

  it('多引擎时逐条渲染结果卡，各自带状态、耗时与复制', async () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100, width: 90 })
    view.render({ status: 'loading', count: 2 })
    expect(partOf<HTMLElement>(view, '.loading').textContent).toContain('2 个引擎')
    await flush()
    expect(partOf<HTMLElement>(view, '.panel').style.width).toBe(`${clampBubbleWidth(90, window.innerWidth)}px`)

    view.render({
      status: 'streaming',
      text: '委员',
      runs: [
        { engineId: 'ai:a', label: 'DeepSeek', text: '委员', done: false },
        { engineId: 'mt:baidu', label: '百度翻译', text: '委员会决定', done: false },
      ],
    })
    let cards = rootOf(view).querySelectorAll('.engine-result')
    expect(cards.length).toBe(2)
    expect(partOf<HTMLElement>(view, '.engine-name').textContent).toBe('DeepSeek')
    expect(rootOf(view).querySelectorAll('.engine-dot.running').length).toBe(2)

    view.render({
      status: 'done',
      text: '委员会已决定',
      engineLabel: 'DeepSeek',
      elapsedMs: 1200,
      word: false,
      runs: [
        { engineId: 'ai:a', label: 'DeepSeek', text: '委员会已决定', done: true, elapsedMs: 1200, cached: true },
        { engineId: 'mt:baidu', label: '百度翻译', text: '委员会决定', done: true, elapsedMs: 800 },
      ],
    })
    cards = rootOf(view).querySelectorAll('.engine-result')
    expect(cards.length).toBe(2)
    expect(rootOf(view).querySelectorAll('.engine-dot.done').length).toBe(2)
    const tags = Array.from(rootOf(view).querySelectorAll('.engine-tag')).map((node) => node.textContent)
    expect(tags).toContain('1.2s')
    expect(tags).toContain('缓存命中')
    expect(cardButtonOf(view, 0, 'speak').hidden).toBe(false)
    expect(cardButtonOf(view, 0, 'copy').hidden).toBe(false)
    expect(cardButtonOf(view, 0, 'save').hidden).toBe(false)
    expect(cardButtonOf(view, 1, 'copy').hidden).toBe(false)

    const copyButtons = rootOf(view).querySelectorAll<HTMLButtonElement>('[data-card-action="copy"]')
    expect(copyButtons.length).toBe(2)
    copyButtons[1].click()
    expect(copied).toBe('委员会决定')
    expect(copyButtons[1].title).toBe('已复制')
  })

  it('被标成单词但有两个引擎时仍逐条显示结果卡', () => {
    const view = mount()
    view.setSource('还是多种点吃吧我不想吃合成淀粉')
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({
      status: 'done',
      text: 'Better to just grow more food.',
      engineLabel: 'DeepSeek',
      elapsedMs: 1000,
      word: true,
      context: '页面标题：Example',
      runs: [
        { engineId: 'ai:a', label: 'DeepSeek', text: 'Better to just grow more food.', done: true, elapsedMs: 1000 },
        { engineId: 'mt:baidu', label: '百度翻译', text: '不如多种点吃的。', done: true, elapsedMs: 800 },
      ],
    })
    expect(rootOf(view).querySelectorAll('.engine-result').length).toBe(2)
    expect(rootOf(view).querySelector('.word-h')).toBe(null)
    expect(partOf<HTMLElement>(view, '.meta').textContent).toContain('上下文预览')
    expect(buttonOf(view, 'copy').hidden).toBe(true)
  })

  it('某个引擎失败时只让那张卡显示错误，不挡住其他译文', () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({
      status: 'done',
      text: '委员会已决定',
      engineLabel: 'DeepSeek',
      elapsedMs: 1200,
      word: false,
      runs: [
        { engineId: 'ai:a', label: 'DeepSeek', text: '委员会已决定', done: true, elapsedMs: 1200 },
        { engineId: 'mt:baidu', label: '百度翻译', text: '', done: true, error: '百度翻译未配置 AppID' },
      ],
    })
    const cards = rootOf(view).querySelectorAll('.engine-result')
    expect(cards.length).toBe(2)
    expect(cards[1].classList.contains('failed')).toBe(true)
    expect(cards[1].querySelector('.engine-error')?.textContent).toBe('百度翻译未配置 AppID')
    expect(cards[1].querySelector<HTMLButtonElement>('[data-card-action="copy"]')?.hidden).toBe(true)
    expect(cards[1].querySelector<HTMLButtonElement>('[data-card-action="save"]')?.hidden).toBe(true)
    expect(cards[0].querySelector('.engine-text')?.textContent).toBe('委员会已决定')
  })

  it('气泡宽度略长于选区，给卡片内边距留出空间', () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100, width: 300 })
    view.render({ status: 'done', text: '已推迟发布。', engineLabel: 'DeepSeek', elapsedMs: 1400, word: false })
    const width = partOf<HTMLElement>(view, '.panel').style.width
    expect(width).toBe(`${clampBubbleWidth(300, window.innerWidth)}px`)
    expect(parseInt(width, 10)).toBeGreaterThan(300)
  })

  it('选区过宽时最多占半屏', () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100, width: 2000 })
    view.render({ status: 'done', text: '已推迟发布。', engineLabel: 'DeepSeek', elapsedMs: 1400, word: false })
    expect(partOf<HTMLElement>(view, '.panel').style.width).toBe(`${clampBubbleWidth(2000, window.innerWidth)}px`)
    expect(parseInt(partOf<HTMLElement>(view, '.panel').style.width, 10)).toBeLessThanOrEqual(
      Math.floor(window.innerWidth / 2),
    )
  })

  it('窄气泡给单词卡动作加紧凑类，重渲染后仍保持', () => {
    const view = mount()
    view.setSource('ephemeral')
    view.showAt({ top: 200, bottom: 220, left: 100, width: 220 })
    view.render({ status: 'done', text: '短暂的', engineLabel: 'DeepSeek', elapsedMs: 900, word: true })
    const panel = partOf<HTMLElement>(view, '.panel')
    expect(panel.style.width).toBe(`${clampBubbleWidth(220, window.innerWidth)}px`)
    expect(panel.classList.contains('compact')).toBe(true)
    expect(buttonOf(view, 'copy').hidden).toBe(false)
    view.render({ status: 'streaming', text: '短暂' })
    expect(panel.classList.contains('compact')).toBe(true)
  })

  it('常规宽度不压缩动作按钮', () => {
    const view = mount()
    view.showAt({ top: 200, bottom: 220, left: 100, width: 300 })
    view.render({ status: 'done', text: '已推迟发布。', engineLabel: 'DeepSeek', elapsedMs: 1400, word: false })
    expect(partOf<HTMLElement>(view, '.panel').classList.contains('compact')).toBe(false)
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

  it('选到隐藏内容时模糊原文并给出继续翻译入口', () => {
    const view = mount()
    view.setSource('喜欢不喜欢')
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({ status: 'guard', text: '喜欢不喜欢\nvar Feedback = 1;' })
    expect(partOf<HTMLElement>(view, '.guard-msg').textContent).toBe('选中了隐藏内容，请重新选择或继续翻译')
    expect(partOf<HTMLElement>(view, '.guard-hint').textContent).toContain('整段都不可见')
    expect(partOf<HTMLElement>(view, '.guard-text').textContent).toContain('喜欢不喜欢')
    expect(partOf<HTMLElement>(view, '.foot').hidden).toBe(true)
    const go = partOf<HTMLButtonElement>(view, '[data-guard="continue"]')
    expect(go.textContent).toBe('继续翻译')
    go.click()
    expect(calls).toEqual(['continue'])
    view.render({ status: 'loading' })
    expect(rootOf(view).querySelector('.guard-msg')).toBe(null)
    expect(rootOf(view).querySelector('.guard-hint')).toBe(null)
    expect(partOf<HTMLElement>(view, '.body').className).toBe('body')
  })

  it('隐藏内容预览最多留 240 字', () => {
    const view = mount()
    view.setSource('字')
    view.showAt({ top: 200, bottom: 220, left: 100 })
    view.render({ status: 'guard', text: '字'.repeat(400) })
    const preview = partOf<HTMLElement>(view, '.guard-text')
    expect(preview.textContent).toHaveLength(241)
    expect(preview.textContent?.endsWith('…')).toBe(true)
  })
})
