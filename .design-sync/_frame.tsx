import type { ReactNode, CSSProperties } from 'react'

// Preview-only backdrop. XPanel is a dark-theme DS — components use light text
// (var(--color-text)) on the app's dark body (var(--color-bg)). The preview card
// body is white by default, so dark-theme components render illegibly without this.
// Not a DS export and not a provider: components need no context, this is just the
// page surface they assume. Discovery ignores it (no matching component name).
export function Frame({
  children,
  style,
}: {
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        fontFamily: 'var(--font-sans)',
        padding: 24,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
