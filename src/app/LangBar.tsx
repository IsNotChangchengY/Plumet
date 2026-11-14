import { AUTO_LANG, LANGUAGES, SMART_TARGET_LANG, TARGET_LANGUAGES } from '../core/lang'

type Props = {
  sourceLang: string
  targetLang: string
  onChangeSource: (code: string) => void
  onChangeTarget: (code: string) => void
  onSwap: () => void
}

export function LangBar({ sourceLang, targetLang, onChangeSource, onChangeTarget, onSwap }: Props) {
  const smartTarget = targetLang === SMART_TARGET_LANG
  const swapDisabled = sourceLang === AUTO_LANG || smartTarget
  const swapTitle = smartTarget ? '智能目标语言无法互换' : '自动检测时无法互换'

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
        disabled={swapDisabled}
        title={swapDisabled ? swapTitle : '互换语言'}
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
        title={smartTarget ? '其他语言译成中文，中文译成英文' : '目标语言'}
        aria-label="目标语言"
      >
        {TARGET_LANGUAGES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  )
}
