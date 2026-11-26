import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PageButton } from '../src/app/PageButton'
import type { PageState } from '../src/core/messaging'

const globalWithAct = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
globalWithAct.IS_REACT_ACT_ENVIRONMENT = true

const globalScope = globalThis as unknown as { chrome?: unknown }

let container: HTMLDivElement
let root: Root
let state: PageState
let commands: string[]

function setChrome(): void {
  const stub = {
    runtime: {
      sendMessage: (message: { command: string }) => {
        commands.push(message.command)
        if (message.command === 'restore') {
          state = { state: 'idle', done: 0, total: 0, failed: 0, mode: state.mode }
        }
        return Promise.resolve({ ok: true, state })
      },
      onMessage: {
        addListener: () => undefined,
        removeListener: () => undefined,
      },
    },
  }
  globalScope.chrome = stub
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

async function render(): Promise<void> {
  await act(async () => {
    root.render(<PageButton mode="bilingual" />)
  })
  await flush()
}

function button(selector: string): HTMLButtonElement {
  const node = container.querySelector<HTMLButtonElement>(selector)
  if (!node) throw new Error('missing ' + selector)
  return node
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  commands = []
  state = { state: 'done', done: 3, total: 3, failed: 0, mode: 'bilingual' }
  setChrome()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  delete globalScope.chrome
})

describe('PageButton 页脚胶囊', () => {
  it('已译页面把「还原本页」放进胶囊，一次点击就发出 restore', async () => {
    await render()
    expect(button('.page-run').textContent).toBe('重译本页')
    expect(button('.page-restore').textContent).toBe('还原本页')
    act(() => {
      button('.page-more').click()
    })
    const items = Array.from(container.querySelectorAll('.page-menu-item')).map((node) => node.textContent ?? '')
    expect(items).toEqual(['双语显示', '覆盖原文'])
    await act(async () => {
      button('.page-restore').click()
    })
    await flush()
    expect(commands).toContain('restore')
    expect(container.querySelector('.page-restore')).toBeNull()
    expect(button('.page-run').textContent).toBe('翻译本页')
  })

  it('未翻译的页面不显示还原分段', async () => {
    state = { state: 'idle', done: 0, total: 0, failed: 0, mode: 'bilingual' }
    await render()
    expect(container.querySelector('.page-restore')).toBeNull()
    expect(button('.page-run').textContent).toBe('翻译本页')
  })

  it('翻译中显示取消进度，且不给还原分段', async () => {
    state = { state: 'running', done: 2, total: 5, failed: 1, mode: 'bilingual' }
    await render()
    expect(button('.page-run').textContent).toBe('取消 2/5')
    expect(container.querySelector('.page-restore')).toBeNull()
    await act(async () => {
      button('.page-run').click()
    })
    expect(commands).toContain('cancel')
  })
})
