// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CheckView } from '../src/app/CheckView'
import { DictCard } from '../src/app/DictCard'
import { EnginePicker } from '../src/app/EnginePicker'
import { PolishView } from '../src/app/PolishView'
import type { DictionaryEntry } from '../src/core/dictionary/types'
import type { CheckJobResult } from '../src/core/messaging'
import type { EngineOption } from '../src/core/providers/registry'
import type { DictionarySections } from '../src/storage/settings'

const checkResult: CheckJobResult = {
  issues: [
    {
      id: 'c0-0',
      quote: 'teh',
      replacement: 'the',
      category: 'spelling',
      severity: 'error',
      explanation: '拼写错误',
      start: 7,
      end: 10,
    },
    {
      id: 'c0-1',
      quote: 'design scheme',
      replacement: 'design idea',
      category: 'word-choice',
      severity: 'warning',
      explanation: '用词不自然',
      start: 15,
      end: 28,
    },
  ],
  corrected: 'I have the book and my design idea works.',
  engineLabel: 'Mock AI',
  elapsedMs: 1234,
  chunks: 1,
  dropped: 0,
}

const dictEntry: DictionaryEntry = {
  word: 'hello',
  direction: 'en-zh',
  phonetics: [{ label: '英', text: 'həˈləʊ', audio: 'https://dict.youdao.com/dictvoice?audio=hello&type=1' }],
  translations: [{ pos: 'int.', text: '喂，你好' }],
  definitions: [{ pos: 'n.', text: 'a greeting', example: 'she said hello' }],
  forms: [{ name: '复数', value: 'hellos' }],
  examples: [{ source: 'She said hello.', target: '她说你好。' }],
  phrases: [{ phrase: 'say hello', meaning: '打招呼' }],
}

const dictEntryZh: DictionaryEntry = {
  word: '你好',
  direction: 'zh-en',
  phonetics: [{ label: '拼音', text: 'nǐ hǎo', audio: 'https://dict.youdao.com/dictvoice?audio=%E4%BD%A0%E5%A5%BD&type=1' }],
  translations: [{ pos: '', text: 'hello' }],
  definitions: [],
  forms: [],
  examples: [{ source: '你好，西蒙！', target: 'Hello, Simon!' }],
  phrases: [],
}

const fullSections: DictionarySections = {
  phonetic: true,
  translation: true,
  definition: true,
  forms: true,
  examples: true,
  phrases: true,
}

describe('DictCard 渲染', () => {
  it('六块内容都在', () => {
    const html = renderToStaticMarkup(<DictCard entry={dictEntry} sections={fullSections} />)
    expect(html).toContain('dict-word')
    expect(html).toContain('həˈləʊ')
    expect(html).toContain('喂，你好')
    expect(html).toContain('a greeting')
    expect(html).toContain('hellos')
    expect(html).toContain('She said hello.')
    expect(html).toContain('say hello')
    expect(html).toContain('中文释义')
    expect(html).toContain('英英释义')
    expect(html).toContain('词形变化')
  })

  it('中文词卡片的释义标题是英文释义', () => {
    const html = renderToStaticMarkup(<DictCard entry={dictEntryZh} sections={fullSections} />)
    expect(html).toContain('英文释义')
    expect(html).not.toContain('中文释义')
    expect(html).toContain('拼音')
    expect(html).toContain('hello')
  })

  it('按设置隐藏对应区块', () => {
    const html = renderToStaticMarkup(
      <DictCard
        entry={dictEntry}
        sections={{ ...fullSections, phonetic: false, definition: false, examples: false, phrases: false }}
      />,
    )
    expect(html).not.toContain('dict-phon')
    expect(html).not.toContain('英英释义')
    expect(html).not.toContain('She said hello.')
    expect(html).toContain('喂，你好')
    expect(html).toContain('词形变化')
  })

  it('全部关掉时提示去设置', () => {
    const html = renderToStaticMarkup(
      <DictCard
        entry={dictEntry}
        sections={{ phonetic: false, translation: false, definition: false, forms: false, examples: false, phrases: false }}
      />,
    )
    expect(html).toContain('设置')
    expect(html).not.toContain('dict-sec')
  })
})

