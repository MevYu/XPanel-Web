# XPanel-Web

XPanel 的前端:登录、按已启用模块动态渲染的导航、系统总览(轮询指标 + 实时图)、模块管理、服务管理。暗色"遥测仪表台"视觉,全自研组件 + Tailwind CSS v4 token。

## 技术栈

React 18 · Vite 5 · TypeScript · Tailwind CSS v4(`@tailwindcss/vite`)· React Router 6 · recharts · lucide-react · Vitest + Testing Library + jsdom。

## 开发

```bash
npm install
npm run dev      # 启动 dev server;需后端在 http://127.0.0.1:8765 运行(Vite 代理 /api)
```

`npm run dev` 把 `/api` 代理到 `http://127.0.0.1:8765`(见 `vite.config.ts`)。后端未运行时,登录与所有数据请求都会失败。

## 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器(HMR + `/api` 代理) |
| `npm run build` | 生产构建到 `dist/` |
| `npm run preview` | 本地预览构建产物 |
| `npm test` | 运行 Vitest(`vitest run`) |
| `npm run typecheck` | TypeScript 类型检查(`tsc --noEmit`) |

## 结构

```
src/
├── api/        fetch 封装(token 注入、401 自动 refresh)+ 后端 DTO 类型
├── auth/       AuthContext、ProtectedRoute
├── components/ 自研组件套件(Button/Card/Switch/Stat/Sparkline/…)
├── hooks/      usePoll(可见性暂停的轮询)、useModules
├── layout/     AppShell + 动态 Sidebar + TelemetryRail(顶栏实时脉搏)
├── lib/        formatBytes 等工具
├── pages/      Login / Dashboard / Modules / Service
└── styles/     global.css(唯一全局样式 + @theme token)
```

## 路由

- `/login` — 公开。
- `/dashboard` · `/modules` · `/service` — 受 `ProtectedRoute` 保护,包在 `AppShell` 内。
- `/` 重定向到 `/dashboard`;未知路由回 `/dashboard`。

`/service` 仅在 service 模块已启用时出现在侧栏导航(由 `useModules` 动态控制),但路由始终可达。
