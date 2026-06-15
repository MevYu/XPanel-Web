import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppShell } from './layout/AppShell'
import Login from './pages/Login'

// 路由骨架:/login 公开;其余受保护并包在 AppShell 内。
// dashboard/modules/service 页面由后续 Task 实现,此处先用占位元素。
function Placeholder({ name }: { name: string }) {
  return <p className="text-muted">{name} · 待实现</p>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Placeholder name="系统总览" />} />
          <Route path="/modules" element={<Placeholder name="模块管理" />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
