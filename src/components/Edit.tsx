import { useState } from 'react'
import { db, type Entry, type Todo, type BigThing, type Issue } from '../lib/db'
import { Sheet, useToast, TAGC } from './ui'
import type { AppConfig } from '../lib/config'

const SOFT_DELETE = { deletedAt: () => new Date().toISOString() }

/** 统一的编辑抽屉：条目 / 待办 / 大事 / 问题。能改、能删（软删，收件"已删除"里可恢复）。 */
export function EditEntry(props: { e: Entry | null; cfg: AppConfig; onClose: () => void }) { return props.e ? <EditEntryInner key={props.e.id} {...props} /> : null }
function EditEntryInner({ e, cfg, onClose }: { e: Entry | null; cfg: AppConfig; onClose: () => void }) {
  const toast = useToast()
  const [text, setText] = useState(e?.text ?? '')
  const [tags, setTags] = useState<string[]>(e?.tags ?? [])
  const [die, setDie] = useState(e?.die ?? '')
  const [note, setNote] = useState(e?.note ?? '')
  const all = [...cfg.tags.map(t => t.name), '财务', '大事', '杂']
  if (!e) return null
  return (
    <Sheet open onClose={onClose} title="改这条" sub={e.at.slice(0, 16).replace('T', ' ')}>
      <div className="grid gap-2">
        <textarea rows={3} value={text} onChange={ev => setText(ev.target.value)} style={{ background: 'var(--surface)' }} />
        <div className="flex gap-1.5 flex-wrap">{all.map(t => <button key={t} onClick={() => setTags(ts => ts.includes(t) ? ts.filter(x => x !== t) : [...ts, t])} className={'chip ' + (tags.includes(t) ? (TAGC[t] ?? 'c2') : 'ghost')} style={{ cursor: 'pointer', border: tags.includes(t) ? 0 : undefined }}>{t}</button>)}</div>
        {tags.includes('想法') && <input className="rounded-xl p-3 border-0" style={{ background: 'var(--surface)' }} placeholder="最可能在哪里死" value={die} onChange={ev => setDie(ev.target.value)} />}
        <input className="rounded-xl p-3 border-0" style={{ background: 'var(--surface)' }} placeholder="备注，可空" value={note} onChange={ev => setNote(ev.target.value)} />
        <div className="flex gap-1.5 flex-wrap">
          <button className="pill" onClick={async () => { await db.entries.update(e.id!, { text, tags: tags.length ? tags : ['杂'], die: die || undefined, note: note || undefined }); toast('改好了'); onClose() }}>保存</button>
          <button className="pill ghost" onClick={async () => { await db.entries.update(e.id!, { review: e.review === 'none' ? 'pending' : 'none' }); toast(e.review === 'none' ? '进待复盘池' : '取消复盘'); onClose() }}>{e.review === 'none' ? '要复盘' : '取消复盘'}</button>
          <button className="pill ghost ml-auto" style={{ color: 'var(--t4d)' }} onClick={async () => {
            await db.entries.update(e.id!, { deletedAt: SOFT_DELETE.deletedAt() })
            if (e.uid) { const t = await db.todos.where('entryUid').equals(e.uid).first(); if (t && !t.done) await db.todos.update(t.id!, { deletedAt: SOFT_DELETE.deletedAt() }) }
            toast('删了。收件 →「已删除」里能找回'); onClose()
          }}>删除</button>
        </div>
      </div>
    </Sheet>
  )
}

export function EditTodo(props: { t: Todo | null; cfg: AppConfig; onClose: () => void }) { return props.t ? <EditTodoInner key={props.t.id} {...props} /> : null }
function EditTodoInner({ t, cfg, onClose }: { t: Todo | null; cfg: AppConfig; onClose: () => void }) {
  const toast = useToast()
  const [text, setText] = useState(t?.text ?? '')
  const [date, setDate] = useState(t?.date ?? '')
  const [evening, setEvening] = useState(t?.evening ?? false)
  const [tag, setTag] = useState(t?.tag ?? '杂')
  const tagList = [...cfg.tags.map(x => x.name), '财务', '杂']
  if (!t) return null
  return (
    <Sheet open onClose={onClose} title="改待办">
      <div className="grid gap-2">
        <textarea rows={2} value={text} onChange={ev => setText(ev.target.value)} style={{ background: 'var(--surface)' }} />
        <div className="flex gap-2 items-center"><input type="date" className="rounded-xl p-2.5 border-0 flex-1 min-w-0" style={{ background: 'var(--surface)' }} value={date} onChange={ev => setDate(ev.target.value)} /><button className={'pill sm ' + (evening ? '' : 'ghost')} onClick={() => setEvening(v => !v)}>今晚</button><button className="pill sm ghost" onClick={() => setDate('')}>不排期</button></div>
        <div className="flex gap-1.5 flex-wrap">{tagList.map(x => <button key={x} onClick={() => setTag(x)} className={'chip ' + (tag === x ? (TAGC[x] ?? 'c2') : 'ghost')} style={{ cursor: 'pointer', border: tag === x ? 0 : undefined }}>{x}</button>)}</div>
        <div className="flex gap-1.5 flex-wrap">
          <button className="pill" onClick={async () => { await db.todos.update(t.id!, { text, date: date || undefined, evening, tag }); toast('改好了'); onClose() }}>保存</button>
          <button className="pill ghost" onClick={async () => { await db.todos.update(t.id!, { review: t.review === 'none' ? 'pending' : 'none' }); toast(t.review === 'none' ? '做完会进待复盘池' : '取消复盘'); onClose() }}>{t.review === 'none' ? '要复盘' : '取消复盘'}</button>
          <button className="pill ghost ml-auto" style={{ color: 'var(--t4d)' }} onClick={async () => { await db.todos.update(t.id!, { deletedAt: SOFT_DELETE.deletedAt() }); toast('删了'); onClose() }}>删除</button>
        </div>
      </div>
    </Sheet>
  )
}

