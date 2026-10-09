import { useRef, useState } from 'react'
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
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  function voice() {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent)
    if (isIOS || !Ctor) { document.getElementById('capture')?.focus(); toast(isIOS ? '点键盘右下角的麦克风说话，说完点右上角完成' : '这个浏览器不支持语音，用键盘上的麦克风键'); return }
    if (false) { toast('这个浏览器不支持语音。用键盘上的麦克风键听写也一样'); return }
    if (listening) { recRef.current?.stop(); return }
    const rec = new Ctor(); recRef.current = rec
    rec.lang = 'zh-CN'; rec.interimResults = true; rec.continuous = false
    const base = text
    rec.onresult = (e) => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setText(base + t) }
    rec.onerror = (e) => { setListening(false); toast(e.error === 'not-allowed' ? '没拿到麦克风权限。设置里允许一下，或用键盘的麦克风键' : '语音没听清，再试一次') }
    rec.onend = () => setListening(false)
    try { rec.start(); setListening(true); toast('在听…说完自动停，再点一下也能停'); window.setTimeout(() => { try { rec.stop() } catch { /* noop */ } }, 12000) } catch { setListening(false) }
  }

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
    if (p.bigThing) msg = (p.bigThing.day === 'today' ? '今天' : '明天') + '的大事定了' + (p.bigThing.standard ? '，标准也记了' : '。晚上复盘时补一句做成的标准')
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
          <motion.button whileTap={{ scale: .93 }} animate={listening ? { scale: [1, 1.08, 1] } : { scale: 1 }} transition={listening ? { repeat: Infinity, duration: 1 } : {}} className={(listening ? 'accent' : 't4') + ' h-[46px] w-[46px] rounded-2xl border-0 text-[18px] cursor-pointer shrink-0'} title="语音" onClick={voice}>{listening ? '■' : '🎙'}</motion.button>
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
            {live.bigThing && <span className="chip c5">→ {live.bigThing.day === 'today' ? '今天' : '明天'}的大事</span>}
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

interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void; stop(): void
}
