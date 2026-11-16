import { useEffect, useRef, useState } from 'react'
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

export function EnginePicker({ engines, selected, onChange }: EnginePickerProps) {
  const [open, setOpen] = useState(false)
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

  const rows: PickerRow[] = []
  for (const engine of engines) {
    if (!engine.ready && !selected.includes(engine.id)) continue
    rows.push({
      id: engine.id,
      label: engine.label,
      note: engine.ready ? '' : engine.missing.join('、') || '未配置',
      ready: engine.ready,
    })
  }
  const known = new Set(engines.map((engine) => engine.id))
  for (const id of selected) {
    if (known.has(id)) continue
    rows.push({ id, label: `${id}（已删除）`, note: '未配置', ready: false })
  }

  const labels = selected.map((id) => {
    const engine = engines.find((item) => item.id === id)
    return engine ? engine.label : `${id}（已删除）`
  })

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      if (selected.length <= 1) return
      onChange(selected.filter((item) => item !== id))
      return
    }
    onChange([...selected, id])
  }

  const labelText = labels.join(' · ')

  return (
    <div className="engine-picker" ref={rootRef}>
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary title={labelText}>
          <span className="engine-picker-current">
            {selected.length > 1 ? labels[0] : labelText || '选择引擎'}
          </span>
          {selected.length > 1 ? <span className="engine-picker-count">{selected.length}</span> : null}
        </summary>
        <div className="engine-picker-menu">
          {rows.map((row) => (
            <label className="engine-option" key={row.id}>
              <input
                type="checkbox"
                checked={selected.includes(row.id)}
                disabled={selected.includes(row.id) && selected.length === 1}
                onChange={() => toggle(row.id)}
              />
              <span className="engine-option-name">{row.label}</span>
              {row.note ? <span className="engine-option-note">{row.note}</span> : null}
            </label>
          ))}
          {rows.length === 0 ? (
            <p className="engine-picker-empty">还没有可用引擎，去「设置 → 服务」里配置。</p>
          ) : null}
        </div>
      </details>
    </div>
  )
}
