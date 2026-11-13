import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ExternalResult } from '../app/TranslatePanel'
import { TranslatePanel } from '../app/TranslatePanel'
import { HistoryList } from '../app/HistoryList'
import { PageButton } from '../app/PageButton'
import type { HistoryEntry } from '../storage/history'
import type { Settings } from '../storage/settings'
import { loadSettings, patchSettings } from '../storage/settings'
import { applyTheme } from '../ui/apply-theme'
import { openLearning, openOptions } from '../ui/nav'
import { extensionVersion } from '../ui/version'

type Tab = 'translate' | 'history'

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tab, setTab] = useState<Tab>('translate')
  const [external, setExternal] = useState<ExternalResult>(null)
  const [historyRefresh, setHistoryRefresh] = useState(0)

  useEffect(() => {
    void loadSettings().then(setSettings)
  }, [])

  useEffect(() => {
    if (settings) applyTheme(settings.theme)
  }, [settings])

  const patch = useCallback(async (partial: Partial<Settings>) => {
    const next = await patchSettings(partial)
    setSettings(next)
  }, [])

  const pickHistory = useCallback((entry: HistoryEntry) => {
    setExternal({ source: entry.sourceText, result: entry.resultText, engineLabel: entry.engineLabel })
    setTab('translate')
  }, [])

  const switchTab = (next: Tab) => {
    setTab(next)
    if (next === 'history') setHistoryRefresh((value) => value + 1)
  }

  if (!settings) {
    return (
      <div className="popup">
        <div className="empty">正在加载设置…</div>
      </div>
    )
  }

  const tabStyle = { '--ti': tab === 'history' ? 1 : 0 } as CSSProperties

  return (
    <div className="popup">
      <header className="popup-header">
        <div className="brand">
          <span className="brand-mark">羽</span>
          <span>羽译</span>
        </div>
        <div className="tabs" style={tabStyle}>
          <span className="tab-ind" aria-hidden="true" />
          <button
            type="button"
            className={`tab${tab === 'translate' ? ' active' : ''}`}
            onClick={() => switchTab('translate')}
          >
            翻译
          </button>
          <button
            type="button"
            className={`tab${tab === 'history' ? ' active' : ''}`}
            onClick={() => switchTab('history')}
          >
            历史
          </button>
        </div>
        <button type="button" className="ibtn" onClick={openLearning} title="打开生词本" aria-label="打开生词本">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </button>
        <button type="button" className="ibtn" onClick={openOptions} title="打开设置" aria-label="打开设置">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      <div className="popup-body">
        {tab === 'translate' ? (
          <TranslatePanel settings={settings} onPatch={patch} external={external} />
        ) : (
          <div className="popup-scroll">
            <HistoryList refreshKey={historyRefresh} onPick={pickHistory} />
          </div>
        )}
      </div>

      <footer className="popup-footer">
        <PageButton onStarted={() => window.close()} />
        <span className="hint">v{extensionVersion()}</span>
      </footer>
    </div>
  )
}
