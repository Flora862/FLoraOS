export const W = ['日', '一', '二', '三', '四', '五', '六']
const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => ymd(new Date())
export const month = () => today().slice(0, 7)
export function dOff(n: number, from = new Date()) {
  const d = new Date(from); d.setDate(d.getDate() + n); return ymd(d)
}
export function fmtDate(d?: string) {
  if (!d) return ''
  if (d === today()) return '今天'
  if (d === dOff(1)) return '明天'
  if (d === dOff(-1)) return '昨天'
  return d.slice(5).replace('-', '/')
}
export function hm(iso: string) {
  const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function greeting() {
  const h = new Date().getHours()
  return h < 11 ? '早上好' : h < 18 ? '下午好' : '晚上好'
}
export function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}
