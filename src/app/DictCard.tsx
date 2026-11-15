import { playPronunciation } from '../core/dictionary/audio'
import type { DictionaryEntry } from '../core/dictionary/types'
import type { DictionarySections } from '../storage/settings'

const ICON_SPEAK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 5 6 9H3v6h3l5 4z" />
    <path d="M15.5 8.5a4.5 4.5 0 0 1 0 7" />
  </svg>
)

type Props = {
  entry: DictionaryEntry
  sections: DictionarySections
}

export function DictCard({ entry, sections }: Props) {
  const phonetics = sections.phonetic ? entry.phonetics : []
  const showTranslation = sections.translation && entry.translations.length > 0
  const showDefinition = sections.definition && entry.definitions.length > 0
  const showForms = sections.forms && entry.forms.length > 0
  const showExamples = sections.examples && entry.examples.length > 0
  const showPhrases = sections.phrases && entry.phrases.length > 0
  const empty = !showTranslation && !showDefinition && !showForms && !showExamples && !showPhrases

  return (
    <div className="dict">
      <div className="dict-head">
        <span className="dict-word">{entry.word}</span>
        {phonetics.length > 0 ? (
          <div className="dict-phonetics">
            {phonetics.map((item, index) => (
              <button
                key={`${item.label}-${item.text}-${index}`}
                type="button"
                className="dict-phon"
                onClick={() => playPronunciation(item.audio, entry.word)}
                title="播放发音"
              >
                {item.label ? <span className="dict-phon-label">{item.label}</span> : null}
                {item.text ? <span className="dict-phon-text">{item.text}</span> : null}
                <span className="dict-phon-audio">{ICON_SPEAK}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {showTranslation ? (
        <section className="dict-sec">
          <h4>{entry.direction === 'zh-en' ? '英文释义' : '中文释义'}</h4>
          {entry.translations.map((item, index) => (
            <p className="dict-tr" key={`tr-${index}`}>
              {item.pos ? <span className="dict-pos">{item.pos}</span> : null}
              {item.text}
            </p>
          ))}
        </section>
      ) : null}

      {showDefinition ? (
        <section className="dict-sec">
          <h4>英英释义</h4>
          {entry.definitions.map((item, index) => (
            <p className="dict-def" key={`def-${index}`}>
              {item.pos ? <span className="dict-pos">{item.pos}</span> : null}
              {item.text}
              {item.example ? <em className="dict-def-ex">{item.example}</em> : null}
            </p>
          ))}
        </section>
      ) : null}

      {showForms ? (
        <section className="dict-sec">
          <h4>词形变化</h4>
          <div className="dict-forms">
            {entry.forms.map((item, index) => (
              <span className="dict-form" key={`form-${index}`}>
                <span className="dict-form-name">{item.name}</span>
                {item.value}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {showExamples ? (
        <section className="dict-sec">
          <h4>例句</h4>
          {entry.examples.map((item, index) => (
            <p className="dict-ex" key={`ex-${index}`}>
              <span className="dict-ex-src">{item.source}</span>
              {item.target ? <span className="dict-ex-dst">{item.target}</span> : null}
            </p>
          ))}
        </section>
      ) : null}

      {showPhrases ? (
        <section className="dict-sec">
          <h4>词组</h4>
          {entry.phrases.map((item, index) => (
            <p className="dict-phrase" key={`ph-${index}`}>
              <b>{item.phrase}</b>
              {item.meaning}
            </p>
          ))}
        </section>
      ) : null}

      {empty ? <p className="dict-hint">在设置 → 词典里选择要展示的内容</p> : null}
    </div>
  )
}
