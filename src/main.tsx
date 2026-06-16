import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import App from './App'
// 自托管字体,替代 index.html 的 Google Fonts link。字重对齐设计:标题 / 正文 / 数据。
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import './styles/global.css'

// 隐藏入口:后端在它服务的 index.html 注入 window.__XPANEL_BASE__="<entry_path>",
// 让面板挂在 /<entry_path>/ 下。dev(vite,无注入)为空,行为不变。
const basename = (window as { __XPANEL_BASE__?: string }).__XPANEL_BASE__ || ''

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
