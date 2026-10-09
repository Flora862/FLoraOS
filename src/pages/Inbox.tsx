import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Entry, type Todo, type Issue } from '../lib/db'
import { hm, today, fmtDate, dOff } from '../lib/dates'
import { toggleTodo, moveTodo } from '../lib/store'
import { Chip, useToast } from '../components/ui'
import { TodoRow } from '../components/TodoRow'
import { EditEntry, EditTodo, EditIssue } from '../components/Edit'
import type { AppConfig } from '../lib/config'

const FILTERS = ['全部', '待办', '已完成', '问题', '想法', '工作', '图书', '财务', '德语', '要复盘', '已删除']

/** 收件：所有进来的东西都在这，点一条就能改、能删。待办、已完成、问题、已删除也在这汇总。 */
export function Inbox({ cfg }: { cfg: AppConfig }) {
  const [f, setF] = useState('全部')
  const [editE, setEditE] = useState<Entry | null>(null)
  const [editT, setEditT] = useState<Todo | null>(null)
  const [editI, setEditI] = useState<Issue | null>(null)
  const toast = useToast()
  const entries = useLiveQuery(() => db.entries.orderBy('at').reverse().toArray(), []) ?? []
  const todos = useLiveQuery(() => db.todos.toArray(), []) ?? []
  const issues = useLiveQuery(() => db.issues.toArray(), []) ?? []
  const T = today()
  const seg = <div className="seg mb-2.5">{FILTERS.map(x => <button key={x} className={f === x ? 'on' : ''} onClick={() => setF(x)}>{x}</button>)}</div>

  if (f === '待办' || f === '已完成') {
    const live = todos.filter(t => !t.deletedAt)
    const list = live.filter(t => f === '待办' ? !t.done : t.done).sort((a, b) => f === '待办' ? ((a.date ?? '9') < (b.date ?? '9') ? -1 : 1) : ((b.doneAt ?? '') < (a.doneAt ?? '') ? -1 : 1))
    const groups = f === '待办' ? [['逾期', list.filter(t => t.date && t.date < T)], ['今天', list.filter(t => t.date === T)], ['之后', list.filter(t => t.date && t.date > T)], ['没排期', list.filter(t => !t.date)]] as const : [['已完成 · 点圆圈可以撤销', list]] as const
    return (
      <div>{seg}
        {groups.map(([name, ts]) => ts.length > 0 && <div key={name}><div className="sect">{name} <span>{ts.length}</span></div>{ts.map(t => <TodoRow key={t.id} t={t} onToggle={() => toggleTodo(t.id!)} onMove={() => moveTodo(t.id!, dOff(1))} onEdit={() => setEditT(t)} />)}</div>)}
        {!list.length && <div className="muted text-[13px] py-4 text-center">{f === '待办' ? '没有待办。写一句"明天得…"就有了。' : '还没有完成的'}</div>}
        <div className="muted text-[12px] mt-3">点待办文字可以改内容、改日期、删除。右滑完成，左滑挪到明天。</div>
        <EditTodo t={editT} cfg={cfg} onClose={() => setEditT(null)} />
      </div>
    )
  }
  if (f === '问题') {
    const list = issues.filter(i => !i.deletedAt).sort((a, b) => a.status === b.status ? 0 : a.status === 'open' ? -1 : 1)
    return (
      <div>{seg}
        <div className="card">{list.map(i => <div key={i.id} className="item" onClick={() => setEditI(i)} style={{ cursor: 'pointer' }}><div className="t">{i.status === 'open' ? <span className="chip c4">未解决</span> : <span className="chip c3">已解决</span>}{i.blocks.length > 0 && <span className="muted">卡点 {i.blocks.length}</span>}<span className="ml-auto muted">改 ›</span></div>{i.text}{i.solvedHow && <div className="m">解决：{i.solvedHow}</div>}</div>)}{!list.length && <div className="muted text-[13px] py-2">没有问题</div>}</div>
        <EditIssue i={editI} onClose={() => setEditI(null)} />
      </div>
    )
  }
  if (f === '已删除') {
    const dels = [...entries.filter(e => e.deletedAt).map(e => ({ kind: 'entry' as const, id: e.id!, text: e.text, at: e.deletedAt! })), ...todos.filter(t => t.deletedAt).map(t => ({ kind: 'todo' as const, id: t.id!, text: '待办：' + t.text, at: t.deletedAt! })), ...issues.filter(i => i.deletedAt).map(i => ({ kind: 'issue' as const, id: i.id!, text: '问题：' + i.text, at: i.deletedAt! }))].sort((a, b) => a.at < b.at ? 1 : -1)
    return (
      <div>{seg}
        <div className="card">{dels.map(d => <div key={d.kind + d.id} className="item flex items-center gap-2"><span className="flex-1 min-w-0">{d.text}</span><button className="pill sm ghost" onClick={async () => { const t = d.kind === 'entry' ? db.entries : d.kind === 'todo' ? db.todos : db.issues; await (t as typeof db.entries).update(d.id, { deletedAt: undefined }); toast('恢复了') }}>恢复</button></div>)}{!dels.length && <div className="muted text-[13px] py-2">没有删除过的</div>}</div>
        <div className="muted text-[12px] mt-3">删除只是隐藏，这里随时能恢复。</div>
      </div>
    )
  }

  const list = entries.filter(e => !e.deletedAt).filter(e => f === '全部' ? true : f === '要复盘' ? e.review !== 'none' : e.tags.includes(f))
  return (
    <div>{seg}
      <div className="card">
        {list.map(e => {
          const td = todos.find(t => t.entryUid === e.uid && !t.deletedAt); const is = issues.find(i => i.entryUid === e.uid && !i.deletedAt)
          return (
            <div key={e.id} className="item" onClick={() => setEditE(e)} style={{ cursor: 'pointer' }}>
              <div className="t">{e.at.slice(5, 10).replace('-', '/')} {hm(e.at)} · {e.tags.map(t => <Chip key={t} t={t} />)}{e.review !== 'none' && <span className="chip ghost">🔁</span>}<span className="ml-auto muted">改 ›</span></div>
              <div className="mt-0.5">{e.text}</div>
              {td && <div className="m">→ 待办：{td.text}{td.done ? ' ✓' : td.date ? '（' + fmtDate(td.date) + '）' : ''}</div>}
              {is && <div className="m">→ 问题：{is.text}{is.status === 'solved' ? ' ✓' : ''}</div>}
              {e.die && <div className="m">→ 最可能死在：{e.die}</div>}
              {e.note && <div className="m">备注：{e.note}</div>}
            </div>
          )
        })}
        {!list.length && <div className="muted text-[13px] py-2">这个筛选下还没有东西</div>}
      </div>
      <div className="muted text-[12px] mt-3">点任何一条可以改文字、改标签、删除。</div>
      <EditEntry e={editE} cfg={cfg} onClose={() => setEditE(null)} />
    </div>
  )
}
