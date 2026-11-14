import type { ReactNode } from 'react'
import { engineReadiness, listEngines } from '../core/providers/registry'
import { serviceKeyOf } from '../core/providers/services'
import type { Settings } from '../storage/settings'

type SlotKey = 'translateEngine' | 'pageEngine' | 'checkEngine' | 'polishEngine'

type SlotDef = {
  key: SlotKey
  label: string
  onlyAi: boolean
  icon: ReactNode
}

const SLOTS: SlotDef[] = [
  {
    key: 'translateEngine',
    label: '翻译面板',
    onlyAi: false,
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6h16M4 12h10M4 18h7" />
      </svg>
    ),
  },
  {
    key: 'pageEngine',
    label: '网页翻译',
    onlyAi: false,
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
      </svg>
    ),
  },
  {
    key: 'checkEngine',
    label: '语法检查',
    onlyAi: true,
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="m13 2-9 12h6l-1 8 9-12h-6l1-8z" />
      </svg>
    ),
  },
  {
    key: 'polishEngine',
    label: '润色',
    onlyAi: true,
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
      </svg>
    ),
  },
]

type Props = {
  settings: Settings
  onPatch: (patch: Partial<Settings>) => void
  onOpenService: (key: string) => void
}

export function EnginesSection({ settings, onPatch, onOpenService }: Props) {
  const engines = listEngines(settings)
  const aiReady = engines.some((engine) => engine.kind === 'ai' && engine.ready)

  const slotReady = (slot: SlotDef): boolean => {
    const value = settings[slot.key]
    if (!value) return slot.onlyAi && aiReady
    return engineReadiness(settings, value).ready
  }

  const readyCount = SLOTS.filter(slotReady).length

  return (
    <>
      <div className="cat-head">
        <h1>翻译引擎</h1>
      </div>

      <section className="card slot-card">
        <div className="slot-head">
          <h2>槽位分配</h2>
          <span className="spacer" />
          <span className="hint">
            {readyCount} / {SLOTS.length} 可用
          </span>
        </div>

        {SLOTS.map((slot) => {
          const value = settings[slot.key]
          const options = engines.filter((engine) => engine.ready && (!slot.onlyAi || engine.kind === 'ai'))
          const current = engines.find((engine) => engine.id === value)
          const ready = slotReady(slot)
          const serviceKey = current ? serviceKeyOf(current.id) : ''

          return (
            <div className="slot" key={slot.key}>
              <div className="slot-id">
                <span className="ico" aria-hidden="true">
                  {slot.icon}
                </span>
                <b>{slot.label}</b>
                {slot.onlyAi ? <span className="svc-tag">仅 AI</span> : null}
              </div>

              <div className="slot-eng">
                <select
                  className="select"
                  value={value}
                  aria-label={`${slot.label}引擎`}
                  onChange={(event) => onPatch({ [slot.key]: event.target.value } as Partial<Settings>)}
                >
                  {slot.onlyAi ? <option value="">自动（优先用翻译引擎）</option> : null}
                  {value && !current ? <option value={value}>{value}（已删除）</option> : null}
                  {current && !current.ready ? (
                    <option value={current.id}>{current.label}（未配置）</option>
                  ) : null}
                  {options.map((engine) => (
                    <option key={engine.id} value={engine.id}>
                      {engine.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="slot-side">
                {ready ? (
                  <span className="st ok">
                    <i />
                    可用
                  </span>
                ) : (
                  <>
                    <span className="st err">
                      <i />
                      不可用
                    </span>
                    <button type="button" className="btn small" onClick={() => onOpenService(serviceKey)}>
                      去配置
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </section>
    </>
  )
}
