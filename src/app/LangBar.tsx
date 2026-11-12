import { LANGUAGES } from '../core/lang'

type Props = {
  sourceLang: string
  targetLang: string
  onChangeSource: (code: string) => void
  onChangeTarget: (code: string) => void
  onSwap: () => void
}

export function LangBar({ sourceLang, targetLang, onChangeSource, onChangeTarget, onSwap }: Props) {
  const targetOptions = LANGUAGES.filter((item) => item.code !== 'auto')
  return (
    <div className="lang-bar">
      <select
        className="select"
        style={{ flex: 1 }}
        value={sourceLang}
        onChange={(event) => onChangeSource(event.target.value)}
        title="源语言"
      >
        {LANGUAGES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn ghost small"
        onClick={onSwap}
        disabled={sourceLang === 'auto'}
        title={sourceLang === 'auto' ? '自动检测时无法互换' : '互换语言'}
      >
        ⇄
      </button>
      <select
        className="select"
        style={{ flex: 1 }}
        value={targetLang}
        onChange={(event) => onChangeTarget(event.target.value)}
        title="目标语言"
      >
        {targetOptions.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  )
}
