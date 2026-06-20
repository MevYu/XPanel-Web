## How to build with XPanel

XPanel is a **dark-theme** Linux ops / telemetry dashboard kit (aapanel / 1Panel style),
self-built on React + Tailwind CSS v4. **Components are context-free — there is no
provider or theme wrapper to mount.** Pull a component off `window.XPanel` and render it.

### 1. Set the dark surface first (required)
Every component uses light text (`var(--color-text)`) and expects the app's dark
background behind it. On a default white page the text is invisible. Put your UI inside a
root that establishes the surface:

```jsx
const { Card, Stat, Badge } = window.XPanel
<div style={{ background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-sans)' }}>
  …your screen…
</div>
```

All design tokens are CSS custom properties on `:root` (shipped via `styles.css`); there is
no JS theme object.

### 2. Styling idiom — Tailwind v4 utilities mapped to `@theme` tokens
Components come pre-styled. For your own layout glue use the same Tailwind v4 utility
vocabulary below (it resolves to the tokens). Reuse these names — never invent a parallel
palette, or the screen drifts off-brand.

- **Surfaces, low → high:** `bg-bg` · `bg-surface` · `bg-surface-2` · `bg-elevated`
- **Borders:** `border-border` · `border-border-strong`
- **Text, strong → faint:** `text-text` · `text-muted` · `text-faint`
- **Brand (indigo):** `text-brand` · `bg-brand` · `bg-brand-soft` (selected/active bg)
- **Status:** `online` (green) · `warn` (gold) · `crit` (red) — each as `text-*`, `bg-*`, and `bg-*-soft` (e.g. `bg-online-soft` + `text-online`)
- **Radii:** `rounded-(--radius-sm)` (6px) · `rounded-(--radius-card)` (8px)
- **Fonts:** `font-[family-name:var(--font-display)]` = Space Grotesk (headings/brand) · `--font-sans` = Inter (body) · `--font-mono` = JetBrains Mono (numbers, code, paths)

### 3. The components
- **Forms:** `Input` (label + `error`), `Switch`, `Button` (`variant` primary/ghost/danger × `size` sm/md), `IconButton` (needs `aria-label`)
- **Data:** `Table` (with `ActionLink` / `ActionLinks` for row actions), `Stat` (big mono read-out), `Sparkline`, `Badge` (`status` online/warn/crit/neutral)
- **Overlays:** `Modal`, `TabModal` (left icon-tab settings dialog) — both render `fixed inset-0`; mount one at a time
- **Shell / editor:** `Card`, `Logo`, `Spinner`, `CodeEditor` (CodeMirror), `FileTreeSidebar`, `SearchBar`

Before composing a component, read its bound `<Name>.d.ts` (the exact props) and
`<Name>.prompt.md` (usage). For the full token + utility list, read `styles.css` and the
`_ds_bundle.css` it imports — those are the source of truth, not this summary.

### 4. Idiomatic example
```jsx
const { Card, Stat, Badge, Button } = window.XPanel
<div style={{ background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-sans)', padding: 24 }}>
  <div className="flex flex-col gap-4">
    <Card>
      <div className="flex items-center justify-between">
        <Stat value="42%" label="CPU 使用率" />
        <Badge status="online">运行中</Badge>
      </div>
    </Card>
    <div className="flex justify-end gap-2">
      <Button variant="ghost">取消</Button>
      <Button variant="danger">删除站点</Button>
    </div>
  </div>
</div>
```
