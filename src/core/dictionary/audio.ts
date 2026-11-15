export function playPronunciation(url: string, word: string, lang = 'en'): void {
  if (url) {
    try {
      const audio = new Audio(url)
      const played = audio.play()
      if (played && typeof played.catch === 'function') {
        played.catch(() => speakText(word, lang))
      }
      return
    } catch {
      speakText(word, lang)
      return
    }
  }
  speakText(word, lang)
}

export function speakText(text: string, lang?: string): void {
  if (!text) return
  try {
    const utterance = new SpeechSynthesisUtterance(text)
    if (lang) utterance.lang = lang
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  } catch {
    // 某些页面禁用了语音合成，忽略
  }
}
