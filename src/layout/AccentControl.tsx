import { useEffect, useState } from 'react'

// 口重色预设(对标设计稿 data-accent)。indigo 为基础 token,无需覆盖。
const ACCENTS = [
  { key: 'indigo', color: '#6E8BFF' },
  { key: 'emerald', color: '#3FB57F' },
  { key: 'cyan', color: '#2BB6C4' },
  { key: 'violet', color: '#9A7BFF' },
] as const
type Accent = (typeof ACCENTS)[number]['key']
const KEY = 'xpanel.accent'

/** useAccent 读/写口重色,写到 document.documentElement 的 data-accent(覆盖 brand token),持久化到 localStorage。 */
export function useAccent() {
  const [accent, setAccent] = useState<Accent>(
    () => (localStorage.getItem(KEY) as Accent) || 'indigo',
  )
  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent)
    localStorage.setItem(KEY, accent)
  }, [accent])
  return { accent, setAccent }
}

/** AccentControl 四色口重色切换点。 */
export function AccentControl() {
  const { accent, setAccent } = useAccent()
  return (
    <div className="flex items-center gap-1.5" title="主题色">
      {ACCENTS.map((a) => (
        <button
          key={a.key}
          type="button"
          aria-label={a.key}
          aria-pressed={accent === a.key}
          onClick={() => setAccent(a.key)}
          className={`h-3.5 w-3.5 rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-white/60 ${
            accent === a.key ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-bg' : 'opacity-70 hover:opacity-100'
          }`}
          style={{ background: a.color }}
        />
      ))}
    </div>
  )
}
