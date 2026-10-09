// 模型层：DeepSeek 默认，Claude 升级。密钥来自 .env（VITE_DEEPSEEK_KEY / VITE_CLAUDE_KEY）。
// 没密钥 → 返回 null，上层用 parse.ts 的规则结果。
// 注意：第一版密钥在前端，只适合自用。开 Supabase 后把这段挪进 Edge Function，密钥不再下发到浏览器。
import type { Parsed } from './parse'

const DS_KEY = import.meta.env.VITE_DEEPSEEK_KEY as string | undefined
const CL_KEY = import.meta.env.VITE_CLAUDE_KEY as string | undefined

export interface ClassifyResult {
  tags: string[]
  todo?: string
  issue?: string
  ask: boolean
  date?: string
  confidence: number
}

const SYSTEM = `你是个人记录系统的分类器。输入一句中文（可能夹德语/英语）。输出 JSON：
{"tags":[模块标签],"todo":"若句中有明确动作则抽成一句待办，否则省略","issue":"若是没想明白的问题则抽成一句，否则省略","ask":true/false,"date":"YYYY-MM-DD 或省略","confidence":0-1}
规则：明确动作（明天得/记得/要去）直接给 todo，ask=false；像动作但不明确（“X 那个事”）→ ask=true 且不给 todo；想法类不给 todo。标签从给定列表里选，可多个。只输出 JSON。`

export async function classify(text: string, tagList: string[], task: 'classify' | 'summary' = 'classify'): Promise<ClassifyResult | null> {
  const useClaude = task === 'summary' || text.length > 800
  if (useClaude && CL_KEY) return viaClaude(text, tagList)
  if (DS_KEY) {
    const r = await viaDeepSeek(text, tagList)
    if (r && r.confidence < 0.6 && CL_KEY) return viaClaude(text, tagList)
    return r
  }
  if (CL_KEY) return viaClaude(text, tagList)
  return null
}

async function viaDeepSeek(text: string, tagList: string[]): Promise<ClassifyResult | null> {
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DS_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat', temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: SYSTEM + '\n标签列表：' + tagList.join('、') }, { role: 'user', content: text }],
      }),
    })
    const j = await res.json()
    return JSON.parse(j.choices[0].message.content)
  } catch { return null }
}

async function viaClaude(text: string, tagList: string[]): Promise<ClassifyResult | null> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CL_KEY!, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: 'claude-sonnet-5-5', max_tokens: 300,
        system: SYSTEM + '\n标签列表：' + tagList.join('、'),
        messages: [{ role: 'user', content: text }],
      }),
    })
    const j = await res.json()
    const t = j.content?.[0]?.text ?? ''
    return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1))
  } catch { return null }
}

export function merge(rule: Parsed, llm: ClassifyResult | null): Parsed {
  if (!llm) return rule
  return {
    ...rule,
    tags: llm.tags?.length ? llm.tags : rule.tags,
    todo: rule.pages || rule.money ? undefined : (llm.todo ?? rule.todo),
    issue: llm.issue ?? rule.issue,
    ask: rule.pages || rule.money || rule.isIdea ? false : (llm.ask ?? rule.ask),
    date: llm.date ?? rule.date,
  }
}

export const hasLLM = !!(DS_KEY || CL_KEY)
