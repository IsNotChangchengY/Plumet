import { useEffect, useMemo, useState } from 'react'
import type { Settings } from '../storage/settings'
import { DEFAULT_SETTINGS, defaultServices, loadSettings, saveSettings } from '../storage/settings'
import { engineReadiness, listEngines } from '../core/providers/registry'
import { LANGUAGES, SMART_TARGET_LANG, TARGET_LANGUAGES } from '../core/lang'
import { clearCache } from '../core/cache'
import { clearHistory } from '../storage/history'
import { applyTheme } from '../ui/apply-theme'
import { extensionVersion } from '../ui/version'
import { SectionTitle } from '../app/SectionTitle'
import { EnginesSection } from './EnginesSection'
import { ServicesSection } from './ServicesSection'

const TABS = [
  { id: 'general', label: '通用' },
  { id: 'translate', label: '翻译' },
  { id: 'engines', label: '引擎' },
  { id: 'services', label: '服务' },
  { id: 'misc', label: '其它' },
] as const

type Tab = (typeof TABS)[number]['id']

function readHash(): { tab: Tab; detail: string } {
  const raw = location.hash.replace(/^#/, '')
  const [head, ...rest] = raw.split(':')
  const tab = (TABS.some((item) => item.id === head) ? head : 'general') as Tab
  return { tab, detail: tab === 'services' ? rest.join(':') : '' }
}

function slotsBadge(settings: Settings): number {
  const aiReady = listEngines(settings).some((engine) => engine.kind === 'ai' && engine.ready)
  const unready = (engineId: string, onlyAi: boolean): number => {
    if (!engineId) return onlyAi && !aiReady ? 1 : 0
    return engineReadiness(settings, engineId).ready ? 0 : 1
  }
  return (
    unready(settings.translateEngine, false) +
    unready(settings.pageEngine, false) +
    unready(settings.checkEngine, true) +
    unready(settings.polishEngine, true)
  )
}

export default function App() {
  const initial = useMemo(readHash, [])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<Tab>(initial.tab)
  const [detail, setDetail] = useState(initial.detail)

  useEffect(() => {
    void loadSettings().then(setSettings)
  }, [])

  useEffect(() => {
    if (!settings) return
    applyTheme(settings.theme)
  }, [settings])

  useEffect(() => {
    if (!settings) return
    const timer = setTimeout(() => {
      void saveSettings(settings).then(() => setSavedAt(Date.now()))
    }, 400)
    return () => clearTimeout(timer)
  }, [settings])

  if (!settings) {
    return <div className="shell">正在加载设置…</div>
  }

  const patch = (partial: Partial<Settings>) => {
    setSettings({ ...settings, ...partial })
  }

  const go = (next: Tab) => {
    setTab(next)
    if (next !== 'services') setDetail('')
    history.replaceState(null, '', `#${next}`)
  }

  const openService = (key: string) => {
    setTab('services')
    setDetail(key)
    history.replaceState(null, '', `#services${key ? `:${key}` : ''}`)
  }

  const closeService = () => {
    setDetail('')
    history.replaceState(null, '', '#services')
  }

  const handleClearCache = async () => {
    await clearCache()
    setNotice('译文缓存已清空')
  }

  const handleClearHistory = async () => {
    if (!window.confirm('清空全部翻译历史？这个操作不能撤销。')) return
    await clearHistory()
    setNotice('翻译历史已清空')
  }

  const handleReset = async () => {
    if (!window.confirm('恢复默认设置？服务密钥与 AI 服务配置都会被清除。')) return
    const next = { ...DEFAULT_SETTINGS, services: defaultServices() }
    await saveSettings(next)
    setSettings(next)
    setNotice('已恢复默认设置')
  }

  const savedText = savedAt ? `已自动保存 ${new Date(savedAt).toLocaleTimeString('zh-CN')}` : '修改后自动保存'
  const badge = slotsBadge(settings)

  return (
    <div className="options">
      <header className="topbar">
        <div className="tb">
          <div className="brand">
            <span className="brand-mark">羽</span>
            <span className="brand-txt">
              羽译<i>设置</i>
            </span>
          </div>
          <nav className="cats">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`cat${tab === item.id ? ' is-on' : ''}`}
                onClick={() => go(item.id)}
              >
                {item.label}
                {item.id === 'engines' && badge > 0 ? <span className="badge">{badge}</span> : null}
              </button>
            ))}
          </nav>
          <span className="spacer" />
          <span className="save">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            {savedText}
          </span>
        </div>
      </header>

      <div className="shell">
        {notice ? (
          <div className="banner info" style={{ marginBottom: 16 }}>
            <span>{notice}</span>
            <span className="spacer" />
            <button type="button" className="btn ghost small" onClick={() => setNotice('')}>
              知道了
            </button>
          </div>
        ) : null}

        {tab === 'general' ? (
          <>
            <div className="cat-head">
              <h1>通用</h1>
            </div>

            <section className="card section">
              <SectionTitle icon="sliders">外观与语言</SectionTitle>
              <div className="grid-2">
                <label className="field">
                  <span className="field-label">界面主题</span>
                  <select
                    className="select"
                    style={{ width: '100%' }}
                    value={settings.theme}
                    onChange={(event) => patch({ theme: event.target.value as Settings['theme'] })}
                  >
                    <option value="auto">跟随系统</option>
                    <option value="light">浅色</option>
                    <option value="dark">深色</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">默认目标语言</span>
                  <select
                    className="select"
                    style={{ width: '100%' }}
                    value={settings.targetLang}
                    onChange={(event) => patch({ targetLang: event.target.value })}
                  >
                    {TARGET_LANGUAGES.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  {settings.targetLang === SMART_TARGET_LANG ? (
                    <span className="hint" style={{ display: 'block' }}>
                      智能：其他语言译成中文，中文译成英文
                    </span>
                  ) : null}
                </label>
                <label className="field">
                  <span className="field-label">默认源语言</span>
                  <select
                    className="select"
                    style={{ width: '100%' }}
                    value={settings.sourceLang}
                    onChange={(event) => patch({ sourceLang: event.target.value })}
                  >
                    {LANGUAGES.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="card section">
              <SectionTitle icon="type">翻译历史</SectionTitle>
              <div className="grid-2">
                <label className="switch" style={{ alignSelf: 'end' }}>
                  <input
                    type="checkbox"
                    checked={settings.historyEnabled}
                    onChange={(event) => patch({ historyEnabled: event.target.checked })}
                  />
                  <span className="sw" aria-hidden="true" />
                  <span>记录翻译历史</span>
                </label>
                <label className="field">
                  <span className="field-label">最多保留条数</span>
                  <input
                    className="input"
                    type="number"
                    min={20}
                    max={1000}
                    step={20}
                    value={settings.historyLimit}
                    onChange={(event) =>
                      patch({ historyLimit: Math.max(20, Math.min(1000, Number(event.target.value) || 200)) })
                    }
                  />
                </label>
              </div>
              <p className="hint">只存在本机，不上传。</p>
            </section>
          </>
        ) : null}

        {tab === 'translate' ? (
          <>
            <div className="cat-head">
              <h1>翻译</h1>
            </div>

            <section className="card section">
              <SectionTitle icon="type">划词翻译</SectionTitle>
              <div className="grid-2">
                <label className="field">
                  <span className="field-label">触发方式</span>
                  <select
                    className="select"
                    style={{ width: '100%' }}
                    value={settings.selectionTrigger}
                    onChange={(event) =>
                      patch({ selectionTrigger: event.target.value as Settings['selectionTrigger'] })
                    }
                  >
                    <option value="icon">选中后显示小图标</option>
                    <option value="shortcut">只用快捷键与右键菜单</option>
                    <option value="off">关闭划词翻译</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">上下文长度（前后各多少字符）</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={2000}
                    step={100}
                    value={settings.selectionContextChars}
                    onChange={(event) =>
                      patch({
                        selectionContextChars: Math.max(0, Math.min(2000, Number(event.target.value) || 0)),
                      })
                    }
                  />
                </label>
              </div>
              <p className="hint">选中文字与所在段落会一起发给引擎。</p>
            </section>

            <section className="card section">
              <SectionTitle icon="globe">网页翻译</SectionTitle>
              <div className="grid-2">
                <label className="field">
                  <span className="field-label">呈现方式</span>
                  <select
                    className="select"
                    style={{ width: '100%' }}
                    value={settings.pageMode}
                    onChange={(event) => patch({ pageMode: event.target.value as Settings['pageMode'] })}
                  >
                    <option value="bilingual">双语对照（原文下面加译文）</option>
                    <option value="replace">仅译文（隐藏原文，可一键还原）</option>
                  </select>
                </label>
              </div>
              <p className="hint">跳过代码块与输入框；改呈现方式后需重新翻译本页。</p>
            </section>
          </>
        ) : null}

        {tab === 'engines' ? (
          <EnginesSection settings={settings} onPatch={patch} onOpenService={openService} />
        ) : null}

        {tab === 'services' ? (
          <ServicesSection
            settings={settings}
            onPatch={patch}
            detail={detail}
            onOpenDetail={openService}
            onCloseDetail={closeService}
          />
        ) : null}

        {tab === 'misc' ? (
          <>
            <div className="cat-head">
              <h1>其它</h1>
            </div>

            <section className="card section">
              <SectionTitle icon="shield">数据与隐私</SectionTitle>
              <p className="hint">密钥只存在本机；清理操作不可撤销。</p>
              <div className="row wrap">
                <button type="button" className="btn" onClick={() => void handleClearCache()}>
                  清空译文缓存
                </button>
                <button type="button" className="btn" onClick={() => void handleClearHistory()}>
                  清空翻译历史
                </button>
                <span className="spacer" />
                <button type="button" className="btn danger" onClick={() => void handleReset()}>
                  恢复默认设置
                </button>
              </div>
            </section>

            <section className="card section">
              <SectionTitle icon="type">快捷键</SectionTitle>
              <div className="kv-row">
                <span className="k">翻译选中内容</span>
                <span className="d">
                  <span className="kbd">Alt</span> + <span className="kbd">T</span>
                </span>
              </div>
              <div className="kv-row">
                <span className="k">翻译当前页面</span>
                <span className="d">
                  <span className="kbd">Alt</span> + <span className="kbd">P</span>
                </span>
              </div>
            </section>

            <section className="card section">
              <SectionTitle icon="info">关于</SectionTitle>
              <div className="kv-row">
                <span className="k">版本</span>
                <span className="d">v{extensionVersion()} · Chromium MV3</span>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}
