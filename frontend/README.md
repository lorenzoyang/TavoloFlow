# Qiao TavoloFlow 前端

产品名称为 **Qiao TavoloFlow**，技术项目名称仍为 **TavoloFlow**，现有文件名与内部标识保持不变。

React 19 + TypeScript + Vite，路由与数据请求使用 TanStack Router / Query，界面组件基于 shadcn（Base UI，base-nova）。

## 常用命令

- `npm install`：安装依赖。
- `npm run dev`：启动开发服务器（http://localhost:5173），`/api` 代理到 http://localhost:5093。
- `npm run build`：生成路由树、构建，并做 TypeScript 检查。
- `npm run lint`、`npm run format`：Oxlint 检查与 Prettier 格式化。
- `node --test --test-isolation=none tests/*.test.ts`：运行纯逻辑单元测试（需 Node 24）。

## 界面语言

店铺 `/staff/*` 和平台 `/platform/*` 均支持中文、意大利语、英语，共用 `localStorage` 中的
`tavoloflow:staff-language`。有效保存值优先；否则按 `navigator.languages` 顺序匹配语言主标签，
无匹配时使用英语。切换入口位于店铺登录/首次改密页、首页账号卡片和平台页头，退出不清除选择。
顾客 `/q/{token}` 按餐厅保存独立偏好，首次使用餐厅默认语言。

统一类型为 `lib/language.ts` 的 `Language`，每个功能通过三语文案字典提供界面文字。
共享组件默认读取店铺/平台语言，顾客调用时显式传入自己的标签。错误码翻译、格式化及完整开发约定见
仓库根目录 [`AGENTS.md`](../AGENTS.md#ui-conventions) 的 “UI Conventions”。

## 正式域名与二维码

业务系统正式地址为 `https://app.qiaotavoloflow.it`。根域名留给独立仓库、独立部署的 Astro 官网。
在本目录准备生产构建：

```bash
cp .env.production.example .env.production
npm run build
```

示例包含 `VITE_PUBLIC_BASE_URL=https://app.qiaotavoloflow.it`，只控制生成的公开菜单链接和二维码。
该值在构建时写入前端产物，修改后需要重新构建；`.env.production` 不提交到 Git。
顾客 `/q/{token}`、店铺 `/staff/*`、平台 `/platform/*` 和 `/api` 都位于业务子域名，继续使用同源路径。
业务根路径 `/` 仍跳转到 `/staff`；Cookie 限定于业务主机，无需与官网共享 Cookie 或配置跨域 API。

开发模式不读取 `.env.production`；未配置时使用当前浏览器 origin，手机访问可在 `.env.local`
设置局域网地址，见 [桌位与公开菜单说明](../docs/tables-public-menu.md)。
手机扫码测试及 Windows + WSL 的转发、防火墙步骤见 [本地运行指南第 4 部分（意大利语）](../docs/it/local-development.md#parte-4-provare-dal-telefono)。
已有纸质二维码仍指向旧地址，更换地址后需重新打印或维护旧地址跳转。
生产发布使用根目录 `deploy/build-release.sh` 在 Docker 中构建，不读取本机环境文件。
默认 `PUBLIC_ORIGIN=https://app.qiaotavoloflow.it`；其他业务域名需在仓库根目录显式传入：

```bash
PUBLIC_ORIGIN=https://app.example.com bash deploy/build-release.sh
```

`PUBLIC_ORIGIN` 必须为小写 HTTPS origin，不含端口、路径或末尾斜杠；它同时写入前端的
`VITE_PUBLIC_BASE_URL` 和发布包的 `public-origin.txt`。服务器生产 `.env` 的 `DOMAIN` 须替换
模板中的 `app.example.com`，并满足 `https://` 加 `DOMAIN` 与该文件一致，否则安装停止。
后续每次发布到自定义域名都要传入同一个 `PUBLIC_ORIGIN`，改服务器配置不会重写已构建的二维码地址。
完整流程见 [自托管指南（意大利语）](../docs/it/self-hosting.md)。

## 安装为应用（PWA）

正式安装入口为 `https://app.qiaotavoloflow.it/staff`，可安装到主屏幕或桌面，安装需要 HTTPS 或 localhost。开发模式不注册 service worker，
请用 `npm run build && npm run preview`（http://localhost:4173）测试安装和离线页。见 [PWA 说明](../docs/pwa.md)。

## 目录

- `src/routes/`：文件路由，只负责 URL 和搜索参数。
- `src/features/<模块>/`：`api.ts` 放请求、查询 key 和类型；`state.ts` 放纯逻辑，有单元测试；`use*.ts` 负责轮询与恢复；`*Page.tsx` / `*Views.tsx` 负责界面。
- `src/components/ui/`：shadcn 生成的基础组件。
- `src/components/`：全站共用的页面组件，包括页头、提示、确认对话框、主从视图、筛选标签、加载状态、空状态和品牌标识。
- `src/lib/`：HTTP 请求、格式化、语言和共享 hook。
- `public/`：favicon、店铺端 manifest、service worker 和应用图标。

界面约定（配色语义、控件尺寸、导航、主从视图、确认方式、PWA）见仓库根目录 `AGENTS.md` 的 “UI Conventions”，以及 [开发笔记（意大利语）](../docs/it/development-notes.md#frontend-organizzazione-delle-feature)。
