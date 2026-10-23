# TavoloFlow

面向餐厅的堂食二维码点单 MVP：菜单/桌位、开桌与顾客验证、点单、厨房处理、线下收款确认与历史账单，以及平台建店和账号维护。ASP.NET Core 10 + EF Core + PostgreSQL 18；React / TypeScript + TanStack Router / Query。沿用九张业务表，不处理在线支付。

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

## 验证

```bash
dotnet test TavoloFlow.slnx
cd frontend
node --test --test-isolation=none tests/*.test.ts
npm run build
npm run lint
```

集成测试使用 Docker 临时 PostgreSQL，不访问开发库。浏览器验收使用独立 localhost 部署；命令及演练记录见 [第八阶段](docs/platform-pilot.md)。

## 学习与试运营

- [精简版 PRD](docs/tavoloflow_mvp_prd_11_simplified.md) · [数据模型](docs/er-diagram.dbml)
- [账号](docs/store-accounts.md) → [菜单](docs/menu-management.md) → [桌位和公开菜单](docs/tables-public-menu.md)
- [开桌与顾客授权](docs/dining-guest-access.md) → [购物车和下单](docs/cart-ordering.md) → [厨房](docs/kitchen-cancellation.md) → [结账与历史](docs/billing-history.md)
- [第八阶段的四个步骤及验证记录](docs/platform-pilot.md)
- [单机 Compose / Caddy 部署、备份恢复](deploy/README.md)
- [试运营手册及上线前填写事项](docs/pilot-operations.md)

本地部署模板使用独立项目和数据卷；不要将其配置、密码文件或备份提交到 Git。当前交付包括本地演练，没有执行公网部署或远端备份上传。
