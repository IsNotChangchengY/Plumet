import { beforeEach, describe, expect, it } from 'vitest'
import { clearLocal } from '../src/storage/local'
import type { DictionaryEntry } from '../src/core/dictionary/types'
import type { LearningBook, LearningCard } from '../src/storage/learning'
import {
  DEFAULT_EASE,
  MAX_EASE,
  MIN_EASE,
  bookStats,
  dayKey,
  dueCards,
  exportBook,
  gradeCard,
  importCards,
  loadBook,
  normalizeBook,
  saveCard,
  schedule,
} from '../src/storage/learning'

const DAY = 86400000
const NOW = new Date(2024, 0, 10, 9, 0, 0).getTime()

function baseCard(patch: Partial<LearningCard> = {}): LearningCard {
  return {
    id: 'c1',
    text: 'serendipity',
    translation: '意外的幸运',
    dictionary: null,
    sourceUrl: 'https://example.com/a',
    sourceTitle: 'Example',
    sourceLang: 'en',
    targetLang: 'zh-CN',
    tags: [],
    createdAt: NOW,
    ease: DEFAULT_EASE,
    interval: 0,
    dueAt: NOW,
    reps: 0,
    lapses: 0,
    reviewedAt: null,
    ...patch,
  }
}

function baseDictionary(patch: Partial<DictionaryEntry> = {}): DictionaryEntry {
  return {
    word: 'serendipity',
    direction: 'en-zh',
    phonetics: [{ label: '英', text: '/ˌserənˈdɪpəti/', audio: 'https://dict.youdao.com/dictvoice?audio=serendipity&type=1' }],
    translations: [{ pos: 'n.', text: '意外的幸运' }],
    definitions: [
      { pos: 'n.', text: 'the occurrence of events by chance', example: 'a moment of serendipity' },
    ],
    forms: [{ name: '复数', value: 'serendipities' }],
    examples: [{ source: 'It was pure serendipity.', target: '纯属意外之喜。' }],
    phrases: [{ phrase: 'serendipity effect', meaning: '意外发现效应' }],
    ...patch,
  }
}

beforeEach(() => {
  void clearLocal()
})

describe('SM-2 简化排程', () => {
  it('第一次「记得」排到 1 天后', () => {
    const next = schedule(baseCard(), 'good', NOW)
    expect(next.reps).toBe(1)
    expect(next.interval).toBe(1)
    expect(next.dueAt).toBe(NOW + DAY)
  })

  it('第二次「记得」排到 3 天后', () => {
    const next = schedule(baseCard({ reps: 1, interval: 1 }), 'good', NOW)
    expect(next.interval).toBe(3)
    expect(next.dueAt).toBe(NOW + 3 * DAY)
  })

  it('第三次起按 ease 乘间隔', () => {
    const next = schedule(baseCard({ reps: 2, interval: 3, ease: 2.5 }), 'good', NOW)
    expect(next.interval).toBe(8)
    expect(next.reps).toBe(3)
  })

  it('「忘记了」重置进度并在 10 分钟后再来', () => {
    const next = schedule(baseCard({ reps: 3, interval: 8, lapses: 1 }), 'again', NOW)
    expect(next.reps).toBe(0)
    expect(next.interval).toBe(0)
    expect(next.lapses).toBe(2)
    expect(next.ease).toBeCloseTo(2.3)
    expect(next.dueAt).toBe(NOW + 10 * 60 * 1000)
  })

  it('ease 有上下限', () => {
    let card = baseCard({ ease: MIN_EASE })
    card = schedule(card, 'again', NOW)
    expect(card.ease).toBe(MIN_EASE)
    let easy = baseCard({ ease: MAX_EASE })
    easy = schedule(easy, 'easy', NOW)
    expect(easy.ease).toBe(MAX_EASE)
  })

  it('「有点难」至少向前 1 天、「很简单」首次给 2 天', () => {
    expect(schedule(baseCard({ reps: 1, interval: 1 }), 'hard', NOW).interval).toBe(1)
    const easy = schedule(baseCard(), 'easy', NOW)
    expect(easy.interval).toBe(2)
    expect(easy.dueAt).toBe(NOW + 2 * DAY)
  })
})

