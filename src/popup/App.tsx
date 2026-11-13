import { useCallback, useEffect, useState } from 'react'
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

  return (
    <div className="popup">
      <header className="popup-header">
        <div className="brand">
          <span className="brand-mark">羽</span>
          <span>羽译</span>
        </div>
        <div className="view-tabs">
          <button
            type="button"
            className={`view-tab${tab === 'translate' ? ' active' : ''}`}
            onClick={() => switchTab('translate')}
          >
            翻译
          </button>
          <button
            type="button"
            className={`view-tab${tab === 'history' ? ' active' : ''}`}
            onClick={() => switchTab('history')}
          >
            历史
          </button>
        </div>
        <button type="button" className="btn ghost small" onClick={openLearning} title="打开生词本">
          生词本
        </button>
        <button type="button" className="btn ghost small" onClick={openOptions} title="打开设置">
          ⚙
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
        <span className="spacer" />
        <span className="hint">v{extensionVersion()}</span>
      </footer>
    </div>
  )
}
