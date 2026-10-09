// 业务操作：所有写数据库的动作集中在这里，页面只调用这些函数。
import { db, type Entry, type Todo, type Issue, type Envelope, type Transaction } from './db'
import { DEFAULT_CONFIG, type AppConfig } from './config'
import { parse, todoFromVague, issueFromText, type Parsed } from './parse'
import { classify, merge } from './llm'
import { stableUuid } from './sync'
import { supabase } from './supabase'
import { today, month, daysBetween, dOff } from './dates'

/** 当前用户 id（本地模式为 'local'），用来给稳定 uid 加前缀，不同账号不会撞 */
export async function currentUserId(): Promise<string> {
  if (!supabase) return 'local'
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user.id ?? 'local'
}

export async function loadConfig(): Promise<AppConfig> {
  const row = await db.config.get('app')
  return { ...DEFAULT_CONFIG, ...((row?.value as Partial<AppConfig>) ?? {}) }
}
export async function saveConfig(c: AppConfig) { await db.config.put({ key: 'app', value: c }) }

/** 一句话进来：解析 → 存条目 → 按规则建待办/问题/记页数/记消费。返回解析结果供 UI 决定是否弹抽屉。 */
export async function capture(text: string, cfg: AppConfig, source: Entry['source'] = 'desktop'): Promise<{ parsed: Parsed; entryUid: string }> {
  const rule = parse(text, cfg)
  const llm = rule.bigThing || rule.pages || rule.money ? null : await classify(text, cfg.tags.map(t => t.name))
  const parsed = merge(rule, llm)
  const entryUid = crypto.randomUUID()
  await db.entries.add({ uid: entryUid, at: new Date().toISOString(), text, source, tags: parsed.tags, review: 'none' })

  if (parsed.bigThing) await setBigThing(parsed.bigThing.day === 'today' ? today() : dOff(1), parsed.bigThing.text, parsed.bigThing.standard ?? '', cfg.bigThingMinutes)
  if (parsed.pages) await logPages(parsed.pages)
  if (parsed.money) await spend(parsed.money.amount, parsed.money.envelope, text, cfg, entryUid)
  if (parsed.todo && !parsed.ask) await addTodo(parsed.todo, { entryUid, date: parsed.date, evening: parsed.evening, tag: parsed.tags[0] })
  if (parsed.issue && !parsed.ask) await addIssue(parsed.issue, entryUid)
  return { parsed, entryUid }
}

/** 抽屉里选了之后 */
export async function resolveVague(entryUid: string, kind: 'todo' | 'issue' | 'none', parsed: Parsed) {
  if (kind === 'todo') await addTodo(todoFromVague(parsed.text), { entryUid, date: parsed.date ?? today(), evening: parsed.evening, tag: parsed.tags[0] })
  if (kind === 'issue') await addIssue(issueFromText(parsed.text), entryUid)
}

export async function addTodo(text: string, o: Partial<Todo> = {}) {
  return db.todos.add({ text, done: false, evening: false, tag: o.tag ?? '杂', review: 'none', ...o })
}
export async function toggleTodo(id: number) {
  const t = await db.todos.get(id); if (!t) return
  const done = !t.done
  await db.todos.update(id, { done, doneAt: done ? new Date().toISOString() : undefined })
}
export async function setTodoReview(id: number, on: boolean) { await db.todos.update(id, { review: on ? 'pending' : 'none' }) }
export async function moveTodo(id: number, date: string) { await db.todos.update(id, { date }) }

export async function addIssue(text: string, entryUid?: string) {
  return db.issues.add({ text, entryUid, status: 'open', blocks: [], review: 'pending' })
}
export async function addBlock(id: number, text: string) {
  const i = await db.issues.get(id); if (!i) return
  await db.issues.update(id, { blocks: [...i.blocks, { at: today(), text }] })
}
export async function solveIssue(id: number, how: string) {
  await db.issues.update(id, { status: 'solved', solvedAt: today(), solvedHow: how, review: 'done', reviewedAt: today() })
}

export async function setIdeaDie(entryUid: string, die: string) { const e = await db.entries.where('uid').equals(entryUid).first(); if (e) await db.entries.update(e.id!, { die }) }
export async function setEntryReview(entryId: number, on: boolean) { await db.entries.update(entryId, { review: on ? 'pending' : 'none' }) }

/* 大事（一天一件；软删后可重建） */
export async function getBigThing(date: string) {
  return db.bigThings.where('date').equals(date).filter(b => !b.deletedAt).first()
}
export async function setBigThing(date: string, text: string, standard: string, minutes: number) {
  const ex = await getBigThing(date)
  if (ex) await db.bigThings.update(ex.id!, { text, standard, minutes })
  else await db.bigThings.add({ date, text, standard, minutes, review: 'pending' })
}
export async function resultBigThing(date: string, result: 'done' | 'failed' | 'skipped', fact?: string) {
  const ex = await getBigThing(date); if (!ex) return
  await db.bigThings.update(ex.id!, { result, ...(fact !== undefined ? { fact } : {}) })
}

