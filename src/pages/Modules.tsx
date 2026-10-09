import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { db, type ReadingLog } from '../lib/db'
import { month, today, daysBetween, dOff } from '../lib/dates'
import { pagesPerDay, behindDays, freeToSpend, spend, setBudgets, saveConfig } from '../lib/store'
import type { AppConfig } from '../lib/config'
import { Heat, CountUp, useToast } from '../components/ui'

export function Modules({ cfg, setCfg, sub, setSub }: { cfg: AppConfig; setCfg: (c: AppConfig) => void; sub?: string; setSub: (s?: string) => void }) {
  const toast = useToast()
  const book = useLiveQuery(() => db.books.where('status').equals('reading').first(), [])
  const envs = useLiveQuery(() => db.envelopes.where('month').equals(month()).filter(e => !e.deletedAt).toArray(), []) ?? []
  const free = freeToSpend(envs)
  if (sub === 'book') return <BookPage back={() => setSub()} />
  if (sub === 'fin') return <FinPage cfg={cfg} setCfg={setCfg} back={() => setSub()} />
  const M = ({ cls, ic, name, small, onClick, wide, right }: { cls: string; ic: string; name: string; small: string; onClick: () => void; wide?: boolean; right?: React.ReactNode }) => (
    <motion.div whileTap={{ scale: .97 }} onClick={onClick} className={'tile cursor-pointer flex ' + cls + (wide ? ' col-span-2 flex-row items-center justify-between min-h-[96px]' : ' flex-col justify-between min-h-[118px]')}>
      <div><div className="text-[22px]">{ic}</div><b className="block mt-1.5 text-[15px]">{name}</b><small className="text-[12px] opacity-80">{small}</small></div>{right}
    </motion.div>
  )
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <M wide cls="t5" ic="📕" name="图书" small={book ? `在读《${book.title}》 · ${behindDays(book) ? '落后 ' + behindDays(book) + ' 天 · ' : ''}今天 ${pagesPerDay(book)} 页` : '还没有在读的书，点进去建一本'} onClick={() => setSub('book')} />
      <M wide cls="t3" ic="💶" name="财务" small={`本月放心花 €${free} · 点进去改预算`} onClick={() => setSub('fin')} right={<div className="text-right"><div className="num text-[22px]">€<CountUp to={free} /></div><small className="text-[11px]">放心花</small></div>} />
      <M cls="t1" ic="🇩🇪" name="德语" small="计划型 · 下一轮做" onClick={() => toast('德语模块：按《抗遗忘记忆系统》搭，下一轮')} />
      <M cls="t2" ic="💡" name="想法账本" small="收件里筛「想法」" onClick={() => toast('想法账本第一版 = 收件筛选「想法」+ 死因字段')} />
      <M cls="t4" ic="🎧" name="播客" small="清单型 · 下一轮" onClick={() => toast('播客：清单型，下一轮')} />
      <M cls="t1" ic="📋" name="SOP" small="流程型 · 模子留好" onClick={() => toast('SOP：流程型，用到再做')} />
      <div className="tile border-2 border-dashed grid place-items-center text-center muted cursor-pointer" style={{ borderColor: 'var(--line)', background: 'transparent' }} onClick={() => toast('说一句「加一个 X 模块」我就按模子长出来')}>＋ 加一个模块</div>
    </div>
  )
}

