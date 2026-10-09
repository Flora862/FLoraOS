// 业务操作：所有写数据库的动作集中在这里，页面只调用这些函数。
import { db, type Entry, type Todo, type Issue, type Envelope } from './db'
import { DEFAULT_CONFIG, type AppConfig } from './config'
import { parse, todoFromVague, issueFromText, type Parsed } from './parse'
import { classify, merge } from './llm'
import { today, month, daysBetween } from './dates'

export async function loadConfig(): Promise<AppConfig> {
  const row = await db.config.get('app')
  return { ...DEFAULT_CONFIG, ...((row?.value as Partial<AppConfig>) ?? {}) }
}
export async function saveConfig(c: AppConfig) { await db.config.put({ key: 'app', value: c }) }

/** 一句话进来：解析 → 存条目 → 按规则建待办/问题/记页数/记消费。返回解析结果供 UI 决定是否弹抽屉。 */
export async function capture(text: string, cfg: AppConfig, source: Entry['source'] = 'desktop'): Promise<{ parsed: Parsed; entryId: number }> {
  const rule = parse(text, cfg)
  const llm = await classify(text, cfg.tags.map(t => t.name))
  const parsed = merge(rule, llm)
  const entryId = await db.entries.add({ at: new Date().toISOString(), text, source, tags: parsed.tags, review: 'none' })

  if (parsed.bigThing) { const d = parsed.bigThing.day === 'today' ? today() : daysBetweenShift(today(), 1); await setBigThing(d, parsed.bigThing.text, parsed.bigThing.standard ?? '', cfg.bigThingMinutes) }
  if (parsed.pages) await logPages(parsed.pages, entryId)
  if (parsed.money) await spend(parsed.money.amount, parsed.money.envelope, text, cfg, entryId)
  if (parsed.todo && !parsed.ask) await addTodo(parsed.todo, { entryId, date: parsed.date, evening: parsed.evening, tag: parsed.tags[0] })
  if (parsed.issue && !parsed.ask) await addIssue(parsed.issue, entryId)
  return { parsed, entryId }
}

/** 抽屉里选了之后 */
export async function resolveVague(entryId: number, kind: 'todo' | 'issue' | 'none', parsed: Parsed) {
  if (kind === 'todo') await addTodo(todoFromVague(parsed.text), { entryId, date: parsed.date ?? today(), evening: parsed.evening, tag: parsed.tags[0] })
  if (kind === 'issue') await addIssue(issueFromText(parsed.text), entryId)
}

export async function addTodo(text: string, o: Partial<Todo> = {}) {
  return db.todos.add({ text, done: false, evening: false, tag: o.tag ?? '杂', review: 'none', ...o })
}
export async function toggleTodo(id: number) {
  const t = await db.todos.get(id); if (!t) return
  const done = !t.done
  await db.todos.update(id, { done, doneAt: done ? new Date().toISOString() : undefined, review: done && t.review === 'none' && t.tag === '🔁' ? 'pending' : t.review })
}
export async function setTodoReview(id: number, on: boolean) { await db.todos.update(id, { review: on ? 'pending' : 'none' }) }
export async function moveTodo(id: number, date: string) { await db.todos.update(id, { date }) }

export async function addIssue(text: string, entryId?: number) {
  return db.issues.add({ text, entryId, status: 'open', blocks: [], review: 'pending' })
}
export async function addBlock(id: number, text: string) {
  const i = await db.issues.get(id); if (!i) return
  await db.issues.update(id, { blocks: [...i.blocks, { at: today(), text }] })
}
export async function solveIssue(id: number, how: string) {
  await db.issues.update(id, { status: 'solved', solvedAt: today(), solvedHow: how, review: 'done', reviewedAt: today() })
}

export async function setIdeaDie(entryId: number, die: string) { await db.entries.update(entryId, { die }) }
export async function setEntryReview(entryId: number, on: boolean) { await db.entries.update(entryId, { review: on ? 'pending' : 'none' }) }

/* 大事 */
export async function setBigThing(date: string, text: string, standard: string, minutes: number) {
  const ex = await db.bigThings.where('date').equals(date).first()
  if (ex) await db.bigThings.update(ex.id!, { text, standard, minutes })
  else await db.bigThings.add({ date, text, standard, minutes, review: 'pending' })
}
export async function resultBigThing(date: string, result: 'done' | 'failed' | 'skipped', fact?: string) {
  const ex = await db.bigThings.where('date').equals(date).first(); if (!ex) return
  await db.bigThings.update(ex.id!, { result, fact })
}

