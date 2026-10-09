import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion, AnimatePresence } from 'framer-motion'
import { db } from '../lib/db'
import { today, dOff, hm } from '../lib/dates'
import { saveDailyState, resultBigThing, solveIssue, addBlock, completeReview, setBigThing, moveTodo, toggleTodo } from '../lib/store'
import type { AppConfig } from '../lib/config'
import { Chip, confetti, useToast } from '../components/ui'
import { summarize, lastError } from '../lib/llm'
import { setEntryReview } from '../lib/store'
import { TodoRow } from '../components/TodoRow'

const MOODS = ['😩', '😕', '😐', '🙂', '😄'], BODIES = ['🤒', '😮‍💨', '😐', '💪', '🔥']
const TITLES = ['今天怎么样', '今天的大事', '今天进来了什么', '问题与反思', '明天的一件大事']

export function Review({ cfg }: { cfg: AppConfig }) {
  const [flow, setFlow] = useState(false)
  const T = today()
  const pendingTodos = useLiveQuery(() => db.todos.where('review').equals('pending').toArray(), []) ?? []
  const pendingEntries = useLiveQuery(() => db.entries.where('review').equals('pending').toArray(), []) ?? []
  const openIssues = useLiveQuery(() => db.issues.where('status').equals('open').toArray(), []) ?? []
  const bigs = useLiveQuery(() => db.bigThings.where('review').equals('pending').toArray(), []) ?? []
  const doneCount = useLiveQuery(() => db.reviews.filter(r => r.completed).count(), []) ?? 0
  const [tab, setTab] = useState<'wait' | 'done'>('wait')
  const doneItems = useLiveQuery(() => db.bigThings.where('review').equals('done').reverse().sortBy('date'), []) ?? []
  const lessons = useLiveQuery(() => db.lessons.reverse().sortBy('createdAt'), []) ?? []
  const [summing, setSumming] = useState(false)
  const toast = useToast()
  async function summarizeWeek() {
    if (summing) return
    setSumming(true)
    try {
      const since = dOff(-7)
      const bigs = await db.bigThings.filter(b => b.date >= since).toArray()
      const iss = await db.issues.filter(i => (i.blocks.length > 0 && i.blocks.some(b => b.at >= since)) || (i.solvedAt ?? '') >= since).toArray()
      const refl = await db.entries.filter(e => e.review === 'done' && (e.reviewedAt ?? '') >= since).toArray()
      const states = await db.dailyStates.filter(d => d.date >= since).toArray()
      const avg = (k: 'mood' | 'body') => states.length ? (states.reduce((a, d) => a + d[k], 0) / states.length).toFixed(1) : '无'
      const text = [
        `时间范围：${since} 到 ${today()}`,
        `大事（${bigs.length} 件）：` + bigs.map(b => `${b.date} ${b.text} → ${b.result ?? '未记'}${b.fact ? '｜事实：' + b.fact : ''}`).join('；'),
        `问题与卡点：` + iss.map(i => `${i.text}（${i.status === 'solved' ? '已解决：' + (i.solvedHow ?? '') : '未解决'}；卡点：${i.blocks.map(b => b.text).join(' / ') || '无'}）`).join('；'),
        `反思：` + refl.map(e => e.text).join('；'),
        `心情均值 ${avg('mood')}/4，身体均值 ${avg('body')}/4，姨妈期标记 ${states.filter(d => (d.sub as { period?: unknown }).period).length} 天`,
      ].join('\n')
      const r = await summarize(text)
      if (!r) { toast('AI 没接上：' + (lastError || '本地开发没有 /api')); return }
      await db.lessons.add({ period: 'week', range: `${since}~${today()}`, draft: r.text, createdAt: new Date().toISOString() })
      toast('总结好了（' + r.model + '），改完再存成经验')
    } finally { setSumming(false) }
  }
  if (flow) return <Flow cfg={cfg} exit={() => setFlow(false)} />
  const n = pendingTodos.length + pendingEntries.length + openIssues.length + bigs.length
  return (
    <div>
      <motion.div whileTap={{ scale: .98 }} className="tile ink mb-3 cursor-pointer" onClick={() => setFlow(true)}><div className="lbl">晚间复盘</div><div className="num text-[24px]">开始今晚的复盘 →</div><div className="text-[13px] mt-2 opacity-70">约 5 分钟 · 已连续复盘 {doneCount} 次</div></motion.div>
      <div className="seg mb-2.5"><button className={tab === 'wait' ? 'on' : ''} onClick={() => setTab('wait')}>待复盘 · {n}</button><button className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>已复盘</button></div>
      {tab === 'wait' ? (
        <div className="card">
          {bigs.map(b => <div key={b.id} className="item"><div className="t"><span className="chip">大事</span>{b.date === T ? '今天' : b.date.slice(5)}{b.result && ' · ' + { done: '做成', failed: '没做成', skipped: '没做' }[b.result]}</div>{b.text}</div>)}
          {openIssues.map(i => <div key={i.id} className="item"><div className="t"><span className="chip c4">问题</span></div>{i.text}{i.blocks.length > 0 && <div className="m">卡点 {i.blocks.length} 条 · 最近：{i.blocks.at(-1)!.text}</div>}</div>)}
          {pendingTodos.map(t => <div key={t.id} className="item"><div className="t"><span className="chip c3">待办 🔁</span>{t.done ? '已完成' : '未完成'}</div>{t.text}</div>)}
          {pendingEntries.map(e => <div key={e.id} className="item"><div className="t"><span className="chip c2">反思</span>{e.at.slice(5, 10)}</div>{e.text}</div>)}
          {!n && <div className="muted text-[13px] py-2">池子是空的。</div>}
          <div className="muted text-[13px] mt-2">留到你复盘到它为止，不会自动消失。</div>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="card"><div className="flex justify-between items-center mb-1"><b className="text-[14px]">经验</b><button className="pill sm" disabled={summing} onClick={summarizeWeek}>{summing ? '在想…' : '总结这周（AI）'}</button></div>
            {lessons.map(l => <div key={l.id} className="item"><div className="t">{l.range} · 周</div><textarea rows={6} defaultValue={l.final ?? l.draft} onBlur={e => db.lessons.update(l.id!, { final: e.target.value })} /><div className="muted text-[12px] mt-1">改了会自动存，你改过的才算经验。</div></div>)}
            {!lessons.length && <div className="muted text-[13px] py-1">攒一周已复盘的记录，点右上角让 AI 出做成率、反复卡点、经验条。</div>}</div>
          <div className="card">{doneItems.map(b => <div key={b.id} className="item"><div className="t"><span className="chip c3">已复盘</span>{b.date.slice(5)} · 大事</div>{b.text}{b.fact && <div className="m">{b.fact}</div>}</div>)}{!doneItems.length && <div className="muted text-[13px] py-2">还没有</div>}</div>
        </div>
      )}
    </div>
  )
}

