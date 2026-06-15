import { describe, it, expect } from 'vitest'
import { formatBytes, formatRate, formatDuration } from './format'

describe('formatBytes', () => {
  it('returns 0 B for zero', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('formats large values in binary units', () => {
    expect(formatBytes(130663825408)).toBe('121.7 GiB')
  })

  it('formats KiB and MiB', () => {
    expect(formatBytes(2048)).toBe('2.0 KiB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MiB')
  })
})

describe('formatRate', () => {
  it('appends /s suffix', () => {
    expect(formatRate(2048)).toBe('2.0 KiB/s')
    expect(formatRate(0)).toBe('0 B/s')
  })
})

describe('formatDuration', () => {
  it('formats days and hours', () => {
    expect(formatDuration(12 * 86400 + 3 * 3600 + 5 * 60)).toBe('12 天 3 小时')
  })

  it('formats hours and minutes when under a day', () => {
    expect(formatDuration(3 * 3600 + 7 * 60 + 40)).toBe('3 小时 7 分')
  })

  it('formats minutes only when under an hour', () => {
    expect(formatDuration(42 * 60 + 9)).toBe('42 分')
  })

  it('formats seconds when under a minute', () => {
    expect(formatDuration(30)).toBe('30 秒')
  })

  it('clamps negatives to 0', () => {
    expect(formatDuration(-5)).toBe('0 秒')
  })
})
