import { afterEach, describe, expect, it } from 'vitest'
import type { PageState } from '../src/core/messaging'
import { createPill } from '../src/content/page/pill'

type Pill = ReturnType<typeof createPill>

const calls: string[] = []

const handlers = {
  onCancel: () => calls.push('cancel'),
  onRetry: () => calls.push('retry'),
  onRestore: () => calls.push('restore'),
  onClose: () => calls.push('close'),
}

function state(partial: Partial<PageState>): PageState {
  return { state: 'idle', done: 0, total: 0, failed: 0, mode: 'bilingual', ...partial }
}

let pill: Pill | null = null

function mount(): Pill {
  pill = createPill(handlers)
  return pill
}

function textOf(view: Pill): string {
  return view.element.shadowRoot?.querySelector('.text')?.textContent ?? ''
}

function buttonOf(view: Pill, action: string): HTMLButtonElement | null {
  return view.element.shadowRoot?.querySelector(`button[data-action="${action}"]`) ?? null
}

afterEach(() => {
  pill?.destroy()
  pill = null
  calls.length = 0
  document.documentElement.querySelectorAll('[data-yuyi-ui="pill"]').forEach((node) => node.remove())
})

describe('page pill', () => {
  it('初始隐藏', () => {
    const view = mount()
    expect(view.element.hasAttribute('data-open')).toBe(false)
  })

  it('运行中显示进度与取消按钮', () => {
    const view = mount()
    view.render(state({ state: 'running', done: 2, total: 5 }))
    expect(view.element.getAttribute('data-open')).toBe('1')
    expect(textOf(view)).toBe('翻译中 2/5')
    expect(buttonOf(view, 'cancel')?.hidden).toBe(false)
    expect(buttonOf(view, 'restore')?.hidden).toBe(true)
  })

  it('完成后显示段数与引擎，并给出还原按钮', () => {
    const view = mount()
    view.render(state({ state: 'done', done: 5, total: 5, engineLabel: '谷歌翻译（免费通道）' }))
    expect(textOf(view)).toBe('已译 5 段 · 谷歌翻译（免费通道）')
    expect(buttonOf(view, 'restore')?.hidden).toBe(false)
    expect(buttonOf(view, 'cancel')?.hidden).toBe(true)
  })

  it('有失败时显示失败数与重试按钮', () => {
    const view = mount()
    view.render(state({ state: 'done', done: 3, total: 5, failed: 2 }))
    expect(textOf(view)).toBe('已译 3 段，2 段失败')
    expect(buttonOf(view, 'retry')?.hidden).toBe(false)
  })

  it('点击按钮回调对应动作', () => {
    const view = mount()
    view.render(state({ state: 'running', done: 1, total: 4 }))
    buttonOf(view, 'cancel')?.click()
    view.render(state({ state: 'done', done: 4, total: 4, engineLabel: 'Mock' }))
    buttonOf(view, 'restore')?.click()
    expect(calls).toEqual(['cancel', 'restore'])
  })
})