export function EditIssue(props: { i: Issue | null; onClose: () => void }) { return props.i ? <EditIssueInner key={props.i.id} {...props} /> : null }
function EditIssueInner({ i, onClose }: { i: Issue | null; onClose: () => void }) {
  const toast = useToast()
  const [text, setText] = useState(i?.text ?? '')
  if (!i) return null
  return (
    <Sheet open onClose={onClose} title="改问题">
      <div className="grid gap-2">
        <textarea rows={2} value={text} onChange={ev => setText(ev.target.value)} style={{ background: 'var(--surface)' }} />
        {i.blocks.length > 0 && <div className="text-[13px] muted">卡点：{i.blocks.map(b => b.at.slice(5) + ' ' + b.text).join('；')}</div>}
        <div className="flex gap-1.5 flex-wrap">
          <button className="pill" onClick={async () => { await db.issues.update(i.id!, { text }); toast('改好了'); onClose() }}>保存</button>
          {i.status === 'open' ? <button className="pill ghost" onClick={async () => { await db.issues.update(i.id!, { status: 'solved', solvedAt: new Date().toISOString().slice(0, 10), review: 'done' }); toast('标为已解决'); onClose() }}>解决了</button>
            : <button className="pill ghost" onClick={async () => { await db.issues.update(i.id!, { status: 'open', review: 'pending' }); toast('重新打开'); onClose() }}>重新打开</button>}
          <button className="pill ghost ml-auto" style={{ color: 'var(--t4d)' }} onClick={async () => { await db.issues.update(i.id!, { deletedAt: SOFT_DELETE.deletedAt() }); toast('删了'); onClose() }}>删除</button>
        </div>
      </div>
    </Sheet>
  )
}

export function EditBig({ b, date, minutes, onClose }: { b: BigThing | null | undefined; date: string; minutes: number; onClose: () => void }) {
  const toast = useToast()
  const [text, setText] = useState(b?.text ?? '')
  const [standard, setStandard] = useState(b?.standard ?? '')
  const [min, setMin] = useState(b?.minutes ?? minutes)
  return (
    <Sheet open onClose={onClose} title={(date === new Date().toISOString().slice(0, 10) ? '今天' : date.slice(5)) + '的一件大事'}>
      <div className="grid gap-2">
        <textarea rows={2} value={text} onChange={ev => setText(ev.target.value)} placeholder="一件，≤90 分钟" style={{ background: 'var(--surface)' }} />
        <textarea rows={2} value={standard} onChange={ev => setStandard(ev.target.value)} placeholder="做成的标准：做完能对照打勾的那句话" style={{ background: 'var(--surface)' }} />
        <div className="flex gap-1.5 items-center flex-wrap"><span className="muted text-[13px]">时长</span>{[45, 60, 90, 120].map(m => <button key={m} className={'pill sm ' + (min === m ? '' : 'ghost')} onClick={() => setMin(m)}>{m}</button>)}</div>
        {b?.result && <div className="flex gap-1.5 items-center flex-wrap"><span className="muted text-[13px]">结果</span>{(['done', 'failed', 'skipped'] as const).map(r => <button key={r} className={'pill sm ' + (b.result === r ? '' : 'ghost')} onClick={async () => { await db.bigThings.update(b.id!, { result: r }); toast('改了') }}>{{ done: '做成了', failed: '没做成', skipped: '没做' }[r]}</button>)}<button className="pill sm ghost" onClick={async () => { await db.bigThings.update(b.id!, { result: undefined }); toast('清掉结果'); onClose() }}>清掉</button></div>}
        <div className="flex gap-1.5">
          <button className="pill" onClick={async () => { if (!text.trim()) return toast('大事不能空'); if (b?.id) await db.bigThings.update(b.id, { text, standard, minutes: min }); else await db.bigThings.add({ date, text, standard, minutes: min, review: 'pending' }); toast('定了'); onClose() }}>保存</button>
          {b?.id && <button className="pill ghost ml-auto" style={{ color: 'var(--t4d)' }} onClick={async () => { await db.bigThings.update(b.id!, { deletedAt: SOFT_DELETE.deletedAt() }); localStorage.removeItem('floraos.focus'); toast('删了'); onClose() }}>删除</button>}
        </div>
      </div>
    </Sheet>
  )
}
