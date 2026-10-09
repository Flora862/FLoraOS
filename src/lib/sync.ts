// 本地 ↔ 云端同步。本地 Dexie 是工作副本（离线也能用），云端 documents 表是正本。
// 规则：每行有 uid + updatedAt + dirty。改了就 dirty=1；push 把 dirty 行上传；pull 拉回别处更新的行；后写的赢。
import { db, REMOTE, syncFlags } from './db'
import { supabase } from './supabase'

const SYNC_TABLES = ['entries', 'todos', 'issues', 'bigThings', 'reviews', 'dailyStates', 'books', 'readingLogs', 'envelopes', 'accounts', 'transactions', 'lessons'] as const
type Row = Record<string, unknown> & { id?: number; uid?: string; updatedAt?: string; dirty?: number; deletedAt?: string }

let timer: number | undefined
export function scheduleSync() { if (!supabase) return; window.clearTimeout(timer); timer = window.setTimeout(() => void sync(), 1500) }

let running = false
export let lastSyncError = ''
export async function sync(): Promise<{ pushed: number; pulled: number } | null> {
  if (!supabase || running) return null
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  running = true; lastSyncError = ''
  try {
    const userId = session.user.id
    let pushed = 0
    // ---- push ----
    for (const t of SYNC_TABLES) {
      const table = db.table(t)
      const dirty = (await table.filter((r: Row) => r.dirty === 1).toArray()) as Row[]
      if (!dirty.length) continue
      const payload = dirty.map(r => { const { id, dirty: _d, ...data } = r; void id; void _d; return { id: r.uid, user_id: userId, table_name: t, data, updated_at: r.updatedAt ?? new Date().toISOString(), deleted: !!r.deletedAt } })
      const { error } = await supabase.from('documents').upsert(payload, { onConflict: 'id' })
      if (error) { lastSyncError = t + ': ' + error.message; console.warn('push failed', t, error.message); continue }
      // 只清"推送时那个版本"的 dirty；推送期间又改过的保持 dirty
      for (const r of dirty) await table.where('id').equals(r.id!).modify((x: Row) => { if (x.updatedAt === r.updatedAt) x.dirty = 0 })
      pushed += dirty.length
    }
    const dirtyCfg = (await db.config.toArray()).filter(r => r.dirty === 1)
    if (dirtyCfg.length) {
      const { error } = await supabase.from('documents').upsert(dirtyCfg.map(r => ({ id: cfgUuid(userId, r.key), user_id: userId, table_name: 'config', data: { key: r.key, value: r.value }, updated_at: r.updatedAt ?? new Date().toISOString() })), { onConflict: 'id' })
      if (!error) for (const r of dirtyCfg) await db.config.where('key').equals(r.key).modify((x) => { if (x.updatedAt === r.updatedAt) x.dirty = 0 })
      else lastSyncError = 'config: ' + error.message
    }
    // ---- pull（分页，游标用 >=，同一时间戳不会漏） ----
    let since = localStorage.getItem('floraos.lastPull') ?? '1970-01-01T00:00:00Z'
    let pulled = 0
    for (let page = 0; page < 50; page++) {
      const { data, error } = await supabase.from('documents').select('id,table_name,data,updated_at,deleted').gte('updated_at', since).order('updated_at').order('id').limit(500)
      if (error) { lastSyncError = 'pull: ' + error.message; break }
      if (!data?.length) break
      let maxTs = since
      for (const d of data) {
        maxTs = d.updated_at > maxTs ? d.updated_at : maxTs
        if (d.table_name === 'config') {
          const local = await db.config.get(d.data.key)
          if (!local || ((local.updatedAt ?? '') < d.updated_at && local.dirty !== 1)) { await db.config.put({ key: d.data.key, value: d.data.value, updatedAt: d.updated_at, dirty: 0 }); pulled++ }
          continue
        }
        if (!(SYNC_TABLES as readonly string[]).includes(d.table_name)) continue
        const table = db.table(d.table_name)
        const local = (await table.where('uid').equals(d.id).first()) as Row | undefined
        const remote = { ...d.data, uid: d.id, updatedAt: d.updated_at, dirty: 0 } as Row
        if (!local) { try { await table.add({ ...remote, [REMOTE]: true }); pulled++ } catch (e) { console.warn('pull add failed', d.table_name, e) } }
        else if ((local.updatedAt ?? '') < d.updated_at && local.dirty !== 1) { await table.update(local.id!, remote); pulled++ }
      }
      localStorage.setItem('floraos.lastPull', maxTs)
      if (data.length < 500 || maxTs === since) break
      since = maxTs
    }
    return { pushed, pulled }
  } finally { running = false }
}

/** config 的 key → 该用户下稳定的 uuid */
export function cfgUuid(userId: string, key: string) { return stableUuid(userId + ':cfg:' + key) }
export function stableUuid(str: string) {
  let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0xdeadbeef, h4 = 0x12345678
  for (const ch of str) { const c = ch.charCodeAt(0); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 + c, 2246822507) >>> 0; h3 = Math.imul(h3 ^ (c << 3), 3266489909) >>> 0; h4 = (h4 + Math.imul(c, 374761393)) >>> 0 }
  const hex = [h1, h2, h3, h4].map(x => x.toString(16).padStart(8, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** 登录后第一次：把本地已有的（离线期间的）全部标 dirty 上传 */
export async function markAllDirty() {
  for (const t of SYNC_TABLES) await db.table(t).toCollection().modify((r: Row) => { r.dirty = 1; r.updatedAt ??= new Date().toISOString() })
}

export function startAutoSync() {
  if (!supabase) return
  syncFlags.onLocalWrite = scheduleSync
  void sync()
  const onVis = () => { if (document.visibilityState === 'visible') void sync() }
  const onOnline = () => void sync()
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('online', onOnline)
  const id = window.setInterval(() => void sync(), 60_000)
  return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', onOnline); window.clearInterval(id) }
}