describe('卡片存储', () => {
  it('新建卡片记为到期，同词同语言重复收藏被阻止且不改动已有卡', async () => {
    const first = await saveCard(
      { text: 'serendipity', translation: '意外的幸运', targetLang: 'zh-CN' },
      NOW,
    )
    expect(first.created).toBe(true)
    expect(first.card.dueAt).toBe(NOW)

    const graded = await gradeCard(first.card.id, 'good', NOW)
    expect(graded?.reps).toBe(1)

    const again = await saveCard(
      { text: 'serendipity', translation: '幸运的相遇', targetLang: 'zh-CN' },
      NOW + 1000,
    )
    expect(again.created).toBe(false)
    expect(again.card.id).toBe(first.card.id)
    expect(again.card.translation).toBe('意外的幸运')
    expect(again.card.reps).toBe(1)
    expect(again.card.interval).toBe(1)

    const otherLang = await saveCard(
      { text: 'serendipity', translation: 'serendipity', targetLang: 'ja' },
      NOW + 2000,
    )
    expect(otherLang.created).toBe(true)
    expect(otherLang.card.id).not.toBe(first.card.id)
    expect(otherLang.card.targetLang).toBe('ja')

    const otherLangAgain = await saveCard(
      { text: 'serendipity', translation: '別の訳', targetLang: 'ja' },
      NOW + 3000,
    )
    expect(otherLangAgain.created).toBe(false)
    expect(otherLangAgain.card.id).toBe(otherLang.card.id)
    expect(otherLangAgain.card.translation).toBe('serendipity')
    expect((await loadBook()).cards).toHaveLength(2)
  })

  it('收藏时保存词典快照，读回仍是结构化字段', async () => {
    const saved = await saveCard(
      { text: 'serendipity', translation: '意外的幸运', targetLang: 'zh-CN', dictionary: baseDictionary() },
      NOW,
    )
    expect(saved.card.dictionary?.translations).toEqual([{ pos: 'n.', text: '意外的幸运' }])
    expect(saved.card.dictionary?.phonetics[0]?.text).toBe('/ˌserənˈdɪpəti/')

    const book = await loadBook()
    expect(book.cards[0]?.dictionary?.forms).toEqual([{ name: '复数', value: 'serendipities' }])
    expect(book.cards[0]?.dictionary?.examples).toEqual([
      { source: 'It was pure serendipity.', target: '纯属意外之喜。' },
    ])
  })

  it('重复收藏不改动已有卡的词典快照', async () => {
    const first = await saveCard(
      { text: 'serendipity', translation: '意外的幸运', targetLang: 'zh-CN', dictionary: baseDictionary() },
      NOW,
    )
    const again = await saveCard(
      {
        text: 'serendipity',
        translation: '别的译文',
        targetLang: 'zh-CN',
        dictionary: baseDictionary({ translations: [{ pos: 'n.', text: '别的译文' }] }),
      },
      NOW + 1000,
    )
    expect(again.created).toBe(false)
    expect(again.card.dictionary?.translations).toEqual(first.card.dictionary?.translations)
  })

  it('旧卡没有词典快照或快照损坏时读入为 null', () => {
    const noSnapshot = baseCard()
    const broken = { ...baseCard({ id: 'c2' }), dictionary: { translations: [{ text: 42 }], definitions: 'nope' } }
    const book = normalizeBook({ version: 1, cards: [noSnapshot, broken], days: {}, correct: 0 })
    expect(book.cards[0]?.dictionary).toBe(null)
    expect(book.cards[1]?.dictionary).toBe(null)
  })

  it('旧数据里的上下文在规范化时被丢弃', () => {
    const legacy = { ...baseCard(), context: '旧上下文' }
    const book = normalizeBook({ version: 1, cards: [legacy], days: {}, correct: 0 })
    expect(book.cards).toHaveLength(1)
    expect('context' in book.cards[0]).toBe(false)
  })

  it('空原文不建卡', async () => {
    await expect(saveCard({ text: '   ', translation: 'x' }, NOW)).rejects.toThrow()
  })

  it('到期队列按到期时间排序并受上限约束', () => {
    const cards = [
      baseCard({ id: 'a', dueAt: NOW - 2000 }),
      baseCard({ id: 'b', dueAt: NOW - 5000 }),
      baseCard({ id: 'c', dueAt: NOW - 1000 }),
      baseCard({ id: 'd', dueAt: NOW + DAY }),
    ]
    expect(dueCards(cards, NOW).map((card) => card.id)).toEqual(['b', 'a', 'c'])
    expect(dueCards(cards, NOW, 2).map((card) => card.id)).toEqual(['b', 'a'])
  })

  it('评分写入复习次数与正确率', async () => {
    const card = (await saveCard({ text: 'hello', translation: '你好', targetLang: 'zh-CN' }, NOW)).card
    await gradeCard(card.id, 'good', NOW)
    await gradeCard(card.id, 'again', NOW)
    const book = await loadBook()
    const stats = bookStats(book, NOW)
    expect(stats.reviews).toBe(2)
    expect(stats.reviewedToday).toBe(2)
    expect(stats.correctRate).toBeCloseTo(0.5)
    expect(book.days[dayKey(NOW)]).toBe(2)
  })
})

