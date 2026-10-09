import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, exportAll, clearLocalData } from '../lib/db'
import { saveConfig } from '../lib/store'
import type { AppConfig } from '../lib/config'
import { hasLLM } from '../lib/llm'
import { useToast } from '../components/ui'
import { supabase, cloudMode } from '../lib/supabase'
import { sync, lastSyncError } from '../lib/sync'

const PALS = [
  { p: '', n: '粉彩', s: '按你的参考图', sw: ['#5b7cf0', '#e6dcff', '#d3f1e6', '#ffe1ea', '#fff0c4'] },
  { p: 'sun', n: '暖阳', s: '奶黄底、芥末主色', sw: ['#e8b530', '#ffd6c2', '#d9efd0', '#f9d5e5', '#dbe9ff'] },
  { p: 'indigo', n: '靛蓝', s: '冷、克制', sw: ['#3e63dd', '#e4e9f7', '#d6f0ef', '#f1e3ff', '#ffe9d6'] },
  { p: 'night', n: '深夜', s: '深底霓虹块', sw: ['#ff5c7a', '#1f2a5c', '#153a35', '#4a1d33', '#3f3010'] },
] as const

export function Settings({ cfg }: { cfg: AppConfig }) {
  const toast = useToast()
  const accounts = useLiveQuery(() => db.accounts.filter(a => !a.deletedAt).toArray(), []) ?? []
  const [name, setName] = useState(cfg.name)
  const [invite, setInvite] = useState('')
  const [email, setEmail] = useState('')
  useEffect(() => { supabase?.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? '')) }, [])
  async function upd(patch: Partial<AppConfig>) { await saveConfig({ ...cfg, ...patch }) }
  return (
    <div className="grid gap-3">
      <div className="card"><div className="lbl muted mb-2" style={{ opacity: 1 }}>色系 · 点一下当场换</div>
        <div className="grid grid-cols-2 gap-2">{PALS.map(x => <button key={x.p} onClick={() => upd({ palette: x.p })} className="text-left p-2.5 rounded-2xl border-2 cursor-pointer font-bold" style={{ background: 'var(--surface)', borderColor: cfg.palette === x.p ? 'var(--ink)' : 'transparent', color: 'var(--fg)' }}><span className="flex gap-1 mb-1.5">{x.sw.map(c => <i key={c} className="w-[18px] h-[18px] rounded-md block" style={{ background: c }} />)}</span>{x.n}<small className="block muted text-[11px] font-medium">{x.s}</small></button>)}</div>
        <div className="flex gap-1.5 mt-2.5">{([['light', '浅色'], ['dark', '深色'], ['', '跟随系统']] as const).map(([v, l]) => <button key={v} className={'pill sm ' + (cfg.theme === v ? '' : 'ghost')} onClick={() => upd({ theme: v })}>{l}</button>)}</div>
      </div>
      <div className="card"><div className="lbl muted mb-2" style={{ opacity: 1 }}>我</div>
        <div className="flex gap-2"><input className="flex-1 min-w-0 rounded-xl p-3 border-0" style={{ background: 'var(--bg)' }} value={name} onChange={e => setName(e.target.value)} /><button className="pill" onClick={() => { upd({ name }); toast('存了') }}>存</button></div>
        <div className="flex items-center justify-between mt-3 flex-wrap gap-2"><span>大事默认时长</span><div className="flex gap-1.5">{[45, 60, 90, 120].map(m => <button key={m} className={'pill sm ' + (cfg.bigThingMinutes === m ? '' : 'ghost')} onClick={() => upd({ bigThingMinutes: m })}>{m} 分</button>)}</div></div>
      </div>
      <div className="card"><div className="lbl muted mb-2" style={{ opacity: 1 }}>财务 · 存量资金（真实数字只存这里）</div>
        {accounts.map(a => <div key={a.id} className="flex items-center justify-between py-1.5 gap-2"><span className="min-w-0">{a.name}<small className="muted block text-[11px]">{a.rule}</small></span><input className="w-28 rounded-xl p-2 border-0 text-right tabular-nums" style={{ background: 'var(--bg)' }} inputMode="decimal" defaultValue={a.amount} onBlur={e => { db.accounts.update(a.id!, { amount: parseFloat(e.target.value) || 0 }); toast('存了') }} /></div>)}
        <div className="muted text-[13px] mt-2">月收入、每个信封的预算和名字：模块 → 财务 → 右上角"改预算"。</div>
      </div>
      <div className="card"><div className="lbl muted mb-2" style={{ opacity: 1 }}>模型路由</div>
        <div className="text-[14px]">{hasLLM ? '已连接服务器端模型：DeepSeek 默认，总结走 Claude（如果填了）。没填密钥时自动退回规则分类。' : '没有填密钥，现在用规则分类（够用）。'}</div>
      </div>
      <div className="card"><div className="lbl muted mb-2" style={{ opacity: 1 }}>数据与账号</div>
        {cloudMode ? (<>
          <div className="text-[14px] mb-2"><b>云端模式</b>：{email || '…'}。本地有副本，离线能用，联网自动同步，手机电脑同一份。</div>
          <div className="flex gap-1.5 flex-wrap">
            <button className="pill sm" onClick={async () => { const r = await sync(); toast(r ? `同步完成：上传 ${r.pushed} · 下载 ${r.pulled}` + (lastSyncError ? ' · 有错误：' + lastSyncError : '') : '没登录或正在同步') }}>立即同步</button>
            <button className="pill sm ghost" onClick={async () => { const { data, error } = await supabase!.rpc('make_invite'); if (error) toast('生成失败：' + error.message + '（SQL Editor 跑一下 fix_invite.sql）'); else { setInvite(data as string); toast('邀请码已生成') } }}>生成邀请码</button>
            <button className="pill sm ghost" onClick={async () => { if (!confirm('退出登录会清掉这台设备上的本地副本（云端数据不受影响），下次登录再拉回来。确定？')) return; await sync(); await supabase!.auth.signOut(); await clearLocalData(); location.reload() }}>退出登录</button>
          </div>
          {invite && <div className="mt-2 text-[14px]">邀请码：<b className="tabular-nums tracking-widest">{invite}</b><span className="muted text-[12px]"> 给朋友，只能用一次</span></div>}
        </>) : <div className="text-[14px] mb-2">现在是<b>本地模式</b>：数据在这台设备的浏览器里。</div>}
        <div className="flex gap-1.5 mt-2"><button className="pill sm" onClick={async () => { const s = await exportAll(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([s], { type: 'application/json' })); a.download = `floraos-${new Date().toISOString().slice(0, 10)}.json`; a.click(); toast('已导出整库 JSON') }}>整库导出</button>
          {!cloudMode && <button className="pill sm ghost" onClick={async () => { if (!confirm('清空本地示例数据？你的真实记录也会一起清，先导出。')) return; await clearLocalData(); location.reload() }}>清空重来</button>}</div>
      </div>
    </div>
  )
}
