import { useEffect, useMemo, useState } from 'react'
import type { AiProviderConfig, Settings } from '../storage/settings'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../storage/settings'
import { listAiEngines, listEngines } from '../core/providers/registry'
import { LANGUAGES } from '../core/lang'
import { clearCache } from '../core/cache'
import { clearHistory } from '../storage/history'
import { applyTheme } from '../ui/apply-theme'
import { extensionVersion } from '../ui/version'
import { SectionTitle } from '../app/SectionTitle'
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
  const aiEngines = useMemo(() => (settings ? listAiEngines(settings) : []), [settings])

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
      <header className="opts-head">
        <div className="stack" style={{ gap: 4 }}>
          <h1 className="page-title">羽译 · 设置</h1>
          <p className="page-subtitle">
            翻译、语法检查、润色与生词学习一体的浏览器扩展。当前版本 v{extensionVersion()}，生词学习在后续里程碑实现。
          </p>
        </div>
        <span className="save">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {savedText}
        </span>
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
        <SectionTitle icon="sliders">通用</SectionTitle>
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
            <span className="sw" aria-hidden="true" />
            <span>记录翻译历史</span>
          </label>
        </div>
      </section>

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
              <option value="shortcut">只用快捷键 Alt+T / 右键菜单</option>
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
        <p className="hint">
          划词翻译会把选中文字和它所在段落（作为语境）一起发给当前翻译引擎。关掉小图标后，仍可用右键菜单和 Alt+T。
        </p>
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
        <p className="hint">
          网页翻译会跳过代码块、输入框与隐藏内容，翻译过程中可在页面右下角取消。改了呈现方式后，回面板再点一次「翻译本页」就会按新方式重排；按域名自动翻译留到后续版本。
        </p>
      </section>

      <section className="card section">
        <SectionTitle icon="zap">翻译引擎</SectionTitle>
        <p className="hint">
          翻译、语法检查、润色、网页翻译可以分别指定引擎。AI 更懂语境但会产生费用；免费通道适合长文与兜底。检查和润色只能用 AI。
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
            <span className="field-label">网页翻译</span>
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
          <label className="field">
            <span className="field-label">语法检查（只用 AI）</span>
            <select
              className="select"
              style={{ width: '100%' }}
              value={settings.checkEngine}
              onChange={(event) => patch({ checkEngine: event.target.value })}
            >
              <option value="">自动：翻译引擎是 AI 就用它，否则用第一个 AI 服务</option>
              {aiEngines.map((engine) => (
                <option key={engine.id} value={engine.id}>
                  {engine.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">润色（只用 AI）</span>
            <select
              className="select"
              style={{ width: '100%' }}
              value={settings.polishEngine}
              onChange={(event) => patch({ polishEngine: event.target.value })}
            >
              <option value="">自动：翻译引擎是 AI 就用它，否则用第一个 AI 服务</option>
              {aiEngines.map((engine) => (
                <option key={engine.id} value={engine.id}>
                  {engine.label}
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
            <span className="sw" aria-hidden="true" />
            <span>启用谷歌翻译免费通道（免 Key）</span>
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.mtEnabled.mymemory !== false}
              onChange={(event) => patch({ mtEnabled: { ...settings.mtEnabled, mymemory: event.target.checked } })}
            />
            <span className="sw" aria-hidden="true" />
            <span>启用 MyMemory（免 Key，有限流）</span>
          </label>
        </div>
      </section>

      <AiProvidersSection settings={settings} onChange={updateProviders} />

      <section className="card section">
        <SectionTitle icon="shield">数据与隐私</SectionTitle>
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
        <SectionTitle icon="info">关于</SectionTitle>
        <p className="hint">
          羽译 v{extensionVersion()} · 快捷键：Alt+T 翻译选中内容，Alt+P 翻译当前页面（可在浏览器扩展快捷键页修改）。
        </p>
      </section>
    </div>
  )
}
