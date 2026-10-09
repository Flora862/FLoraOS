import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/* ---------- Toast ---------- */
const ToastCtx = createContext<(m: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const t = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => { setMsg(m); window.clearTimeout(t.current); t.current = window.setTimeout(() => setMsg(null), 2400) }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <AnimatePresence>
        {msg && (
          <motion.div initial={{ opacity: 0, y: 12, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
            className="ink fixed left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-[13px] font-semibold max-w-[90%]"
            style={{ bottom: 'calc(160px + env(safe-area-inset-bottom,0px))' }}>{msg}</motion.div>
        )}
      </AnimatePresence>
    </ToastCtx.Provider>
  )
}

/* ---------- 底部抽屉（可拖拽；mandatory=true 时不可下滑关闭） ---------- */
export function Sheet({ open, onClose, mandatory, title, sub, children }: { open: boolean; onClose?: () => void; mandatory?: boolean; title: string; sub?: string; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-40 flex items-end justify-center" style={{ background: 'rgba(10,14,30,.5)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !mandatory && onClose?.()}>
          <motion.div onClick={e => e.stopPropagation()}
            className="w-full max-w-[460px] rounded-t-3xl px-[18px] pt-[10px]" style={{ background: 'var(--bg)', paddingBottom: 'calc(22px + env(safe-area-inset-bottom,0px))' }}
            initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 80 }} transition={{ type: 'spring', stiffness: 400, damping: 36 }}
            drag={mandatory ? false : 'y'} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: .6 }}
            onDragEnd={(_, i) => { if (i.offset.y > 90) onClose?.() }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-3" style={{ background: 'var(--line)' }} />
            <h3 className="text-[18px] font-extrabold m-0 mb-1">{title}</h3>
            {sub && <div className="muted text-[14px] mb-3">{sub}</div>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------- 圆环 ---------- */
export function Ring({ pct, size = 104, stroke = 9, children, track = 'rgba(255,255,255,.3)', color = '#fff' }: { pct: number; size?: number; stroke?: number; children?: ReactNode; track?: string; color?: string }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(1, Math.max(0, pct))) }} transition={{ type: 'spring', stiffness: 60, damping: 18 }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center font-extrabold leading-none">{children}</div>
    </div>
  )
}

/* ---------- 数字滚动 ---------- */
export function CountUp({ to, prefix = '', suffix = '' }: { to: number; prefix?: string; suffix?: string }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0; const t0 = performance.now(); const dur = 700
    const step = (t: number) => { const p = Math.min(1, (t - t0) / dur); setV(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf)
  }, [to])
  return <>{prefix}{v}{suffix}</>
}

/* ---------- 热力图 ---------- */
export function Heat({ levels, cols = 15 }: { levels: number[]; cols?: number }) {
  return <div className="heat" style={{ gridTemplateColumns: `repeat(${cols},1fr)` }}>{levels.map((l, i) => <i key={i} className={l ? 'l' + l : ''} />)}</div>
}

/* ---------- 彩纸 ---------- */
export function confetti() {
  const cols = ['#5b7cf0', '#ff7a9c', '#5fe3b2', '#ffd166', '#c8b4ff']
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60'
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('i')
    p.style.cssText = `position:absolute;width:8px;height:12px;border-radius:2px;left:${Math.random() * 100}%;top:-10px;background:${cols[i % 5]};transform:rotate(${Math.random() * 360}deg);transition:transform 1.2s ease-out,opacity 1.2s;`
    host.appendChild(p)
    requestAnimationFrame(() => { p.style.transform = `translateY(90vh) rotate(540deg)`; p.style.opacity = '0' })
  }
  document.body.appendChild(host); setTimeout(() => host.remove(), 1400)
}

export const TAGC: Record<string, string> = { 财务: 'c3', 工作: '', 德语: 'c3', 图书: 'c5', 想法: 'c4', 播客: 'c2', 生活: 'c2', 产品技术: 'c3', 人: 'c4', 杂: 'c2' }
export const Chip = ({ t, onClick }: { t: string; onClick?: () => void }) => <span className={'chip ' + (TAGC[t] ?? 'c2')} onClick={onClick}>{t}</span>
