import { describe, it, expect, beforeEach } from 'vitest'
import { loadTabs } from '../Files'

const KEY = 'xpanel.files.tabs'

// 回退结果:单个根目录标签,activeId 指向它,cwd 必为合法空串。
function expectRootFallback(r: { tabs: { id: string; path: string }[]; activeId: string }) {
  expect(r.tabs).toHaveLength(1)
  expect(r.tabs[0].path).toBe('')
  expect(typeof r.tabs[0].id).toBe('string')
  expect(r.activeId).toBe(r.tabs[0].id)
}

describe('loadTabs localStorage 恢复', () => {
  beforeEach(() => localStorage.clear())

  it('无数据时回退到根标签', () => {
    expectRootFallback(loadTabs())
  })

  it.each([
    ['损坏 JSON', '{not valid json'],
    ['JSON null', 'null'],
    ['JSON 数字', '42'],
    ['JSON 字符串', '"hello"'],
    ['旧结构:顶层数组', '[{"id":"a","path":""}]'],
    ['缺 tabs 字段', '{"activeId":"x"}'],
    ['tabs 非数组', '{"tabs":"oops","activeId":"x"}'],
    ['tabs 空数组', '{"tabs":[],"activeId":"x"}'],
    ['tab 缺 id', '{"tabs":[{"path":"etc"}],"activeId":"a"}'],
    ['tab path 非字符串', '{"tabs":[{"id":"a","path":123}],"activeId":"a"}'],
  ])('坏/旧 localStorage(%s)回退到根标签且不抛', (_label, raw) => {
    localStorage.setItem(KEY, raw)
    expect(() => loadTabs()).not.toThrow()
    expectRootFallback(loadTabs())
  })

  it('合法数据原样恢复', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ tabs: [{ id: 'a', path: '' }, { id: 'b', path: 'etc' }], activeId: 'b' }),
    )
    const r = loadTabs()
    expect(r.tabs).toHaveLength(2)
    expect(r.activeId).toBe('b')
  })

  it('activeId 指向不存在的标签时回退到首个标签', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ tabs: [{ id: 'a', path: '' }], activeId: 'ghost' }),
    )
    const r = loadTabs()
    expect(r.activeId).toBe('a')
  })
})
