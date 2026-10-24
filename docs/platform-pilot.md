# 第八阶段：平台管理与试运营准备

后续新增的餐厅联系方式、收费周期和线下年费见 [收费周期](restaurant-subscriptions.md)。当前数据库共十张表；下文试运营验收数据保留其执行时的历史版本。

## 第一步：平台初始化与身份

平台是独立于店铺和顾客的身份。先显式迁移数据库，再通过本地 user-secrets 或部署秘密配置设置
`PlatformBootstrap:Username`、`PlatformBootstrap:Password`（6–128 字符，允许六位纯数字，不能全部为空白）。
执行 `dotnet run --project backend/TavoloFlow.Api --launch-profile http -- --seed-platform-admin`。
它只创建首个平台管理员，完成后退出；再次执行不会覆盖密码或改变启用状态。
恢复密码使用单独的 `--reset-platform-password`，必须匹配已有用户名；这会使旧票据失效，但不会启用已禁用账号。
两条命令可在生产使用，不提供匿名 HTTP 初始化入口。密码配置不写入 Git、不放命令行参数。

从 `/platform/login` 登录。请求链路为：表单 → 平台 CSRF → 登录接口 → PasswordHasher → Platform Cookie。
平台与 Store 均使用固定 30 天的持久 Cookie，关闭浏览器后保留登录，不滑动续期；Guest 仍使用固定 12 小时的浏览器会话 Cookie。
已有票据按原签发期限到期，重新登录或成功改密后签发新的 30 天票据。
每次平台请求检查当前数据库状态和凭据版本；平台身份不具有店铺账单权限。
三个入口共享 CSRF 设施，但 token 额外绑定 store/platform/guest 用途，即使尚未登录也不能混用。

练习：在同一浏览器分别登录店铺和平台，检查 Network 中的 `/me` 和 Cookie Path；
在第二浏览器登录平台，然后从第一浏览器改密，观察第二浏览器下次请求被拒绝。
阅读 `PlatformAuthentication`、`PlatformAccountService`、`PlatformAuthController`，区分认证、权限和凭据失效。

## 第二步：建店、服务启停与账号恢复

平台餐厅列表支持名称包含筛选、ACTIVE/SUSPENDED 筛选和页码分页（每页默认 20，最多 100）。
创建餐厅要求名称、默认菜单语言及两个不同的登录名。客户端发送创建前保存的餐厅 UUID；
数据库把餐厅和 OWNER/STAFF 放在一个事务中创建。用户名冲突不会留下半家餐厅。
EUR/Europe/Rome 为本版创建默认值，默认语言后续仍由 OWNER 的既有设置接口管理。

临时密码由服务器生成，仅在建店/重置成功时返回一次。查询只返回账号状态及供并发检查的凭据版本。
前端直接调用写接口，把秘密仅留在当次组件内存；不用 Query/Mutation 缓存存储密码。
隐藏页面、离开页面、改变身份或关闭展示后清除。复制内容的剪贴板由操作者负责及时清理。

服务停用在餐厅行锁内关闭接单，与开桌和下单协调。恢复 ACTIVE 不自动开启接单。
服务停用不禁用账号，不关闭用餐，厨房和结账仍可继续。OWNER 可在 `/staff/settings` 重置本店 STAFF。
重置不改变账号启用状态；禁用或重新启用账号会在实际变更时增加凭据版本，使旧票据失效。

未知结果只 GET 核对。建店未查到时不能证明旧请求不会到达，人工再次创建必须使用原餐厅 UUID。
账号重置的迟到请求受预期凭据版本保护，不能覆盖较新凭据。
核对后若无法取得临时密码，必须再次人工确认重置；不会从数据库恢复明文密码。
管理界面使用 `ACCOUNT_CHANGED` 表示目标账号冲突，不会把当前 OWNER/平台管理员误退出。

练习：创建两家店，在店 A 的 OWNER 页面尝试指定店 B 员工；观察接口拒绝额外字段。
分别在两个平台窗口重置同一账号，观察过时版本被拒绝。
拦截建店/重置成功响应，再刷新页面，观察 Network 只有 GET 恢复。

## 第三步：部署、健康检查与备份恢复

先阅读 [部署说明](../deploy/README.md)，再按“空卷 → 数据库 → migration bundle → 管理员初始化 → API/Caddy”的顺序执行。每一步都有独立退出结果；迁移失败时不启动业务服务。根目录开发 Compose 保持原用途。

请求链路：浏览器 HTTPS → Caddy 静态页面或 `/api` → 受信代理转发头 → Browser 认证选择器 → 授权和 CSRF → 业务服务 → PostgreSQL。Caddy 的固定 IP 不在动态分配池内；API 根据实际 HTTPS 签发 Secure Cookie，按转发后的来源 IP 限流，未知代理提供的头不生效。

API 以 UID 1654 运行，只有运行时数据库 DML 权限。迁移镜像拥有更高权限并显式执行。Data Protection 的应用用途沿用前七阶段，密钥目录挂持久卷；数据库备份与密钥必须一起保存，只有数据库无法解密已有入桌码。

`live` 表示 HTTP 进程存活，`ready` 表示可连接数据库且没有待执行迁移。不要把 readiness 误解为已验证餐厅业务配置、证书续期或备份可恢复。管理事件记录操作者/目标 ID 和状态，不记录密码、Cookie、入桌码或请求正文，也不把这些日志称为完整持久化审计。

练习：从头创建隔离 Compose 项目，分别观察未迁移/已迁移时的 readiness；重建 API 后在同一浏览器重新查看同一活动用餐的入桌码。然后备份到新目录，恢复到另一个项目，对比订单快照和 CLOSED 金额，验证恢复后服务仍暂停。再次向已存在的目标恢复应在写入前失败。

