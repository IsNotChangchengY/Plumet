import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { EngineOption } from '../core/providers/registry'

type EnginePickerProps = {
  engines: EngineOption[]
  selected: string[]
  onChange: (ids: string[]) => void
}

type PickerRow = {
  id: string
  label: string
  note: string
  ready: boolean
}

type DragState = {
  id: string
  from: number
  slot: number
}

const GRIP_ICON = (
  <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    <circle cx="4" cy="3" r="0.9" fill="currentColor" />
    <circle cx="4" cy="6" r="0.9" fill="currentColor" />
    <circle cx="4" cy="9" r="0.9" fill="currentColor" />
    <circle cx="8" cy="3" r="0.9" fill="currentColor" />
    <circle cx="8" cy="6" r="0.9" fill="currentColor" />
    <circle cx="8" cy="9" r="0.9" fill="currentColor" />
  </svg>
)

export function moveEngineId(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids
  const next = [...ids]
  const [id] = next.splice(from, 1)
  if (id === undefined) return ids
  next.splice(to, 0, id)
  return next
}

export function dropEngineIndex(rects: Array<{ top: number; height: number }>, clientY: number, fallback: number): number {
  if (rects.length === 0) return fallback
  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index]
    if (clientY < rect.top + rect.height / 2) return index
  }
  return rects.length
}

export function EnginePicker({ engines, selected, onChange }: EnginePickerProps) {
  const [open, setOpen] = useState(false)
  const [drag, setDrag] = useState<DragState | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current || rootRef.current.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const orderedSelected = selected.filter((id, index) => selected.indexOf(id) === index)
  const selectedSet = new Set(orderedSelected)
  const selectedRows: PickerRow[] = orderedSelected.map((id) => {
    const engine = engines.find((item) => item.id === id)
    return {
      id,
      label: engine ? engine.label : `${id}（已删除）`,
      note: engine ? (engine.ready ? '' : engine.missing.join('、') || '未配置') : '未配置',
      ready: Boolean(engine?.ready),
    }
  })
  const availableRows: PickerRow[] = engines
    .filter((engine) => engine.ready && !selectedSet.has(engine.id))
    .map((engine) => ({
      id: engine.id,
      label: engine.label,
      note: '',
      ready: true,
    }))

  const labels = selectedRows.map((row) => row.label)
  const labelText = labels.join(' · ')
  const selectedCount = orderedSelected.length

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      if (selectedCount <= 1) return
      onChange(orderedSelected.filter((item) => item !== id))
      return
    }
    onChange([...orderedSelected, id])
  }

  const startDrag = (event: PointerEvent<HTMLButtonElement>, id: string, from: number) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ id, from, slot: from })
  }

  const dropIndexAt = (clientY: number, fallback: number) => {
    const menu = rootRef.current?.querySelector('.engine-picker-menu')
    const rects = menu
      ? Array.from(menu.querySelectorAll<HTMLElement>('.engine-option[data-selected="1"]')).map((item) =>
          item.getBoundingClientRect(),
        )
      : []
    return dropEngineIndex(rects, clientY, fallback)
  }

  const updateDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return
    const slot = dropIndexAt(event.clientY, drag.slot)
    if (slot !== drag.slot) setDrag({ ...drag, slot })
  }

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return
    const slot = dropIndexAt(event.clientY, drag.slot)
    const to = slot > drag.from ? slot - 1 : slot
    const next = moveEngineId(orderedSelected, drag.from, to)
    setDrag(null)
    if (next !== orderedSelected) onChange(next)
  }

  const cancelDrag = () => setDrag(null)

  const moveWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, from: number) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const to = from + (event.key === 'ArrowUp' ? -1 : 1)
    if (to < 0 || to >= selectedCount) return
    onChange(moveEngineId(orderedSelected, from, to))
  }

  return (
    <div className="engine-picker" ref={rootRef}>
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary title={labelText}>
          <span className="engine-picker-current">
            {selectedCount > 1 ? labels[0] : labelText || '选择引擎'}
          </span>
          {selectedCount > 1 ? <span className="engine-picker-count">{selectedCount}</span> : null}
        </summary>
        <div className={`engine-picker-menu${drag && drag.slot === selectedCount && drag.slot !== drag.from && drag.slot !== drag.from + 1 ? ' drop-end' : ''}`}>
          {selectedRows.map((row, index) => (
            <div
              className={`engine-option${drag?.id === row.id ? ' dragging' : ''}${drag && drag.slot === index && drag.slot !== drag.from && drag.slot !== drag.from + 1 ? ' drop-before' : ''}`}
              key={row.id}
              data-engine-id={row.id}
              data-selected="1"
            >
              {selectedCount > 1 ? (
                <button
                  type="button"
                  className="engine-grip"
                  aria-label={`拖动排序：${row.label}，当前第 ${index + 1} 位`}
                  title="拖动调整顺序（也可用 ↑ ↓ 键）"
                  onPointerDown={(event) => startDrag(event, row.id, index)}
                  onPointerMove={updateDrag}
                  onPointerUp={finishDrag}
                  onPointerCancel={cancelDrag}
                  onKeyDown={(event) => moveWithKeyboard(event, index)}
                >
                  {GRIP_ICON}
                </button>
              ) : (
                <span className="engine-grip-empty" aria-hidden="true" />
              )}
              <label className="engine-option-main">
                <input
                  type="checkbox"
                  checked
                  disabled={selectedCount === 1}
                  onChange={() => toggle(row.id)}
                />
                <span className="engine-option-name" title={row.label}>{row.label}</span>
                {row.note ? <span className="engine-option-note">{row.note}</span> : null}
              </label>
              {index === 0 ? <span className="engine-primary" title="主引擎">主引擎</span> : null}
            </div>
          ))}
          {availableRows.map((row) => (
            <div className="engine-option" key={row.id} data-engine-id={row.id}>
              <span className="engine-grip-empty" aria-hidden="true" />
              <label className="engine-option-main">
                <input type="checkbox" checked={false} onChange={() => toggle(row.id)} />
                <span className="engine-option-name" title={row.label}>{row.label}</span>
              </label>
            </div>
          ))}
          {selectedRows.length + availableRows.length === 0 ? (
            <p className="engine-picker-empty">还没有可用引擎，去「设置 → 服务」里配置。</p>
          ) : null}
        </div>
      </details>
    </div>
  )
}