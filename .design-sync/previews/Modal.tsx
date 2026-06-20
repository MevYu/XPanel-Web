import { Modal, Button } from 'xpanel-web'

// Overlay component (fixed inset-0). The wrapper's `transform` makes it the
// containing block for the modal's fixed positioning, so the open dialog renders
// inside this sized scene instead of escaping to the viewport (which collapses the
// measured card to blank). cardMode/viewport set in config.
export function ConfirmDelete() {
  return (
    <div
      style={{
        position: 'relative',
        width: 680,
        height: 500,
        transform: 'translateZ(0)',
        overflow: 'hidden',
        borderRadius: 8,
        background: 'var(--color-bg)',
      }}
    >
      <Modal title="删除站点" onClose={() => {}} size="sm">
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          确认删除 <strong>example.com</strong> 吗?此操作会移除站点配置与 Nginx vhost,
          网站根目录文件将保留。
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <Button variant="ghost">取消</Button>
          <Button variant="danger">确认删除</Button>
        </div>
      </Modal>
    </div>
  )
}
