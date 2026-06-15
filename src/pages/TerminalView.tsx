import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { apiFetch } from '../api/client'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'

type Status = 'connecting' | 'open' | 'closed' | 'error'

function wsURL(ticket: string): string {
  const base = location.origin.replace(/^http/, 'ws')
  return `${base}/api/m/terminal/ws?ticket=${encodeURIComponent(ticket)}`
}

/**
 * TerminalView 懒加载组件:换票 → 连 WS → xterm ⇄ WS 双向桥接。
 * xterm 实例与监听器在 effect 内创建,卸载/重连时整组销毁,避免句柄泄漏。
 */
export default function TerminalView() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<Status>('connecting')
  const [errText, setErrText] = useState<string | null>(null)
  // 自增以触发重连:每次 +1 重跑 effect。
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let ws: WebSocket | null = null
    let disposed = false
    setStatus('connecting')
    setErrText(null)

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'var(--font-mono), monospace',
      fontSize: 13,
      theme: { background: '#0B0F14', foreground: '#E6EDF3', cursor: '#6E8BFF' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()

    const sendResize = () => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', rows: term.rows, cols: term.cols }))
      }
    }
    const onWindowResize = () => {
      fit.fit()
      sendResize()
    }
    window.addEventListener('resize', onWindowResize)

    // 输入:键入字节作为二进制帧发给 PTY。
    const dataSub = term.onData((d) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(d))
    })

    void (async () => {
      try {
        const { ticket } = await apiFetch<{ ticket: string }>('/api/m/terminal/ticket', {
          method: 'POST',
        })
        if (disposed) return
        ws = new WebSocket(wsURL(ticket))
        ws.binaryType = 'arraybuffer'
        ws.onopen = () => {
          setStatus('open')
          fit.fit()
          sendResize()
          term.focus()
        }
        // 输出:WS 二进制帧 = shell 输出,直接写入终端。
        ws.onmessage = (ev) => {
          if (ev.data instanceof ArrayBuffer) term.write(new Uint8Array(ev.data))
          else if (typeof ev.data === 'string') term.write(ev.data)
        }
        ws.onclose = () => setStatus((s) => (s === 'error' ? s : 'closed'))
        ws.onerror = () => setStatus('error')
      } catch (e) {
        if (disposed) return
        setStatus('error')
        setErrText(e instanceof Error ? e.message.trim() : '连接失败')
      }
    })()

    return () => {
      disposed = true
      window.removeEventListener('resize', onWindowResize)
      dataSub.dispose()
      ws?.close()
      term.dispose()
    }
  }, [attempt])

  const badge =
    status === 'open' ? (
      <Badge status="online">已连接</Badge>
    ) : status === 'connecting' ? (
      <Badge status="warn">连接中</Badge>
    ) : status === 'error' ? (
      <Badge status="crit">连接错误</Badge>
    ) : (
      <Badge status="neutral">已断开</Badge>
    )

  const reconnectable = status === 'closed' || status === 'error'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {badge}
          {errText && <span className="text-xs text-crit">{errText}</span>}
        </div>
        {reconnectable && (
          <Button size="sm" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
            重连
          </Button>
        )}
      </div>
      <div
        ref={hostRef}
        className="h-[70vh] overflow-hidden rounded-(--radius-card) border border-border bg-[#0B0F14] p-2"
      />
    </div>
  )
}
