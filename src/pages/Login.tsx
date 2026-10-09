import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'

/** 登录 / 注册。注册需要邀请码（第一个账号除外）。 */
export function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [code, setCode] = useState('')
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  async function go() {
    if (!supabase || busy) return
    setBusy(true); setMsg('')
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
        if (error) setMsg(error.message.includes('Invalid') ? '邮箱或密码不对' : error.message)
      } else {
        const { error } = await supabase.auth.signUp({ email, password: pw, options: { data: { invite_code: code.trim().toUpperCase() } } })
        if (error) setMsg(/INVITE|Database error/i.test(error.message) ? '邀请码无效或已用过（第一个账号不需要）' : error.message)
        else setMsg('注册成功。如果你的项目开了邮件确认，去邮箱点一下链接再登录。')
      }
    } finally { setBusy(false) }
  }
  return (
    <div className="min-h-full grid place-items-center p-4">
      <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-[400px]">
        <div className="flex items-center gap-2 mb-6"><img src="/icon-192.png" alt="" className="w-10 h-10 rounded-xl" /><span className="text-[24px] font-extrabold">FloraOS</span></div>
        <div className="card grid gap-2.5">
          <div className="seg"><button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>登录</button><button className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>注册</button></div>
          <input className="rounded-xl p-3 border-0" style={{ background: 'var(--bg)' }} type="email" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
          <input className="rounded-xl p-3 border-0" style={{ background: 'var(--bg)' }} type="password" placeholder="密码（至少 6 位）" value={pw} onChange={e => setPw(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} onKeyDown={e => e.key === 'Enter' && go()} />
          {mode === 'signup' && <input className="rounded-xl p-3 border-0" style={{ background: 'var(--bg)' }} placeholder="邀请码（第一个账号不需要）" value={code} onChange={e => setCode(e.target.value)} />}
          <button className="pill" disabled={busy} onClick={go}>{busy ? '…' : mode === 'login' ? '登录' : '注册'}</button>
          {msg && <div className="text-[13px]" style={{ color: 'var(--t4d)' }}>{msg}</div>}
          <div className="muted text-[12px]">数据库在法兰克福，只有你本人能读自己的数据。</div>
        </div>
      </motion.div>
    </div>
  )
}
