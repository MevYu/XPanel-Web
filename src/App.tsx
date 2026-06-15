import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppShell } from './layout/AppShell'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Modules from './pages/Modules'
import Service from './pages/Service'
import Terminal from './pages/Terminal'
import Files from './pages/Files'
import Cron from './pages/Cron'
import Firewall from './pages/Firewall'

// 路由表:/login 公开;其余受保护并包在 AppShell 内,未知路由回 /dashboard。
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/modules" element={<Modules />} />
          <Route path="/service" element={<Service />} />
          <Route path="/terminal" element={<Terminal />} />
          <Route path="/files" element={<Files />} />
          <Route path="/cron" element={<Cron />} />
          <Route path="/firewall" element={<Firewall />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
