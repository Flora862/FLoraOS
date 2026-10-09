import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { hm } from '../lib/dates'
import { setEntryReview } from '../lib/store'
import { Chip, useToast } from '../components/ui'

const FILTERS = ['全部', '想法', '工作', '图书', '财务', '德语', '要复盘']

export function Inbox() {
  const [f, setF] = useState('全部')
  const toast = useToast()
  const entries = useLiveQuery(() => db.entries.orderBy('at').reverse().toArray(), []) ?? []
  const todos = useLiveQuery(() => db.todos.toArray(), []) ?? []
  const issues = useLiveQuery(() => db.issues.toArray(), []) ?? []
  const list = entries.filter(e => f === '全部' ? true : f === '要复盘' ? e.review !== 'none' : e.tags.includes(f))
  return (
    <div>
      <div className="seg mb-2.5">{FILTERS.map(x => <button key={x} className={f === x ? 'on' : ''} onClick={() => setF(x)}>{x}</button>)}</div>
      <div className="card">
        {list.map(e => {
          const td = todos.find(t => t.entryId === e.id); const is = issues.find(i => i.entryId === e.id)
          return (
            <div key={e.id} className="item">
              <div className="t">{e.at.slice(5, 10).replace('-', '/')} {hm(e.at)} · {e.tags.map(t => <Chip key={t} t={t} onClick={() => toast('开发版下一轮：点标签改分类')} />)}
                <button className="chip ghost ml-auto cursor-pointer" onClick={() => setEntryReview(e.id!, e.review === 'none')}>{e.review === 'none' ? '要复盘' : '🔁 已标'}</button></div>
              <div className="mt-0.5">{e.text}</div>
              {td && <div className="m">→ 待办：{td.text}{td.done ? ' ✓' : ''}</div>}
              {is && <div className="m">→ 问题：{is.text}{is.status === 'solved' ? ' ✓' : ''}</div>}
              {e.die && <div className="m">→ 最可能死在：{e.die}</div>}
            </div>
          )
        })}
        {!list.length && <div className="muted text-[13px] py-2">这个筛选下还没有东西</div>}
      </div>
    </div>
  )
}
