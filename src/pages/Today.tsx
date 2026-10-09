import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { db } from '../lib/db'
import { today, fmtDate, hm, month } from '../lib/dates'
import { toggleTodo, moveTodo, resultBigThing, freeToSpend, reviewStreak, pagesPerDay, behindDays } from '../lib/store'
import type { AppConfig } from '../lib/config'
import { WeekStrip } from '../components/WeekStrip'
import { TodoRow } from '../components/TodoRow'
import { Ring, CountUp, Heat, Chip, confetti, useToast } from '../components/ui'
import { dOff } from '../lib/dates'

export function Today({ cfg, go }: { cfg: AppConfig; go: (v: string, sub?: string) => void }) {
  const T = today()
  const [sel, setSel] = useState(T)
  const toast = useToast()
  const todos = useLiveQuery(() => db.todos.filter(t => !t.deletedAt).toArray(), []) ?? []
  const big = useLiveQuery(() => db.bigThings.where('date').equals(T).first(), [T])
  const entries = useLiveQuery(() => db.entries.orderBy('at').reverse().limit(3).toArray(), []) ?? []
  const issues = useLiveQuery(() => db.issues.where('status').equals('open').toArray(), []) ?? []
  const envs = useLiveQuery(() => db.envelopes.where('month').equals(month()).toArray(), []) ?? []
  const book = useLiveQuery(() => db.books.where('status').equals('reading').first(), [])
  const quotes = useLiveQuery(() => db.entries.filter(e => e.tags.includes('图书')).toArray(), []) ?? []
  const [streak, setStreak] = useState(0)
  useEffect(() => { reviewStreak().then(setStreak) }, [todos.length])

  const td = todos.filter(t => t.date === T); const done = td.filter(t => t.done).length
  const day = td.filter(t => !t.evening), eve = td.filter(t => t.evening)
  const free = freeToSpend(envs)
  const [left, setLeft] = useState((big?.minutes ?? cfg.bigThingMinutes) * 60)
  const [running, setRunning] = useState(false)
  useEffect(() => { if (!running) return; const id = setInterval(() => setLeft(l => { if (l <= 1) { clearInterval(id); setRunning(false); finish('done') } return l - 1 }), 1000); return () => clearInterval(id) }, [running])
  const total = (big?.minutes ?? cfg.bigThingMinutes) * 60
  async function finish(r: 'done' | 'failed') { await resultBigThing(T, r); if (r === 'done') { confetti(); toast('大事做成，晚上复盘会问你对照标准那句') } }
  const pad = (n: number) => String(n).padStart(2, '0')
  const quote = quotes.length ? quotes[Math.floor(Date.now() / 86400000) % quotes.length] : null
  const behind = book ? behindDays(book) : 0

  return (
    <div>
      <WeekStrip todos={todos} sel={sel} onSel={setSel} />
      {sel !== T ? (
        <div className="card"><div className="lbl muted" style={{ opacity: 1 }}>{fmtDate(sel)} · {sel < T ? '遗留 ' + todos.filter(t => t.date === sel && !t.done).length + ' 件' : '已排 ' + todos.filter(t => t.date === sel).length + ' 件'}</div>
          {todos.filter(t => t.date === sel).map(t => <TodoRow key={t.id} t={t} onToggle={() => toggleTodo(t.id!)} onMove={() => moveTodo(t.id!, dOff(1))} />)}
          {!todos.some(t => t.date === sel) && <div className="muted text-[13px] mt-2">这天没有安排</div>}</div>
      ) : (<>
        <motion.div layout className={'tile mb-3 grid gap-2.5 items-center min-h-[150px] ' + (big?.result === 'done' ? 't3' : 'accent')} style={{ gridTemplateColumns: '1fr 104px' }}>
          <div>
            <div className="lbl">今天的一件大事 · {big?.minutes ?? cfg.bigThingMinutes} 分钟</div>
            <h2 className="text-[18px] font-extrabold my-1 leading-snug">{big?.text ?? '还没定。晚上复盘最后一步填，或者现在说一句"今天的大事是 X"'}</h2>
            {big && <div className="text-[13px] opacity-85">标准：{big.standard}</div>}
            {big && !big.result && <div className="flex gap-1.5 mt-2.5"><button className="pill sm" onClick={() => setRunning(r => !r)}>{running ? '暂停' : left === total ? '开始专注' : '继续'}</button><button className="pill sm ghost" onClick={() => finish('done')}>做成了 ✓</button></div>}
            {big?.result === 'done' && <div className="mt-2 font-bold text-[13px]">做成了 ✓</div>}
          </div>
          <Ring pct={big?.result === 'done' ? 1 : 1 - left / total} track={big?.result === 'done' ? 'rgba(0,0,0,.08)' : undefined} color={big?.result === 'done' ? 'currentColor' : undefined}>
            <div className="text-[17px] tabular-nums">{big?.result === 'done' ? '✓' : pad(Math.floor(left / 60)) + ':' + pad(left % 60)}<small className="block text-[10px] opacity-80 font-semibold mt-0.5">{big?.result === 'done' ? '做成' : '剩余'}</small></div>
          </Ring>
        </motion.div>

        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <div className="tile t1"><div className="lbl">今日待办</div><div className="num"><CountUp to={done} /><small>/{td.length}</small></div><div className="bars mt-2">{td.map(t => <i key={t.id} className={t.done ? 'on' : ''} style={{ height: t.done ? '100%' : '45%' }} />)}</div></div>
          <div className="tile t4"><div className="lbl">连续复盘</div><div className="num"><CountUp to={streak} /><small> 天</small></div><div className="mt-2"><Heat cols={7} levels={Array.from({ length: 14 }, (_, i) => i >= 14 - streak ? 3 : 0)} /></div></div>
          {book ? (
            <div className="tile t5 cursor-pointer" onClick={() => go('mods', 'book')}><div className="lbl">{book.title} · {behind ? '落后 ' + behind + ' 天' : '按计划'}</div><div className="num"><CountUp to={book.current} /><small>/{book.pages}</small></div><div className="prog mt-2"><i style={{ width: (book.current / book.pages * 100) + '%' }} /></div><div className="text-[12px] mt-1.5 font-bold">今天要读 {pagesPerDay(book)} 页</div></div>
          ) : <div className="tile t5 cursor-pointer" onClick={() => go('mods', 'book')}><div className="lbl">图书</div><div className="text-[14px] font-bold mt-2">还没有在读的书</div></div>}
          <div className="tile t3 cursor-pointer" onClick={() => go('mods', 'fin')}><div className="lbl">还能放心花</div><div className="num">€<CountUp to={free} /></div><div className="text-[12px] mt-1.5 font-bold">{envs.filter(e => !e.locked).map(e => e.name.split(' ')[0] + ' €' + Math.max(0, e.budget - e.used)).join(' · ')}</div></div>
        </div>

        <div className="sect">白天 <span>{day.filter(t => t.done).length}/{day.length}</span></div>
        {day.map(t => <TodoRow key={t.id} t={t} onToggle={() => toggleTodo(t.id!)} onMove={() => moveTodo(t.id!, dOff(1))} />)}
        {!day.length && <div className="muted text-[13px]">白天没有安排</div>}
        <div className="sect">今晚 <span>{eve.filter(t => t.done).length}/{eve.length}</span></div>
        {eve.map(t => <TodoRow key={t.id} t={t} onToggle={() => toggleTodo(t.id!)} onMove={() => moveTodo(t.id!, dOff(1))} />)}
        {!eve.length && <div className="muted text-[13px]">今晚空着</div>}

        {quote && <div className="tile t2 mt-3.5"><div className="lbl">今日摘录 · 来自你的图书</div><div className="text-[16px] font-bold leading-relaxed">"{quote.text}"</div></div>}
        {issues.length > 0 && <><div className="sect">还没解决的问题 <span>{issues.length}</span></div><div className="card">{issues.map(i => <div key={i.id} className="item">{i.text}</div>)}</div></>}

        <div className="sect">今天进来的 <span>{entries.length}</span></div>
        <div className="card pt-2">{entries.map(e => <div key={e.id} className="item"><div className="t">{hm(e.at)} · {e.tags.map(t => <Chip key={t} t={t} />)}</div><div>{e.text}</div>{e.die && <div className="m">→ 最可能死在：{e.die}</div>}</div>)}{!entries.length && <div className="muted text-[13px] py-2">还没有。往下写一句就有了。</div>}</div>
      </>)}
    </div>
  )
}
