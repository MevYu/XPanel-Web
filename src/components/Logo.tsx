interface LogoProps {
  size?: number
  className?: string
}

// XPanel 品牌标:抽象 X 由两道遥测信号轨交叉构成,中心脉冲节点 + 四角机架挂点,
// 靛蓝渐变在暗底高对比;纯矢量、单 viewBox,小尺寸也清晰。
export function Logo({ size = 28, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="XPanel"
      className={className}
    >
      <defs>
        <linearGradient id="xpanel-logo-stroke" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9DB0FF" />
          <stop offset="1" stopColor="#6E8BFF" />
        </linearGradient>
        <radialGradient id="xpanel-logo-core" cx="0.5" cy="0.5" r="0.5">
          <stop stopColor="#C7D2FF" />
          <stop offset="1" stopColor="#6E8BFF" />
        </radialGradient>
      </defs>

      {/* 机架边框:圆角方,暗底容器 */}
      <rect
        x="2.5"
        y="2.5"
        width="27"
        height="27"
        rx="7.5"
        fill="#121822"
        stroke="url(#xpanel-logo-stroke)"
        strokeOpacity="0.35"
        strokeWidth="1"
      />

      {/* X 左下→右上信号轨,中心断开让脉冲穿过 */}
      <path
        d="M8 24L13 18.5M19 13.5L24 8"
        stroke="url(#xpanel-logo-stroke)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* X 左上→右下信号轨 */}
      <path
        d="M8 8L13 13.5M19 18.5L24 24"
        stroke="url(#xpanel-logo-stroke)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      {/* 四角机架挂点 */}
      <circle cx="8" cy="8" r="1.5" fill="#6E8BFF" fillOpacity="0.55" />
      <circle cx="24" cy="8" r="1.5" fill="#6E8BFF" fillOpacity="0.55" />
      <circle cx="8" cy="24" r="1.5" fill="#6E8BFF" fillOpacity="0.55" />
      <circle cx="24" cy="24" r="1.5" fill="#6E8BFF" fillOpacity="0.55" />

      {/* 中心脉冲节点 */}
      <circle cx="16" cy="16" r="3.4" fill="url(#xpanel-logo-core)" />
      <circle cx="16" cy="16" r="3.4" stroke="#0B0F14" strokeWidth="1" />
    </svg>
  )
}
