import { newId, readLocal, writeLocal } from './local'

export type CardGrade = 'again' | 'hard' | 'good' | 'easy'

export type LearningCard = {
  id: string
  text: string
  translation: string
  context: string
  sourceUrl: string
  sourceTitle: string
  sourceLang: string
  targetLang: string
  tags: string[]
  createdAt: number
  ease: number
  interval: number
  dueAt: number
  reps: number
  lapses: number
  reviewedAt: number | null
}

export type LearningBook = {
  version: 1
  cards: LearningCard[]
  days: Record<string, number>
  correct: number
}

export type NewCardInput = {
  text: string
  translation: string
  context?: string
  sourceUrl?: string
  sourceTitle?: string
  sourceLang?: string
  targetLang?: string
  tags?: string[]
}

export type SaveCardResult = {
  card: LearningCard
  created: boolean
}

export type ImportResult = {
  added: number
  skipped: number
}

export type LearningStats = {
  total: number
  due: number
  addedToday: number
  reviewedToday: number
  reviews: number
  correctRate: number
  streak: number
}

export const LEARNING_KEY = 'learning.v1'
export const REVIEW_LIMIT = 20
export const DEFAULT_EASE = 2.5
export const MIN_EASE = 1.3
export const MAX_EASE = 2.8

const DAY_MS = 86400000
const RELEARN_MS = 10 * 60 * 1000

export const GRADES: { id: CardGrade; label: string; hint: string }[] = [
  { id: 'again', label: '忘记了', hint: '10 分钟后再看' },
  { id: 'hard', label: '有点难', hint: '间隔稍微拉长' },
  { id: 'good', label: '记得', hint: '按间隔往后推' },
  { id: 'easy', label: '很简单', hint: '间隔拉长一些' },
]

function emptyBook(): LearningBook {
  return { version: 1, cards: [], days: {}, correct: 0 }
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeCard(raw: unknown): LearningCard | null {
  if (!raw || typeof raw !== 'object') return null
  const card = raw as Partial<LearningCard>
  const body = text(card.text).trim()
  if (!body) return null
  const createdAt = typeof card.createdAt === 'number' ? card.createdAt : Date.now()
  return {
    id: typeof card.id === 'string' && card.id ? card.id : newId(),
    text: body,
    translation: text(card.translation),
    context: text(card.context),
    sourceUrl: text(card.sourceUrl),
    sourceTitle: text(card.sourceTitle),
    sourceLang: text(card.sourceLang) || 'auto',
    targetLang: text(card.targetLang) || 'zh-CN',
    tags: Array.isArray(card.tags) ? card.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    createdAt,
    ease: num(card.ease, DEFAULT_EASE, MIN_EASE, MAX_EASE),
    interval: num(card.interval, 0, 0, 3650),
    dueAt: typeof card.dueAt === 'number' ? card.dueAt : createdAt,
    reps: num(card.reps, 0, 0, 100000),
    lapses: num(card.lapses, 0, 0, 100000),
    reviewedAt: typeof card.reviewedAt === 'number' ? card.reviewedAt : null,
  }
}

export function normalizeBook(raw: unknown): LearningBook {
  if (!raw || typeof raw !== 'object') return emptyBook()
  const stored = raw as Partial<LearningBook>
  const cards = Array.isArray(stored.cards)
    ? stored.cards.map(normalizeCard).filter((card): card is LearningCard => card !== null)
    : []
  const days: Record<string, number> = {}
  if (stored.days && typeof stored.days === 'object') {
    for (const [key, value] of Object.entries(stored.days)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        days[key] = Math.floor(value)
      }
    }
  }
  return {
    version: 1,
    cards,
    days,
    correct: typeof stored.correct === 'number' && stored.correct > 0 ? Math.floor(stored.correct) : 0,
  }
}

