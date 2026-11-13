import { useState } from 'react'
import type { AiProviderConfig, Settings } from '../storage/settings'
import { newId } from '../storage/local'
import type { ErrorCode } from '../core/errors'
import { toAppError } from '../core/errors'
import { AI_PRESETS, findPreset, originPattern } from '../core/providers/ai/presets'
import { isJobEvent, YUYI_PORT } from '../core/messaging'
import type { JobEvent } from '../core/messaging'
import { SectionTitle } from '../app/SectionTitle'

type Props = {
  settings: Settings
  onChange: (providers: AiProviderConfig[]) => void
}

type TestState = {
  status: 'ok' | 'error'
  message: string
} | null

async function requestHostPermission(baseUrl: string): Promise<boolean> {
  const pattern = originPattern(baseUrl)
  if (!pattern) return false
  try {
    return await chrome.permissions.request({ origins: [pattern] })
  } catch {
    return false
  }
}

function testProvider(config: AiProviderConfig): Promise<{ latencyMs: number; sample: string }> {
  return new Promise((resolve, reject) => {
    const requestId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `test-${Date.now()}`
    const port = chrome.runtime.connect({ name: YUYI_PORT })
    const timer = setTimeout(() => {
      port.disconnect()
      reject(new Error('测试超时（60 秒），请检查网络或服务地址'))
    }, 60_000)
    port.onMessage.addListener((event: unknown) => {
      if (!isJobEvent(event)) return
      const jobEvent = event as JobEvent
      if (jobEvent.requestId !== requestId) return
      clearTimeout(timer)
      port.disconnect()
      if (jobEvent.kind === 'testDone') {
        resolve({ latencyMs: jobEvent.latencyMs, sample: jobEvent.sample })
        return
      }
      if (jobEvent.kind === 'error') {
        reject(new Error(jobEvent.message))
        return
      }
      reject(new Error('收到了意外的测试结果'))
    })
    port.onDisconnect.addListener(() => {
      clearTimeout(timer)
    })
    port.postMessage({ kind: 'test', requestId, config })
  })
}

export function AiProvidersSection({ settings, onChange }: Props) {
  const [presetId, setPresetId] = useState(AI_PRESETS[0]?.id ?? 'custom')
  const [testingId, setTestingId] = useState('')
  const [results, setResults] = useState<Record<string, TestState>>({})

  const addProvider = () => {
    const preset = findPreset(presetId)
    const provider: AiProviderConfig = {
      id: newId(),
      label: preset.label,
      presetId: preset.id,
      baseUrl: preset.baseUrl,
      apiKey: '',
      model: preset.models[0] ?? '',
      temperature: 0.3,
    }
    onChange([...settings.aiProviders, provider])
  }

  const updateProvider = (id: string, patch: Partial<AiProviderConfig>) => {
    onChange(settings.aiProviders.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const removeProvider = (id: string) => {
    if (!window.confirm('删除这个 AI 服务配置？')) return
    onChange(settings.aiProviders.filter((item) => item.id !== id))
  }

  const handleTest = async (provider: AiProviderConfig) => {
    if (!provider.baseUrl.trim()) {
      setResults((prev) => ({ ...prev, [provider.id]: { status: 'error', message: '请先填写 Base URL' } }))
      return
    }
    setTestingId(provider.id)
    setResults((prev) => ({ ...prev, [provider.id]: null }))
    try {
      const granted = await requestHostPermission(provider.baseUrl)
      if (!granted) {
        setResults((prev) => ({
          ...prev,
          [provider.id]: { status: 'error', message: '没有获得访问这个地址的授权，请在浏览器的权限弹窗里点「允许」' },
        }))
        return
      }
      const result = await testProvider(provider)
      setResults((prev) => ({
        ...prev,
        [provider.id]: {
          status: 'ok',
          message: `连接成功：${result.latencyMs} ms，示例译文「${result.sample}」`,
        },
      }))
    } catch (error) {
      const code: ErrorCode = toAppError(error).code
      setResults((prev) => ({
        ...prev,
        [provider.id]: { status: 'error', message: `${toAppError(error).message}（${code}）` },
      }))
    } finally {
      setTestingId('')
    }
  }

  return (
    <section className="card section">
      <SectionTitle icon="cpu">AI 服务（OpenAI 兼容）</SectionTitle>
      <p className="hint">
        填一个 OpenAI 兼容服务的 Base URL、模型名和 API Key。第一次连接某个服务地址时，点「授权并测试」让浏览器允许扩展访问它。
      </p>

      <div className="row wrap">
        <select
          className="select"
          value={presetId}
          onChange={(event) => setPresetId(event.target.value)}
          style={{ minWidth: 220 }}
        >
          {AI_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn primary" onClick={addProvider}>
          添加 AI 服务
        </button>
      </div>

      {settings.aiProviders.length === 0 ? (
        <p className="empty">还没有 AI 服务。没有也可以先用免费通道翻译，AI 只影响语法检查与润色的质量。</p>
      ) : null}

      {settings.aiProviders.map((provider) => {
        const result = results[provider.id]
        return (
          <div key={provider.id} className="card flat provider-card">
            <div className="provider-head">
              <strong>{provider.label || '未命名服务'}</strong>
              <span className="tag">{provider.presetId}</span>
              <span className="spacer" />
              <button type="button" className="btn danger small" onClick={() => removeProvider(provider.id)}>
                删除
              </button>
            </div>

            <div className="grid-2">
              <label className="field">
                <span className="field-label">显示名称</span>
                <input
                  className="input"
                  value={provider.label}
                  onChange={(event) => updateProvider(provider.id, { label: event.target.value })}
                  placeholder="例如：DeepSeek 主力"
                />
              </label>
              <label className="field">
                <span className="field-label">模型</span>
                <input
                  className="input"
                  value={provider.model}
                  onChange={(event) => updateProvider(provider.id, { model: event.target.value })}
                  placeholder="例如：deepseek-chat"
                />
              </label>
            </div>

            <label className="field">
              <span className="field-label">Base URL</span>
              <input
                className="input mono"
                value={provider.baseUrl}
                onChange={(event) => updateProvider(provider.id, { baseUrl: event.target.value })}
                placeholder="例如：https://api.deepseek.com/v1"
              />
            </label>

            <div className="grid-2">
              <label className="field">
                <span className="field-label">API Key</span>
                <input
                  className="input mono"
                  type="password"
                  value={provider.apiKey}
                  onChange={(event) => updateProvider(provider.id, { apiKey: event.target.value })}
                  placeholder="sk-..."
                />
              </label>
              <label className="field">
                <span className="field-label">温度（0 最稳定，1 最发散）</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={provider.temperature}
                  onChange={(event) =>
                    updateProvider(provider.id, { temperature: Number(event.target.value) || 0 })
                  }
                />
              </label>
            </div>

            <div className="row wrap">
              <button
                type="button"
                className="btn"
                onClick={() => void handleTest(provider)}
                disabled={testingId === provider.id}
              >
                {testingId === provider.id ? '测试中…' : '授权并测试'}
              </button>
              <span className="hint">测试会翻译一句 Hello world，消耗可忽略的额度。</span>
            </div>

            {result ? (
              <div className={`banner ${result.status === 'ok' ? 'ok' : 'error'}`}>{result.message}</div>
            ) : null}
          </div>
        )
      })}
    </section>
  )
}