const engineOptions: EngineOption[] = [
  { id: 'mt:google-free', label: 'Google 翻译 · 免费通道', kind: 'mt', group: 'free', ready: true, missing: [] },
  { id: 'ai:deepseek', label: 'DeepSeek 主力 · deepseek-chat', kind: 'ai', group: 'ai', ready: true, missing: [] },
  { id: 'mt:baidu', label: '百度翻译', kind: 'mt', group: 'mt', ready: false, missing: ['App ID', '密钥'] },
]

describe('EnginePicker 渲染', () => {
  it('多选时摘要只显示第一个引擎与计数，title 给全量名称', () => {
    const html = renderToStaticMarkup(
      <EnginePicker engines={engineOptions} selected={['mt:google-free', 'ai:deepseek']} onChange={() => undefined} />,
    )
    expect(html).toContain('title="Google 翻译 · 免费通道 · DeepSeek 主力 · deepseek-chat"')
    expect(html).toMatch(
      /<summary title="[^"]*"><span class="engine-picker-current">Google 翻译 · 免费通道<\/span><span class="engine-picker-count">2<\/span><\/summary>/,
    )
  })

  it('单选时摘要显示完整名称且没有计数', () => {
    const html = renderToStaticMarkup(
      <EnginePicker engines={engineOptions} selected={['ai:deepseek']} onChange={() => undefined} />,
    )
    expect(html).toContain('DeepSeek 主力 · deepseek-chat')
    expect(html).not.toContain('engine-picker-count')
  })

  it('只剩一个勾选时该项不可取消', () => {
    const html = renderToStaticMarkup(
      <EnginePicker engines={engineOptions} selected={['mt:google-free']} onChange={() => undefined} />,
    )
    expect(html).toContain('disabled=""')
  })

  it('已选但不可用的引擎显示原因，未选的不可用引擎不出现', () => {
    const selected = renderToStaticMarkup(
      <EnginePicker engines={engineOptions} selected={['mt:baidu']} onChange={() => undefined} />,
    )
    expect(selected).toContain('App ID、密钥')
    const hidden = renderToStaticMarkup(
      <EnginePicker engines={engineOptions} selected={['mt:google-free']} onChange={() => undefined} />,
    )
    expect(hidden).not.toContain('百度翻译')
  })
})

describe('CheckView 渲染', () => {
  it('输出划掉的原文与绿色的改法', () => {
    const html = renderToStaticMarkup(
      <CheckView
        text="I have teh book and my design scheme works."
        result={checkResult}
        onReplaceInput={() => undefined}
      />,
    )
    expect(html).toContain('mark-del')
    expect(html).toContain('mark-ins')
    expect(html).toContain('teh')
    expect(html).toContain('the')
    expect(html).toContain('拼写')
    expect(html).toContain('高亮')
    expect(html).toContain('终稿')
  })

  it('没有问题时不渲染问题卡片', () => {
    const html = renderToStaticMarkup(
      <CheckView
        text="All good."
        result={{ ...checkResult, issues: [], corrected: 'All good.' }}
        onReplaceInput={() => undefined}
      />,
    )
    expect(html).toContain('没有发现问题')
    expect(html).not.toContain('mark-del')
  })
})

describe('PolishView 渲染', () => {
  it('输出 diff 标记与视图切换', () => {
    const html = renderToStaticMarkup(
      <PolishView
        original="这个设计很好。"
        result={{ polished: '这个设计真的很不错。', engineLabel: 'Mock AI', elapsedMs: 800 }}
        onRerun={() => undefined}
        onReplaceInput={() => undefined}
      />,
    )
    expect(html).toContain('mark-del')
    expect(html).toContain('mark-ins')
    expect(html).toContain('合并')
    expect(html).toContain('纯净稿')
    expect(html).toContain('再来一版')
  })
})
