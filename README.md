# XPanel-Web

XPanel 的前端:一块暗色"遥测仪表台"。登录(含 2FA)后按已启用模块动态渲染侧栏导航,顶栏跑实时遥测脉搏,每个模块一页功能。React + Vite + TypeScript + Tailwind CSS v4,全自研组件(无重组件库),字体自托管。

## 技术栈

React 18 · Vite 5 · TypeScript · Tailwind CSS v4(`@tailwindcss/vite`,`@theme` token)· React Router 6 · recharts(图表,懒加载)· @xterm/xterm(Web 终端,懒加载)· lucide-react(图标)· @fontsource(Inter / Space Grotesk / JetBrains Mono,自托管)· Vitest + Testing Library + jsdom。

## 开发

```bash
npm install
npm run dev        # 启动 dev server;需后端在 http://127.0.0.1:8765 运行
npm run build      # 生产构建到 dist/
npm run typecheck  # tsc --noEmit
npm test           # vitest run
npm run preview    # 本地预览构建产物
```

`npm run dev` 把 `/api` 代理到 `http://127.0.0.1:8765`(见 `vite.config.ts`)。后端未运行时,登录与所有数据请求都会失败。

## 部署

前端仓库本身不单独部署。生产时由 XPanel-Go 后端用 `go:embed` 把 `dist/` 打进单二进制:见后端 `scripts/build-release.sh`(`npm ci && npm run build` 后把 `dist/` 拷到 `XPanel-Go/web/dist`)。

## 特性

- 登录,支持 2FA(TOTP):启用 2FA 的用户先提交账密拿到 `2fa_required` 后再带验证码重试。
- 侧栏导航按后端 `/api/modules` 返回的 nav 动态渲染,只显示已启用模块,按 category 分组。
- 顶栏实时遥测条(TelemetryRail):轮询 `/api/m/dashboard/metrics`,`document.hidden` 时自动暂停。
- 各模块独立功能页(站点 / 数据库 / Docker / 防火墙 / SSL / 文件 / 计划任务 / 终端 等约 30 个)。
- `apiFetch` 自动注入 Bearer;401 时单飞刷新一次 token 并重试,刷新失败清登录态并跳登录页。

## 结构

```
src/
├── api/        client(apiFetch:token 注入 + 401 单飞刷新)+ types(后端 DTO)
├── auth/       AuthContext(登录/2FA/登出)、jwt(解角色)、ProtectedRoute
├── components/ 自研组件(Button/Card/Switch/Stat/Sparkline/Input/Badge/…)
├── hooks/      usePoll(可见性暂停的轮询)、useModules(拉 /api/modules)
├── layout/     AppShell + 动态 Sidebar + TelemetryRail + icons(lucide map)
├── lib/        format(formatBytes 等)
├── pages/      每个模块一页 + Login / Dashboard / Modules
└── styles/     global.css(唯一全局样式 + @theme token + 暗色调色板)
```

路由表在 `src/App.tsx`:`/login` 公开;其余受 `ProtectedRoute` 保护并包在 `AppShell` 内,`/` 重定向到 `/dashboard`,未知路由回 `/dashboard`。
