# Qiao TavoloFlow 前端

产品名称为 **Qiao TavoloFlow**，技术项目名称仍为 **TavoloFlow**，现有文件名与内部标识保持不变。

React 19 + TypeScript + Vite，路由与数据请求使用 TanStack Router / Query，界面组件基于 shadcn（Base UI，base-nova）。

## 常用命令

- `npm install`：安装依赖。
- `npm run dev`：启动开发服务器（http://localhost:5173），`/api` 代理到 http://localhost:5093。
- `npm run build`：生成路由树、构建，并做 TypeScript 检查。
- `npm run lint`、`npm run format`：Oxlint 检查与 Prettier 格式化。
- `node --test --test-isolation=none tests/*.test.ts`：运行纯逻辑单元测试（需 Node 24）。

## 正式域名与二维码

正式主地址为 `https://qiaotavoloflow.it`。在本目录准备生产构建：

```bash
cp .env.production.example .env.production
npm run build
```

示例包含 `VITE_PUBLIC_BASE_URL=https://qiaotavoloflow.it`，只控制生成的公开菜单链接和二维码。
该值在构建时写入前端产物，修改后需要重新构建；`.env.production` 不提交到 Git。
顾客 `/q/{token}`、店铺 `/staff/*`、平台 `/platform/*` 和 `/api` 沿用同源路径。

开发模式不读取 `.env.production`；未配置时使用当前浏览器 origin，手机访问可在 `.env.local`
设置局域网地址，见 [桌位与公开菜单说明](../docs/tables-public-menu.md)。
已有纸质二维码仍指向旧地址，更换地址后需重新打印或维护旧地址跳转。
服务器部署、HTTPS 和 OVHcloud DNS 接入在上线时配置。

## 目录

- `src/routes/`：文件路由，只负责 URL 和搜索参数。
- `src/features/<模块>/`：`api.ts` 放请求、查询 key 和类型；`state.ts` 放纯逻辑，有单元测试；`use*.ts` 负责轮询与恢复；`*Page.tsx` / `*Views.tsx` 负责界面。
- `src/components/ui/`：shadcn 生成的基础组件。
- `src/components/`：全站共用的页面组件，包括页头、提示、确认对话框、主从视图、筛选标签和空状态。
- `src/lib/`：HTTP 请求、格式化、语言和共享 hook。

界面约定（配色语义、控件尺寸、导航、主从视图、确认方式、PWA 预备）见仓库根目录 `AGENTS.md` 的 “UI Conventions”，以及 `docs/architecture.md` 第 7 节。
