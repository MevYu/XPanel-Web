import { useId, useState, type ReactNode } from 'react'

export type Level = 'ok' | 'warn' | 'crit'

// 利用率阈值 → 配色等级:>92% 危急、>80% 警告、其余正常。
export function levelFor(pct: number): Level {
  if (pct > 92) return 'crit'
  if (pct > 80) return 'warn'
  return 'ok'
}

export const levelText: Record<Level, string> = {
  ok: 'text-text',
  warn: 'text-warn',
  crit: 'text-crit',
}

export const levelStroke: Record<Level, string> = {
  ok: 'var(--color-brand)',
  warn: 'var(--color-warn)',
  crit: 'var(--color-crit)',
}

// 每等级的辉光底色,hover 时增强。
const levelGlow: Record<Level, string> = {
  ok: 'rgba(110, 139, 255, 0.45)',
  warn: 'rgba(232, 179, 57, 0.45)',
  crit: 'rgba(229, 72, 77, 0.45)',
}

// clampPct 夹紧 [0,100]:后端可能上报 used>total,避免环超过整圈或文字 >100%。
export const clampPct = (pct: number) => Math.min(100, Math.max(0, pct))

interface GaugeProps {
  /** 环填充百分比 [0,100],决定颜色等级与弧长。 */
  pct: number
  /** 中心大号读数(已格式化的字符串)。 */
  reading: string
  /** 读数后缀单位,如 %。 */
  unit?: string
  /** 环下方小标签。 */
  label: string
  /** hover/focus 时就地展开的细节内容;无则不展开。 */
  detail?: ReactNode
  /** 环直径(px),默认 164(对齐 aaPanel 大号超细环);紧凑排布传 ~100。 */
  size?: number
}

/** Gauge 圆形状态球:SVG 环按百分比填充 + 阈值染色 + 柔和辉光,hover/focus 放大并显出细节面板。 */
export function Gauge({ pct, reading, unit, label, detail, size = 164 }: GaugeProps) {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const level = levelFor(pct)
  const clamped = clampPct(pct)

  // 大环描边 7px;小环略增厚保持可见。读数字号随直径缩放。
  const compact = size < 120
  const stroke = compact ? 6 : 7
  const readingClass = compact ? 'text-xl' : 'text-[2.6rem]'
  const unitClass = compact ? 'text-xs' : 'text-lg'

  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - clamped / 100)
  const color = levelStroke[level]

  const expanded = open && !!detail

  return (
    <div
      className="group relative flex flex-col items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`${label} ${reading}${unit ?? ''}`}
        aria-expanded={detail ? expanded : undefined}
        aria-describedby={expanded ? titleId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={[
          'relative flex flex-col items-center rounded-full p-2 outline-none',
          compact ? 'gap-2' : 'gap-4',
          'transition-transform duration-(--dur-base) ease-(--ease-out)',
          'motion-safe:group-hover:scale-[1.05] motion-safe:focus-visible:scale-[1.05]',
          'focus-visible:ring-2 focus-visible:ring-brand/60',
        ].join(' ')}
      >
        <div className="relative" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90"
            aria-hidden
            style={{
              filter: `drop-shadow(0 0 0 ${levelGlow[level]})`,
              transition: 'filter var(--dur-base) var(--ease-out)',
            }}
          >
            {/* 轨道环 */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="var(--color-surface-2)"
              strokeWidth={stroke}
            />
            {/* 进度环:阈值染色 + 平滑过渡,hover 增强辉光 */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700 motion-safe:ease-(--ease-out)"
              style={{
                filter: `drop-shadow(0 0 4px ${levelGlow[level]})`,
              }}
            />
          </svg>
          {/* 中心读数 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className={`font-[family-name:var(--font-mono)] ${readingClass} font-bold tabular-nums tracking-tight`}
            >
              <span className={levelText[level]}>{reading}</span>
              {unit && <span className={`${unitClass} text-muted`}>{unit}</span>}
            </span>
          </div>
        </div>
        <span className="text-xs uppercase tracking-wider text-muted">{label}</span>
      </button>

      {/* hover/focus 细节面板:绝对定位悬浮于球下方,不挤压布局 */}
      {detail && (
        <div
          id={titleId}
          role="tooltip"
          className={[
            'pointer-events-none absolute left-1/2 top-full z-20 mt-1 w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2',
            'rounded-(--radius-card) border border-border-strong bg-elevated p-4',
            'shadow-[var(--shadow-elevated),var(--inset-hl)]',
            'origin-top transition-[opacity,transform] duration-(--dur-base) ease-(--ease-out)',
            expanded
              ? 'opacity-100 motion-safe:translate-y-0 motion-safe:scale-100'
              : 'opacity-0 motion-safe:-translate-y-1 motion-safe:scale-95',
          ].join(' ')}
          aria-hidden={!expanded}
        >
          {detail}
        </div>
      )}
    </div>
  )
}

/** GaugeDetailRow 细节面板内的标签 + mono 读数行。 */
export function GaugeDetailRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: Level
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="lowercase tracking-wide text-muted">{label}</span>
      <span
        className={`font-[family-name:var(--font-mono)] tabular-nums ${
          tone ? levelText[tone] : 'text-text'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

/** MiniBar 细节面板内的迷你利用率条(每核占用用)。 */
export function MiniBar({ pct }: { pct: number }) {
  const level = levelFor(pct)
  return (
    <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
      <div
        className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500"
        style={{ width: `${clampPct(pct)}%`, background: levelStroke[level] }}
      />
    </div>
  )
}
