import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

/** ProtectedRoute 未登录时重定向到 /login,否则渲染子路由。 */
export function ProtectedRoute() {
  const { isAuthed } = useAuth()
  return isAuthed ? <Outlet /> : <Navigate to="/login" replace />
}
