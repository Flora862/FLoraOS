import { useState } from 'react'
import { db, type Entry, type Todo, type BigThing } from '../lib/db'
import { Sheet, useToast, TAGC } from './ui'
import type { AppConfig } from '../lib/config'

/** 统一的编辑抽屉：条目 / 待办 / 大事。能改、能删（软删，数据还在）。 */
export function EditEntry({ e, cfg, onClose }: { e: Entry | null; cfg: AppConfig; onClose: () => void }) {
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
          <button className="pill ghost ml-auto" style={{ color: 'var(--t4d)' }} onClick={async () => { await db.entries.update(e.id!, { deletedAt: new Date().toISOString() }); const t = await db.todos.where('entryId').equals(e.id!).first(); if (t && !t.done) await db.todos.update(t.id!, { deletedAt: new Date().toISOString() }); toast('删了'); onClose() }}>删除</button>
        </div>
      </div>
    </Sheet>
  )
}

export function EditTodo({ t, cfg, onClose }: { t: Todo | null; cfg: AppConfig; onClose: () => void }) {
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
        <div className="flex gap-2 items-center"><input type="date" className="rounded-xl p-2.5 border-0 flex-1" style={{ background: 'var(--surface)' }} value={date} onChange={ev => setDate(ev.target.value)} /><button className={'pill sm ' + (evening ? '' : 'ghost')} onClick={() => setEvening(v => !v)}>今晚</button><button className="pill sm ghost" onClick={() => setDate('')}>不排期</button></div>
        <div className="flex gap-1.5 flex-wrap">{tagList.map(x => <button key={x} onClick={() => setTag(x)} className={'chip ' + (tag === x ? (TAGC[x] ?? 'c2') : 'ghost')} style={{ cursor: 'pointer', border: tag === x ? 0 : undefined }}>{x}</button>)}</div>
        <div className="flex gap-1.5 flex-wrap">
          <button className="pill" onClick={async () => { await db.todos.update(t.id!, { text, date: date || undefined, evening, tag }); toast('改好了'); onClose() }}>保存</button>
          <button className="pill ghost" onClick={async () => { await db.todos.update(t.id!, { review: t.review === 'none' ? 'pending' : 'none' }); toast(t.review === 'none' ? '做完会进待复盘池' : '取消复盘'); onClose() }}>{t.review === 'none' ? '要复盘' : '取消复盘'}</button>
          <button className="pill ghost ml-auto" style={{ color: 'var(--t4d)' }} onClick={async () => { await db.todos.update(t.id!, { deletedAt: new Date().toISOString() }); toast('删了'); onClose() }}>删除</button>
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
        <div className="flex gap-1.5 items-center"><span className="muted text-[13px]">时长</span>{[45, 60, 90, 120].map(m => <button key={m} className={'pill sm ' + (min === m ? '' : 'ghost')} onClick={() => setMin(m)}>{m}</button>)}</div>
        <div className="flex gap-1.5">
          <button className="pill" onClick={async () => { if (!text.trim()) return toast('大事不能空'); if (b?.id) await db.bigThings.update(b.id, { text, standard, minutes: min }); else await db.bigThings.add({ date, text, standard, minutes: min, review: 'pending' }); toast('定了'); onClose() }}>保存</button>
          {b?.id && <button className="pill ghost ml-auto" style={{ color: 'var(--t4d)' }} onClick={async () => { await db.bigThings.delete(b.id!); localStorage.removeItem('floraos.focus'); toast('删了'); onClose() }}>删除</button>}
        </div>
      </div>
    </Sheet>
  )
}