## 第四步：浏览器验收与试运营

先运行本地独立部署，再从 `frontend/` 执行：

```bash
npx playwright install --with-deps chromium
PILOT_ISOLATED=1 \
PILOT_BASE_URL=https://localhost:8443 \
PILOT_ADMIN_PASSWORD_FILE=../deploy/secrets-local/platform-password \
npm run test:e2e
```

这是明确写入演练数据的命令，不在开发库或生产库运行。测试配置拒绝非 localhost 地址；默认只有一个 worker、没有自动重试。首次登录从 secret 文件读取平台密码，随机店铺临时密码只留在进程/组件内存；测试关闭 trace、video 和自动失败截图。测试本身使用可识别的演练账号，并将它们的改后密码固定为测试数据，不能用于真实账号。菜单和桌位通过真实授权 API 准备，其余关键流程通过页面操作；测试不会证明所有菜单编辑 UI 已经覆盖。

两个浏览器用例覆盖：

1. 桌面平台建店、启用服务、OWNER/STAFF 首次改密；两店访问隔离；同一浏览器 Platform/Store/Guest 共存及跨作用域 CSRF 拒绝；扫码验证、下单、停用服务后厨房完成、OWNER 结账和历史详情；OWNER 页面重置员工密码。
2. 390px 移动端模拟建店与重置响应丢失，确认不会自动再次 POST，恢复只 GET；取得最新版本后人工重置；临时密码关闭、隐藏、导航后清除；检查横向溢出和 Enter 键确认入口。

浏览器测试会保留一轮空的 ACTIVE 用餐供密钥恢复演练，不能将演练账号/数据当作真实开业配置。正式试运营流程与待填写联系方式、数据保存约定见 [试运营手册](pilot-operations.md)。

### 本地验证记录（2026-10-23）

以下是当日版本的实际验收记录，保留原有规则和测试数量，不代表后续 30 天登录及收费周期功能已完成同样的部署演练。

| 检查 | 实际结果 |
|---|---|
| .NET 完整回归 | 216 通过，0 失败；真实临时 PostgreSQL，涵盖平台初始化/认证、版本冲突、启停、授权及两种锁先后顺序 |
| Node 纯逻辑 | 47 通过，0 失败；包括平台缓存隔离、最小待确认记录及目标版本核对 |
| 前端 build / lint | 通过；路由树由 Vite 自动生成，E2E 文件纳入 TypeScript 检查 |
| Playwright Chromium | 2 个验收用例通过；1440px 桌面与 390px 移动端，截图见下方 |
| Compose 空卷演练 | `tavoloflow-pilot` 独立项目完成构建、4 个既有迁移、平台管理员初始化、HTTPS 健康检查；无新迁移 |
| 数据库权限 / 容器 | API UID 1654；运行时账号不能在 public schema CREATE；仅 Caddy 发布端口 |
| API 重建 | `--force-recreate api` 后，原 Store 票据仍有效，同一活动用餐的解密码一致 |
| 备份 / 隔离恢复 | 自定义格式 dump + 密钥归档 + SHA256 校验；恢复到 `tavoloflow-restore` 新卷成功，重复恢复被拒绝 |
| 恢复数据核对 | 九张业务表逐表摘要一致，排除预期的服务暂停与凭据版本变化；账号和所有菜单/桌位/用餐/订单快照均匹配 |
| 恢复金额 / 密钥 | 备份时 6 家演练餐厅、12 个店铺账号、1 个平台账号、2 轮用餐、1 个订单和 1 行快照；CLOSED 合计 1250 分。恢复 key ring 解出与原环境相同的活动码；输出日志不含码值 |
| 恢复隔离 | 全部餐厅 SUSPENDED、接单关闭，Store/Platform 版本统一 +1；只在 localhost 8444 启动验证，没有恢复生产接单 |
| Shell / diff | 脚本语法检查与 `git diff --check` 通过 |

演练中发现并修复 Caddy 静态 IP 可能被动态分配占用的问题；密码认证部署关闭不需要的 GSS 加密协商，避免精简容器缺少 Kerberos 库的噪声。浏览器环境原先缺少共享库和中文字库，演练将它们解包到 `/tmp` 使用，没有更改 WSL 系统包。最终截图使用完整中文字库。

依赖安装时 `npm audit` 报告现有 shadcn 构建工具链的 7 项 high 记录，链路为 braces / micromatch / fast-glob / ts-morph；报告给出的自动修复会将 shadcn 跨大版本降到 1.0.0。本阶段没有执行强制降级。前端只引用其 Tailwind 样式，部署镜像只带构建后的静态文件，相关 Node CLI 不进入 Caddy 运行层；这仍属于正式发布前需要跟踪的构建依赖问题，不能将本次验收描述为“依赖漏洞为零”。没有远程部署、生产恢复或离机上传记录。验收结束后停止了 `tavoloflow-restore` 的容器，保留其卷与本地备份；`tavoloflow-pilot` 保持运行供查看。

### 实际页面截图

截图只含演练数据，不含临时密码和入桌码。

- [桌面餐厅管理](screenshots/platform-pilot/desktop-restaurant.png)
- [移动端餐厅管理](screenshots/platform-pilot/mobile-restaurant.png)
- [顾客下单结果](screenshots/platform-pilot/desktop-guest-order.png)
- [历史账单](screenshots/platform-pilot/desktop-history.png)
- [OWNER 员工账号设置](screenshots/platform-pilot/desktop-staff-settings.png)

建议按四步阅读各自改动，每步先画出身份与请求链路，再运行一项手动实验。重点理解：为何“恢复餐厅服务”不自动接单，为什么凭据版本不能证明哪次未知请求成功，以及为什么恢复数据库时必须同时核对密钥、旧凭据和线下收款。