/* ---------------- 图书 ---------------- */
function BookPage({ back }: { back: () => void }) {
  const book = useLiveQuery(() => db.books.where('status').equals('reading').first(), [])
  const logs = useLiveQuery(async (): Promise<ReadingLog[]> => book ? db.readingLogs.where('bookId').equals(book.id!).toArray() : [], [book?.id]) ?? []
  const notes = useLiveQuery(() => db.entries.filter(e => e.tags.includes('图书') && !e.deletedAt).reverse().toArray(), []) ?? []
  const [editing, setEditing] = useState(false)
  const toast = useToast()

  if (!book || editing) return <BookForm book={editing ? book : undefined} back={() => editing ? setEditing(false) : back()} />

  const per = pagesPerDay(book); const behind = behindDays(book); const leftDays = Math.max(0, daysBetween(today(), book.end) + 1)
  const heat = Array.from({ length: 30 }, (_, i) => { const d = dOff(i - 29); const l = logs.find(x => x.date === d); return !l ? 0 : l.met ? 3 : l.pagesRead > 0 ? 2 : 1 })
  const totalDays = daysBetween(book.start, book.end) + 1
  return (
    <div>
      <div className="flex justify-between mb-2.5"><button className="pill sm ghost" onClick={back}>← 模块</button><button className="pill sm ghost" onClick={() => setEditing(true)}>改计划</button></div>
      <div className="tile t5 mb-3">
        <div className="grid gap-3 items-center" style={{ gridTemplateColumns: '84px 1fr' }}>
          <div className="w-[84px] h-[118px] rounded-xl text-white flex items-end p-2 font-extrabold text-[13px] leading-tight" style={{ background: 'linear-gradient(160deg,var(--t2d),var(--t1d))', boxShadow: '0 8px 18px rgba(0,0,0,.18)' }}>{book.title}</div>
          <div><div className="lbl">在读 · {book.start.slice(5)} → {book.end.slice(5)} · 共 {totalDays} 天</div><div className="num"><CountUp to={book.current} /><small>/{book.pages}</small></div><div className="prog mt-2"><i style={{ width: (book.current / book.pages * 100) + '%' }} /></div>
            <div className="flex gap-1.5 flex-wrap mt-2"><Stat n={per} l="今日应读" /><Stat n={leftDays} l="剩余天" /><Stat n={-behind} l="落后天" warn={behind > 0} /><Stat n={Math.ceil(book.pages / totalDays)} l="原计划/天" /></div></div>
        </div>
        <div className="flex gap-1.5 mt-3 flex-wrap">
          <button className="pill sm" onClick={() => { document.getElementById('capture')?.focus(); toast('在下面写"读到 N 页"，进度和今天的记录自动更新') }}>记今天读到几页</button>
          <button className="pill sm ghost" onClick={async () => { await db.books.update(book.id!, { status: 'finished' }); toast('读完了。再建下一本') }}>读完了</button>
        </div>
      </div>
      <div className="tile t3 mb-3"><div className="lbl">最近 30 天</div><div className="mt-2"><Heat levels={heat} /></div><div className="text-[13px] mt-2 opacity-80">深色 = 完成当日应读。灰 = 没记录。</div></div>
      <div className="card"><div className="lbl muted" style={{ opacity: 1 }}>摘录与反思 · {notes.length}</div>
        {notes.map(n => <div key={n.id} className="item"><div className="t">{n.at.slice(5, 10)}{n.review !== 'none' && <span className="chip ghost">要复盘</span>}</div>{n.text}</div>)}
        {!notes.length && <div className="muted text-[13px] py-2">边读边在下面写一句，带"这本书 / 读到 / 书里"的都会归到这。</div>}</div>
    </div>
  )
}
function BookForm({ book, back }: { book?: { id?: number; title: string; pages: number; start: string; end: string; current: number }; back: () => void }) {
  const [f, setF] = useState({ title: book?.title ?? '', pages: String(book?.pages ?? ''), start: book?.start ?? today(), end: book?.end ?? dOff(13), current: String(book?.current ?? 0) })
  const toast = useToast()
  const days = Math.max(1, daysBetween(f.start, f.end) + 1)
  const per = +f.pages ? Math.ceil((+f.pages - +f.current) / days) : 0
  const inp = 'w-full rounded-xl p-3 border-0 mt-1'
  return (
    <div><button className="pill sm ghost mb-2.5" onClick={back}>← 返回</button>
      <div className="card grid gap-3">
        <div className="lbl muted" style={{ opacity: 1 }}>{book ? '改计划' : '开始读一本书'}</div>
        <label><span className="muted text-[12px] font-semibold">书名</span><input className={inp} style={{ background: 'var(--bg)' }} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label><span className="muted text-[12px] font-semibold">总页数</span><input className={inp} style={{ background: 'var(--bg)' }} inputMode="numeric" value={f.pages} onChange={e => setF({ ...f, pages: e.target.value })} /></label>
          <label><span className="muted text-[12px] font-semibold">已读到第几页</span><input className={inp} style={{ background: 'var(--bg)' }} inputMode="numeric" value={f.current} onChange={e => setF({ ...f, current: e.target.value })} /></label>
          <label><span className="muted text-[12px] font-semibold">开始日</span><input className={inp} style={{ background: 'var(--bg)' }} type="date" value={f.start} onChange={e => setF({ ...f, start: e.target.value })} /></label>
          <label><span className="muted text-[12px] font-semibold">读完日</span><input className={inp} style={{ background: 'var(--bg)' }} type="date" value={f.end} onChange={e => setF({ ...f, end: e.target.value })} /></label>
        </div>
        <div className="tile t5"><div className="lbl">按这个计划</div><div className="text-[15px] font-bold mt-1">{days} 天 · 每天约 {per} 页</div><div className="text-[12px] mt-1 opacity-80">落后了每天应读会自动重算，首页会提醒。</div></div>
        <button className="pill" onClick={async () => {
          if (!f.title || !+f.pages) return toast('书名和页数要填')
          const row = { title: f.title, pages: +f.pages, start: f.start, end: f.end, current: +f.current || 0, status: 'reading' as const }
          if (book?.id) await db.books.update(book.id, row); else await db.books.add(row)
          toast(book ? '计划改好了' : '开始了。每天写一句"读到 N 页"'); back()
        }}>{book ? '保存' : '开始'}</button>
      </div></div>
  )
}
const Stat = ({ n, l, warn }: { n: number; l: string; warn?: boolean }) => <div className="rounded-xl px-2.5 py-1.5 font-extrabold text-[15px] tabular-nums" style={{ background: 'var(--surface)', color: warn ? 'var(--t4d)' : undefined }}>{n}<small className="block text-[10px] muted font-semibold tracking-wide">{l}</small></div>