describe('统计', () => {
  function bookWith(days: Record<string, number>, cards: LearningCard[], correct: number): LearningBook {
    return { version: 1, cards, days, correct }
  }

  it('今日新增、待复习与正确率', () => {
    const book = bookWith(
      { [dayKey(NOW)]: 4 },
      [
        baseCard({ id: 'a', createdAt: NOW, dueAt: NOW - 1 }),
        baseCard({ id: 'b', createdAt: NOW - DAY, dueAt: NOW + DAY }),
      ],
      3,
    )
    const stats = bookStats(book, NOW)
    expect(stats.total).toBe(2)
    expect(stats.due).toBe(1)
    expect(stats.addedToday).toBe(1)
    expect(stats.reviewedToday).toBe(4)
    expect(stats.reviews).toBe(4)
    expect(stats.correctRate).toBeCloseTo(0.75)
  })

  it('连续天数包含今天与昨天两种情况', () => {
    const yesterday = NOW - DAY
    const twoDaysAgo = NOW - 2 * DAY
    const withToday = bookWith({ [dayKey(NOW)]: 1, [dayKey(yesterday)]: 2, [dayKey(twoDaysAgo)]: 3 }, [], 6)
    expect(bookStats(withToday, NOW).streak).toBe(3)
    const withoutToday = bookWith({ [dayKey(yesterday)]: 2, [dayKey(twoDaysAgo)]: 3 }, [], 5)
    expect(bookStats(withoutToday, NOW).streak).toBe(2)
    const broken = bookWith({ [dayKey(twoDaysAgo)]: 3 }, [], 3)
    expect(bookStats(broken, NOW).streak).toBe(0)
  })

  it('没有记录时正确率为 0 而不是 NaN', () => {
    expect(bookStats(bookWith({}, [], 0), NOW).correctRate).toBe(0)
  })
})

describe('导入导出', () => {
  it('导出后再导入保持卡片内容，重复项被跳过', async () => {
    await saveCard({ text: 'alpha', translation: '阿尔法', targetLang: 'zh-CN' }, NOW)
    const payload = exportBook(await loadBook(), NOW)
    const parsed = JSON.parse(payload) as { version: number; cards: LearningCard[] }
    expect(parsed.version).toBe(1)
    expect(parsed.cards).toHaveLength(1)

    await clearLocal()
    const result = await importCards(JSON.parse(payload))
    expect(result.added).toBe(1)
    expect(result.skipped).toBe(0)
    const book = await loadBook()
    expect(book.cards[0]?.text).toBe('alpha')
    expect(book.cards[0]?.translation).toBe('阿尔法')

    const twice = await importCards(JSON.parse(payload))
    expect(twice.added).toBe(0)
    expect(twice.skipped).toBe(1)

    const crossLang = await importCards({
      version: 1,
      cards: [{ text: 'alpha', translation: 'Alpha 日语', targetLang: 'ja' }],
    })
    expect(crossLang.added).toBe(1)
    expect(crossLang.skipped).toBe(0)

    const crossLangAgain = await importCards({
      version: 1,
      cards: [{ text: 'alpha', translation: 'Alpha 日语', targetLang: 'ja' }],
    })
    expect(crossLangAgain.added).toBe(0)
    expect(crossLangAgain.skipped).toBe(1)
  })

  it('导出导入保留词典快照', async () => {
    await saveCard(
      {
        text: 'hello',
        translation: '你好',
        targetLang: 'zh-CN',
        dictionary: baseDictionary({
          word: 'hello',
          translations: [{ pos: 'int.', text: '喂，你好' }],
        }),
      },
      NOW,
    )
    const payload = exportBook(await loadBook(), NOW)
    await clearLocal()
    const result = await importCards(JSON.parse(payload))
    expect(result.added).toBe(1)
    const book = await loadBook()
    expect(book.cards[0]?.dictionary?.translations).toEqual([{ pos: 'int.', text: '喂，你好' }])
    expect(book.cards[0]?.dictionary?.forms).toEqual([{ name: '复数', value: 'serendipities' }])
  })

  it('坏条目被跳过，非数组结构直接报错', async () => {
    const result = await importCards({ version: 1, cards: [{ text: '' }, { text: 'ok', translation: '好' }] })
    expect(result.added).toBe(1)
    expect(result.skipped).toBe(1)
    await expect(importCards({ nope: true })).rejects.toThrow()
  })

  it('normalizeBook 容错并补齐默认字段', () => {
    const book = normalizeBook({
      cards: [{ text: 'hello' }, null, { nope: 1 }],
      days: { '2024-01-10': 2, bad: -1 },
      correct: 99.7,
    })
    expect(book.cards).toHaveLength(1)
    expect(book.cards[0]?.ease).toBe(DEFAULT_EASE)
    expect(book.cards[0]?.targetLang).toBe('zh-CN')
    expect(book.days).toEqual({ '2024-01-10': 2 })
    expect(book.correct).toBe(99)
    expect(normalizeBook(null).cards).toEqual([])
  })
})
