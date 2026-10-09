// 本地存储层（Dexie / IndexedDB）。字段与《FloraOS 数据模型》一一对应。
// 云端同步：每行有 uid（跨设备唯一）、updatedAt、dirty。跨表引用一律用 *Uid，不用本地自增 id。
// 永不真删：delete 一律用 deletedAt 标记。
import Dexie, { type Table } from 'dexie'

export type ReviewState = 'none' | 'pending' | 'done'
/** 所有同步表共有的字段，由 hooks 自动维护 */
export interface Synced { uid?: string; updatedAt?: string; dirty?: number; deletedAt?: string }

export interface Entry extends Synced {
  id?: number
  at: string
  text: string
  source: 'phone-voice' | 'phone-text' | 'desktop'
  tags: string[]
  die?: string
  test?: string
  note?: string
  review: ReviewState
  reviewedAt?: string
}
export interface Todo extends Synced {
  id?: number
  text: string
  entryUid?: string
  date?: string
  evening: boolean
  done: boolean
  doneAt?: string
  tag: string
  review: ReviewState
  reviewedAt?: string
}
export interface Issue extends Synced {
  id?: number
  text: string
  entryUid?: string
  status: 'open' | 'solved'
  blocks: { at: string; text: string }[]
  solvedAt?: string
  solvedHow?: string
  review: ReviewState
  reviewedAt?: string
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
  handled: { kind: string; uid: string }[]
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
  sub: Record<string, unknown>
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
  bookUid: string
  date: string
  toPage: number
  pagesRead: number
  met: boolean
}
export interface Envelope extends Synced {
  id?: number
  month: string
  name: string
  budget: number
  used: number       // 旧字段，保留兼容；实际用量由 transactions 求和
  locked: boolean
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
  envelopeUid?: string
  text: string
  entryUid?: string
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

/** 同步标志：onLocalWrite 由 sync.ts 注册，本地写入后触发延迟同步 */
export const syncFlags: { onLocalWrite: (() => void) | null } = { onLocalWrite: null }
/** 远端拉回来的行带这个标记写入，creating hook 看到就不打 dirty */
export const REMOTE = '__remote'

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
    this.version(2).stores(Object.fromEntries(Object.entries(v1).map(([k, v]) => [k, k === 'config' ? v : v + ', uid'])))
    // v3：跨表引用改成 uid；bigThings/reviews/dailyStates 的 &date 改成普通索引（软删后同一天可重建）
    this.version(3).stores({
      entries: '++id, uid, at, review, *tags', todos: '++id, uid, date, done, review, entryUid', issues: '++id, uid, status, review, entryUid',
      bigThings: '++id, uid, date, review', reviews: '++id, uid, date', dailyStates: '++id, uid, date', books: '++id, uid, status',
      readingLogs: '++id, uid, bookUid, date', envelopes: '++id, uid, month, name', accounts: '++id, uid, name',
      transactions: '++id, uid, date, envelopeUid', lessons: '++id, uid, period', config: 'key',
    }).upgrade(async tx => {
      const uidMap = async (table: string) => { const m = new Map<number, string>(); for (const r of await tx.table(table).toArray()) m.set(r.id, r.uid); return m }
      const E = await uidMap('entries'), B = await uidMap('books'), V = await uidMap('envelopes')
      await tx.table('todos').toCollection().modify((t: Todo & { entryId?: number }) => { if (t.entryId != null) t.entryUid = E.get(t.entryId); delete t.entryId })
      await tx.table('issues').toCollection().modify((i: Issue & { entryId?: number }) => { if (i.entryId != null) i.entryUid = E.get(i.entryId); delete i.entryId })
      await tx.table('readingLogs').toCollection().modify((l: ReadingLog & { bookId?: number }) => { l.bookUid = (l.bookId != null ? B.get(l.bookId) : undefined) ?? l.bookUid ?? ''; delete l.bookId })
      await tx.table('transactions').toCollection().modify((r: Transaction & { envelopeId?: number }) => { if (r.envelopeId != null) r.envelopeUid = V.get(r.envelopeId); delete r.envelopeId })
    })
    for (const t of this.tables) {
      t.hook('creating', (_k, obj: Synced & Record<string, unknown>) => {
        if (t.name !== 'config' && !obj.uid) obj.uid = crypto.randomUUID()
        if (obj[REMOTE]) { delete obj[REMOTE]; return }
        obj.updatedAt = new Date().toISOString(); obj.dirty = 1; syncFlags.onLocalWrite?.()
      })
      t.hook('updating', (mods: Partial<Synced>) => {
        if ('dirty' in mods) return   // 远端写入或 push 清 dirty：不动
        syncFlags.onLocalWrite?.()
        return { ...mods, updatedAt: new Date().toISOString(), dirty: 1 }
      })
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
/** 退出登录 / 换账号：清掉本机副本，防止串账号 */
export async function clearLocalData() {
  await Promise.all(db.tables.map(t => t.clear()))
  for (const k of ['floraos.lastPull', 'floraos.firstSyncDone', 'floraos.focus']) localStorage.removeItem(k)
}
export async function exportAll() {
  const out: Record<string, unknown[]> = {}
  for (const t of db.tables) out[t.name] = await t.toArray()
  return JSON.stringify({ exportedAt: new Date().toISOString(), data: out }, null, 2)
}
