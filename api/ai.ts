// 服务器端 AI 接口（Vercel Serverless）。密钥只在这里，前端拿不到。
// 调用前先验证 Supabase 登录态：没登录的人不能用你的额度。
// 环境变量（Vercel 项目设置里填，不带 VITE_ 前缀）：DEEPSEEK_KEY（必填）、CLAUDE_KEY（可选）、SUPABASE_URL、SUPABASE_ANON_KEY
import type { VercelRequest, VercelResponse } from '@vercel/node'

const CLASSIFY_SYSTEM = `你是个人记录系统的分类器。输入一句中文（可能夹德语/英语）。只输出 JSON：
{"tags":[模块标签],"todo":"若句中有明确动作则抽成一句待办，否则省略","issue":"若是没想明白的问题则抽成一句，否则省略","ask":true/false,"date":"YYYY-MM-DD 或省略","confidence":0-1}
规则：明确动作（明天得/记得/要去）直接给 todo，ask=false；像动作但不明确（"X 那个事"）→ ask=true 且不给 todo；想法类不给 todo。标签只从给定列表里选，可多个。日期按给定的今天推算。`

const SUMMARY_SYSTEM = `你是一个克制、直接的复盘助手，不说客套话，不给鸡汤。用户给你一段时间内已复盘的记录（大事结果、问题与卡点、反思、心情身体均值）。
输出 Markdown，三段，每段不超过 5 行：
## 做成率
大事做成 X/Y，列出没做成的共同原因（只写证据支持的）。
## 反复出现的卡点
出现 ≥2 次的卡点或问题，每条一句，写明出现了几次。
## 值得写进经验的
1 到 2 条，每条是可以直接执行的一句话。没有就写"这段数据还不够"。`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const auth = req.headers.authorization ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'no token' })
  const supaUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  if (!supaUrl || !anon) return res.status(500).json({ error: 'server missing SUPABASE_URL/ANON' })
  const u = await fetch(`${supaUrl}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anon } })
  if (!u.ok) return res.status(401).json({ error: 'not logged in' })

  const { task, text, tags, today } = (req.body ?? {}) as { task: 'classify' | 'summary'; text: string; tags?: string[]; today?: string }
  if (!text) return res.status(400).json({ error: 'no text' })
  const ds = process.env.DEEPSEEK_KEY, cl = process.env.CLAUDE_KEY
  const useClaude = (task === 'summary' || text.length > 800) && !!cl
  try {
    if (task === 'summary') {
      const out = useClaude ? await claude(cl!, SUMMARY_SYSTEM, text, 900) : ds ? await deepseek(ds, SUMMARY_SYSTEM, text, false) : null
      if (out === null) return res.status(503).json({ error: 'Vercel 里没有 DEEPSEEK_KEY，或者加了没重新部署' })
      return res.json({ text: out, model: useClaude ? 'claude' : 'deepseek' })
    }
    const sys = CLASSIFY_SYSTEM + `\n标签列表：${(tags ?? []).join('、')}\n今天是 ${today ?? new Date().toISOString().slice(0, 10)}`
    let out: string | null = null, model = 'deepseek'
    if (ds) out = await deepseek(ds, sys, text, true)
    let parsed = safeJson(out)
    if ((!parsed || (parsed.confidence ?? 1) < 0.6) && cl) { out = await claude(cl, sys, text, 300); parsed = safeJson(out) ?? parsed; model = 'claude' }
    if (!parsed) return res.status(503).json({ error: ds ? '模型返回不可解析' : 'Vercel 里没有 DEEPSEEK_KEY，或者加了没重新部署' })
    return res.json({ ...parsed, model })
  } catch (e) {
    return res.status(502).json({ error: String(e) })
  }
}

async function deepseek(key: string, system: string, user: string, json: boolean) {
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'deepseek-chat', temperature: 0, ...(json ? { response_format: { type: 'json_object' } } : {}), messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  })
  const j = await r.json(); return j.choices?.[0]?.message?.content ?? null
}
async function claude(key: string, system: string, user: string, max: number) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: max, system, messages: [{ role: 'user', content: user }] }),
  })
  const j = await r.json(); return j.content?.[0]?.text ?? null
}
function safeJson(t: string | null) { if (!t) return null; try { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)) } catch { return null } }
