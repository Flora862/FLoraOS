// 本地 ↔ 云端同步。本地 Dexie 是工作副本（离线也能用），云端 documents 表是正本。
// 规则：每行有 uid + updatedAt + dirty。改了就 dirty=1；push 把 dirty 行上传；pull 拉回别处更新的行；后写的赢。
import { db, syncFlags } from './db'
import { supabase } from './supabase'
import { dedupeFinance } from './store'

const SYNC_TABLES = ['entries', 'todos', 'issues', 'bigThings', 'reviews', 'dailyStates', 'books', 'readingLogs', 'envelopes', 'accounts', 'transactions', 'lessons'] as const

type Row = Record<string, unknown> & { id?: number; uid?: string; updatedAt?: string; dirty?: number }

let timer: number | undefined
export function scheduleSync() { if (!supabase) return; window.clearTimeout(timer); timer = window.setTimeout(() => void sync(), 1500) }

let running = false
export async function sync(): Promise<{ pushed: number; pulled: number } | null> {
  if (!supabase || running) return null
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  running = true
  try {
    const uid = session.user.id
    // push
    let pushed = 0
    for (const t of SYNC_TABLES) {
      const table = db.table(t)
      const dirty = (await table.filter((r: Row) => r.dirty === 1).toArray()) as Row[]
      if (!dirty.length) continue
      const payload = dirty.map(r => { const { id, dirty: _d, ...data } = r; void id; void _d; return { id: r.uid, user_id: uid, table_name: t, data, updated_at: r.updatedAt ?? new Date().toISOString(), deleted: !!r.deletedAt } })
      const { error } = await supabase.from('documents').upsert(payload, { onConflict: 'id' })
      if (error) { console.warn('push failed', t, error.message); continue }
      syncFlags.applyingRemote = true
      try { for (const r of dirty) await table.update(r.id!, { dirty: 0 }) } finally { syncFlags.applyingRemote = false }
      pushed += dirty.length
    }
    // config 单独：key 当 uid
    const cfgRows = (await db.config.toArray()) as (Row & { key: string; value: unknown })[]
    const dirtyCfg = cfgRows.filter(r => r.dirty === 1)
    if (dirtyCfg.length) {
      const { error } = await supabase.from('documents').upsert(dirtyCfg.map(r => ({ id: keyToUuid(r.key), user_id: uid, table_name: 'config', data: { key: r.key, value: r.value }, updated_at: r.updatedAt ?? new Date().toISOString() })), { onConflict: 'id' })
      if (!error) { syncFlags.applyingRemote = true; try { for (const r of dirtyCfg) await db.config.update(r.key, { dirty: 0 }) } finally { syncFlags.applyingRemote = false } }
    }
    // pull
    const since = (localStorage.getItem('floraos.lastPull') ?? '1970-01-01T00:00:00Z')
    const { data, error } = await supabase.from('documents').select('id,table_name,data,updated_at,deleted').gt('updated_at', since).order('updated_at')
    if (error) { console.warn('pull failed', error.message); return { pushed, pulled: 0 } }
    let pulled = 0; let maxTs = since
    syncFlags.applyingRemote = true
    try {
      for (const d of data ?? []) {
        maxTs = d.updated_at > maxTs ? d.updated_at : maxTs
        if (d.table_name === 'config') { await db.config.put({ key: d.data.key, value: d.data.value, updatedAt: d.updated_at, dirty: 0 } as never); pulled++; continue }
        if (!(SYNC_TABLES as readonly string[]).includes(d.table_name)) continue
        const table = db.table(d.table_name)
        const local = (await table.where('uid').equals(d.id).first()) as Row | undefined
        const remote = { ...d.data, uid: d.id, updatedAt: d.updated_at, dirty: 0 } as Row
        if (!local) {
          try { await table.add(remote); pulled++ }
          catch { // 本机已有同一天的行（&date 唯一）但 uid 不同：用云端覆盖它
            const dup = remote.date ? (await table.where('date').equals(remote.date as string).first()) as Row | undefined : undefined
            if (dup) { await table.update(dup.id!, remote); pulled++ }
          }
        }
        else if ((local.updatedAt ?? '') < d.updated_at && local.dirty !== 1) { await table.update(local.id!, remote); pulled++ }
      }
    } finally { syncFlags.applyingRemote = false }
    localStorage.setItem('floraos.lastPull', maxTs)
    if (pulled) await dedupeFinance()
    return { pushed, pulled }
  } finally { running = false }
}

/** config 的 key 变成稳定 uuid（同一用户同一 key 永远同一个 id） */
function keyToUuid(key: string) {
  let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const hex = h.toString(16).padStart(8, '0')
  return `00000000-0000-4000-8000-${hex}${'0'.repeat(4)}`
}

/** 登录后第一次：把本地已有的（示例或离线期间的）全部标 dirty 上传 */
export async function markAllDirty() {
  for (const t of SYNC_TABLES) await db.table(t).toCollection().modify((r: Row) => { r.dirty = 1; r.updatedAt ??= new Date().toISOString() })
}

export function startAutoSync() {
  if (!supabase) return
  syncFlags.onLocalWrite = scheduleSync
  void sync()
  const onVis = () => { if (document.visibilityState === 'visible') void sync() }
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('online', () => void sync())
  const id = window.setInterval(() => void sync(), 60_000)
  return () => { document.removeEventListener('visibilitychange', onVis); window.clearInterval(id) }
}
