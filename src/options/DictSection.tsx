import { useMemo, useState } from 'react'
import { entryText } from '../core/dictionary/format'
import { lookupWord } from '../core/dictionary/lookup'
import { toAppError } from '../core/errors'
import { DICTIONARY_SERVICES, findDictionaryService } from '../core/providers/dict/services'
import type { DictionarySections, Settings } from '../storage/settings'
import { SectionTitle } from '../app/SectionTitle'

type SectionKey = keyof DictionarySections

const SECTION_ITEMS: { key: SectionKey; label: string; hint: string }[] = [
  { key: 'phonetic', label: '音标与发音', hint: '英/美音标，点一下听发音' },
  { key: 'translation', label: '中文释义', hint: '按词性分组的中文解释' },
  { key: 'definition', label: '英英释义', hint: '英文释义，可带英文例句' },
  { key: 'forms', label: '词形变化', hint: '复数、过去式、现在分词等' },
  { key: 'examples', label: '双语例句', hint: '语料库例句与中文译文' },
  { key: 'phrases', label: '常用词组', hint: '常见搭配与短语' },
]

type TestState = { status: 'ok' | 'error'; message: string } | null

type Props = {
  settings: Settings
  onPatch: (patch: Partial<Settings>) => void
}

export function DictSection({ settings, onPatch }: Props) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestState>(null)
  const dictionary = settings.dictionary
  const service = useMemo(
    () => findDictionaryService(dictionary.service) ?? DICTIONARY_SERVICES[0],
    [dictionary.service],
  )
  const capabilities = service?.capabilities
  const missing = SECTION_ITEMS.filter((item) => capabilities && !capabilities[item.key]).map((item) => item.label)

  const patchDictionary = (patch: Partial<Settings['dictionary']>) => {
    onPatch({ dictionary: { ...dictionary, ...patch } })
  }

  const patchSections = (patch: Partial<DictionarySections>) => {
    onPatch({ dictionary: { ...dictionary, sections: { ...dictionary.sections, ...patch } } })
  }

  const runTest = async (): Promise<void> => {
    if (!service || testing) return
    setTesting(true)
    setResult(null)
    try {
      const found = await lookupWord({ word: service.testWord, service: service.id })
      if (!found.entry) {
        setResult({ status: 'error', message: `词典没有收录「${service.testWord}」` })
        return
      }
      const sample = entryText(found.entry).split('\n')[0] ?? ''
      setResult({
        status: 'ok',
        message: `连接成功：${Math.round(found.elapsedMs)} ms，示例「${sample.slice(0, 60)}」`,
      })
    } catch (error) {
      setResult({ status: 'error', message: toAppError(error).message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <div className="cat-head">
        <h1>词典</h1>
      </div>

      <section className="card section">
        <SectionTitle icon="book">单词查询</SectionTitle>
        <div className="grid-2">
          <label className="switch" style={{ alignSelf: 'end' }}>
            <input
              type="checkbox"
              checked={dictionary.enabled}
              onChange={(event) => patchDictionary({ enabled: event.target.checked })}
            />
            <span className="sw" aria-hidden="true" />
            <span>单词自动查词典</span>
          </label>
          <label className="field">
            <span className="field-label">词典服务</span>
            <select
              className="select"
              style={{ width: '100%' }}
              value={dictionary.service}
              onChange={(event) =>
                patchDictionary({ service: event.target.value as Settings['dictionary']['service'] })
              }
            >
              {DICTIONARY_SERVICES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint">
          输入或划选单个英文单词（或 1–4 个汉字的词）时优先查词典；词典没有收录或查询失败会自动改用翻译引擎，长句与段落始终走翻译。中文词只有有道词典能查。
        </p>
        {service ? (
          <div className="row wrap" style={{ alignItems: 'center' }}>
            <span className="svc-tag">{service.tag}</span>
            <span className="hint">{service.note}</span>
          </div>
        ) : null}
        <div className="row wrap">
          <button type="button" className="btn primary" onClick={() => void runTest()} disabled={testing}>
            {testing ? '测试中…' : '测试词典'}
          </button>
          <span className="hint">会查询「{service?.testWord ?? 'hello'}」并显示首条释义</span>
        </div>
        {result ? <div className={`banner ${result.status === 'ok' ? 'ok' : 'error'}`}>{result.message}</div> : null}
      </section>

      <section className="card section">
        <SectionTitle icon="sliders">展示内容</SectionTitle>
        <div className="grid-2">
          {SECTION_ITEMS.map((item) => {
            const supported = capabilities ? capabilities[item.key] : false
            return (
              <label className="switch" key={item.key} style={{ opacity: supported ? 1 : 0.5 }}>
                <input
                  type="checkbox"
                  checked={dictionary.sections[item.key]}
                  disabled={!supported}
                  onChange={(event) => patchSections({ [item.key]: event.target.checked })}
                />
                <span className="sw" aria-hidden="true" />
                <span>{item.label}</span>
              </label>
            )
          })}
        </div>
        {missing.length > 0 ? (
          <p className="hint">当前词典服务不提供：{missing.join('、')}；换成有道词典可以展示全部内容。</p>
        ) : (
          <p className="hint">归入词卡的每一块都可以单独关掉，关掉后不会再占位置。</p>
        )}
      </section>
    </>
  )
}
