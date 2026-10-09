import { useState } from 'react'
import { motion } from 'framer-motion'
import { parse } from '../lib/parse'
import { capture, resolveVague, setIdeaDie } from '../lib/store'
import { fmtDate } from '../lib/dates'
import type { AppConfig } from '../lib/config'
import type { Parsed } from '../lib/parse'
import { Sheet, useToast, TAGC } from './ui'

/** 常驻捕捉栏：输入即解析为芯片；回车发送；不明确弹必选抽屉；想法追问死因 */
export function Capture({ cfg, desktop }: { cfg: AppConfig; desktop?: boolean }) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState<{ parsed: Parsed; entryId: number } | null>(null)
  const [idea, setIdea] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const live = text.trim() ? parse(text, cfg) : null

  async function send() {
    const x = text.trim(); if (!x || busy) return
    if (idea !== null && !/想法/.test(x)) { await setIdeaDie(idea, x); setIdea(null); setText(''); toast('已挂到那条想法后面'); return }
    setBusy(true); setText('')
    try {
      const r = await capture(x, cfg, desktop ? 'desktop' : 'phone-text')
      if (r.parsed.ask) { setPending(r); return }
      done(r.parsed, r.entryId)
    } finally { setBusy(false) }
  }
  function done(p: Parsed, entryId: number) {
    let msg = '已收 · ' + p.tags.join(' / ')
    if (p.todo) msg += ' · 建了待办' + (p.date ? '（' + fmtDate(p.date) + '）' : '')
    if (p.issue) msg += ' · 记为问题，进待复盘池'
    if (p.pages) msg += ' · 进度已更新'
    if (p.money) msg += ' · 已记到「' + p.money.envelope + '」'
    toast(msg)
    if (p.isIdea) setIdea(entryId)
  }
  async function pick(k: 'todo' | 'issue' | 'none') {
    if (!pending) return
    await resolveVague(pending.entryId, k, pending.parsed)
    const p = { ...pending.parsed, todo: k === 'todo' ? '✓' : undefined, issue: k === 'issue' ? '✓' : undefined }
    setPending(null); done(p, pending.entryId)
  }

  return (
    <>
      <div className={desktop ? 'px-4 py-3' : 'px-[14px] pt-3 pb-1.5'}>
        <div className="flex gap-2 items-end">
          <motion.button whileTap={{ scale: .93 }} className="t4 h-[46px] w-[46px] rounded-2xl border-0 text-[18px] cursor-pointer shrink-0" title="语音" onClick={() => toast('语音入口在第 6 步：快捷指令按住说话')}>🎙</motion.button>
          <textarea id="capture" value={text} onChange={e => setText(e.target.value)} rows={1}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={idea !== null ? '这个想法最可能在哪里死？直接回答' : '想到什么直接写。回车发送。'}
            className="min-h-[46px] max-h-[120px] rounded-2xl" style={{ background: 'var(--bg)' }} />
          <motion.button whileTap={{ scale: .93 }} onClick={send} className="ink h-[46px] w-[46px] rounded-2xl border-0 text-[18px] cursor-pointer shrink-0" title="发送">↑</motion.button>
        </div>
        <div className="flex gap-1.5 flex-wrap min-h-[20px] mt-1.5 text-[12px] muted">
          {live ? (<>
            {live.tags.map(t => <span key={t} className={'chip ' + (TAGC[t] ?? 'c2')}>{t}</span>)}
            {live.date && <span className="chip c3">📅 {fmtDate(live.date)}</span>}
            {live.evening && <span className="chip c2">今晚</span>}
            {live.pages && <span className="chip c5">读到 {live.pages} 页</span>}
            {live.money && <span className="chip c3">€{live.money.amount} → {live.money.envelope}</span>}
            {live.ask && <span className="chip ghost">会问你是待办还是问题</span>}
          </>) : <span>试试："明天得问 Lackmann 料号" · "和朋友吃饭 €25" · "纳瓦尔读到 226 页"</span>}
        </div>
      </div>
      <Sheet open={!!pending} mandatory title="这句是什么？" sub={pending ? '“' + pending.parsed.text + '”' : ''}>
        <div className="grid gap-2">
          <button className="t1 text-left p-[13px_14px] rounded-2xl border-0 flex gap-3 items-center cursor-pointer" onClick={() => pick('todo')}><span className="text-[20px]">✓</span><span><b className="block">待办</b><small className="opacity-80">一个要去做的动作</small></span></button>
          <button className="t4 text-left p-[13px_14px] rounded-2xl border-0 flex gap-3 items-center cursor-pointer" onClick={() => pick('issue')}><span className="text-[20px]">?</span><span><b className="block">问题</b><small className="opacity-80">还没想明白的事，进待复盘池</small></span></button>
          <button className="t2 text-left p-[13px_14px] rounded-2xl border-0 flex gap-3 items-center cursor-pointer" onClick={() => pick('none')}><span className="text-[20px]">·</span><span><b className="block">不用</b><small className="opacity-80">只留在收件</small></span></button>
        </div>
      </Sheet>
    </>
  )
}
