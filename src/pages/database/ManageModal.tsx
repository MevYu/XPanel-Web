import { useEffect, useState } from 'react'
import { Play, TableProperties, Terminal } from 'lucide-react'
import { apiFetch } from '../../api/client'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import { type Engine, ENGINE_LABEL, errorText } from './shared'

// /query 可写,按危险操作要求带确认头(与删库/导入一致)。
const DANGER = { 'X-Confirm-Danger': '1' }
const PAGE = 50

interface TableInfo {
  name: string
  rows: number
}
interface RowsResp {
  columns: string[]
  rows: (string | null)[][]
  total: number
}
type QueryResp =
  | { columns: string[]; rows: (string | null)[][]; truncated: boolean }
  | { affected: number; message: string }

const inputCls =
  'h-9 w-full rounded-(--radius-sm) border border-border bg-surface-2/70 px-3 text-sm text-text outline-none transition-[border-color,box-shadow] duration-(--dur-micro) ease-(--ease-out) placeholder:text-faint hover:border-border-strong focus:border-brand focus:bg-surface-2'

/** ManageModal 原生数据管理:左表列表 → 右行浏览(分页) / SQL 查询执行。admin + 后端审计。 */
export function ManageModal({
  engine,
  database,
  onClose,
}: {
  engine: Engine
  database: string
  onClose: () => void
}) {
  const [tables, setTables] = useState<TableInfo[]>([])
  const [filter, setFilter] = useState('')
  const [tab, setTab] = useState<'data' | 'sql'>('data')
  const [active, setActive] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<RowsResp | null>(null)
  const [sql, setSql] = useState('')
  const [result, setResult] = useState<QueryResp | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    apiFetch<{ tables: TableInfo[] }>(
      `/api/m/database/${engine}/tables?database=${encodeURIComponent(database)}`,
    )
      .then((r) => {
        if (!alive) return
        setTables(r.tables ?? [])
        setActive(r.tables?.[0]?.name ?? null)
      })
      .catch((e) => alive && setErr(errorText(e)))
    return () => {
      alive = false
    }
  }, [engine, database])

  useEffect(() => {
    if (!active || tab !== 'data') return
    let alive = true
    setBusy(true)
    setErr(null)
    apiFetch<RowsResp>(
      `/api/m/database/${engine}/rows?database=${encodeURIComponent(database)}&table=${encodeURIComponent(active)}&limit=${PAGE}&offset=${offset}`,
    )
      .then((r) => alive && setData(r))
      .catch((e) => alive && setErr(errorText(e)))
      .finally(() => alive && setBusy(false))
    return () => {
      alive = false
    }
  }, [engine, database, active, offset, tab])

  function selectTable(name: string) {
    setActive(name)
    setOffset(0)
    setTab('data')
  }

  async function runSql() {
    if (!sql.trim() || busy) return
    setBusy(true)
    setErr(null)
    setResult(null)
    try {
      const r = await apiFetch<QueryResp>(`/api/m/database/${engine}/query`, {
        method: 'POST',
        headers: DANGER,
        body: JSON.stringify({ database, sql: sql.trim() }),
      })
      setResult(r)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const shown = filter
    ? tables.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()))
    : tables

  return (
    <Modal title={`数据管理 · ${database}`} size="lg" onClose={onClose}>
      <div className="flex h-full min-h-0 gap-3">
        {/* 左:表列表 + SQL 入口 */}
        <div className="flex w-48 shrink-0 flex-col gap-2 border-r border-border pr-3">
          <input
            className={inputCls}
            placeholder="筛选表…"
            value={filter}
            spellCheck={false}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {shown.map((t) => (
              <button
                key={t.name}
                onClick={() => selectTable(t.name)}
                className={`flex w-full items-center justify-between gap-2 rounded-(--radius-sm) px-2 py-1.5 text-left text-sm transition ${
                  active === t.name && tab === 'data'
                    ? 'bg-brand-soft text-text'
                    : 'text-muted hover:bg-surface-2'
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <TableProperties size={13} className="shrink-0 text-faint" />
                  <span className="truncate font-[family-name:var(--font-mono)]">{t.name}</span>
                </span>
                <span className="shrink-0 text-xs text-faint tabular-nums">{t.rows}</span>
              </button>
            ))}
            {shown.length === 0 && <p className="px-2 py-2 text-xs text-faint">无表</p>}
          </div>
          <button
            onClick={() => setTab('sql')}
            className={`flex items-center gap-1.5 rounded-(--radius-sm) px-2 py-1.5 text-sm transition ${
              tab === 'sql' ? 'bg-brand-soft text-text' : 'text-muted hover:bg-surface-2'
            }`}
          >
            <Terminal size={14} className="shrink-0" />
            SQL 查询
          </button>
          <p className="truncate text-[0.6875rem] text-faint">{ENGINE_LABEL[engine]}</p>
        </div>

        {/* 右:行浏览 / SQL 控制台 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {tab === 'data' ? (
            <DataView data={data} busy={busy} offset={offset} onPage={setOffset} table={active} />
          ) : (
            <SqlView sql={sql} setSql={setSql} run={runSql} busy={busy} result={result} />
          )}
          {err && <p className="shrink-0 text-sm text-crit">{err}</p>}
        </div>
      </div>
    </Modal>
  )
}

function DataView({
  data,
  busy,
  offset,
  onPage,
  table,
}: {
  data: RowsResp | null
  busy: boolean
  offset: number
  onPage: (o: number) => void
  table: string | null
}) {
  if (!table) return <Empty text="选择左侧一张表查看数据" />
  if (busy && !data) return <Centered><Spinner size={20} /></Centered>
  if (!data) return <Empty text="无数据" />
  const from = data.total === 0 ? 0 : offset + 1
  const to = Math.min(offset + data.rows.length, data.total)
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 text-xs text-muted">
        <span className="font-[family-name:var(--font-mono)] text-text">{table}</span>
        <span className="tabular-nums">
          {from}–{to} / {data.total}
        </span>
      </div>
      <ResultGrid columns={data.columns} rows={data.rows} />
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || offset === 0}
          onClick={() => onPage(Math.max(0, offset - PAGE))}
        >
          上一页
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || to >= data.total}
          onClick={() => onPage(offset + PAGE)}
        >
          下一页
        </Button>
      </div>
    </>
  )
}

function SqlView({
  sql,
  setSql,
  run,
  busy,
  result,
}: {
  sql: string
  setSql: (v: string) => void
  run: () => void
  busy: boolean
  result: QueryResp | null
}) {
  return (
    <>
      <textarea
        value={sql}
        spellCheck={false}
        placeholder="输入 SQL,Ctrl/⌘+Enter 执行"
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run()
        }}
        className="h-28 shrink-0 resize-none rounded-(--radius-sm) border border-border bg-surface-2/70 px-3 py-2 font-[family-name:var(--font-mono)] text-sm text-text outline-none focus:border-brand focus:bg-surface-2"
      />
      <div className="flex shrink-0 items-center gap-3">
        <Button size="sm" onClick={run} disabled={busy || !sql.trim()}>
          {busy ? <Spinner size={14} /> : <Play size={14} />}
          执行
        </Button>
        {result && 'affected' in result && (
          <span className="text-sm text-online">已执行 · {result.message}</span>
        )}
        {result && 'truncated' in result && result.truncated && (
          <span className="text-xs text-warn">结果超过 1000 行,已截断</span>
        )}
      </div>
      {result && 'columns' in result && <ResultGrid columns={result.columns} rows={result.rows} />}
    </>
  )
}

function ResultGrid({ columns, rows }: { columns: string[]; rows: (string | null)[][] }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-(--radius-sm) border border-border">
      <table className="w-full border-collapse text-[13px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th
                key={c}
                className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 last:border-b-0 hover:bg-surface-2/50">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="max-w-xs truncate px-3 py-1.5 align-top font-[family-name:var(--font-mono)] text-text"
                  title={cell ?? 'NULL'}
                >
                  {cell === null ? <span className="text-faint italic">NULL</span> : cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={Math.max(1, columns.length)} className="px-3 py-6 text-center text-muted">
                无结果
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <Centered><span className="text-sm text-muted">{text}</span></Centered>
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 items-center justify-center">{children}</div>
}
