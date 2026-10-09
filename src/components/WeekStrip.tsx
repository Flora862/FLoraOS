import { motion } from 'framer-motion'
import { useState } from 'react'
import { W, dOff, today } from '../lib/dates'
import type { Todo } from '../lib/db'

/** 7 日圆圈周条：左右滑翻周，点日期筛选 */
export function WeekStrip({ todos, sel, onSel }: { todos: Todo[]; sel: string; onSel: (d: string) => void }) {
  const [week, setWeek] = useState(0)
  const T = today()
  const days = Array.from({ length: 7 }, (_, i) => dOff(week * 7 + i - 3))
  return (
    <motion.div key={week} initial={{ x: week > 0 ? 40 : -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
      drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={.2}
      onDragEnd={(_, i) => { if (i.offset.x < -60) setWeek(w => w + 1); if (i.offset.x > 60) setWeek(w => w - 1) }}
      className="grid grid-cols-7 gap-1 mb-3 select-none" style={{ touchAction: 'pan-y' }}>
      {days.map(d => {
        const ts = todos.filter(t => t.date === d); const open = ts.filter(t => !t.done).length
        const past = d < T
        const cls = past ? (open ? 't5' : 't3') : d === T ? 'ink' : ''
        const dt = new Date(d)
        return (
          <button key={d} onClick={() => onSel(d)} className="bg-transparent border-0 p-1 flex flex-col items-center gap-1 cursor-pointer" style={{ color: 'var(--fg)' }}>
            <span className="muted text-[11px] font-semibold">{d === T ? '今天' : '周' + W[dt.getDay()]}</span>
            <motion.span whileTap={{ scale: .9 }} className={'w-[38px] h-[38px] rounded-full grid place-items-center font-bold text-[15px] tabular-nums ' + cls}
              style={{ background: cls ? undefined : 'var(--surface)', border: '2px solid ' + (d === sel ? 'var(--ink)' : 'transparent') }}>
              {past && !open ? '✓' : dt.getDate()}
            </motion.span>
            <span className="w-[5px] h-[5px] rounded-full" style={{ background: open && !past ? 'var(--accent)' : 'transparent' }} />
          </button>
        )
      })}
    </motion.div>
  )
}
