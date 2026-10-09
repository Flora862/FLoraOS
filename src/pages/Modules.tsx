import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { db, type ReadingLog } from '../lib/db'
import { month, today, daysBetween, dOff } from '../lib/dates'
import { pagesPerDay, behindDays, freeToSpend, ensureMonth } from '../lib/store'
import type { AppConfig } from '../lib/config'
import { Heat, CountUp, useToast } from '../components/ui'

export function Modules({ cfg, sub, setSub }: { cfg: AppConfig; sub?: string; setSub: (s?: string) => void }) {
  const toast = useToast()
  const book = useLiveQuery(() => db.books.where('status').equals('reading').first(), [])
  const envs = useLiveQuery(() => db.envelopes.where('month').equals(month()).toArray(), []) ?? []
  const free = freeToSpend(envs)
  if (sub === 'book') return <BookPage back={() => setSub()} />
  if (sub === 'fin') return <FinPage cfg={cfg} back={() => setSub()} />
  const M = ({ cls, ic, name, small, onClick, wide, right }: { cls: string; ic: string; name: string; small: string; onClick: () => void; wide?: boolean; right?: React.ReactNode }) => (
    <motion.div whileTap={{ scale: .97 }} onClick={onClick} className={'tile cursor-pointer flex ' + cls + (wide ? ' col-span-2 flex-row items-center justify-between min-h-[96px]' : ' flex-col justify-between min-h-[118px]')}>
      <div><div className="text-[22px]">{ic}</div><b className="block mt-1.5 text-[15px]">{name}</b><small className="text-[12px] opacity-80">{small}</small></div>{right}
    </motion.div>
  )
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <M wide cls="t5" ic="📕" name="图书" small={book ? `在读 1 · ${behindDays(book) ? '落后 ' + behindDays(book) + ' 天 · ' : ''}今天 ${pagesPerDay(book)} 页` : '还没有在读的书'} onClick={() => setSub('book')} />
      <M wide cls="t3" ic="💶" name="财务" small={`账本型 · 本月放心花 €${free}`} onClick={() => setSub('fin')} right={<div className="text-right"><div className="num text-[22px]">€<CountUp to={free} /></div><small className="text-[11px]">放心花</small></div>} />
      <M cls="t1" ic="🇩🇪" name="德语" small="计划型 · 下一轮做" onClick={() => toast('德语模块：按《抗遗忘记忆系统》搭，下一轮')} />
      <M cls="t2" ic="💡" name="想法账本" small="清单型 · 收件里筛「想法」" onClick={() => toast('想法账本第一版 = 收件筛选「想法」+ 死因字段')} />
      <M cls="t4" ic="🎧" name="播客" small="清单型 · 下一轮" onClick={() => toast('播客：清单型，下一轮')} />
      <M cls="t1" ic="📋" name="SOP" small="流程型 · 模子留好" onClick={() => toast('SOP：流程型，用到再做')} />
      <div className="tile border-2 border-dashed grid place-items-center text-center muted cursor-pointer" style={{ borderColor: 'var(--line)', background: 'transparent' }} onClick={() => toast('说一句「加一个 X 模块」我就按模子长出来')}>＋ 加一个模块</div>
    </div>
  )
}

function BookPage({ back }: { back: () => void }) {
  const book = useLiveQuery(() => db.books.where('status').equals('reading').first(), [])
  const logs = useLiveQuery(async (): Promise<ReadingLog[]> => book ? db.readingLogs.where('bookId').equals(book.id!).toArray() : [], [book?.id]) ?? []
  const notes = useLiveQuery(() => db.entries.filter(e => e.tags.includes('图书')).reverse().toArray(), []) ?? []
  const [form, setForm] = useState({ title: '', pages: '', days: '14' })
  const toast = useToast()
  if (!book) return (
    <div><button className="pill sm ghost mb-2.5" onClick={back}>← 模块</button>
      <div className="card"><div className="lbl muted mb-2" style={{ opacity: 1 }}>开始读一本书</div>
        <input className="w-full rounded-xl p-3 mb-2 border-0" style={{ background: 'var(--bg)' }} placeholder="书名" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        <div className="flex gap-2 mb-2"><input className="flex-1 rounded-xl p-3 border-0" style={{ background: 'var(--bg)' }} placeholder="总页数" inputMode="numeric" value={form.pages} onChange={e => setForm({ ...form, pages: e.target.value })} /><input className="flex-1 rounded-xl p-3 border-0" style={{ background: 'var(--bg)' }} placeholder="几天读完" inputMode="numeric" value={form.days} onChange={e => setForm({ ...form, days: e.target.value })} /></div>
        <button className="pill" onClick={async () => { if (!form.title || !+form.pages) return toast('书名和页数要填'); await db.books.add({ title: form.title, pages: +form.pages, start: today(), end: dOff(+form.days - 1), current: 0, status: 'reading' }); toast('开始了。每天说一句"读到 N 页"') }}>开始</button>
      </div></div>)
  const per = pagesPerDay(book); const behind = behindDays(book); const leftDays = Math.max(0, daysBetween(today(), book.end) + 1)
  const heat = Array.from({ length: 30 }, (_, i) => { const d = dOff(i - 29); const l = logs.find(x => x.date === d); return !l ? 0 : l.met ? 3 : l.pagesRead > 0 ? 2 : 1 })
  return (
    <div>
      <button className="pill sm ghost mb-2.5" onClick={back}>← 模块</button>
      <div className="tile t5 mb-3">
        <div className="grid gap-3 items-center" style={{ gridTemplateColumns: '84px 1fr' }}>
          <div className="w-[84px] h-[118px] rounded-xl text-white flex items-end p-2 font-extrabold text-[13px] leading-tight" style={{ background: 'linear-gradient(160deg,var(--t2d),var(--t1d))', boxShadow: '0 8px 18px rgba(0,0,0,.18)' }}>{book.title}</div>
          <div><div className="lbl">在读 · {book.start.slice(5)} → {book.end.slice(5)}</div><div className="num"><CountUp to={book.current} /><small>/{book.pages}</small></div><div className="prog mt-2"><i style={{ width: (book.current / book.pages * 100) + '%' }} /></div>
            <div className="flex gap-1.5 flex-wrap mt-2"><Stat n={per} l="今日应读" /><Stat n={leftDays} l="剩余天" /><Stat n={-behind} l="落后天" warn={behind > 0} /></div></div>
        </div>
        <div className="flex gap-1.5 mt-3"><button className="pill sm" onClick={() => toast('计时阅读下一轮做。现在说一句"读到 N 页"就行')}>开始读 · 计时</button><button className="pill sm ghost" onClick={() => document.getElementById('capture')?.focus()}>补录页数</button></div>
      </div>
      <div className="tile t3 mb-3"><div className="lbl">最近 30 天</div><div className="mt-2"><Heat levels={heat} /></div><div className="text-[13px] mt-2 opacity-80">深色 = 完成当日应读</div></div>
      <div className="card"><div className="lbl muted" style={{ opacity: 1 }}>摘录与反思 · {notes.length}</div>
        {notes.map(n => <div key={n.id} className="item"><div className="t">{n.at.slice(5, 10)}{n.review !== 'none' && <span className="chip ghost">要复盘</span>}</div>{n.text}</div>)}
        {!notes.length && <div className="muted text-[13px] py-2">边读边说一句，标签带"图书"的都在这。</div>}</div>
    </div>
  )
}
const Stat = ({ n, l, warn }: { n: number; l: string; warn?: boolean }) => <div className="rounded-xl px-2.5 py-1.5 font-extrabold text-[15px] tabular-nums" style={{ background: 'var(--surface)', color: warn ? 'var(--t4d)' : undefined }}>{n}<small className="block text-[10px] muted font-semibold tracking-wide">{l}</small></div>

