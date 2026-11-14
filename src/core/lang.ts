export type LangOption = {
  code: string
  label: string
}

export const AUTO_LANG = 'auto'

export const LANGUAGES: LangOption[] = [
  { code: AUTO_LANG, label: '自动检测' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁体中文' },
  { code: 'en', label: '英语' },
  { code: 'ja', label: '日语' },
  { code: 'ko', label: '韩语' },
  { code: 'fr', label: '法语' },
  { code: 'de', label: '德语' },
  { code: 'es', label: '西班牙语' },
  { code: 'ru', label: '俄语' },
  { code: 'pt', label: '葡萄牙语' },
  { code: 'it', label: '意大利语' },
  { code: 'ar', label: '阿拉伯语' },
]

export const SMART_TARGET_LANG = 'smart'

export const TARGET_LANGUAGES: LangOption[] = [
  { code: SMART_TARGET_LANG, label: '智能（中⇄英）' },
  ...LANGUAGES.filter((item) => item.code !== AUTO_LANG),
]

const LABEL_BY_CODE = new Map(LANGUAGES.map((item) => [item.code, item.label]))

export function langLabel(code: string): string {
  return LABEL_BY_CODE.get(code) ?? code
}

export function isTargetOnlyLang(code: string): boolean {
  return code !== AUTO_LANG && LABEL_BY_CODE.has(code)
}

type ScriptCount = {
  cjk: number
  hangul: number
  kana: number
  cyrillic: number
  arabic: number
  latin: number
  total: number
}

function countScripts(text: string): ScriptCount {
  const result: ScriptCount = { cjk: 0, hangul: 0, kana: 0, cyrillic: 0, arabic: 0, latin: 0, total: 0 }
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (code === 0) continue
    if (/\s/.test(char) || /[0-9]/.test(char)) continue
    if (/[\p{P}\p{S}]/u.test(char)) continue
    result.total += 1
    if (code >= 0x4e00 && code <= 0x9fff) result.cjk += 1
    else if (code >= 0x3040 && code <= 0x30ff) result.kana += 1
    else if (code >= 0xac00 && code <= 0xd7af) result.hangul += 1
    else if (code >= 0x0400 && code <= 0x04ff) result.cyrillic += 1
    else if (code >= 0x0600 && code <= 0x06ff) result.arabic += 1
    else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) result.latin += 1
  }
  return result
}

export function detectLang(text: string): string {
  const stats = countScripts(text)
  if (stats.total === 0) return 'en'
  if (stats.kana > 0) return 'ja'
  if (stats.hangul / stats.total > 0.2) return 'ko'
  if (stats.cyrillic / stats.total > 0.2) return 'ru'
  if (stats.arabic / stats.total > 0.2) return 'ar'
  if (stats.cjk / stats.total > 0.15) return 'zh-CN'
  if (stats.latin / stats.total > 0.2) return 'en'
  return 'en'
}

export function resolveSourceLang(sourceLang: string, text: string): string {
  return sourceLang === AUTO_LANG ? detectLang(text) : sourceLang
}

export function resolveTargetLang(targetLang: string, text: string): string {
  if (targetLang !== SMART_TARGET_LANG) return targetLang
  return detectLang(text).startsWith('zh') ? 'en' : 'zh-CN'
}
