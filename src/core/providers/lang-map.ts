const BAIDU: Record<string, string> = {
  'zh-CN': 'zh',
  'zh-TW': 'cht',
  en: 'en',
  ja: 'jp',
  ko: 'kor',
  fr: 'fra',
  de: 'de',
  es: 'spa',
  ru: 'ru',
  pt: 'pt',
  it: 'it',
  ar: 'ara',
}

const AZURE: Record<string, string> = {
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
}

export function toBaiduLang(code: string): string {
  if (!code || code === 'auto') return 'auto'
  return BAIDU[code] ?? code
}

export function toAzureLang(code: string): string {
  return AZURE[code] ?? code
}
