const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] as const

/** formatBytes 以二进制单位(KiB/MiB/GiB/…)格式化字节数,保留一位小数(B 不带小数)。 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
  const value = bytes / 1024 ** exp
  return `${exp === 0 ? value : value.toFixed(1)} ${UNITS[exp]}`
}

/** formatRate 速率格式化:formatBytes 末尾追加 "/s"。 */
export function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

/** formatDuration 把秒数转成「天 时 分」友好格式,如 "12 天 3 小时"。 */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec))
  const days = Math.floor(sec / 86400)
  const hours = Math.floor((sec % 86400) / 3600)
  const mins = Math.floor((sec % 3600) / 60)
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${mins} 分`
  if (mins > 0) return `${mins} 分`
  return `${sec} 秒`
}
