interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  className?: string
}

/** Sparkline 迷你折线:SVG polyline,brand 色,无坐标轴。数据点不足 2 个时不渲染线。 */
export function Sparkline({
  data,
  width = 120,
  height = 32,
  className = '',
}: SparklineProps) {
  const pad = 2
  const points = toPoints(data, width, height, pad)
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-hidden
      className={className}
    >
      {points && (
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
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