function Flow({ cfg, exit }: { cfg: AppConfig; exit: () => void }) {
  const T = today(); const toast = useToast()
  const [step, setStep] = useState(0)
  const [t0] = useState(Date.now())
  const [mood, setMood] = useState(3), [body, setBody] = useState(2)
  const [moodNote, setMoodNote] = useState(''), [bodyNote, setBodyNote] = useState('')
  const [subOn, setSubOn] = useState<Record<string, boolean>>({})
  const [subVal, setSubVal] = useState<Record<string, unknown>>({})
  const [fact, setFact] = useState('')
  const [tomorrow, setTomorrow] = useState({ text: '', standard: '' })
  const [handled, setHandled] = useState<{ kind: string; id: number }[]>([])
  const big = useLiveQuery(() => db.bigThings.where('date').equals(T).first(), [T])
  const entries = useLiveQuery(() => db.entries.filter(e => e.at.slice(0, 10) === T).reverse().toArray(), [T]) ?? []
  const issues = useLiveQuery(() => db.issues.where('status').equals('open').toArray(), []) ?? []
  const reflections = useLiveQuery(() => db.entries.where('review').equals('pending').toArray(), []) ?? []
  const todayTodos = useLiveQuery(() => db.todos.where('date').equals(T).filter(t => !t.done).toArray(), [T]) ?? []
  const lastPeriod = useLiveQuery(() => db.dailyStates.orderBy('date').reverse().filter(s => !!(s.sub as { period?: unknown }).period).first(), [])
  useEffect(() => { document.getElementById('rvtop')?.scrollIntoView() }, [step])
  const periodDay = (() => { const p = lastPeriod?.sub?.period as { day: number; ended?: boolean } | undefined; if (!p || p.ended) return 1; return p.day + Math.max(1, Math.round((Date.now() - new Date(lastPeriod!.date).getTime()) / 86400000)) })()

  async function next() {
    if (step === 0) await saveDailyState({ mood, moodNote, body, bodyNote, sub: Object.fromEntries(Object.keys(subOn).filter(k => subOn[k]).map(k => [k, subVal[k] ?? (k === 'period' ? { day: periodDay } : true)])) })
    if (step === 1 && big && big.result) { await resultBigThing(T, big.result, fact); setHandled(h => [...h, { kind: 'big', id: big.id! }]) }
    if (step === 4) {
      if (tomorrow.text) await setBigThing(dOff(1), tomorrow.text, tomorrow.standard, cfg.bigThingMinutes)
      await completeReview({ mood, body, fact, tomorrow }, handled, Math.round((Date.now() - t0) / 1000))
      confetti(); toast('复盘完成'); exit(); return
    }
    setStep(s => s + 1)
  }
  const Sub = cfg.bodySubItems
  return (
    <div className="card" id="rvtop">
      <div className="flex justify-between items-center"><b>{TITLES[step]}</b><button className="pill sm ghost" onClick={() => { toast('没走完。明早首页先提醒你定大事'); exit() }}>退出</button></div>
      <div className="flex gap-1 my-3">{TITLES.map((_, i) => <i key={i} className="flex-1 h-1 rounded" style={{ background: i <= step ? 'var(--accent)' : 'var(--line)' }} />)}</div>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }} transition={{ duration: .18 }}>
          {step === 0 && (<>
            <div className="font-bold text-[14px] mb-1">今日心情</div>
            <div className="flex justify-between my-2">{MOODS.map((m, i) => <motion.button key={i} whileTap={{ scale: .9 }} animate={{ scale: mood === i ? 1.12 : 1 }} onClick={() => setMood(i)} className="w-14 h-14 rounded-2xl text-[26px] border-0 cursor-pointer" style={{ background: mood === i ? 'var(--t5)' : 'var(--bg)' }}>{m}</motion.button>)}</div>
            <textarea rows={1} value={moodNote} onChange={e => setMoodNote(e.target.value)} placeholder="一句话，可空。例：下午被客户问住了，有点烦" />
            <div className="font-bold text-[14px] mt-3.5 mb-1">今日身体</div>
            <div className="flex justify-between my-2">{BODIES.map((m, i) => <motion.button key={i} whileTap={{ scale: .9 }} animate={{ scale: body === i ? 1.12 : 1 }} onClick={() => setBody(i)} className="w-14 h-14 rounded-2xl text-[26px] border-0 cursor-pointer" style={{ background: body === i ? 'var(--t3)' : 'var(--bg)' }}>{m}</motion.button>)}</div>
            <textarea rows={1} value={bodyNote} onChange={e => setBodyNote(e.target.value)} placeholder="一句话，可空。例：睡了 6 小时，下午困" />
            <div className="muted text-[13px] font-bold mt-3.5 mb-1">细分（点亮才记）</div>
            <div className="flex gap-1.5 flex-wrap">{Sub.map(s => <button key={s.key} onClick={() => setSubOn(o => ({ ...o, [s.key]: !o[s.key] }))} className={'pill sm ' + (subOn[s.key] ? '' : 'ghost')}>{s.label}</button>)}</div>
            {Sub.map(s => subOn[s.key] && (
              <div key={s.key} className="flex gap-1.5 flex-wrap mt-2">
                {s.kind === 'period' && <><span className="chip c4" style={{ padding: '6px 12px' }}>第 {periodDay} 天 · 自动数</span><button className="pill sm ghost" onClick={() => setSubVal(v => ({ ...v, period: { day: periodDay, ended: true } }))}>结束</button>{s.tags!.map(t => <button key={t} className={'pill sm ' + ((subVal.period as { tags?: string[] })?.tags?.includes(t) ? '' : 'ghost')} onClick={() => setSubVal(v => { const p = (v.period as { day: number; tags?: string[] }) ?? { day: periodDay }; const tags = p.tags?.includes(t) ? p.tags.filter(x => x !== t) : [...(p.tags ?? []), t]; return { ...v, period: { ...p, tags } } })}>{t}</button>)}</>}
                {s.kind === 'choice' && s.options!.map(o => <button key={o} className={'pill sm ' + (subVal[s.key] === o ? '' : 'ghost')} onClick={() => setSubVal(v => ({ ...v, [s.key]: o }))}>{o}</button>)}
              </div>))}
            <div className="muted text-[13px] mt-2">心情和身体各一个表情必答，其余可空。只存你的库，不发给模型。</div>
          </>)}
          {step === 1 && (big ? (<>
            <div className="tile accent mb-2.5"><div className="lbl">大事</div><b className="text-[16px]">{big.text}</b><div className="text-[13px] mt-1 opacity-85">标准：{big.standard}</div></div>
            <div className="flex gap-1.5">{(['done', 'failed', 'skipped'] as const).map(r => <button key={r} className={'pill sm ' + (big.result === r ? '' : 'ghost')} onClick={() => resultBigThing(T, r)}>{{ done: '做成了', failed: '没做成', skipped: '没做' }[r]}</button>)}</div>
            <textarea className="mt-2.5" rows={2} value={fact} onChange={e => setFact(e.target.value)} placeholder="对照标准说一句事实，不写“感觉还好”" />
          </>) : <div className="muted">今天没定大事。最后一步定明天的。</div>)}
          {step === 2 && (<>
            <div className="flex gap-1.5 mb-1.5 flex-wrap"><span className="chip">{entries.length} 条</span><span className="chip c4">想法 {entries.filter(e => e.tags.includes('想法')).length}</span><span className="chip c5">图书 {entries.filter(e => e.tags.includes('图书')).length}</span></div>
            {entries.map(e => <EntryRow key={e.id} e={e} />)}
            {!entries.length && <div className="muted">今天没记东西。</div>}
          </>)}
          {step === 3 && (<>
            {issues.map(i => <IssueRow key={i.id} i={i} onHandled={() => setHandled(h => [...h, { kind: 'issue', id: i.id! }])} />)}
            {reflections.map(e => <div key={e.id} className="item"><div className="t"><span className="chip c2">反思</span></div>{e.text}<div className="flex gap-1.5 mt-1.5"><button className="pill sm" onClick={async () => { await db.entries.update(e.id!, { review: 'done', reviewedAt: T }); toast('已移到已复盘') }}>看过了</button><button className="pill sm ghost" onClick={() => toast('留在池里')}>下次</button></div></div>)}
            {!issues.length && !reflections.length && <div className="muted">池里没有问题和反思。</div>}
          </>)}
          {step === 4 && (<>
            <textarea rows={2} value={tomorrow.text} onChange={e => setTomorrow({ ...tomorrow, text: e.target.value })} placeholder="一件，≤90 分钟，优先德语或产品技术" />
            <div className="muted text-[13px] mt-2 mb-1">做成的标准</div>
            <textarea rows={2} value={tomorrow.standard} onChange={e => setTomorrow({ ...tomorrow, standard: e.target.value })} placeholder="做完能对照打勾的那句话" />
            {todayTodos.length > 0 && <><div className="muted text-[13px] mt-3 mb-1">今天没做完的，要挪到明天的右滑或点 → 明天</div>{todayTodos.map(t => { return <div key={t.id} className="flex items-center gap-2"><div className="flex-1"><TodoRow t={t} onToggle={() => toggleTodo(t.id!)} /></div><button className="pill sm ghost" onClick={() => moveTodo(t.id!, dOff(1))}>→ 明天</button></div> })}</>}
          </>)}
        </motion.div>
      </AnimatePresence>
      <div className="flex justify-between items-center mt-3.5"><button className="pill ghost" disabled={step === 0} onClick={() => setStep(s => s - 1)}>上一步</button><button className="pill" onClick={next}>{step === 4 ? '完成' : '下一步'}</button></div>
    </div>
  )
}

