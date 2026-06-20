// design-sync bundle entry — re-exports the XPanel component suite so the
// converter assigns each to window.XPanel.<Name>. The repo is a Vite app, not a
// published library, so this barrel stands in for a dist entry. Keep in sync
// with componentSrcMap in .design-sync/config.json.
export { Badge } from '../src/components/Badge'
export { Button } from '../src/components/Button'
export { Card } from '../src/components/Card'
export { IconButton } from '../src/components/IconButton'
export { Input } from '../src/components/Input'
export { Logo } from '../src/components/Logo'
export { Modal } from '../src/components/Modal'
export { Sparkline } from '../src/components/Sparkline'
export { Spinner } from '../src/components/Spinner'
export { Stat } from '../src/components/Stat'
export { Switch } from '../src/components/Switch'
export { TabModal } from '../src/components/TabModal'
export { Table, ActionLink, ActionLinks } from '../src/components/Table'
export { FileTreeSidebar } from '../src/components/editor/FileTreeSidebar'
export { SearchBar } from '../src/components/editor/SearchBar'
export { CodeEditor } from '../src/components/CodeEditor'