/* ---------------- 财务 ---------------- */
function FinPage({ cfg, setCfg, back }: { cfg: AppConfig; setCfg: (c: AppConfig) => void; back: () => void }) {
  const envs = useLiveQuery(() => db.envelopes.where('month').equals(month()).filter(e => !e.deletedAt).toArray(), []) ?? []
  const accounts = useLiveQuery(() => db.accounts.filter(a => !a.deletedAt).toArray(), []) ?? []
  const tx = useLiveQuery(() => db.transactions.orderBy('date').reverse().limit(10).toArray(), []) ?? []
  const free = freeToSpend(envs)
  const toast = useToast()
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState(() => ({ income: cfg.finance.income, envelopes: cfg.finance.envelopes.map(e => ({ ...e })) }))
  const colorVar = (c: string) => ({ c1: 'var(--t1d)', c2: 'var(--t2d)', c3: 'var(--t3d)', c4: 'var(--t4d)', c5: 'var(--t5d)' }[c] ?? 'var(--t1d)')
  const lastDay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const daysLeft = lastDay - new Date().getDate()
  const sum = draft.envelopes.reduce((a, e) => a + (+e.budget || 0), 0)
  async function saveBudgets() {
    const c = { ...cfg, finance: { ...cfg.finance, income: +draft.income || 0, envelopes: draft.envelopes.map(e => ({ ...e, budget: +e.budget || 0 })) } }
    setCfg(c); await saveConfig(c); await setBudgets(c); setEdit(false); toast('预算改好了，本月信封同步更新')
  }
  return (
    <div>
      <div className="flex justify-between mb-2.5"><button className="pill sm ghost" onClick={back}>← 模块</button><button className="pill sm ghost" onClick={() => setEdit(e => !e)}>{edit ? '取消' : '改预算'}</button></div>
      <div className="tile accent mb-3"><div className="lbl">这个月还能放心花</div><div className="num text-[40px]">€<CountUp to={free} /></div><div className="text-[13px] mt-1.5 opacity-90">不是银行卡余额。是已获得"消费许可"、还没花掉的那部分。还剩 {daysLeft} 天。</div></div>

      {edit ? (
        <div className="card mb-3 grid gap-2">
          <div className="lbl muted" style={{ opacity: 1 }}>每月预算（存你的库，不发给模型）</div>
          <label className="flex items-center justify-between"><span>月收入</span><input className="w-28 rounded-xl p-2 border-0 text-right tabular-nums" style={{ background: 'var(--bg)' }} inputMode="decimal" value={draft.income} onChange={e => setDraft({ ...draft, income: +e.target.value })} /></label>
          {draft.envelopes.map((e, i) => <label key={e.name} className="flex items-center justify-between gap-2"><span className={'chip ' + e.color}>{e.name}</span><span className="muted text-[12px] ml-auto">{e.locked ? '锁定' : '可花'}</span><input className="w-24 rounded-xl p-2 border-0 text-right tabular-nums" style={{ background: 'var(--bg)' }} inputMode="decimal" value={e.budget} onChange={ev => setDraft({ ...draft, envelopes: draft.envelopes.map((x, k) => k === i ? { ...x, budget: +ev.target.value } : x) })} /></label>)}
          <div className="text-[13px]" style={{ color: sum === +draft.income ? 'var(--muted)' : 'var(--t4d)' }}>信封合计 €{sum} / 收入 €{draft.income}{sum !== +draft.income && ' · 不相等，差 €' + (draft.income - sum)}</div>
          <button className="pill" onClick={saveBudgets}>保存</button>
          <div className="muted text-[12px]">想加减信封种类、改名字，跟我说一句。</div>
        </div>
      ) : (<>
        <div className="sect">本月信封 <span>€{cfg.finance.income} 收入 · {month()}</span></div>
        <div className="card">{envs.map(e => <div key={e.id} className="item"><div className="flex justify-between items-center"><span className={'chip ' + e.color}>{e.name}</span><b className="tabular-nums">{e.locked ? `€${e.budget} ✓` : <>剩 €{Math.max(0, e.budget - e.used)} <span className="muted font-medium">/ {e.budget}</span></>}</b></div><div className="prog mt-1.5" style={{ color: colorVar(e.color) }}><i style={{ width: Math.min(100, e.budget ? e.used / e.budget * 100 : 0) + '%' }} /></div></div>)}{!envs.length && <div className="muted text-[13px]">本月信封还没生成，刷新一下</div>}</div>
      </>)}

      <div className="sect">存量资金 <span>在设置里改数字</span></div>
      <div className="grid grid-cols-2 gap-2.5 mb-3">{accounts.map((a, i) => <div key={a.id} className={'tile ' + ['t1', 't2', 't4', 't5'][i % 4]}><div className="lbl">{a.name}</div><div className="num text-[26px]">€{a.amount.toLocaleString()}</div><small className="opacity-80 text-[12px]">{a.rule}</small></div>)}</div>
      <BatchImport cfg={cfg} />
      <div className="card mb-3"><div className="lbl muted" style={{ opacity: 1 }}>最近消费 · 说一句就记</div>{tx.map(t => { const e = envs.find(x => x.id === t.envelopeId); return <div key={t.id} className="item"><div className="t">{t.date.slice(5)} · <span className={'chip ' + (e?.color ?? '')}>{e?.name ?? '信封'}</span></div>{t.text}</div> })}{!tx.length && <div className="muted text-[13px] py-2">还没有。试试说"吃饭 €12"。</div>}</div>
      <div className="card"><div className="lbl muted" style={{ opacity: 1 }}>消费时怎么判断（V1 §12）</div><div className="text-[14px] leading-7">不问"能不能不花"。问：<b>这笔属于哪个信封？信封里还有多少？</b><br />有，愿意，就花。没有，先攒目标基金。</div></div>
    </div>
  )
}