/* 图书 */
export async function logPages(toPage: number) {
  const book = await db.books.where('status').equals('reading').filter(b => !b.deletedAt).first(); if (!book) return false
  const d = today()
  const prevLog = (await db.readingLogs.where('bookUid').equals(book.uid!).filter(l => l.date < d && !l.deletedAt).toArray()).sort((a, b) => a.date < b.date ? 1 : -1)[0]
  const base = prevLog ? prevLog.toPage : Math.min(book.current, toPage)   // 今天之前读到哪
  const pagesRead = Math.max(0, toPage - base)
  const need = pagesPerDay({ ...book, current: base })
  const ex = await db.readingLogs.where('bookUid').equals(book.uid!).filter(l => l.date === d && !l.deletedAt).first()
  if (ex) await db.readingLogs.update(ex.id!, { toPage, pagesRead, met: pagesRead >= need })
  else await db.readingLogs.add({ bookUid: book.uid!, date: d, toPage, pagesRead, met: pagesRead >= need })
  await db.books.update(book.id!, { current: toPage })   // 允许改小（说错了重说）
  return true
}
export function pagesPerDay(b: { pages: number; current: number; end: string }) {
  const left = Math.max(1, daysBetween(today(), b.end) + 1)
  return Math.max(0, Math.ceil((b.pages - b.current) / left))
}
export function behindDays(b: { pages: number; current: number; start: string; end: string }) {
  const total = Math.max(1, daysBetween(b.start, b.end) + 1)
  const elapsed = Math.min(total, Math.max(0, daysBetween(b.start, today()) + 1))
  const planned = Math.round(b.pages * elapsed / total)
  const per = b.pages / total
  return Math.max(0, Math.round((planned - b.current) / per))
}

/* 财务：信封用稳定 uid（用户 + 月份 + key），两台设备建的是同一份；用量由流水求和 */
export function envelopeUid(userId: string, m: string, key: string) { return stableUuid(userId + ':env:' + m + ':' + key) }
export async function ensureMonth(cfg: AppConfig, m = month()) {
  const userId = await currentUserId()
  for (const e of cfg.finance.envelopes) {
    const key = e.key ?? e.name
    const uid = envelopeUid(userId, m, key)
    const ex = await db.envelopes.where('uid').equals(uid).first()
    if (ex) continue
    // 旧版本（没带用户前缀）建的同名信封：把 uid 升级成新的，流水跟着改
    const legacy = await db.envelopes.where('month').equals(m).filter(x => x.name === e.name && !x.deletedAt).first()
    if (legacy) { const old = legacy.uid!; await db.envelopes.update(legacy.id!, { uid }); await db.transactions.where('envelopeUid').equals(old).modify({ envelopeUid: uid }); continue }
    await db.envelopes.add({ uid, month: m, name: e.name, budget: e.budget, used: 0, locked: e.locked, color: e.color })
  }
  for (const a of cfg.finance.accounts) {
    const uid = stableUuid(userId + ':acc:' + a.name)
    if (await db.accounts.where('uid').equals(uid).first()) continue
    const legacy = await db.accounts.filter(x => x.name === a.name && !x.deletedAt).first()
    if (legacy) { await db.accounts.update(legacy.id!, { uid }); continue }
    await db.accounts.add({ uid, name: a.name, amount: a.amount, rule: a.rule })
  }
  await dedupeFinance(m)
}
/** 同名重复信封/账户（早期多设备各建一份）：留稳定 uid 那一行，流水挂过去，其余软删 */
export async function dedupeFinance(m = month()) {
  const envs = await db.envelopes.where('month').equals(m).filter(e => !e.deletedAt).toArray()
  const groups = new Map<string, Envelope[]>()
  for (const e of envs) groups.set(e.name, [...(groups.get(e.name) ?? []), e])
  for (const list of groups.values()) {
    if (list.length < 2) continue
    const keep = list[0]
    for (const o of list.slice(1)) {
      await db.transactions.where('envelopeUid').equals(o.uid!).modify({ envelopeUid: keep.uid })
      await db.envelopes.update(o.id!, { deletedAt: new Date().toISOString() })
    }
  }
  const accs = await db.accounts.filter(a => !a.deletedAt).toArray()
  const ag = new Map<string, typeof accs>()
  for (const a of accs) ag.set(a.name, [...(ag.get(a.name) ?? []), a])
  for (const list of ag.values()) {
    if (list.length < 2) continue
    const amount = Math.max(...list.map(a => a.amount))
    await db.accounts.update(list[0].id!, { amount })
    for (const o of list.slice(1)) await db.accounts.update(o.id!, { deletedAt: new Date().toISOString() })
  }
}
/** 改了预算：本月信封同步（改名、加、减、锁定） */
export async function setBudgets(cfg: AppConfig) {
  const m = month(); const userId = await currentUserId()
  const keep = new Set<string>()
  for (const e of cfg.finance.envelopes) {
    const uid = envelopeUid(userId, m, e.key ?? e.name); keep.add(uid)
    const ex = await db.envelopes.where('uid').equals(uid).first()
    if (ex) await db.envelopes.update(ex.id!, { name: e.name, color: e.color, locked: e.locked, budget: e.budget, deletedAt: undefined })
    else await db.envelopes.add({ uid, month: m, name: e.name, budget: e.budget, used: 0, locked: e.locked, color: e.color })
  }
  for (const e of await db.envelopes.where('month').equals(m).filter(x => !x.deletedAt).toArray()) if (e.uid && !keep.has(e.uid)) await db.envelopes.update(e.id!, { deletedAt: new Date().toISOString() })
}
/** 记一笔消费。找不到信封就落到第一个可花信封；返回实际落到的信封名，null 表示没记上 */
export async function spend(amount: number, envelopeName: string, text: string, cfg: AppConfig, entryUid?: string, date = today()): Promise<string | null> {
  const m = date.slice(0, 7)
  await ensureMonth(cfg, m)
  const envs = await db.envelopes.where('month').equals(m).filter(e => !e.deletedAt).toArray()
  const env = envs.find(e => e.name === envelopeName) ?? envs.find(e => !e.locked)
  if (!env) return null
  await db.transactions.add({ date, amount, envelopeUid: env.uid, text, entryUid })
  return env.name
}
/** 信封实际用量 = 流水求和（锁定信封视为用满） */
export function usedOf(env: Envelope, txs: Transaction[]) {
  if (env.locked) return env.budget
  return txs.filter(t => t.envelopeUid === env.uid && !t.deletedAt).reduce((a, t) => a + t.amount, 0)
}
export function freeToSpend(envs: Envelope[], txs: Transaction[]) {
  return Math.round(envs.filter(e => !e.locked && !e.deletedAt).reduce((a, e) => a + Math.max(0, e.budget - usedOf(e, txs)), 0) * 100) / 100
}

