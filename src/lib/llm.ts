// 模型层。正式环境走 /api/ai（密钥在服务器，需登录）；本地开发没有 /api 时可用 .env 里的 VITE_ 密钥直连。
import type { Parsed } from './parse'
import { supabase } from './supabase'
import { today } from './dates'

const DS_KEY = import.meta.env.VITE_DEEPSEEK_KEY as string | undefined
const CL_KEY = import.meta.env.VITE_CLAUDE_KEY as string | undefined
const isLocalDev = import.meta.env.DEV

export let lastError = ''
export interface ClassifyResult { tags: string[]; todo?: string; issue?: string; ask: boolean; date?: string; confidence: number }

async function callApi(body: Record<string, unknown>, timeoutMs = 8000): Promise<Record<string, unknown> | null> {
  if (!supabase) return null
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  try {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
    const j = await r.json().catch(() => ({ error: 'HTTP ' + r.status }))
    if (!r.ok) { lastError = j.error ?? ('HTTP ' + r.status); return null }
    return j
  } catch (e) { lastError = e instanceof Error && e.name === 'TimeoutError' ? '模型超时（8 秒），这句按规则分类了' : String(e); return null }
}

export async function classify(text: string, tagList: string[]): Promise<ClassifyResult | null> {
  if (!isLocalDev) return (await callApi({ task: 'classify', text, tags: tagList, today: today() })) as ClassifyResult | null
  const SYSTEM = `你是个人记录系统的分类器。只输出 JSON：{"tags":[],"todo":"","issue":"","ask":false,"date":"","confidence":0}。明确动作给 todo；不明确 ask=true；想法类不给 todo。标签列表：${tagList.join('、')}。今天 ${today()}`
  if (DS_KEY) {
    try {
      const r = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DS_KEY}` }, body: JSON.stringify({ model: 'deepseek-chat', temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }] }), signal: AbortSignal.timeout(8000) })
      const j = await r.json(); return JSON.parse(j.choices[0].message.content)
    } catch { return null }
  }
  return null
}

export async function summarize(text: string): Promise<{ text: string; model: string } | null> {
  const r = await callApi({ task: 'summary', text }, 60000)
  return r ? (r as { text: string; model: string }) : null
}

/** 规则结果 + 模型结果合并：大事/页数/金额以规则为准；有模型时待办/问题以模型为准 */
export function merge(rule: Parsed, llm: ClassifyResult | null): Parsed {
  if (!llm || rule.bigThing || rule.pages || rule.money) return rule
  return {
    ...rule,
    tags: llm.tags?.length ? llm.tags : rule.tags,
    todo: rule.isIdea ? undefined : (llm.todo || undefined),
    issue: llm.issue || undefined,
    ask: rule.isIdea ? false : (llm.ask ?? rule.ask),
    date: llm.date || rule.date,
  }
}

export const hasLLM = !!(DS_KEY || CL_KEY) || !!supabase
