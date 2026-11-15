import { playPronunciation } from '../core/dictionary/audio'
import type { DictionaryEntry } from '../core/dictionary/types'

const ICON_SPEAK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 5 6 9H3v6h3l5 4z" />
    <path d="M15.5 8.5a4.5 4.5 0 0 1 0 7" />
  </svg>
)

type Props = {
  entry: DictionaryEntry
}

export function CardDictionary({ entry }: Props) {
  const lang = entry.direction === 'zh-en' ? 'zh' : 'en'

  return (
    <div className="learn-dict">
      {entry.phonetics.length > 0 ? (
        <div className="learn-dict-phonetics">
          {entry.phonetics.map((item, index) => (
            <button
              key={`${item.label}-${item.text}-${index}`}
              type="button"
              className="learn-dict-phon"
              title="播放发音"
              onClick={() => playPronunciation(item.audio, entry.word, lang)}
            >
              {item.label ? <span className="learn-dict-phon-label">{item.label}</span> : null}
              {item.text ? <span>{item.text}</span> : null}
              <span className="learn-dict-phon-audio">{ICON_SPEAK}</span>
            </button>
          ))}
        </div>
      ) : null}

      {entry.translations.length > 0 ? (
        <div className="learn-dict-sec">
          {entry.translations.map((item, index) => (
            <p className="learn-dict-tr" key={`tr-${index}`}>
              {item.pos ? <span className="learn-dict-pos">{item.pos}</span> : null}
              {item.text}
            </p>
          ))}
        </div>
      ) : null}

      {entry.definitions.length > 0 ? (
        <div className="learn-dict-sec">
          <span className="learn-dict-label">英英释义</span>
          {entry.definitions.map((item, index) => (
            <p className="learn-dict-def" key={`def-${index}`}>
              {item.pos ? <span className="learn-dict-pos">{item.pos}</span> : null}
              {item.text}
              {item.example ? <em className="learn-dict-ex-inline">{item.example}</em> : null}
            </p>
          ))}
        </div>
      ) : null}

      {entry.forms.length > 0 ? (
        <div className="learn-dict-sec">
          <span className="learn-dict-label">词形变化</span>
          <div className="learn-dict-forms">
            {entry.forms.map((item, index) => (
              <span className="learn-dict-form" key={`form-${index}`}>
                <span className="learn-dict-form-name">{item.name}</span>
                {item.value}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {entry.examples.length > 0 ? (
        <div className="learn-dict-sec">
          <span className="learn-dict-label">例句</span>
          {entry.examples.map((item, index) => (
            <p className="learn-dict-ex" key={`ex-${index}`}>
              <span className="learn-dict-ex-src">{item.source}</span>
              {item.target ? <span className="learn-dict-ex-dst">{item.target}</span> : null}
            </p>
          ))}
        </div>
      ) : null}

      {entry.phrases.length > 0 ? (
        <div className="learn-dict-sec">
          <span className="learn-dict-label">词组</span>
          {entry.phrases.map((item, index) => (
            <p className="learn-dict-phrase" key={`ph-${index}`}>
              <b>{item.phrase}</b>
              {item.meaning}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}
