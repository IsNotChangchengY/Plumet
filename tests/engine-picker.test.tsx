import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EnginePicker, dropEngineIndex, moveEngineId } from '../src/app/EnginePicker'
import type { EngineOption } from '../src/core/providers/registry'

const globalWithAct = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
globalWithAct.IS_REACT_ACT_ENVIRONMENT = true

const engines: EngineOption[] = [
  { id: 'ai:a', label: '引擎 A', kind: 'ai', group: 'ai', ready: true, missing: [] },
  { id: 'ai:b', label: '引擎 B', kind: 'ai', group: 'ai', ready: true, missing: [] },
  { id: 'mt:c', label: '引擎 C', kind: 'mt', group: 'mt', ready: true, missing: [] },
  { id: 'mt:off', label: '未配置引擎', kind: 'mt', group: 'mt', ready: false, missing: ['密钥'] },
]

let container: HTMLDivElement
let root: Root
let onChange: (ids: string[]) => void
let calls: string[][]

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  calls = []
  onChange = (ids) => {
    calls.push(ids)
  }
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  calls.length = 0
})

function render(selected: string[]): void {
  act(() => {
    root.render(<EnginePicker engines={engines} selected={selected} onChange={onChange} />)
  })
}

function rowOf(id: string): HTMLElement {
  const row = container.querySelector<HTMLElement>(`.engine-option[data-engine-id="${id}"]`)
  if (!row) throw new Error(`missing row ${id}`)
  return row
}

function labels(): string[] {
  return Array.from(container.querySelectorAll('.engine-option-name')).map((node) => node.textContent ?? '')
}

describe('EnginePicker ordering', () => {
  it('keeps selected engines in order above available engines', () => {
    render(['ai:b', 'ai:a'])
    expect(labels()).toEqual(['引擎 B', '引擎 A', '引擎 C'])
    expect(rowOf('ai:b').getAttribute('data-selected')).toBe('1')
    expect(rowOf('ai:b').querySelector('.engine-primary')?.textContent).toBe('主引擎')
    expect(rowOf('mt:c').hasAttribute('data-selected')).toBe(false)
    const summary = container.querySelector('summary')
    expect(summary?.querySelector('.engine-picker-current')?.textContent).toBe('引擎 B')
    expect(summary?.querySelector('.engine-picker-count')?.textContent).toBe('2')
    expect(summary?.getAttribute('title')).toBe('引擎 B · 引擎 A')
  })

  it('marks the first selected engine as primary', () => {
    render(['ai:b', 'ai:a'])
    const badges = container.querySelectorAll('.engine-primary')
    expect(badges).toHaveLength(1)
    expect(rowOf('ai:b').querySelector('.engine-primary')?.textContent).toBe('主引擎')
    expect(rowOf('ai:a').querySelector('.engine-primary')).toBeNull()
  })

  it('appends a newly checked engine to the end', () => {
    render(['ai:b', 'ai:a'])
    rowOf('mt:c').querySelector('input')?.click()
    expect(calls).toContainEqual(['ai:b', 'ai:a', 'mt:c'])
  })

  it('removes an unchecked engine but keeps at least one selected', () => {
    render(['ai:b', 'ai:a'])
    rowOf('ai:a').querySelector('input')?.click()
    expect(calls).toContainEqual(['ai:b'])

    render(['ai:b'])
    expect(rowOf('ai:b').querySelector('input')?.disabled).toBe(true)
    expect(rowOf('ai:b').querySelector('.engine-grip')).toBeNull()
    expect(rowOf('ai:b').querySelector('.engine-grip-empty')).not.toBeNull()
    expect(rowOf('ai:b').querySelector('.engine-primary')?.textContent).toBe('主引擎')
  })

  it('reorders with the keyboard grip', () => {
    render(['ai:a', 'ai:b', 'mt:c'])
    const grip = rowOf('mt:c').querySelector<HTMLButtonElement>('.engine-grip')
    if (!grip) throw new Error('missing grip')
    act(() => {
      grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })
    expect(calls).toContainEqual(['ai:a', 'mt:c', 'ai:b'])
  })

  it('reorders by dragging the grip with a pointer', () => {
    render(['ai:a', 'ai:b', 'mt:c'])
    const rows = ['ai:a', 'ai:b', 'mt:c'].map(rowOf)
    rows.forEach((row, index) => {
      row.getBoundingClientRect = () =>
        ({ top: index * 30, height: 30, bottom: index * 30 + 30, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    })
    const grip = rowOf('mt:c').querySelector<HTMLButtonElement>('.engine-grip')
    if (!grip) throw new Error('missing grip')
    grip.setPointerCapture = () => {}
    grip.releasePointerCapture = () => {}
    act(() => {
      grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientY: 75 }))
    })
    act(() => {
      grip.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientY: -1 }))
    })
    act(() => {
      grip.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientY: -1 }))
    })
    expect(calls).toContainEqual(['mt:c', 'ai:a', 'ai:b'])
  })

  it('shows an unavailable selected engine with its note', () => {
    render(['mt:off'])
    expect(rowOf('mt:off').getAttribute('data-selected')).toBe('1')
    expect(rowOf('mt:off').querySelector('.engine-option-note')?.textContent).toBe('密钥')
  })
})

describe('engine ordering helpers', () => {
  it('moves an engine to the requested position', () => {
    expect(moveEngineId(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveEngineId(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveEngineId(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
    expect(moveEngineId(['a'], 0, 0)).toEqual(['a'])
  })

  it('returns the insertion slot below the pointer', () => {
    const rects = [
      { top: 0, height: 30 },
      { top: 30, height: 30 },
      { top: 60, height: 30 },
    ]
    expect(dropEngineIndex(rects, -1, 2)).toBe(0)
    expect(dropEngineIndex(rects, 16, 2)).toBe(1)
    expect(dropEngineIndex(rects, 44, 2)).toBe(1)
    expect(dropEngineIndex(rects, 75, 2)).toBe(3)
    expect(dropEngineIndex([], 75, 2)).toBe(2)
  })
})