/** 批量导入：从银行 App 截图用 iPhone「实况文本」复制出来，粘进来，一行一笔 */
function BatchImport({ cfg }: { cfg: AppConfig }) {
  const [raw, setRaw] = useState('')
  const [rows, setRows] = useState<{ text: string; amount: number; env: string; date: string }[]>([])
  const toast = useToast()
  const envNames = cfg.finance.envelopes.filter(e => !e.locked).map(e => e.name)
  function parseLines() {
    const out: typeof rows = []
    for (const line of raw.split(/\n+/)) {
      const t = line.trim(); if (!t) continue
      const m = t.match(/-?\s*(?:€|EUR)?\s*(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|EUR)?/i); if (!m) continue
      const amount = Math.abs(parseFloat(m[1].replace(',', '.'))); if (!amount) continue
      const env = cfg.finance.envelopes.find(e => e.words?.some(w => t.toLowerCase().includes(w.toLowerCase())))?.name ?? '机动'
      const dm = t.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/)
      const date = dm ? `${dm[3] ? (dm[3].length === 2 ? '20' + dm[3] : dm[3]) : today().slice(0, 4)}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : today()
      out.push({ text: t.replace(m[0], '').replace(/\s+/g, ' ').trim() || t, amount, env, date })
    }
    setRows(out); if (!out.length) toast('没认出金额。每行要有一个数字金额')
  }
  async function commit() {
    for (const r of rows) await spend(r.amount, r.env, r.text + ' €' + r.amount, cfg)
    toast('导入 ' + rows.length + ' 笔'); setRows([]); setRaw('')
  }
  return (
    <div className="card mb-3"><div className="lbl muted" style={{ opacity: 1 }}>批量导入 · 银行截图 → 实况文本复制 → 粘贴</div>
      <textarea rows={4} value={raw} onChange={e => setRaw(e.target.value)} placeholder={'一行一笔，有金额就行。例：\n08.10 REWE SAGT DANKE 38,20\nLieferando 12,50\nDB Ticket 29'} />
      <div className="flex gap-1.5 mt-2"><button className="pill sm" onClick={parseLines}>识别</button>{rows.length > 0 && <button className="pill sm" onClick={commit}>确认导入 {rows.length} 笔</button>}</div>
      {rows.map((r, i) => <div key={i} className="item flex items-center gap-2 flex-wrap"><span className="muted text-[12px] tabular-nums">{r.date.slice(5)}</span><span className="flex-1 min-w-0 truncate">{r.text}</span><b className="tabular-nums">€{r.amount}</b>
        <select className="rounded-lg px-2 py-1 border-0 text-[13px]" style={{ background: 'var(--bg)' }} value={r.env} onChange={e => setRows(rs => rs.map((x, k) => k === i ? { ...x, env: e.target.value } : x))}>{envNames.map(n => <option key={n}>{n}</option>)}</select>
        <button className="pill sm ghost" onClick={() => setRows(rs => rs.filter((_, k) => k !== i))}>×</button></div>)}
      <div className="muted text-[12px] mt-2">金额按行识别，信封按关键词猜，猜错的在下拉里改。固定支出和储蓄不用导，它们是锁定的。</div>
    </div>
  )
}
