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
  ask: boolean            // 不明确 → 弹抽屉
  pages?: number          // 图书：读到 N 页
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
  const tags = cfg.tags.filter(t => t.words.some(w => x.includes(w))).map(t => t.name)
  return tags.length ? tags : ['杂']
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

  // 财务：金额 + 消费词
  const money = text.match(/(?:€|欧)?\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|欧|块)?/)
  if (money && cfg.finance.moneyWords.some(w => text.includes(w))) {
    const amount = parseFloat(money[1].replace(',', '.'))
    const env = cfg.finance.envelopes.find(e => e.words?.some(w => text.includes(w)))
    p.money = { amount, envelope: env?.name ?? '机动' }
    p.tags = ['财务']
    return p
  }

  if (isIdea) return p

  // 明确动作
  const clearRe = new RegExp('(?:' + cfg.clearActionWords.join('|') + ')([^，。,.!！?？]{2,30})')
  const clear = text.match(clearRe)
  if (clear) { p.todo = clear[1].replace(/^(得|要|去)/, '').trim(); return p }

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
