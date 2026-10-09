// 规则解析器：没有模型密钥时的兜底，也是输入时实时芯片的来源。
// 有密钥时 llm.ts 先调模型，模型结果覆盖这里的 tags / todo / issue 判断。
import type { AppConfig } from './config'
import { W, dOff, today, ymd } from './dates'

export interface Parsed {
  text: string
  tags: string[]
  date?: string
  evening: boolean
  todo?: string
  issue?: string
  ask: boolean
  pages?: number
  money?: { amount: number; envelope: string }
  isIdea: boolean
  bigThing?: { day: 'today' | 'tomorrow'; text: string; standard?: string }
}

export function parseDate(x: string): string | undefined {
  const now = new Date()
  if (/明天/.test(x)) return dOff(1)
  if (/后天/.test(x)) return dOff(2)
  if (/今天|今晚/.test(x)) return today()
  const w = x.match(/周([一二三四五六日])/)
  if (w) {
    const target = W.indexOf(w[1]); let k = (target - now.getDay() + 7) % 7 || 7
    if (/下周/.test(x)) k += 7
    return dOff(k)
  }
  const n = x.match(/(\d{1,2})\s*号/)
  if (n) { const d = new Date(now); d.setDate(+n[1]); if (d < now) d.setMonth(d.getMonth() + 1); return ymd(d) }
  return undefined
}

export function tagsOf(x: string, cfg: AppConfig): string[] {
  const lx = x.toLowerCase()
  const tags = cfg.tags.filter(t => t.words.some(w => lx.includes(w.toLowerCase()))).map(t => t.name)
  return tags.length ? tags : ['杂']
}

/** 金额识别：要么紧挨货币符号（€12 / 12€ / 12 欧 / 12 块 / 12 元），要么命中了信封关键词且数字后面不是量词 */
export function parseMoney(text: string, cfg: AppConfig): { amount: number; envelope: string } | null {
  const lx = text.toLowerCase()
  const envHit = cfg.finance.envelopes.find(e => e.words?.some(w => lx.includes(w.toLowerCase())))
  const cur = text.match(/(?:€|eur)\s*(\d{1,5}(?:[.,]\d{1,2})?)|(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|eur|欧|块|元)/i)
  let amount: number | undefined
  if (cur) amount = parseFloat((cur[1] ?? cur[2]).replace(',', '.'))
  else if (envHit || cfg.finance.moneyWords.some(w => lx.includes(w.toLowerCase()))) {
    const m = [...text.matchAll(/(?<![\d.,])(\d{1,5}(?:[.,]\d{1,2})?)(?![\d.,]|\s*(?:本|点|号|页|个|次|分钟|分|小时|天|周|月|年|人|公里|km|g|kg|%|章|节))/g)].pop()
    if (m) amount = parseFloat(m[1].replace(',', '.'))
  }
  if (!amount) return null
  return { amount, envelope: envHit?.name ?? cfg.finance.envelopes.find(e => !e.locked)?.name ?? '机动' }
}

export function parse(x: string, cfg: AppConfig): Parsed {
  const text = x.trim()
  const tags = tagsOf(text, cfg)
  const date = parseDate(text)
  const evening = cfg.eveningWords.some(w => text.includes(w))
  const isIdea = tags.includes('想法')
  const p: Parsed = { text, tags, date, evening, ask: false, isIdea }

  // 大事："今天的大事是 X" / "明天（的）一件大事：X，标准是 Y"
  const bt = text.match(/^(今天|明天)(?:的)?(?:一件)?大事(?:是|：|:|，|,)?\s*(.+)$/)
  if (bt) {
    let body = bt[2].trim(); let standard: string | undefined
    const st = body.match(/^(.*?)(?:[，,。；;]\s*)?(?:做成的?标准|标准)(?:是|：|:)\s*(.+)$/)
    if (st) { body = st[1].trim(); standard = st[2].trim() }
    p.bigThing = { day: bt[1] === '今天' ? 'today' : 'tomorrow', text: body, standard }
    p.tags = ['大事']; return p
  }
  // 图书：读到 N 页
  const pg = text.match(/读到\s*(\d+)\s*页/)
  if (pg) { p.pages = +pg[1]; if (!tags.includes('图书')) p.tags = [...tags.filter(t => t !== '杂'), '图书']; return p }
  // 财务：金额
  const money = isIdea ? null : parseMoney(text, cfg)
  if (money) { p.money = money; p.tags = ['财务']; return p }
  if (isIdea) return p
  // 明确动作（词表里的单字会误伤"觉得/做得"，只用两字以上）
  const words = cfg.clearActionWords.filter(w => w.length >= 2)
  const clear = text.match(new RegExp('(?:' + words.join('|') + ')([^，。,.!！?？]{2,30})'))
  if (clear) { p.todo = clear[1].replace(/^(得|要|去|把)/, '').trim(); return p }
  // 不明确
  if (cfg.vagueWords.some(w => text.includes(w))) p.ask = true
  return p
}

export function todoFromVague(text: string) {
  return text.replace(/的事.*$/, '').replace(/^那个/, '').trim()
}
export function issueFromText(text: string) {
  return text.length > 28 ? text.slice(0, 28) + '…' : text
}
