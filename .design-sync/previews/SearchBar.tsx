import { SearchBar } from 'xpanel-web'

// SearchBar floats absolute in a relative parent (VS Code-style find panel). The
// preview supplies that relative editor-like surface. view={null} is valid — the
// command effects no-op without a CodeMirror view, the UI renders fully.
const sample = `server {
  listen 443 ssl;
  server_name example.com;
  root /www/wwwroot/example.com;

  location / {
    try_files $uri $uri/ /index.php?$query_string;
  }
}`

export function FindReplace() {
  return (
    <div
      style={{
        position: 'relative',
        height: 200,
        background: '#0C1118',
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid var(--color-border)',
      }}
    >
      <pre
        style={{
          margin: 0,
          padding: 16,
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          lineHeight: 1.6,
          color: 'var(--color-muted)',
        }}
      >
        {sample}
      </pre>
      <SearchBar
        view={null}
        showReplace
        onToggleReplace={() => {}}
        onClose={() => {}}
        focusSignal={0}
      />
    </div>
  )
}
