import { useState } from 'react'
import { toAppError } from '../core/errors'
import { AI_PRESETS, findPreset } from '../core/providers/ai/presets'
import {
  aiProviderMissing,
  findMtService,
  FREE_SERVICES,
  KEY_SERVICES,
  missingMtFields,
} from '../core/providers/services'
import type { AiProviderConfig, MtServiceConfig, MtServiceId, Settings } from '../storage/settings'
import { newId } from '../storage/local'
import { SectionTitle } from '../app/SectionTitle'
import { openLink, requestHostPermission, testAiService, testMtService } from './test'

type TestState = { status: 'ok' | 'error'; message: string } | null

type Props = {
  settings: Settings
  onPatch: (patch: Partial<Settings>) => void
  detail: string
  onOpenDetail: (key: string) => void
  onCloseDetail: () => void
}

export function ServicesSection({ settings, onPatch, detail, onOpenDetail, onCloseDetail }: Props) {
  const [testing, setTesting] = useState('')
  const [results, setResults] = useState<Record<string, TestState>>({})
  const [presetId, setPresetId] = useState(AI_PRESETS[0]?.id ?? 'custom')

  const setService = (id: MtServiceId, patch: Partial<MtServiceConfig>) => {
    onPatch({ services: { ...settings.services, [id]: { ...settings.services[id], ...patch } } })
  }

  const setProvider = (id: string, patch: Partial<AiProviderConfig>) => {
    onPatch({
      aiProviders: settings.aiProviders.map((provider) =>
        provider.id === id ? { ...provider, ...patch } : provider,
      ),
    })
  }

  const addProvider = (): void => {
    const preset = findPreset(presetId)
    if (preset.baseUrl) void requestHostPermission(preset.baseUrl)
    const provider: AiProviderConfig = {
      id: newId(),
      label: preset.label,
      presetId: preset.id,
      baseUrl: preset.baseUrl,
      apiKey: '',
      model: preset.models[0] ?? '',
      temperature: 0.3,
    }
    onPatch({ aiProviders: [...settings.aiProviders, provider] })
    onOpenDetail(`ai:${provider.id}`)
  }

  const removeProvider = (id: string): void => {
    if (!window.confirm('删除这个 AI 服务？')) return
    onPatch({ aiProviders: settings.aiProviders.filter((provider) => provider.id !== id) })
    onCloseDetail()
  }

  const clearService = (id: MtServiceId): void => {
    if (!window.confirm('清空这个服务的凭证？')) return
    setService(id, { appId: '', secret: '', key: '', region: '', endpoint: '' })
    setResults((prev) => ({ ...prev, [id]: null }))
  }

  const runMtTest = async (id: MtServiceId): Promise<void> => {
    if (testing) return
    setTesting(id)
    setResults((prev) => ({ ...prev, [id]: null }))
    try {
      const result = await testMtService(id, settings.services[id])
      setResults((prev) => ({
        ...prev,
        [id]: {
          status: 'ok',
          message: `连接成功：${result.latencyMs} ms，示例译文「${result.sample}」`,
        },
      }))
    } catch (error) {
      setResults((prev) => ({ ...prev, [id]: { status: 'error', message: toAppError(error).message } }))
    } finally {
      setTesting('')
    }
  }

  const runAiTest = async (provider: AiProviderConfig): Promise<void> => {
    const key = `ai:${provider.id}`
    if (testing) return
    if (!provider.baseUrl.trim()) {
      setResults((prev) => ({ ...prev, [key]: { status: 'error', message: '请先填写 Base URL' } }))
      return
    }
    setTesting(key)
    setResults((prev) => ({ ...prev, [key]: null }))
    try {
      const granted = await requestHostPermission(provider.baseUrl)
      if (!granted) {
        setResults((prev) => ({
          ...prev,
          [key]: { status: 'error', message: '没有获得访问这个地址的授权，请在权限弹窗里点「允许」' },
        }))
        return
      }
      const result = await testAiService(provider)
      setResults((prev) => ({
        ...prev,
        [key]: {
          status: 'ok',
          message: `连接成功：${result.latencyMs} ms，示例译文「${result.sample}」`,
        },
      }))
    } catch (error) {
      setResults((prev) => ({ ...prev, [key]: { status: 'error', message: toAppError(error).message } }))
    } finally {
      setTesting('')
    }
  }

  const mtDetail = detail.startsWith('ai:') ? undefined : findMtService(detail)
  const aiDetail = detail.startsWith('ai:')
    ? settings.aiProviders.find((provider) => `ai:${provider.id}` === detail)
    : undefined

  const renderMtDetail = (service: NonNullable<ReturnType<typeof findMtService>>) => {
    const config = settings.services[service.id]
    const ready = missingMtFields(settings, service.id).length === 0
    const result = results[service.id]

    return (
      <>
        <button type="button" className="back" onClick={onCloseDetail}>
          ← 全部服务
        </button>
        <div className="detail-head">
          <span className="svc-ico">{service.label.slice(0, 1)}</span>
          <div>
            <h1>{service.label}</h1>
            <div className="meta">
              <span className="svc-tag">机器翻译</span>
              <span className={ready ? 'st ok' : 'st err'}>
                <i />
                {ready ? '就绪' : '未配置'}
              </span>
            </div>
          </div>
        </div>

        <div className="detail-grid">
          <div className="detail-main">
            <section className="card section">
              <SectionTitle icon="cpu">凭证</SectionTitle>
              <div className="grid-2">
                {service.fields.map((field) => (
                  <label className="field" key={field.key}>
                    <span className="field-label">{field.label}</span>
                    <input
                      className="input mono"
                      type={field.secret ? 'password' : 'text'}
                      value={config[field.key]}
                      placeholder={field.placeholder}
                      onChange={(event) => setService(service.id, { [field.key]: event.target.value })}
                    />
                  </label>
                ))}
              </div>
              <div className="row wrap">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void runMtTest(service.id)}
                  disabled={testing === service.id}
                >
                  {testing === service.id ? '测试中…' : '测试连接'}
                </button>
                <span className="spacer" />
                <button type="button" className="btn danger small" onClick={() => clearService(service.id)}>
                  清空凭证
                </button>
              </div>
              {result ? <div className={`banner ${result.status === 'ok' ? 'ok' : 'error'}`}>{result.message}</div> : null}
            </section>
          </div>

          <aside className="detail-aside">
            {service.steps.length > 0 ? (
              <div className="aside-card">
                <h3>
                  <span className="card-ico" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <path d="M15 3h6v6" />
                      <path d="M10 14 21 3" />
                    </svg>
                  </span>
                  怎么拿密钥
                </h3>
                <ol className="steps">
                  {service.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {service.applyUrl ? (
                  <button type="button" className="btn small" onClick={() => openLink(service.applyUrl)}>
                    打开申请页面 ↗
                  </button>
                ) : null}
              </div>
            ) : null}

            {service.quota ? (
              <div className="aside-card">
                <h3>
                  <span className="card-ico" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 7v5l3 2" />
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                  </span>
                  额度
                </h3>
                <div className="quota">{service.quota}</div>
              </div>
            ) : null}
          </aside>
        </div>
      </>
    )
  }

  const renderAiDetail = (provider: AiProviderConfig) => {
    const key = `ai:${provider.id}`
    const ready = aiProviderMissing(provider).length === 0
    const result = results[key]

    return (
      <>
        <button type="button" className="back" onClick={onCloseDetail}>
          ← 全部服务
        </button>
        <div className="detail-head">
          <span className="svc-ico ai">AI</span>
          <div>
            <h1>{provider.label.trim() || provider.model.trim() || 'AI 服务'}</h1>
            <div className="meta">
              <span className="svc-tag">AI 服务</span>
              <span className={ready ? 'st ok' : 'st err'}>
                <i />
                {ready ? '就绪' : '未配置'}
              </span>
            </div>
          </div>
        </div>

        <section className="card section">
          <SectionTitle icon="cpu">配置</SectionTitle>
          <div className="grid-2">
            <label className="field">
              <span className="field-label">显示名称</span>
              <input
                className="input"
                value={provider.label}
                placeholder="例如：DeepSeek 主力"
                onChange={(event) => setProvider(provider.id, { label: event.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">模型</span>
              <input
                className="input"
                value={provider.model}
                placeholder="例如：deepseek-chat"
                onChange={(event) => setProvider(provider.id, { model: event.target.value })}
              />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Base URL</span>
            <input
              className="input mono"
              value={provider.baseUrl}
              placeholder="例如：https://api.deepseek.com/v1"
              onChange={(event) => setProvider(provider.id, { baseUrl: event.target.value })}
            />
          </label>
          <div className="grid-2">
            <label className="field">
              <span className="field-label">API Key</span>
              <input
                className="input mono"
                type="password"
                value={provider.apiKey}
                placeholder="sk-..."
                onChange={(event) => setProvider(provider.id, { apiKey: event.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">温度</span>
              <input
                className="input"
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={provider.temperature}
                onChange={(event) =>
                  setProvider(provider.id, { temperature: Number(event.target.value) || 0 })
                }
              />
            </label>
          </div>
          <div className="row wrap">
            <button
              type="button"
              className="btn primary"
              onClick={() => void runAiTest(provider)}
              disabled={testing === key}
            >
              {testing === key ? '测试中…' : '授权并测试'}
            </button>
            <span className="spacer" />
            <button type="button" className="btn danger small" onClick={() => removeProvider(provider.id)}>
              删除
            </button>
          </div>
          {result ? <div className={`banner ${result.status === 'ok' ? 'ok' : 'error'}`}>{result.message}</div> : null}
        </section>
      </>
    )
  }

  return (
    <>
      <div className="cat-head">
        <h1>翻译服务</h1>
      </div>

      {mtDetail ? renderMtDetail(mtDetail) : null}
      {aiDetail ? renderAiDetail(aiDetail) : null}

      {!mtDetail && !aiDetail ? (
        <>
          <div className="group">
            <div className="group-head">
              <h2>免费通道</h2>
              <span className="n">{FREE_SERVICES.length}</span>
              <span className="line" />
            </div>
            <div className="card list">
              {FREE_SERVICES.map((service) => {
                const config = settings.services[service.id]
                return (
                  <div className="svc-row" key={service.id}>
                    <span className="svc-ico">{service.label.slice(0, 1)}</span>
                    <span className="svc-name">{service.label}</span>
                    <span className="svc-tag">{service.tag}</span>
                    <span className="spacer" />
                    <label className="switch" style={{ height: 'auto' }}>
                      <input
                        type="checkbox"
                        checked={config.enabled}
                        onChange={(event) => setService(service.id, { enabled: event.target.checked })}
                      />
                      <span className="sw" aria-hidden="true" />
                      <span />
                    </label>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="group">
            <div className="group-head">
              <h2>机器翻译</h2>
              <span className="n">{KEY_SERVICES.length}</span>
              <span className="line" />
            </div>
            <div className="card list">
              {KEY_SERVICES.map((service) => {
                const ready = missingMtFields(settings, service.id).length === 0
                return (
                  <div
                    className="svc-row svc-row-link"
                    key={service.id}
                    onClick={() => onOpenDetail(service.id)}
                  >
                    <span className="svc-ico">{service.label.slice(0, 1)}</span>
                    <span className="svc-name">{service.label}</span>
                    <span className="svc-tag">{service.tag}</span>
                    <span className="spacer" />
                    <span className={ready ? 'st ok' : 'st err'}>
                      <i />
                      {ready ? '就绪' : '未配置'}
                    </span>
                    <button type="button" className="btn small">
                      {ready ? '管理' : '填写'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="group">
            <div className="group-head">
              <h2>AI 服务</h2>
              <span className="n">{settings.aiProviders.length}</span>
              <span className="line" />
              <div className="row" style={{ gap: 6 }}>
                <select
                  className="select"
                  style={{ maxWidth: 190 }}
                  value={presetId}
                  aria-label="AI 服务预设"
                  onChange={(event) => setPresetId(event.target.value)}
                >
                  {AI_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn small primary" onClick={addProvider}>
                  添加
                </button>
              </div>
            </div>

            {settings.aiProviders.length === 0 ? (
              <div className="card list">
                <div className="svc-row">
                  <span className="hint">还没有 AI 服务。</span>
                </div>
              </div>
            ) : (
              <div className="grid-svc">
                {settings.aiProviders.map((provider) => {
                  const ready = aiProviderMissing(provider).length === 0
                  const name = provider.label.trim() || provider.model.trim() || '未命名服务'
                  return (
                    <article
                      className="svc is-link"
                      key={provider.id}
                      onClick={() => onOpenDetail(`ai:${provider.id}`)}
                    >
                      <div className="svc-top">
                        <span className="svc-ico ai">{name.slice(0, 1).toUpperCase()}</span>
                        <span className="svc-name">{name}</span>
                        <span className="spacer" />
                        <span className={ready ? 'st ok' : 'st err'}>
                          <i />
                          {ready ? '就绪' : '未配置'}
                        </span>
                      </div>
                      <div className="svc-foot">
                        <span className="svc-model">{provider.model.trim() || provider.baseUrl.replace(/^https?:\/\//, '')}</span>
                        <span className="grow" />
                        <span className="st">管理</span>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </>
  )
}
