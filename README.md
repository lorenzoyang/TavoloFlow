# Qiao TavoloFlow

对外产品名称为 **Qiao TavoloFlow**，业务系统正式地址为 `https://app.qiaotavoloflow.it`。
`https://qiaotavoloflow.it` 预留给独立 GitHub 仓库中的 Astro 官网，由 Cloudflare 托管；本仓库只部署业务系统到 netcup VPS。
技术项目名称仍为 **TavoloFlow**：仓库、目录、文件名、命名空间及内部标识沿用原名。

面向餐厅的堂食二维码点单 MVP：菜单/桌位、开桌与顾客验证、点单、厨房处理、线下收款确认与历史账单，以及平台建店和账号维护。ASP.NET Core 10 + EF Core + PostgreSQL 18；React / TypeScript + TanStack Router / Query。共十一张业务表，不处理在线支付。

顾客、店铺和平台界面均支持中文、意大利语和英语。店铺与平台共用本设备的语言选择；没有有效保存值时跟随浏览器语言，无法匹配则使用英语。顾客菜单按餐厅保存独立选择，首次使用餐厅默认语言。详见[界面语言规则](docs/architecture.md#75-界面语言与本机偏好)。

## 本地开发

```bash
cp .env.example .env
# 编辑数据库密码后启动；Compose 不会自动设置 API 连接串。
docker compose up -d db
dotnet tool restore
dotnet user-secrets set 'ConnectionStrings:Default' '<本地连接串>' --project backend/TavoloFlow.Api
dotnet ef database update --project backend/TavoloFlow.Api
dotnet run --project backend/TavoloFlow.Api --launch-profile http
```

另一个终端：

```bash
cd frontend
npm ci
npm run dev
```

账号初始化见 [店铺账号](docs/store-accounts.md) 和 [平台初始化](docs/platform-pilot.md)。入口：`/platform/login`、`/staff/login`、`/q/{token}`。Vite 代理 `/api` 到 5093。

Windows + WSL 环境下用手机扫码测试，见 [本地手机测试流程](docs/zh-CN/local-wsl-testing.md)。

## 正式域名配置

在 `frontend/` 中复制 `.env.production.example` 为 `.env.production`，然后运行 `npm run build`，
使新生成的二维码指向 `https://app.qiaotavoloflow.it/q/{token}`。顾客、店铺、平台及 `/api` 都在业务子域名下使用同源路径。
本地开发继续使用当前浏览器地址或局域网配置；配置步骤见 [前端说明](frontend/README.md)。

生产发布使用 `bash deploy/build-release.sh`，默认构建地址为 `https://app.qiaotavoloflow.it`。
自托管到其他业务域名时，在仓库根目录执行 `PUBLIC_ORIGIN=https://app.example.com bash deploy/build-release.sh`；
地址须为小写 HTTPS origin，不含端口、路径或末尾斜杠。服务器 `.env` 的 `DOMAIN` 须替换模板中的
`app.example.com`，与构建地址的主机名一致；安装器会核对发布包的 `public-origin.txt`。

首次上线请从 [netcup 中文部署教程](docs/zh-CN/deployment-guide.md) 开始：在 WSL 构建发布包，
部署到 VPS，由 Cloudflare 提供 DNS、Caddy 管理 HTTPS。生产模板和运维脚本位于 `deploy/`，与本地 Compose 分开。
域名仍在 OVHcloud 续费；委派到 Cloudflare 后添加灰云 `A app` 记录指向 VPS 即可，无需购买第二个域名。官网未上线也可以先部署业务系统。
店铺端可安装为应用（PWA），手机安装同样需要 HTTPS 正式地址，部署要求见 [PWA 说明](docs/pwa.md)。
已有纸质二维码保留旧地址，更换地址后需重新打印或为旧地址维护跳转。

## 验证

```bash
dotnet test TavoloFlow.slnx
cd frontend
node --test --test-isolation=none tests/*.test.ts
npm run build
npm run lint
npm run format:check
```

集成测试使用 Docker 临时 PostgreSQL，不访问开发库。

## 学习文档

- [架构说明与重构记录](docs/architecture.md)：分层、身份、锁顺序、数据流与设计取舍的总览，建议先读
- [精简版 PRD](docs/tavoloflow_mvp_prd_11_simplified.md) · [数据模型](docs/er-diagram.dbml)
- [账号](docs/store-accounts.md) → [菜单](docs/menu-management.md) → [桌位和公开菜单](docs/tables-public-menu.md)
- [开桌与顾客授权](docs/dining-guest-access.md) → [购物车和下单](docs/cart-ordering.md) → [厨房](docs/kitchen-cancellation.md) → [结账与历史](docs/billing-history.md)
- [平台管理](docs/platform-pilot.md) → [收费周期](docs/restaurant-subscriptions.md)
- [店铺端 PWA](docs/pwa.md)：安装到主屏幕、离线页、各平台差异与部署要求
- [netcup 部署教程](docs/zh-CN/deployment-guide.md)：首次上线、更新、备份与恢复
- [部署笔记](docs/zh-CN/deployment-notes.md)：做过什么、为什么这样做，以及日常维护备忘
- [部署验证与清理记录](docs/deployment-validation.md)：清理范围、验证命令与人工验收边界
- Documentazione in italiano: [note di sviluppo](docs/it/development-notes.md) · [guida al self-hosting](docs/it/self-hosting.md)
