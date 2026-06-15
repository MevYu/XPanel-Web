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
import Database from './pages/Database'
import Docker from './pages/Docker'
import AppStore from './pages/AppStore'
import Supervisor from './pages/Supervisor'
import Sites from './pages/Sites'
import Ssl from './pages/Ssl'
import Php from './pages/Php'
import Nodejs from './pages/Nodejs'
import Python from './pages/Python'
import Users from './pages/Users'
import Security from './pages/Security'
import Waf from './pages/Waf'
import Malscan from './pages/Malscan'
import Antitamper from './pages/Antitamper'
import Ftp from './pages/Ftp'
import Backup from './pages/Backup'
import Dns from './pages/Dns'
import Alert from './pages/Alert'

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
          <Route path="/database" element={<Database />} />
          <Route path="/docker" element={<Docker />} />
          <Route path="/appstore" element={<AppStore />} />
          <Route path="/supervisor" element={<Supervisor />} />
          <Route path="/sites" element={<Sites />} />
          <Route path="/ssl" element={<Ssl />} />
          <Route path="/php" element={<Php />} />
          <Route path="/nodejs" element={<Nodejs />} />
          <Route path="/python" element={<Python />} />
          <Route path="/users" element={<Users />} />
          <Route path="/security" element={<Security />} />
          <Route path="/waf" element={<Waf />} />
          <Route path="/malscan" element={<Malscan />} />
          <Route path="/antitamper" element={<Antitamper />} />
          <Route path="/ftp" element={<Ftp />} />
          <Route path="/backup" element={<Backup />} />
          <Route path="/dns" element={<Dns />} />
          <Route path="/alert" element={<Alert />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
