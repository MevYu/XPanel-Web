import { describe, it, expect } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { usePoll } from './usePoll'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

describe('usePoll', () => {
  it('discards a stale slow response that resolves after a newer one', async () => {
    const d1 = deferred<number>()
    const d2 = deferred<number>()
    const promises = [d1.promise, d2.promise]
    let i = 0
    const fn = () => promises[i++]

    // intervalMs 很大,保证轮询不会自动再触发;两次 tick 由我们手动 visibilitychange 引发。
    const { result } = renderHook(() => usePoll(fn, 1_000_000))

    // 第二次 tick(新请求)由可见性事件触发,此时第一次仍 pending。
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // 新请求先返回,旧请求后返回 —— 旧的必须被丢弃。
    act(() => { d2.resolve(2) })
    await waitFor(() => expect(result.current.data).toBe(2))

    act(() => { d1.resolve(1) })
    // 给微任务队列一个 flush 机会,确认旧响应没有覆盖。
    await act(async () => { await Promise.resolve() })
    expect(result.current.data).toBe(2)
  })
})
