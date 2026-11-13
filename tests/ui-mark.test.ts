import { describe, expect, it } from 'vitest'
import { isYuyiNode, isYuyiPath, markUiHost } from '../src/content/ui-mark'

function shadowHost(): { host: HTMLElement; inner: HTMLElement } {
  const host = document.createElement('div')
  markUiHost(host, 'bubble')
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const inner = document.createElement('button')
  shadow.appendChild(inner)
  return { host, inner }
}

describe('ui-mark', () => {
  it('宿主元素本身被识别', () => {
    const { host } = shadowHost()
    expect(isYuyiNode(host)).toBe(true)
    expect(isYuyiPath([host])).toBe(true)
  })

  it('Shadow DOM 内部节点经由宿主识别', () => {
    const { inner } = shadowHost()
    expect(isYuyiNode(inner)).toBe(true)
    expect(isYuyiPath([inner])).toBe(true)
  })

  it('带 data-yuyi 的译文节点及其文字被识别', () => {
    const translation = document.createElement('span')
    translation.setAttribute('data-yuyi', 'trans')
    translation.textContent = '译文'
    document.body.appendChild(translation)
    expect(isYuyiNode(translation)).toBe(true)
    expect(isYuyiNode(translation.firstChild)).toBe(true)
  })

  it('普通页面节点不被识别', () => {
    const paragraph = document.createElement('p')
    paragraph.textContent = 'plain text'
    document.body.appendChild(paragraph)
    expect(isYuyiNode(paragraph)).toBe(false)
    expect(isYuyiPath([paragraph])).toBe(false)
    expect(isYuyiNode(null)).toBe(false)
  })
})
