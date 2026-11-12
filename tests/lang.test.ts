import { describe, expect, it } from 'vitest'
import { detectLang, langLabel, resolveSourceLang } from '../src/core/lang'

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

describe('langLabel', () => {
  it('已知语言返回中文名', () => {
    expect(langLabel('zh-CN')).toBe('简体中文')
  })

  it('未知语言原样返回', () => {
    expect(langLabel('xx')).toBe('xx')
  })
})
