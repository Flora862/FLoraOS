// 模型层。正式环境走 /api/ai（密钥在服务器，需登录）；本地开发没有 /api 时可用 .env 里的 VITE_ 密钥直连。
import type { Parsed } from './parse'
import { supabase } from './supabase'
import { today } from './dates'

const DS_KEY = import.meta.env.VITE_DEEPSEEK_KEY as string | undefined
const CL_KEY = import.meta.env.VITE_CLAUDE_KEY as string | undefined
const isLocalDev = import.meta.env.DEV

export interface ClassifyResult { tags: string[]; todo?: string; issue?: string; ask: boolean; date?: string; confidence: number }

async function callApi(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (!supabase) return null
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  try {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) })
    if (!r.ok) return null
    return await r.json()
  } catch { return null }
}

export async function classify(text: string, tagList: string[]): Promise<ClassifyResult | null> {
  if (!isLocalDev) return (await callApi({ task: 'classify', text, tags: tagList, today: today() })) as ClassifyResult | null
  // 本地开发：直连（密钥在 .env，不进仓库）
  const SYSTEM = `你是个人记录系统的分类器。只输出 JSON：{"tags":[],"todo":"","issue":"","ask":false,"date":"","confidence":0}。明确动作给 todo；不明确 ask=true；想法类不给 todo。标签列表：${tagList.join('、')}。今天 ${today()}`
  if (DS_KEY) {
    try {
      const r = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DS_KEY}` }, body: JSON.stringify({ model: 'deepseek-chat', temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }] }) })
      const j = await r.json(); return JSON.parse(j.choices[0].message.content)
    } catch { return null }
  }
  return null
}

export async function summarize(text: string): Promise<{ text: string; model: string } | null> {
  const r = await callApi({ task: 'summary', text })
  return r ? (r as { text: string; model: string }) : null
}

export function merge(rule: Parsed, llm: ClassifyResult | null): Parsed {
  if (!llm || rule.bigThing) return rule
  return {
    ...rule,
    tags: llm.tags?.length ? llm.tags : rule.tags,
    todo: rule.pages || rule.money ? undefined : (llm.todo || rule.todo),
    issue: llm.issue || rule.issue,
    ask: rule.pages || rule.money || rule.isIdea ? false : (llm.ask ?? rule.ask),
    date: llm.date || rule.date,
  }
}

export const hasLLM = !!(DS_KEY || CL_KEY) || !!supabase
