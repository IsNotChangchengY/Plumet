import { describe, expect, it } from 'vitest'
import {
  containsMarkerSyntax,
  fromPlaceholderMarkup,
  hasInlineMarkers,
  inlineMarkupIntact,
  parseInlineMarkers,
  stripInlineMarkers,
  toPlaceholderMarkup,
} from '../src/core/inline-markup'

describe('parseInlineMarkers', () => {
  it('允许按译文语序重排，并区分标记与纯文本', () => {
    expect(parseInlineMarkers('请<y1>安装</y1>前阅读<y0>文档</y0>。', 2)).toEqual([
      { mark: null, text: '请' },
      { mark: 1, text: '安装' },
      { mark: null, text: '前阅读' },
      { mark: 0, text: '文档' },
      { mark: null, text: '。' },
    ])
  })

  it('标记缺失、重复、嵌套、越界或未闭合时返回空', () => {
    expect(parseInlineMarkers('请在安装前阅读文档。', 2)).toBeNull()
    expect(parseInlineMarkers('<y0>文档</y0>', 2)).toBeNull()
    expect(parseInlineMarkers('<y0><y1>文档</y1></y0>', 2)).toBeNull()
    expect(parseInlineMarkers('<y2>文档</y2><y0>x</y0>', 2)).toBeNull()
    expect(parseInlineMarkers('<y0>文档</y0><y0>文档</y0>', 2)).toBeNull()
    expect(parseInlineMarkers('<y0>文档', 1)).toBeNull()
    expect(parseInlineMarkers('</y0>文档', 1)).toBeNull()
  })

  it('接受引擎把尖括号转义后的标记', () => {
    expect(parseInlineMarkers('在&lt;y0&gt;文档&lt;/y0&gt;里', 1)).toEqual([
      { mark: null, text: '在' },
      { mark: 0, text: '文档' },
      { mark: null, text: '里' },
    ])
  })
})

describe('inlineMarkupIntact', () => {
  it('纯文本原文不受校验约束', () => {
    expect(inlineMarkupIntact('Hello world', '你好，世界')).toBe(true)
    expect(inlineMarkupIntact('', '')).toBe(true)
  })

  it('标记原文要求译文里的每个标记恰好成对出现一次', () => {
    const source = 'Read <y0>docs</y0> before <y1>installing</y1>.'
    expect(inlineMarkupIntact(source, '请在<y1>安装</y1>之前阅读<y0>文档</y0>。')).toBe(true)
    expect(inlineMarkupIntact(source, '请在安装之前阅读文档。')).toBe(false)
    expect(inlineMarkupIntact(source, '<y0>文档</y0>')).toBe(false)
    expect(inlineMarkupIntact(source, '<y0>文档</y0><y1>安装</y1><y2>多</y2>')).toBe(false)
    expect(inlineMarkupIntact(source, '<y0><y1>文档</y1></y0>')).toBe(false)
  })
})

describe('占位符编解码', () => {
  it('把尖括号标记换成 CJK 方括号占位符并可还原', () => {
    expect(toPlaceholderMarkup('You also <y0>should not</y0>.')).toBe('You also 【0】should not【/0】.')
    expect(fromPlaceholderMarkup('您也【0】不应【/0】。')).toBe('您也<y0>不应</y0>。')
    expect(fromPlaceholderMarkup(toPlaceholderMarkup('a <y0>b</y0> c<y1>d</y1>'))).toBe('a <y0>b</y0> c<y1>d</y1>')
  })

  it('还原时清掉引擎留下的孤立占位符', () => {
    expect(fromPlaceholderMarkup('甲【0】乙')).toBe('甲乙')
    expect(fromPlaceholderMarkup('甲【/0】乙【2】')).toBe('甲乙')
    expect(fromPlaceholderMarkup('普通译文【注】')).toBe('普通译文【注】')
  })

  it('不会把原文里的方括号玩法当成标记', () => {
    expect(hasInlineMarkers('Use 【0】 as a placeholder.')).toBe(false)
    expect(containsMarkerSyntax('Use 【0】 as a placeholder.')).toBe(true)
    expect(stripInlineMarkers('在<y0>文档</y0>里&lt;y1&gt;x&lt;/y1&gt;')).toBe('在文档里x')
  })
})
