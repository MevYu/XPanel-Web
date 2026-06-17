// 统一时间格式:YYYY-MM-DD HH:mm,本地时区,24 小时制。全站日期渲染的唯一来源。

/** formatTime 把 Unix 秒格式化为 `YYYY-MM-DD HH:mm`(本地时区);0 / NaN 返回占位符。 */
export function formatTime(unixSec: number): string {
  if (!unixSec) return '—'
  const d = new Date(unixSec * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** formatTimeISO 把 ISO 时间串格式化为 `YYYY-MM-DD HH:mm`(本地时区);无法解析时原样返回。 */
export function formatTimeISO(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
