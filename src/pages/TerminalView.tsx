import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { RotateCw, Eraser, TerminalSquare } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import { apiFetch } from '../api/client'
import { Button } from '../components/Button'

type Status = 'connecting' | 'open' | 'closed' | 'error'

// 暗色终端主题:背景比页面略深、品牌色光标、与 token 协调的 16 色 ANSI 表。
const THEME = {
  background: '#0A0E13',
  foreground: '#E6EDF3',
  cursor: '#6E8BFF',
  cursorAccent: '#0A0E13',
  selectionBackground: 'rgba(110, 139, 255, 0.30)',
  black: '#1A222E',
  red: '#E5484D',
  green: '#3FB57F',
  yellow: '#E8B339',
  blue: '#6E8BFF',
  magenta: '#C586E0',
  cyan: '#56C7D6',
  white: '#C4CCD8',
  brightBlack: '#5A6675',
  brightRed: '#FF6B70',
  brightGreen: '#5BD49C',
  brightYellow: '#FFD166',
  brightBlue: '#93A8FF',
  brightMagenta: '#D9A6F0',
  brightCyan: '#7FDDEA',
  brightWhite: '#E6EDF3',
}

function wsURL(ticket: string): string {
  const base = location.origin.replace(/^http/, 'ws')
  return `${base}/api/m/terminal/ws?ticket=${encodeURIComponent(ticket)}`
}

const STATUS_META: Record<Status, { label: string; dot: string; text: string }> = {
  connecting: { label: '连接中', dot: 'bg-warn', text: 'text-warn' },
  open: { label: '已连接', dot: 'bg-online', text: 'text-online' },
  closed: { label: '已断开', dot: 'bg-muted', text: 'text-muted' },
  error: { label: '连接错误', dot: 'bg-crit', text: 'text-crit' },
}

/**
 * TerminalView 懒加载组件:换票 → 连 WS → xterm ⇄ WS 双向桥接。
 * xterm 实例与监听器在 effect 内创建,卸载/重连时整组销毁,避免句柄泄漏。
 */
export default function TerminalView() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<XTerm | null>(null)
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
      cursorStyle: 'bar',
      fontFamily: 'var(--font-mono), ui-monospace, monospace',
      fontSize: 13,
      lineHeight: 1.35,
      letterSpacing: 0.3,
      scrollback: 5000,
      allowProposedApi: true,
      theme: THEME,
    })
    termRef.current = term
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()

    const sendResize = () => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', rows: term.rows, cols: term.cols }))
      }
    }
    const refit = () => {
      try {
        fit.fit()
      } catch {
        // 容器尚无尺寸(隐藏/卸载途中)时 fit 抛错,忽略。
        return
      }
      sendResize()
    }
    // 容器尺寸变化(全高布局 + 窗口缩放 + 侧栏抽屉)统一走 ResizeObserver,比 window resize 更准。
    const ro = new ResizeObserver(refit)
    ro.observe(host)

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
          refit()
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
      ro.disconnect()
      dataSub.dispose()
      ws?.close()
      term.dispose()
      termRef.current = null
    }
  }, [attempt])

  const meta = STATUS_META[status]
  const reconnectable = status === 'closed' || status === 'error'

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-(--radius-card) border border-border bg-[#0A0E13] shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_18px_40px_-24px_rgba(0,0,0,0.8)]">
      {/* 顶部状态栏:标题 + 连接状态 + 操作 */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {/* macOS 风格灯位,纯装饰 */}
          <span className="flex items-center gap-1.5 pr-1" aria-hidden>
            <span className="h-3 w-3 rounded-full bg-crit/80" />
            <span className="h-3 w-3 rounded-full bg-warn/80" />
            <span className="h-3 w-3 rounded-full bg-online/80" />
          </span>
          <TerminalSquare size={15} className="shrink-0 text-muted" aria-hidden />
          <span className="truncate font-[family-name:var(--font-mono)] text-sm text-text">
            主机终端
          </span>
        </div>

        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-medium">
          <span
            className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${
              status === 'connecting' ? 'motion-safe:animate-pulse' : ''
            }`}
            aria-hidden
          />
          <span className={meta.text}>{meta.label}</span>
        </span>

        <div className="flex items-center gap-1.5">
          {reconnectable && (
            <Button size="sm" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
              <RotateCw size={14} aria-hidden />
              重连
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => termRef.current?.clear()}
            disabled={status !== 'open'}
            title="清屏"
          >
            <Eraser size={14} aria-hidden />
            清屏
          </Button>
        </div>
      </div>

      {errText && (
        <div className="shrink-0 border-b border-border bg-crit/10 px-3 py-1.5 text-xs text-crit">
          {errText}
        </div>
      )}

      {/* 终端主体:占满剩余高度,内边距给文字留呼吸空间 */}
      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden px-3 py-2" />
    </div>
  )
}
