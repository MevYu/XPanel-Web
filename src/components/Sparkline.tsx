import { useId } from 'react'

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  className?: string
}

/** Sparkline 迷你折线:SVG polyline + 线下品牌渐变填充,无坐标轴。数据点不足 2 个时不渲染。 */
export function Sparkline({
  data,
  width = 120,
  height = 32,
  className = '',
}: SparklineProps) {
  const fillId = useId()
  const pad = 2
  const line = toPoints(data, width, height, pad)
  // 折线两端落到底边围成闭合区,作渐变填充。
  const area = line ? `${pad},${height - pad} ${line} ${width - pad},${height - pad}` : null
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-hidden
      className={className}
    >
      {line && (
        <>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area!} fill={`url(#${fillId})`} stroke="none" />
          <polyline
            points={line}
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  )
}

function toPoints(
  data: number[],
  width: number,
  height: number,
  pad: number,
): string | null {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const innerW = width - pad * 2
  const innerH = height - pad * 2
  return data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * innerW
      const y = pad + (1 - (v - min) / span) * innerH
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}
