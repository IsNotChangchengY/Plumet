import { useEffect, useMemo, useState } from 'react'
import type { AiProviderConfig, Settings } from '../storage/settings'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../storage/settings'
import { listEngines } from '../core/providers/registry'
import { LANGUAGES } from '../core/lang'
import { clearCache } from '../core/cache'
import { clearHistory } from '../storage/history'
import { applyTheme } from '../ui/apply-theme'
import { AiProvidersSection } from './AiProvidersSection'

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [notice, setNotice] = useState('')

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

  const engines = useMemo(() => (settings ? listEngines(settings) : []), [settings])

  if (!settings) {
    return <div className="container">正在加载设置…</div>
  }

  const patch = (partial: Partial<Settings>) => {
    setSettings({ ...settings, ...partial })
  }

  const updateProviders = (providers: AiProviderConfig[]) => {
    setSettings({ ...settings, aiProviders: providers })
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
    if (!window.confirm('恢复默认设置？AI 服务配置与 API Key 都会被清除。')) return
    await saveSettings(DEFAULT_SETTINGS)
    setSettings({ ...DEFAULT_SETTINGS })
    setNotice('已恢复默认设置')
  }

  const savedText = savedAt ? `已自动保存 ${new Date(savedAt).toLocaleTimeString('zh-CN')}` : '修改后自动保存'

  return (
    <div className="container">
      <header className="stack">
        <h1 className="page-title">羽译 · 设置</h1>
        <p className="page-subtitle">
          翻译、语法检查、润色与生词学习一体的浏览器扩展。当前版本 v0.1.0，网页翻译与划词翻译在后续里程碑实现。
        </p>
        <span className="hint">{savedText}</span>
      </header>

      {notice ? (
        <div className="banner info">
          <span>{notice}</span>
          <span className="spacer" />
          <button type="button" className="btn ghost small" onClick={() => setNotice('')}>
            知道了
          </button>
        </div>
      ) : null}

      <section className="card section">
        <h2 className="section-title">通用</h2>
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
              {LANGUAGES.filter((item) => item.code !== 'auto').map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
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
          <label className="switch" style={{ alignSelf: 'end' }}>
            <input
              type="checkbox"
              checked={settings.historyEnabled}
              onChange={(event) => patch({ historyEnabled: event.target.checked })}
            />
            记录翻译历史
          </label>
        </div>
      </section>

      <section className="card section">
        <h2 className="section-title">翻译引擎</h2>
        <p className="hint">
          翻译面板与网页翻译可以分别指定引擎。AI 引擎更懂语境，但会产生费用；免费通道适合长文与兜底。
        </p>
        <div className="grid-2">
          <label className="field">
            <span className="field-label">翻译面板</span>
            <select
              className="select"
              style={{ width: '100%' }}
              value={settings.translateEngine}
              onChange={(event) => patch({ translateEngine: event.target.value })}
            >
              {engines.map((engine) => (
                <option key={engine.id} value={engine.id}>
                  {engine.label}
                  {engine.configured ? '' : '（未配置）'}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">网页翻译（M4 使用）</span>
            <select
              className="select"
              style={{ width: '100%' }}
              value={settings.pageEngine}
              onChange={(event) => patch({ pageEngine: event.target.value })}
            >
              {engines.map((engine) => (
                <option key={engine.id} value={engine.id}>
                  {engine.label}
                  {engine.configured ? '' : '（未配置）'}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row wrap">
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.mtEnabled['google-free'] !== false}
              onChange={(event) =>
                patch({ mtEnabled: { ...settings.mtEnabled, 'google-free': event.target.checked } })
              }
            />
            启用谷歌翻译免费通道（免 Key）
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.mtEnabled.mymemory !== false}
              onChange={(event) => patch({ mtEnabled: { ...settings.mtEnabled, mymemory: event.target.checked } })}
            />
            启用 MyMemory（免 Key，有限流）
          </label>
        </div>
      </section>

      <AiProvidersSection settings={settings} onChange={updateProviders} />

      <section className="card section">
        <h2 className="section-title">数据与隐私</h2>
        <p className="hint">
          翻译内容会发送到你自己选择的翻译服务。API Key 只保存在本机浏览器（chrome.storage.local），不会同步到云端，也不会写进日志。
        </p>
        <div className="row wrap">
          <button type="button" className="btn" onClick={() => void handleClearCache()}>
            清空译文缓存
          </button>
          <button type="button" className="btn" onClick={() => void handleClearHistory()}>
            清空翻译历史
          </button>
          <button type="button" className="btn danger" onClick={() => void handleReset()}>
            恢复默认设置
          </button>
        </div>
      </section>

      <section className="card section">
        <h2 className="section-title">关于</h2>
        <p className="hint">
          羽译 v0.1.0 · 快捷键：Alt+T 翻译选中内容，Alt+P 翻译当前页面（可在浏览器扩展快捷键页修改）。
        </p>
      </section>
    </div>
  )
}
