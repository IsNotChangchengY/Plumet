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
        className="sb-chip"
        value={sourceLang}
        onChange={(event) => onChangeSource(event.target.value)}
        title="源语言"
        aria-label="源语言"
      >
        {LANGUAGES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="sb-swap"
        onClick={onSwap}
        disabled={sourceLang === 'auto'}
        title={sourceLang === 'auto' ? '自动检测时无法互换' : '互换语言'}
        aria-label="互换语言"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 3h5v5" />
          <path d="M21 3 8 16" />
          <path d="M8 21H3v-5" />
          <path d="m3 21 13-13" />
        </svg>
      </button>
      <select
        className="sb-chip"
        value={targetLang}
        onChange={(event) => onChangeTarget(event.target.value)}
        title="目标语言"
        aria-label="目标语言"
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