function IssueRow({ i, onHandled }: { i: { id?: number; text: string; blocks: { at: string; text: string }[] }; onHandled: () => void }) {
  const [mode, setMode] = useState<'' | 'solve' | 'block'>('')
  const [v, setV] = useState('')
  const toast = useToast()
  return (
    <div className="item">{i.text}
      {mode === '' && <div className="flex gap-1.5 mt-1.5"><button className="pill sm" onClick={() => setMode('solve')}>解决了</button><button className="pill sm ghost" onClick={() => setMode('block')}>卡在哪</button><button className="pill sm ghost" onClick={() => toast('留在池里')}>下次</button></div>}
      {mode !== '' && <div className="flex gap-1.5 mt-1.5 items-end"><textarea rows={1} value={v} onChange={e => setV(e.target.value)} placeholder={mode === 'solve' ? '怎么解决的，一句' : '卡在哪，一句'} /><button className="pill sm" onClick={async () => { if (mode === 'solve') { await solveIssue(i.id!, v); onHandled(); toast('已解决，移到已复盘') } else { await addBlock(i.id!, v); toast('卡点已追加，带日期') } setMode(''); setV('') }}>记</button></div>}
    </div>
  )
}

function EntryRow({ e }: { e: { id?: number; at: string; text: string; tags: string[]; note?: string; review: string } }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(e.note ?? '')
  const toast = useToast()
  return (
    <div className="item">
      <div className="t" onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer' }}>{hm(e.at)} · {e.tags.map(t => <Chip key={t} t={t} />)}<span className="ml-auto muted">{open ? '收起' : '备注 ›'}</span></div>
      <div onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer' }}>{e.text}</div>
      {e.note && !open && <div className="m">备注：{e.note}</div>}
      {open && <div className="mt-2 grid gap-1.5"><textarea rows={2} value={note} onChange={ev => setNote(ev.target.value)} placeholder="补一句备注：现在怎么看这条" />
        <div className="flex gap-1.5"><button className="pill sm" onClick={async () => { await db.entries.update(e.id!, { note }); toast('备注存了'); setOpen(false) }}>存</button><button className="pill sm ghost" onClick={async () => { await setEntryReview(e.id!, e.review === 'none'); toast(e.review === 'none' ? '标了要复盘，进池子' : '取消了') }}>{e.review === 'none' ? '要复盘' : '🔁 已标'}</button></div></div>}
    </div>
  )
}
