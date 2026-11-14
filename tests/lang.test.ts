import { describe, expect, it } from 'vitest'
import { detectLang, langLabel, resolveSourceLang, resolveTargetLang, SMART_TARGET_LANG } from '../src/core/lang'

describe('detectLang', () => {
  it('识别中文', () => {
    expect(detectLang('今天天气不错，我们去公园散步吧。')).toBe('zh-CN')
  })

  it('识别英文', () => {
    expect(detectLang('The quick brown fox jumps over the lazy dog.')).toBe('en')
  })

  it('识别日文', () => {
    expect(detectLang('これはテストです')).toBe('ja')
  })

  it('识别韩文', () => {
    expect(detectLang('안녕하세요 반갑습니다')).toBe('ko')
  })

  it('识别俄文', () => {
    expect(detectLang('Привет, как дела?')).toBe('ru')
  })

  it('空文本退回英文', () => {
    expect(detectLang('')).toBe('en')
  })
})

describe('resolveSourceLang', () => {
  it('auto 时才做检测', () => {
    expect(resolveSourceLang('auto', 'hello')).toBe('en')
    expect(resolveSourceLang('ja', 'hello')).toBe('ja')
  })
})

describe('resolveTargetLang', () => {
  it('智能目标：中文译成英文', () => {
    expect(resolveTargetLang(SMART_TARGET_LANG, '今天天气不错，我们去公园散步吧。')).toBe('en')
    expect(resolveTargetLang(SMART_TARGET_LANG, '這是繁體中文的句子')).toBe('en')
  })

  it('智能目标：其他语言译成中文', () => {
    expect(resolveTargetLang(SMART_TARGET_LANG, 'The quick brown fox jumps over the lazy dog.')).toBe('zh-CN')
    expect(resolveTargetLang(SMART_TARGET_LANG, 'これはテストです')).toBe('zh-CN')
    expect(resolveTargetLang(SMART_TARGET_LANG, '안녕하세요 반갑습니다')).toBe('zh-CN')
    expect(resolveTargetLang(SMART_TARGET_LANG, 'Ceci est une phrase française.')).toBe('zh-CN')
  })

  it('固定目标语言原样返回', () => {
    expect(resolveTargetLang('ja', '今天天气不错')).toBe('ja')
    expect(resolveTargetLang('zh-CN', 'hello')).toBe('zh-CN')
  })

  it('空文本按非中文处理', () => {
    expect(resolveTargetLang(SMART_TARGET_LANG, '')).toBe('zh-CN')
  })
})

describe('langLabel', () => {
  it('已知语言返回中文名', () => {
    expect(langLabel('zh-CN')).toBe('简体中文')
  })

  it('未知语言原样返回', () => {
    expect(langLabel('xx')).toBe('xx')
  })
})