/* 图书 */
export async function logPages(toPage: number, entryId?: number) {
  const book = await db.books.where('status').equals('reading').first(); if (!book) return
  const prev = book.current
  const d = today()
  const need = pagesPerDay(book)
  const ex = await db.readingLogs.where({ bookId: book.id!, date: d }).first()
  const pagesRead = Math.max(0, toPage - (ex ? toPage - ex.pagesRead - (toPage - prev) : prev)) // 简化：当天累计
  const total = ex ? ex.pagesRead + Math.max(0, toPage - prev) : Math.max(0, toPage - prev)
  if (ex) await db.readingLogs.update(ex.id!, { toPage, pagesRead: total, met: total >= need })
  else await db.readingLogs.add({ bookId: book.id!, date: d, toPage, pagesRead: total, met: total >= need })
  await db.books.update(book.id!, { current: Math.max(book.current, toPage) })
  void pagesRead; void entryId
}
export function pagesPerDay(b: { pages: number; current: number; end: string }) {
  const left = Math.max(1, daysBetween(today(), b.end) + 1)
  return Math.ceil((b.pages - b.current) / left)
}
export function behindDays(b: { pages: number; current: number; start: string; end: string }) {
  const total = daysBetween(b.start, b.end) + 1
  const elapsed = daysBetween(b.start, today()) + 1
  const planned = Math.round(b.pages * Math.min(1, elapsed / total))
  const per = b.pages / total
  return Math.max(0, Math.round((planned - b.current) / per))
}

