# XPanel-Web

XPanel 的前端:暗色"遥测仪表台",登录后按已启用模块动态渲染侧栏与功能页。React + Vite + TypeScript + Tailwind CSS v4,全自研组件。

## 技术栈

React 18 · Vite 5 · TypeScript · Tailwind CSS v4(`@tailwindcss/vite`)· React Router 6 · recharts(懒加载)· @xterm/xterm(懒加载)· lucide-react · @fontsource(自托管字体)· Vitest + Testing Library + jsdom。

## 常用命令

```bash
npm run dev        # dev server,/api 代理到 127.0.0.1:8765(需后端在跑)
npm run build      # 生产构建到 dist/
npm run typecheck  # tsc --noEmit
npm test           # vitest run
```

## 项目结构

- `src/api/client.ts` — `apiFetch`:注入 Bearer + 401 单飞刷新;`types.ts` 后端 DTO 类型。
- `src/auth/` — `AuthContext`(login/2FA/logout)、`jwt.ts`(从 access JWT 解角色,仅 UI 门)、`ProtectedRoute`。
- `src/components/` — 自研组件套件(Button/Card/Switch/Stat/Sparkline/Input/Badge/IconButton/Spinner/ErrorBoundary)。
- `src/hooks/` — `usePoll`(轮询,`document.hidden` 暂停)、`useModules`(拉 `/api/modules`,暴露 all/enabled)。
- `src/layout/` — `AppShell` + `Sidebar`(动态导航)+ `TelemetryRail`(顶栏实时脉搏)+ `icons.tsx`(icon 名 → lucide 组件 map)。
- `src/pages/` — 每个模块一页;另有 `Login` / `Dashboard` / `Modules`。
- `src/styles/global.css` — 唯一全局样式 + `@theme` token。

## 架构约定

- 一个模块 = `src/pages/<Name>.tsx`,在 `src/App.tsx` 注册路由。
- 侧栏导航由 `/api/modules` 返回的每模块 `nav` 数组动态渲染(`Sidebar` + `useModules`),只显示 `enabled` 模块,按 `category` 分组;路由本身始终可达,导航才是动态的。
- 导航图标:后端给 kebab-case icon 名,`layout/icons.tsx` 的 `iconFor` 映射到 lucide 组件,未命中兜底 `Boxes`。
- 数据请求一律走 `apiFetch`(经 vite 代理打后端 `/api`),它强制 JSON 头并自动 `JSON.parse`。
- 危险操作(删库、重置等)请求带 `X-Confirm-Danger: 1` 头(各页定义 `const DANGER = { 'X-Confirm-Danger': '1' }`)。
- 角色仅用于 UI 门(如 `role === 'admin'`),真正鉴权在后端。

## 注意事项

- 不用重组件库:UI 全自研。样式只在 `global.css` + Tailwind utility class,暗色 token 来自 `@theme`(color-bg/surface/border/text/muted/brand/online/warn/crit、radius-card、font-display/sans/mono)。
- `text/plain` 端点(如 redis info)、二进制下载、multipart 上传用裸 `fetch`(自己加 Bearer),不走 `apiFetch`——否则强制 JSON 解析会抛错。
- 凭证类字段(密码、API Key、2FA secret)只写不回显:后端不返回明文,前端也不显示已存值。
- recharts 与 xterm 懒加载,不进首屏主包:`Dashboard` 的图表、`SiteMonitor` 整页、`Terminal` 的 xterm 视图均 `lazy(() => import(...))`;`vite.config.ts` 把 recharts 与 react 拆成独立 chunk。
- 401 单飞刷新:并发 401 共享同一刷新 promise,避免旋转 refresh token 被多次消费(见 `api/client.ts`)。
- 2FA 登录:启用 2FA 的用户首次不带 totp 调 login 会收到 `2fa_required`,带 totp 重试(`AuthContext` 的 `TwoFactorRequired`)。
- build target 锁 `es2022`(recharts 触发 esbuild 析构降级报错的绕过,见 `vite.config.ts` 注释),不要改回旧目标。

## 不要做的事

- 不引重 UI 库(禁 Ant Design / MUI 等)。
- 不在 `pages/` 之外散落业务逻辑;一个模块的页面逻辑收在它自己的页文件里。
- 不把大依赖(recharts / xterm)拉进首屏主包——保持懒加载。
- 不为单一调用方抽 interface / 工厂 / Options。
