import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Entry, type Todo } from '../lib/db'
import { hm, today, fmtDate } from '../lib/dates'
import { toggleTodo, moveTodo } from '../lib/store'
import { Chip } from '../components/ui'
import { TodoRow } from '../components/TodoRow'
import { EditEntry, EditTodo } from '../components/Edit'
import type { AppConfig } from '../lib/config'
import { dOff } from '../lib/dates'

const FILTERS = ['全部', '待办', '已完成', '想法', '工作', '图书', '财务', '德语', '要复盘']

/** 收件：所有进来的东西都在这，点一条就能改、能删。待办和已完成也在这汇总。 */
export function Inbox({ cfg }: { cfg: AppConfig }) {
  const [f, setF] = useState('全部')
  const [editE, setEditE] = useState<Entry | null>(null)
  const [editT, setEditT] = useState<Todo | null>(null)
  const entries = useLiveQuery(() => db.entries.orderBy('at').reverse().filter(e => !e.deletedAt).toArray(), []) ?? []
  const todos = useLiveQuery(() => db.todos.filter(t => !t.deletedAt).toArray(), []) ?? []
  const issues = useLiveQuery(() => db.issues.toArray(), []) ?? []
  const T = today()

  if (f === '待办' || f === '已完成') {
    const list = todos.filter(t => f === '待办' ? !t.done : t.done).sort((a, b) => f === '待办' ? ((a.date ?? '9') < (b.date ?? '9') ? -1 : 1) : ((b.doneAt ?? '') < (a.doneAt ?? '') ? -1 : 1))
    const groups = f === '待办' ? [['逾期', list.filter(t => t.date && t.date < T)], ['今天', list.filter(t => t.date === T)], ['之后', list.filter(t => t.date && t.date > T)], ['没排期', list.filter(t => !t.date)]] as const : [['已完成 · 点圆圈可以撤销', list]] as const
    return (
      <div>
        <div className="seg mb-2.5">{FILTERS.map(x => <button key={x} className={f === x ? 'on' : ''} onClick={() => setF(x)}>{x}</button>)}</div>
        {groups.map(([name, ts]) => ts.length > 0 && <div key={name}><div className="sect">{name} <span>{ts.length}</span></div>{ts.map(t => <TodoRow key={t.id} t={t} onToggle={() => toggleTodo(t.id!)} onMove={() => moveTodo(t.id!, dOff(1))} onEdit={() => setEditT(t)} />)}</div>)}
        {!list.length && <div className="muted text-[13px] py-4 text-center">{f === '待办' ? '没有待办。写一句"明天得…"就有了。' : '还没有完成的'}</div>}
        <div className="muted text-[12px] mt-3">点待办文字可以改内容、改日期、删除。{f === '已完成' && '已完成的留在这里，不会消失。'}</div>
        <EditTodo t={editT} cfg={cfg} onClose={() => setEditT(null)} />
      </div>
    )
  }

  const list = entries.filter(e => f === '全部' ? true : f === '要复盘' ? e.review !== 'none' : e.tags.includes(f))
  return (
    <div>
      <div className="seg mb-2.5">{FILTERS.map(x => <button key={x} className={f === x ? 'on' : ''} onClick={() => setF(x)}>{x}</button>)}</div>
      <div className="card">
        {list.map(e => {
          const td = todos.find(t => t.entryId === e.id); const is = issues.find(i => i.entryId === e.id)
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