/* 财务 */
/** 由字符串生成稳定 uuid：同一个月同一个信封，在任何设备上 uid 一样，同步时合并而不是重复 */
export function stableUuid(str: string) {
  let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0xdeadbeef, h4 = 0x12345678
  for (const ch of str) { const c = ch.charCodeAt(0); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 + c, 2246822507) >>> 0; h3 = Math.imul(h3 ^ (c << 3), 3266489909) >>> 0; h4 = (h4 + Math.imul(c, 374761393)) >>> 0 }
  const hex = [h1, h2, h3, h4].map(x => x.toString(16).padStart(8, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
export async function ensureMonth(cfg: AppConfig) {
  const m = month()
  for (const e of cfg.finance.envelopes) {
    const uid = stableUuid('env:' + m + ':' + (e.key ?? e.name))
    const ex = await db.envelopes.where('uid').equals(uid).first()
    if (!ex) await db.envelopes.add({ uid, month: m, name: e.name, budget: e.budget, used: e.locked ? e.budget : 0, locked: e.locked, color: e.color })
  }
  for (const a of cfg.finance.accounts) {
    const uid = stableUuid('acc:' + a.name)
    const ex = await db.accounts.where('uid').equals(uid).first()
    if (!ex) await db.accounts.add({ uid, name: a.name, amount: a.amount, rule: a.rule })
  }
  await dedupeFinance()
}
/** 清理早期版本在多台设备各建一份造成的重复：同名的并进稳定 uid 那一行 */
export async function dedupeFinance() {
  const envs = await db.envelopes.filter(e => !e.deletedAt).toArray()
  const groups = new Map<string, typeof envs>()
  for (const e of envs) { const k = e.month + '|' + e.name; groups.set(k, [...(groups.get(k) ?? []), e]) }
  for (const [k, list] of groups) {
    if (list.length < 2) continue
    const [m, name] = k.split('|'); const keepUid = stableUuid('env:' + m + ':' + (DEFAULT_CONFIG.finance.envelopes.find(x => x.name === name)?.key ?? name))
    const keep = list.find(e => e.uid === keepUid) ?? list[0]
    const others = list.filter(e => e.id !== keep.id)
    const used = keep.locked ? keep.budget : Math.max(keep.used, ...others.map(o => o.used), others.reduce((a, o) => a + o.used, 0) > keep.used ? others.reduce((a, o) => a + o.used, 0) : 0)
    await db.envelopes.update(keep.id!, { used })
    for (const o of others) { await db.transactions.where('envelopeId').equals(o.id!).modify({ envelopeId: keep.id }); await db.envelopes.update(o.id!, { deletedAt: new Date().toISOString() }) }
  }
  const accs = await db.accounts.filter(a => !a.deletedAt).toArray()
  const ag = new Map<string, typeof accs>()
  for (const a of accs) ag.set(a.name, [...(ag.get(a.name) ?? []), a])
  for (const [name, list] of ag) {
    if (list.length < 2) continue
    const keep = list.find(a => a.uid === stableUuid('acc:' + name)) ?? list[0]
    const amount = Math.max(...list.map(a => a.amount))
    await db.accounts.update(keep.id!, { amount })
    for (const o of list.filter(a => a.id !== keep.id)) await db.accounts.update(o.id!, { deletedAt: new Date().toISOString() })
  }
}
/** 改了预算：把本月信封的 budget 同步过去 */
export async function setBudgets(cfg: AppConfig) {
  const m = month()
  const keep = new Set<string>()
  for (const e of cfg.finance.envelopes) {
    const uid = stableUuid('env:' + m + ':' + (e.key ?? e.name)); keep.add(uid)
    const ex = await db.envelopes.where('uid').equals(uid).first()
    if (ex) await db.envelopes.update(ex.id!, { name: e.name, color: e.color, locked: e.locked, budget: e.budget, used: e.locked ? e.budget : ex.used, deletedAt: undefined })
    else await db.envelopes.add({ uid, month: m, name: e.name, budget: e.budget, used: e.locked ? e.budget : 0, locked: e.locked, color: e.color })
  }
  const cur = await db.envelopes.where('month').equals(m).filter(e => !e.deletedAt).toArray()
  for (const e of cur) if (e.uid && !keep.has(e.uid)) await db.envelopes.update(e.id!, { deletedAt: new Date().toISOString() })
}
export async function spend(amount: number, envelopeName: string, text: string, cfg: AppConfig, entryId?: number) {
  await ensureMonth(cfg)
  const env = await db.envelopes.where({ month: month(), name: envelopeName }).filter(e => !e.deletedAt).first()
  if (!env) return
  await db.envelopes.update(env.id!, { used: env.used + amount })
  await db.transactions.add({ date: today(), amount, envelopeId: env.id, text, entryId })
}
export function freeToSpend(envs: Envelope[]) {
  return envs.filter(e => !e.locked && !e.deletedAt).reduce((a, e) => a + Math.max(0, e.budget - e.used), 0)
}

/* 复盘 */
export async function saveDailyState(s: { mood: number; moodNote?: string; body: number; bodyNote?: string; sub: Record<string, unknown> }) {
  const d = today()
  const ex = await db.dailyStates.where('date').equals(d).first()
  if (ex) await db.dailyStates.update(ex.id!, s); else await db.dailyStates.add({ date: d, ...s })
}
export async function completeReview(answers: Record<string, unknown>, handled: { kind: string; id: number }[], seconds: number) {
  const d = today()
  const ex = await db.reviews.where('date').equals(d).first()
  const row = { date: d, answers, handled, completed: true, seconds }
  if (ex) await db.reviews.update(ex.id!, row); else await db.reviews.add(row)
  for (const h of handled) {
    const t = h.kind === 'todo' ? db.todos : h.kind === 'issue' ? db.issues : h.kind === 'entry' ? db.entries : db.bigThings
    await (t as typeof db.todos).update(h.id, { review: 'done', reviewedAt: d })
  }
}
export async function reviewStreak(): Promise<number> {
  const all = (await db.reviews.filter(r => r.completed).toArray()).map(r => r.date)
  const set = new Set(all); let n = 0; let d = today()
  if (!set.has(d)) d = daysBetweenShift(d, -1)
  while (set.has(d)) { n++; d = daysBetweenShift(d, -1) }
  return n
}
function daysBetweenShift(d: string, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }

/* 首次示例数据（全是假数，不是 Flora 的真实数字） */
let seeding: Promise<void> | null = null
export function seedIfEmpty(cfg: AppConfig) { return seeding ??= seedOnce(cfg) }
async function seedOnce(cfg: AppConfig) {
  if (await db.config.get('seeded')) return
  await db.config.put({ key: 'seeded', value: true })
  const d = today()
  await db.books.add({ title: '纳瓦尔宝典', pages: 480, start: daysBetweenShift(d, -8), end: daysBetweenShift(d, 11), current: 192, status: 'reading' })
  await setBigThing(d, '把 OKK-485 通信参数页读懂，能用德语讲 3 句', '合上资料说出 Modbus 地址、波特率、终端电阻', cfg.bigThingMinutes)
  await addTodo('回 Westnetz 交期邮件', { date: d, tag: '工作' })
  await addTodo('德语：复习到期 8 词', { date: d, evening: true, tag: '德语' })
  await addTodo('读纳瓦尔 34 页', { date: d, evening: true, tag: '图书' })
  await addTodo('问 Lackmann 料号配 Bezeichnung', { date: daysBetweenShift(d, 1), tag: '工作' })
  await db.entries.add({ at: new Date(Date.now() - 3600e3 * 5).toISOString(), text: '一个想法：给客户做一个交期自助查询页，少回一半邮件。', source: 'desktop', tags: ['想法'], die: '客户根本不会去打开另一个页面', review: 'none' })
  await db.entries.add({ at: new Date(Date.now() - 3600e3 * 2).toISOString(), text: '做了一天改单，不知道做得对不对，没人说话。', source: 'desktop', tags: ['工作'], review: 'none' })
  await addIssue('工作没有反馈来源')
  await ensureMonth(cfg)
  await spend(38, '买菜 / 基础吃饭', 'Rewe €38', cfg)
  await spend(30, '外食 / 娱乐 / 社交', '和同事吃饭 €30', cfg)
}

export type { Issue }