/* 复盘 */
export async function saveDailyState(s: { mood: number; moodNote?: string; body: number; bodyNote?: string; sub: Record<string, unknown> }) {
  const d = today()
  const ex = await db.dailyStates.where('date').equals(d).filter(x => !x.deletedAt).first()
  if (ex) await db.dailyStates.update(ex.id!, s); else await db.dailyStates.add({ date: d, ...s })
}
export async function completeReview(answers: Record<string, unknown>, handled: { kind: string; uid: string }[], seconds: number) {
  const d = today()
  const ex = await db.reviews.where('date').equals(d).filter(x => !x.deletedAt).first()
  const row = { date: d, answers, handled, completed: true, seconds }
  if (ex) await db.reviews.update(ex.id!, row); else await db.reviews.add(row)
  for (const h of handled) {
    const t = (h.kind === 'todo' ? db.todos : h.kind === 'issue' ? db.issues : h.kind === 'entry' ? db.entries : db.bigThings) as typeof db.todos
    const r = await t.where('uid').equals(h.uid).first()
    if (r) await t.update(r.id!, { review: 'done', reviewedAt: d })
  }
}
export async function reviewStreak(): Promise<number> {
  const set = new Set((await db.reviews.filter(r => r.completed && !r.deletedAt).toArray()).map(r => r.date))
  let n = 0; let d = today()
  if (!set.has(d)) d = dOff(-1)
  while (set.has(d)) { n++; d = dOff(-1, new Date(d)) }
  return n
}

/* 首次示例数据（只在本地模式；全是假数） */
let seeding: Promise<void> | null = null
export function seedIfEmpty(cfg: AppConfig) { return seeding ??= seedOnce(cfg) }
async function seedOnce(cfg: AppConfig) {
  if (await db.config.get('seeded')) return
  await db.config.put({ key: 'seeded', value: true })
  const d = today()
  await db.books.add({ title: '纳瓦尔宝典', pages: 480, start: dOff(-8), end: dOff(11), current: 192, status: 'reading' })
  await setBigThing(d, '把 OKK-485 通信参数页读懂，能用德语讲 3 句', '合上资料说出 Modbus 地址、波特率、终端电阻', cfg.bigThingMinutes)
  await addTodo('回 Westnetz 交期邮件', { date: d, tag: '工作' })
  await addTodo('德语：复习到期 8 词', { date: d, evening: true, tag: '德语' })
  await addTodo('读纳瓦尔 34 页', { date: d, evening: true, tag: '图书' })
  await addTodo('问 Lackmann 料号配 Bezeichnung', { date: dOff(1), tag: '工作' })
  await db.entries.add({ at: new Date(Date.now() - 3600e3 * 5).toISOString(), text: '一个想法：给客户做一个交期自助查询页，少回一半邮件。', source: 'desktop', tags: ['想法'], die: '客户根本不会去打开另一个页面', review: 'none' })
  await db.entries.add({ at: new Date(Date.now() - 3600e3 * 2).toISOString(), text: '做了一天改单，不知道做得对不对，没人说话。', source: 'desktop', tags: ['工作'], review: 'none' })
  await addIssue('工作没有反馈来源')
  await ensureMonth(cfg)
  await spend(38, '买菜 / 基础吃饭', 'Rewe €38', cfg)
  await spend(30, '外食 / 娱乐 / 社交', '和同事吃饭 €30', cfg)
}

export type { Issue }
