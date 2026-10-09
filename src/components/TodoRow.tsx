import { motion, useMotionValue, useTransform } from 'framer-motion'
import { fmtDate } from '../lib/dates'
import type { Todo } from '../lib/db'
import { TAGC } from './ui'

/** 待办行：右滑完成（带阻尼），左滑挪日期；点圆圈也能完成；点文字改 */
export function TodoRow({ t, onToggle, onMove, onEdit, moveLabel = '→ 明天' }: { t: Todo; onToggle: () => void; onMove?: () => void; onEdit?: () => void; moveLabel?: string }) {
  const x = useMotionValue(0)
  const under = useTransform(x, [0, 80], [0, 1])
  const underL = useTransform(x, [-80, 0], [1, 0])
  return (
    <div className="relative rounded-[14px] overflow-hidden mt-1.5">
      <motion.div style={{ opacity: under }} className="t3 absolute inset-0 flex items-center pl-4 font-bold text-[13px]">✓ 完成</motion.div>
      {onMove && <motion.div style={{ opacity: underL }} className="t5 absolute inset-0 flex items-center justify-end pr-4 font-bold text-[13px]">{moveLabel}</motion.div>}
      <motion.div
        className="relative flex items-center gap-2.5 px-3 py-[11px]" style={{ x, background: 'var(--surface)', touchAction: 'pan-y' }}
        drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: onMove ? 0.5 : 0.1, right: 0.6 }}
        onDragEnd={(_, i) => { if (i.offset.x > 80 && !t.done) onToggle(); if (i.offset.x < -80 && onMove) onMove() }}>
        <button onClick={onToggle} aria-label="完成"
          className="w-[22px] h-[22px] rounded-full grid place-items-center text-[12px] text-white shrink-0"
          style={{ border: '2px solid ' + (t.done ? 'var(--accent)' : 'var(--line)'), background: t.done ? 'var(--accent)' : 'transparent' }}>
          <motion.span initial={false} animate={{ scale: t.done ? [0.6, 1.25, 1] : 1 }} transition={{ duration: .35 }}>{t.done ? '✓' : ''}</motion.span>
        </button>
        <span className={'flex-1 min-w-0 ' + (t.done ? 'line-through muted' : '')} onClick={onEdit} style={{ cursor: onEdit ? 'pointer' : undefined }}>{t.text}</span>
        <span className={'chip ' + (TAGC[t.tag] ?? 'c2')} style={{ fontSize: 11, padding: '1px 7px' }}>{t.tag}</span>
        {t.review !== 'none' && <span title="要复盘">🔁</span>}
        <span className="muted text-[12px] whitespace-nowrap tabular-nums">{fmtDate(t.date)}</span>
      </motion.div>
    </div>
  )
}
