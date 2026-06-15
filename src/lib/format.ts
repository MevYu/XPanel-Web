const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] as const

/** formatBytes 以二进制单位(KiB/MiB/GiB/…)格式化字节数,保留一位小数(B 不带小数)。 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
  const value = bytes / 1024 ** exp
  return `${exp === 0 ? value : value.toFixed(1)} ${UNITS[exp]}`
}