function FinPage({ cfg, back }: { cfg: AppConfig; back: () => void }) {
  const envs = useLiveQuery(() => db.envelopes.where('month').equals(month()).toArray(), []) ?? []
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? []
  const tx = useLiveQuery(() => db.transactions.orderBy('date').reverse().limit(8).toArray(), []) ?? []
  const free = freeToSpend(envs)
  const toast = useToast()
  if (!envs.length) ensureMonth(cfg)
  const colorVar = (c: string) => ({ c1: 'var(--t1d)', c2: 'var(--t2d)', c3: 'var(--t3d)', c4: 'var(--t4d)', c5: 'var(--t5d)' }[c] ?? 'var(--t1d)')
  const daysLeft = daysBetween(today(), dOff(0).slice(0, 8) + String(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()))
  return (
    <div>
      <button className="pill sm ghost mb-2.5" onClick={back}>← 模块</button>
      <div className="tile accent mb-3"><div className="lbl">这个月还能放心花</div><div className="num text-[40px]">€<CountUp to={free} /></div><div className="text-[13px] mt-1.5 opacity-90">不是银行卡余额。是已获得"消费许可"、还没花掉的那部分。还剩 {daysLeft} 天。</div></div>
      <div className="sect">本月信封 <span>€{cfg.finance.income} 收入</span></div>
      <div className="card">{envs.map(e => <div key={e.id} className="item"><div className="flex justify-between items-center"><span className={'chip ' + e.color}>{e.name}</span><b className="tabular-nums">{e.locked ? `€${e.budget} ✓` : <>剩 €{Math.max(0, e.budget - e.used)} <span className="muted font-medium">/ {e.budget}</span></>}</b></div><div className="prog mt-1.5" style={{ color: colorVar(e.color) }}><i style={{ width: Math.min(100, e.used / e.budget * 100) + '%' }} /></div></div>)}</div>
      <div className="sect">存量资金 <span>以保护为主 · 在设置里改</span></div>
      <div className="grid grid-cols-2 gap-2.5 mb-3">{accounts.map((a, i) => <div key={a.id} className={'tile ' + ['t1', 't2', 't4', 't5'][i % 4]}><div className="lbl">{a.name}</div><div className="num text-[26px]">€{a.amount.toLocaleString()}</div><small className="opacity-80 text-[12px]">{a.rule}</small></div>)}</div>
      <div className="card mb-3"><div className="lbl muted" style={{ opacity: 1 }}>最近消费 · 说一句就记</div>{tx.map(t => { const e = envs.find(x => x.id === t.envelopeId); return <div key={t.id} className="item"><div className="t">{t.date.slice(5)} · <span className={'chip ' + (e?.color ?? '')}>{e?.name}</span></div>{t.text}{e && <div className="m">{e.name} 剩 €{Math.max(0, e.budget - e.used)}。长期储蓄不受影响。</div>}</div> })}{!tx.length && <div className="muted text-[13px] py-2">还没有。试试说"吃饭 €12"。</div>}</div>
      <div className="card"><div className="lbl muted" style={{ opacity: 1 }}>消费时怎么判断（V1 §12）</div><div className="text-[14px] leading-7">不问"能不能不花"。问：<b>这笔属于哪个信封？信封里还有多少？</b><br />有，愿意，就花。没有，先攒目标基金。</div><button className="pill sm ghost mt-2" onClick={() => toast('三个月验证表：第 3 个月结自动出')}>V1 三个数字验证中</button></div>
    </div>
  )
}
