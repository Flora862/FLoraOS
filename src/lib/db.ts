// 本地存储层（Dexie / IndexedDB）。字段与《FloraOS 数据模型》一一对应。
// 以后接 Supabase：换 storage adapter，表结构不变。永不真删：delete 用 deletedAt 标记。
import Dexie, { type Table } from 'dexie'

export type ReviewState = 'none' | 'pending' | 'done'

export interface Entry extends Synced {
  id?: number
  at: string          // ISO 时间
  text: string        // 原文，一字不改
  source: 'phone-voice' | 'phone-text' | 'desktop'
  tags: string[]
  die?: string        // 想法类：最可能在哪死
  test?: string       // 想法类：最便宜的验证动作
  review: ReviewState
  reviewedAt?: string
  deletedAt?: string
}
export interface Todo extends Synced {
  id?: number
  text: string
  entryId?: number
  date?: string       // YYYY-MM-DD
  evening: boolean
  done: boolean
  doneAt?: string
  tag: string
  review: ReviewState
  reviewedAt?: string
  deletedAt?: string
}
export interface Issue extends Synced {
  id?: number
  text: string
  entryId?: number
  status: 'open' | 'solved'
  blocks: { at: string; text: string }[]
  solvedAt?: string
  solvedHow?: string
  review: ReviewState
  reviewedAt?: string
  deletedAt?: string
}
export interface BigThing extends Synced {
  id?: number
  date: string
  text: string
  standard: string
  minutes: number
  result?: 'done' | 'failed' | 'skipped'
  fact?: string
  review: ReviewState
  reviewedAt?: string
}
export interface Review extends Synced {
  id?: number
  date: string
  answers: Record<string, unknown>
  handled: { kind: string; id: number }[]
  completed: boolean
  seconds: number
}
export interface DailyState extends Synced {
  id?: number
  date: string
  mood: number
  moodNote?: string
  body: number
  bodyNote?: string
  sub: Record<string, unknown>   // { period:{day:3,tags:[...]}, skin:'好', sleep:'6–7h' }
}
export interface Book extends Synced {
  id?: number
  title: string
  pages: number
  start: string
  end: string
  current: number
  status: 'reading' | 'finished' | 'dropped'
}
export interface ReadingLog extends Synced {
  id?: number
  bookId: number
  date: string
  toPage: number
  pagesRead: number
  met: boolean
}
export interface Envelope extends Synced {
  id?: number
  month: string       // YYYY-MM
  name: string
  budget: number
  used: number
  locked: boolean     // 锁定 = 不计入"还能放心花"
  color: string
}
export interface Account extends Synced {
  id?: number
  name: string
  amount: number
  rule: string
}
export interface Transaction extends Synced {
  id?: number
  date: string
  amount: number
  envelopeId?: number
  accountId?: number
  text: string
  entryId?: number
}
export interface Lesson extends Synced {
  id?: number
  period: 'week' | 'month'
  range: string
  draft: string
  final?: string
  createdAt: string
}
export interface ConfigRow { key: string; value: unknown; updatedAt?: string; dirty?: number }
/** 所有同步表共有的三个字段，由 hooks 自动维护 */
export interface Synced { uid?: string; updatedAt?: string; dirty?: number }

export const syncFlags: { applyingRemote: boolean; onLocalWrite: (() => void) | null } = { applyingRemote: false, onLocalWrite: null }

class FloraDB extends Dexie {
  entries!: Table<Entry, number>
  todos!: Table<Todo, number>
  issues!: Table<Issue, number>
  bigThings!: Table<BigThing, number>
  reviews!: Table<Review, number>
  dailyStates!: Table<DailyState, number>
  books!: Table<Book, number>
  readingLogs!: Table<ReadingLog, number>
  envelopes!: Table<Envelope, number>
  accounts!: Table<Account, number>
  transactions!: Table<Transaction, number>
  lessons!: Table<Lesson, number>
  config!: Table<ConfigRow, string>
  constructor() {
    super('floraos')
    const v1 = {
      entries: '++id, at, review, *tags', todos: '++id, date, done, review', issues: '++id, status, review',
      bigThings: '++id, &date, review', reviews: '++id, &date', dailyStates: '++id, &date', books: '++id, status',
      readingLogs: '++id, bookId, date', envelopes: '++id, month, name', accounts: '++id, name',
      transactions: '++id, date, envelopeId', lessons: '++id, period', config: 'key',
    }
    this.version(1).stores(v1)
    // v2：每张表加 uid 索引，供云端同步用
    this.version(2).stores(Object.fromEntries(Object.entries(v1).map(([k, v]) => [k, k === 'config' ? v : v + ', uid'])))
    // hooks：本地写入自动打 uid / updatedAt / dirty；拉取云端时跳过
    for (const t of this.tables) {
      if (t.name === 'config') {
        t.hook('creating', (_k, obj: ConfigRow) => { if (!syncFlags.applyingRemote) { obj.updatedAt = new Date().toISOString(); obj.dirty = 1; syncFlags.onLocalWrite?.() } })
        t.hook('updating', (mods) => { if (syncFlags.applyingRemote) return; syncFlags.onLocalWrite?.(); return { ...mods, updatedAt: new Date().toISOString(), dirty: 1 } })
        continue
      }
      t.hook('creating', (_k, obj: Synced) => { if (!obj.uid) obj.uid = crypto.randomUUID(); if (!syncFlags.applyingRemote) { obj.updatedAt = new Date().toISOString(); obj.dirty = 1; syncFlags.onLocalWrite?.() } })
      t.hook('updating', (mods) => { if (syncFlags.applyingRemote) return; syncFlags.onLocalWrite?.(); return { ...mods, updatedAt: new Date().toISOString(), dirty: 1 } })
    }
  }
}
export const db = new FloraDB()

export async function getConfig<T>(key: string, fallback: T): Promise<T> {
  const row = await db.config.get(key)
  return (row?.value as T) ?? fallback
}
export async function setConfig(key: string, value: unknown) {
  await db.config.put({ key, value })
}

export async function exportAll() {
  const out: Record<string, unknown[]> = {}
  for (const t of db.tables) out[t.name] = await t.toArray()
  return JSON.stringify({ exportedAt: new Date().toISOString(), data: out }, null, 2)
}
