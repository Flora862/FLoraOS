import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './lib/db'
import { DEFAULT_CONFIG, type AppConfig } from './lib/config'
import { loadConfig, seedIfEmpty, ensureMonth } from './lib/store'
import { greeting, today, W } from './lib/dates'
import { ToastProvider } from './components/ui'
import { Capture } from './components/Capture'
import { Today } from './pages/Today'
import { Inbox } from './pages/Inbox'
import { Modules } from './pages/Modules'
import { Review } from './pages/Review'
import { Settings } from './pages/Settings'
import { Login } from './pages/Login'
import { supabase, cloudMode } from './lib/supabase'
import { startAutoSync, markAllDirty, sync } from './lib/sync'
import type { Session } from '@supabase/supabase-js'

type View = 'home' | 'inbox' | 'mods' | 'review' | 'cfg'
const TABS: { v: View; i: string; l: string }[] = [{ v: 'home', i: '☀︎', l: '今日' }, { v: 'inbox', i: '⌸', l: '收件' }, { v: 'mods', i: '▦', l: '模块' }, { v: 'review', i: '◑', l: '复盘' }]
const TITLES: Record<View, string> = { home: '今日', inbox: '收件', mods: '模块', review: '复盘', cfg: '设置' }

export default function App() {
  const [cfg, setCfg] = useState<AppConfig>(DEFAULT_CONFIG)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<View>('home')
  const [sub, setSub] = useState<string | undefined>()
  const [dir, setDir] = useState(1)
  const [session, setSession] = useState<Session | null | undefined>(cloudMode ? undefined : null)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (cloudMode && !session) return
    (async () => {
      if (cloudMode) {
        if (!localStorage.getItem('floraos.firstSyncDone')) { await markAllDirty(); localStorage.setItem('floraos.firstSyncDone', '1') }
        await sync()
      } else await seedIfEmpty(DEFAULT_CONFIG)
      const c = await loadConfig(); setCfg(c); await ensureMonth(c); setReady(true)
    })()
    const stop = startAutoSync(); return stop
  }, [session])
  useEffect(() => {
    const r = document.documentElement
    if (cfg.palette) r.setAttribute('data-palette', cfg.palette); else r.removeAttribute('data-palette')
    if (cfg.theme) r.setAttribute('data-theme', cfg.theme); else r.removeAttribute('data-theme')
  }, [cfg.palette, cfg.theme])
  const pendingN = useLiveQuery(async () => (await db.issues.where('status').equals('open').count()) + (await db.todos.where('review').equals('pending').count()) + (await db.entries.where('review').equals('pending').count()), []) ?? 0

  function go(v: string, s?: string) { setDir(TABS.findIndex(t => t.v === v) >= TABS.findIndex(t => t.v === view) ? 1 : -1); setView(v as View); setSub(s) }
  if (cloudMode && session === undefined) return null
  if (cloudMode && !session) return <ToastProvider><Login /></ToastProvider>
  if (!ready) return null
  const d = new Date()
  const page = (
    <AnimatePresence mode="wait" custom={dir}>
      <motion.div key={view} custom={dir} initial={{ x: 40 * dir, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40 * dir, opacity: 0 }} transition={{ duration: .18 }}>
        {view === 'home' && <Today cfg={cfg} go={go} />}
        {view === 'inbox' && <Inbox />}
        {view === 'mods' && <Modules cfg={cfg} setCfg={setCfg} sub={sub} setSub={setSub} />}
        {view === 'review' && <Review cfg={cfg} />}
        {view === 'cfg' && <Settings cfg={cfg} setCfg={setCfg} />}
      </motion.div>
    </AnimatePresence>
  )
  const header = (
    <div className="flex justify-between items-start">
      <div><h1 className="text-[26px] font-extrabold m-0 leading-tight tracking-tight">{view === 'home' ? greeting() + '，' + cfg.name : TITLES[view]}</h1><div className="muted text-[13px]">{d.getMonth() + 1}月{d.getDate()}日 周{W[d.getDay()]}</div></div>
      <button onClick={() => go('cfg')} className="t2 w-[38px] h-[38px] rounded-full grid place-items-center font-bold border-0 cursor-pointer" title="设置">{cfg.name[0]}</button>
    </div>
  )

  return (
    <ToastProvider>
      {/* 手机：单列 + 底部捕捉栏 + Tab */}
      <div className="lg:hidden max-w-[460px] mx-auto min-h-full">
        <div className="sticky z-10 px-4 pt-3 pb-1" style={{ top: 'env(safe-area-inset-top,0px)', background: 'var(--bg)' }}>{header}</div>
        <main className="px-4 pt-1.5" style={{ paddingBottom: 200 }}>{page}</main>
        <div className="fixed left-0 right-0 bottom-0 flex justify-center pointer-events-none z-20">
          <div className="pointer-events-auto w-full max-w-[460px] rounded-t-3xl" style={{ background: 'var(--surface)', boxShadow: '0 -10px 30px rgba(0,0,0,.08)' }}>
            <Capture cfg={cfg} />
            <div className="flex px-2.5 pt-1" style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom,0px))' }}>
              {TABS.map(t => <button key={t.v} onClick={() => go(t.v)} className="flex-1 border-0 bg-transparent py-1.5 text-[11px] font-semibold flex flex-col items-center gap-0.5 cursor-pointer rounded-2xl relative" style={{ color: view === t.v ? 'var(--fg)' : 'var(--muted)', background: view === t.v ? 'var(--bg)' : 'transparent' }}><span className="text-[20px] leading-none">{t.i}</span>{t.l}{t.v === 'review' && pendingN > 0 && <span className="absolute top-1 right-[22%] w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />}</button>)}
            </div>
          </div>
        </div>
      </div>

      {/* 电脑：三栏 */}
      <div className="hidden lg:grid min-h-full" style={{ gridTemplateColumns: '220px 1fr 340px', gap: 24, maxWidth: 1240, margin: '0 auto', padding: '24px 24px 40px' }}>
        <aside className="sticky top-6 self-start">
          <div className="text-[22px] font-extrabold mb-6 flex items-center gap-2"><img src="/icon-192.png" alt="" className="w-7 h-7 rounded-lg" />FloraOS</div>
          {[...TABS, { v: 'cfg' as View, i: '⚙︎', l: '设置' }].map(t => <button key={t.v} onClick={() => go(t.v)} className="w-full text-left border-0 rounded-2xl px-3.5 py-2.5 mb-1 font-semibold cursor-pointer flex items-center gap-3" style={{ background: view === t.v ? 'var(--surface)' : 'transparent', color: view === t.v ? 'var(--fg)' : 'var(--muted)' }}><span className="text-[18px]">{t.i}</span>{t.l}{t.v === 'review' && pendingN > 0 && <span className="ml-auto chip c4">{pendingN}</span>}</button>)}
          <div className="muted text-[12px] mt-6 px-3.5">{cloudMode ? '云端同步 · 法兰克福' : '本地模式 · 数据在此浏览器'}</div>
        </aside>
        <div>
          <div className="mb-4">{header}</div>
          <div className="rounded-3xl mb-4" style={{ background: 'var(--surface)' }}><Capture cfg={cfg} desktop /></div>
          {page}
        </div>
        <aside className="sticky top-6 self-start">
          <RightRail go={go} />
        </aside>
      </div>
    </ToastProvider>
  )
}

function RightRail({ go }: { go: (v: string) => void }) {
  const T = today()
  const issues = useLiveQuery(() => db.issues.where('status').equals('open').toArray(), []) ?? []
  const refl = useLiveQuery(() => db.entries.where('review').equals('pending').toArray(), []) ?? []
  const todos = useLiveQuery(() => db.todos.filter(t => !t.done && !!t.date && t.date! >= T).sortBy('date'), [T]) ?? []
  return (
    <div className="grid gap-3">
      <div className="tile ink cursor-pointer" onClick={() => go('review')}><div className="lbl">待复盘池</div><div className="num text-[28px]">{issues.length + refl.length}</div><div className="text-[13px] opacity-70 mt-1">问题 {issues.length} · 反思 {refl.length}</div></div>
      <div className="card"><div className="lbl muted mb-1" style={{ opacity: 1 }}>接下来 7 天</div>{todos.slice(0, 8).map(t => <div key={t.id} className="item flex justify-between gap-2"><span className="min-w-0 truncate">{t.text}</span><span className="muted text-[12px] whitespace-nowrap tabular-nums">{t.date === T ? '今天' : t.date!.slice(5).replace('-', '/')}</span></div>)}{!todos.length && <div className="muted text-[13px]">没有排期的待办</div>}</div>
      <div className="card"><div className="lbl muted mb-1" style={{ opacity: 1 }}>没解决的问题</div>{issues.map(i => <div key={i.id} className="item">{i.text}</div>)}{!issues.length && <div className="muted text-[13px]">没有</div>}</div>
    </div>
  )
}