export function dayKey(at: number): string {
  const date = new Date(at)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function schedule(card: LearningCard, grade: CardGrade, now: number): LearningCard {
  let ease = card.ease
  let interval = card.interval
  let reps = card.reps
  let lapses = card.lapses

  if (grade === 'again') {
    lapses += 1
    reps = 0
    interval = 0
    ease = Math.max(MIN_EASE, ease - 0.2)
  } else if (grade === 'hard') {
    ease = Math.max(MIN_EASE, ease - 0.15)
    interval = interval <= 0 ? 1 : Math.max(1, Math.round(interval * 1.2))
    reps += 1
  } else if (grade === 'good') {
    reps += 1
    interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.max(1, Math.round(interval * ease))
  } else {
    ease = Math.min(MAX_EASE, ease + 0.15)
    reps += 1
    interval = reps === 1 ? 2 : Math.max(2, Math.round(interval * ease * 1.3))
  }

  const dueAt = grade === 'again' ? now + RELEARN_MS : now + interval * DAY_MS
  return { ...card, ease, interval, reps, lapses, dueAt, reviewedAt: now }
}

export async function loadBook(): Promise<LearningBook> {
  return normalizeBook(await readLocal<unknown>(LEARNING_KEY, emptyBook()))
}

export async function saveBook(book: LearningBook): Promise<void> {
  await writeLocal(LEARNING_KEY, book)
}

export async function listCards(): Promise<LearningCard[]> {
  const book = await loadBook()
  return book.cards
}

function buildCard(input: NewCardInput, now: number): LearningCard {
  return {
    id: newId(),
    text: input.text.trim(),
    translation: input.translation.trim(),
    context: input.context?.trim() ?? '',
    sourceUrl: input.sourceUrl?.trim() ?? '',
    sourceTitle: input.sourceTitle?.trim() ?? '',
    sourceLang: input.sourceLang || 'auto',
    targetLang: input.targetLang || 'zh-CN',
    tags: (input.tags ?? []).filter(Boolean),
    createdAt: now,
    ease: DEFAULT_EASE,
    interval: 0,
    dueAt: now,
    reps: 0,
    lapses: 0,
    reviewedAt: null,
  }
}

export async function saveCard(input: NewCardInput, now = Date.now()): Promise<SaveCardResult> {
  const body = input.text.trim()
  if (!body) throw new Error('卡片原文为空')
  const book = await loadBook()
  const targetLang = input.targetLang || 'zh-CN'
  const existing = book.cards.find((card) => card.text === body && card.targetLang === targetLang)
  if (existing) {
    const next: LearningCard = {
      ...existing,
      translation: input.translation.trim() || existing.translation,
      context: input.context?.trim() || existing.context,
      sourceUrl: input.sourceUrl?.trim() || existing.sourceUrl,
      sourceTitle: input.sourceTitle?.trim() || existing.sourceTitle,
      tags: input.tags && input.tags.length > 0 ? Array.from(new Set([...existing.tags, ...input.tags])) : existing.tags,
    }
    book.cards = book.cards.map((card) => (card.id === existing.id ? next : card))
    await saveBook(book)
    return { card: next, created: false }
  }
  const card = buildCard(input, now)
  book.cards = [card, ...book.cards]
  await saveBook(book)
  return { card, created: true }
}

export async function removeCard(id: string): Promise<void> {
  const book = await loadBook()
  book.cards = book.cards.filter((card) => card.id !== id)
  await saveBook(book)
}

export async function clearCards(): Promise<void> {
  await saveBook(emptyBook())
}

export async function gradeCard(id: string, grade: CardGrade, now = Date.now()): Promise<LearningCard | null> {
  const book = await loadBook()
  const card = book.cards.find((item) => item.id === id)
  if (!card) return null
  const next = schedule(card, grade, now)
  book.cards = book.cards.map((item) => (item.id === id ? next : item))
  const key = dayKey(now)
  book.days[key] = (book.days[key] ?? 0) + 1
  if (grade !== 'again') book.correct += 1
  await saveBook(book)
  return next
}

export function dueCards(cards: LearningCard[], now = Date.now(), limit = REVIEW_LIMIT): LearningCard[] {
  return cards
    .filter((card) => card.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, Math.max(0, limit))
}

function computeStreak(days: Record<string, number>, now: number): number {
  let cursor = now
  let streak = 0
  if (!days[dayKey(cursor)]) cursor -= DAY_MS
  while (days[dayKey(cursor)]) {
    streak += 1
    cursor -= DAY_MS
  }
  return streak
}

export function bookStats(book: LearningBook, now = Date.now()): LearningStats {
  const today = dayKey(now)
  const values = Object.values(book.days)
  const reviews = values.reduce((sum, value) => sum + value, 0)
  return {
    total: book.cards.length,
    due: book.cards.filter((card) => card.dueAt <= now).length,
    addedToday: book.cards.filter((card) => dayKey(card.createdAt) === today).length,
    reviewedToday: book.days[today] ?? 0,
    reviews,
    correctRate: reviews > 0 ? Math.min(1, book.correct / reviews) : 0,
    streak: computeStreak(book.days, now),
  }
}

export type ExportPayload = {
  version: 1
  exportedAt: number
  cards: LearningCard[]
}

export function exportBook(book: LearningBook, now = Date.now()): string {
  const payload: ExportPayload = { version: 1, exportedAt: now, cards: book.cards }
  return JSON.stringify(payload, null, 2)
}

export async function importCards(raw: unknown): Promise<ImportResult> {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { cards?: unknown }).cards)
      ? ((raw as { cards: unknown[] }).cards)
      : null
  if (!list) throw new Error('文件里没有 cards 数组')
  const book = await loadBook()
  const seen = new Set(book.cards.map((card) => `${card.text}\u0000${card.targetLang}`))
  let added = 0
  let skipped = 0
  for (const item of list) {
    const card = normalizeCard(item)
    if (!card) {
      skipped += 1
      continue
    }
    const key = `${card.text}\u0000${card.targetLang}`
    if (seen.has(key)) {
      skipped += 1
      continue
    }
    seen.add(key)
    book.cards = [card, ...book.cards]
    added += 1
  }
  await saveBook(book)
  return { added, skipped }
}
