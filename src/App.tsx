// 占位屏:验证设计 token 与 Google Fonts 是否生效。后续 Task 替换为路由表。
export default function App() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 bg-bg p-8 text-text">
      <span className="h-2 w-2 rounded-full bg-online" aria-hidden />
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-brand">
        XPanel
      </h1>
      <p className="font-[family-name:var(--font-sans)] text-muted">
        遥测仪表台 · 脚手架就绪
      </p>
      <code className="rounded-(--radius-card) border border-border bg-surface px-3 py-1.5 font-[family-name:var(--font-mono)] text-sm text-text">
        cpu 0.0% · mem 0.0 GiB
      </code>
    </main>
  )
}
