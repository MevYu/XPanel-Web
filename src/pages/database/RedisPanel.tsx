import { useCallback, useState } from 'react'
import { apiFetch } from '../../api/client'
import { Button } from '../../components/Button'
import { Badge } from '../../components/Badge'
import { Spinner } from '../../components/Spinner'
import { RotateCw, Trash2 } from 'lucide-react'
import { DANGER, errorText, fetchText } from './shared'

/** RedisPanel Redis 面板:连接/内存详情指标 + 常用配置 + INFO 原文,支持 flushdb(危险)。 */
export function RedisPanel() {
  const [info, setInfo] = useState<string | null>(null)
  const [dbsize, setDbsize] = useState<number | null>(null)
  const [details, setDetails] = useState<Record<string, string> | null>(null)
  const [config, setConfig] = useState<Record<string, string> | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const [i, s, d, c] = await Promise.all([
        fetchText('/api/m/database/redis/info'),
        apiFetch<{ dbsize: number }>('/api/m/database/redis/dbsize'),
        apiFetch<{ details: Record<string, string> }>('/api/m/database/redis/details'),
        apiFetch<{ config: Record<string, string> }>('/api/m/database/redis/config'),
      ])
      setInfo(i)
      setDbsize(s.dbsize)
      setDetails(d.details ?? {})
      setConfig(c.config ?? {})
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setLoading(false)
    }
  }, [])

  async function flush() {
    if (!window.confirm('确认清空当前 Redis 数据库?此操作不可恢复。')) return
    setBusy(true)
    setFeedback(null)
    try {
      await apiFetch('/api/m/database/redis/flushdb', { method: 'POST', headers: DANGER })
      setFeedback({ kind: 'ok', text: '已清空当前库' })
      await load()
    } catch (e) {
      setFeedback({ kind: 'err', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-text">Redis</h3>
          {dbsize !== null && <Badge status="neutral">{dbsize} keys</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            <RotateCw size={14} />
            查询 info
          </Button>
          <Button size="sm" variant="danger" onClick={() => void flush()} disabled={busy}>
            <Trash2 size={14} />
            flushdb
          </Button>
        </div>
      </div>

      {feedback && (
        <p className={`text-sm ${feedback.kind === 'ok' ? 'text-online' : 'text-crit'}`}>{feedback.text}</p>
      )}

      {loading ? (
        <div className="flex h-24 items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : info !== null ? (
        <div className="flex flex-col gap-4">
          {details && Object.keys(details).length > 0 && (
            <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(details).map(([k, v]) => (
                <div key={k} className="flex flex-col rounded-(--radius-card) border border-border bg-surface-2 px-3 py-2">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="truncate font-[family-name:var(--font-mono)] text-sm text-text">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {config && Object.keys(config).length > 0 && (
            <div className="rounded-(--radius-card) border border-border bg-surface">
              <div className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted">
                配置
              </div>
              <dl className="divide-y divide-border/60">
                {Object.entries(config).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 px-4 py-2">
                    <dt className="font-[family-name:var(--font-mono)] text-xs text-muted">{k}</dt>
                    <dd className="truncate font-[family-name:var(--font-mono)] text-sm text-text">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <pre className="max-h-96 overflow-auto rounded-(--radius-card) border border-border bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-text whitespace-pre-wrap">
            {info.trim() || '无输出'}
          </pre>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 rounded-(--radius-card) border border-border bg-surface py-10">
          <span className="text-sm font-medium text-text">尚未加载 Redis 信息</span>
          <span className="text-xs text-muted">点击「查询 info」获取连接、内存与配置详情。</span>
        </div>
      )}
    </div>
  )
}
