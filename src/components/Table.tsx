import type { ReactNode } from 'react'

export interface Column<T> {
  /** 列标识,用作 React key。 */
  key: string
  header: ReactNode
  /** 单元格渲染。 */
  cell: (row: T) => ReactNode
  /** 列宽(CSS,如 '140px' / '20%'),省略则自适应。 */
  width?: string
  align?: 'left' | 'right' | 'center'
}

interface TableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  /** 空数据内联占位文案。 */
  emptyText?: ReactNode
}

const alignClass = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const

/** Table 紧凑数据表:dense 行(~38px)、小字号、内联空态。受控、通用,行操作建议用 ActionLink。 */
export function Table<T>({ columns, rows, rowKey, onRowClick, emptyText = '暂无数据' }: TableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-(--radius-card) border border-border bg-surface">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`h-10 whitespace-nowrap px-3 text-xs font-medium text-muted ${alignClass[c.align ?? 'left']}`}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="h-16 px-3 text-center text-[13px] text-muted">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-border/60 transition last:border-b-0 hover:bg-surface-2/60 ${
                  onRowClick ? 'cursor-pointer' : ''
                }`}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`h-[38px] px-3 align-middle text-text ${alignClass[c.align ?? 'left']}`}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

interface ActionLinkProps {
  onClick: () => void
  children: ReactNode
  danger?: boolean
  disabled?: boolean
  'aria-label'?: string
  title?: string
}

/** ActionLink 表格操作列文字链接:hover 强调色,danger 走危险色,`|` 分隔由 ActionLinks 提供。 */
export function ActionLink({ onClick, children, danger, disabled, ...rest }: ActionLinkProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`rounded-sm text-[13px] outline-none transition focus-visible:ring-2 focus-visible:ring-brand/60 disabled:cursor-not-allowed disabled:opacity-30 ${
        danger ? 'text-muted hover:text-crit' : 'text-muted hover:text-brand'
      }`}
      {...rest}
    >
      {children}
    </button>
  )
}

/** ActionLinks 把多个 ActionLink 用细竖线分隔横排。 */
export function ActionLinks({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 [&>*+*]:before:mr-2 [&>*+*]:before:text-border [&>*+*]:before:content-['|']">
      {children}
    </span>
  )
}
