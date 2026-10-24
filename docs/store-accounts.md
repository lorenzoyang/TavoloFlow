# 店铺账号模块

本阶段提供 OWNER / STAFF 的登录闭环，使用现有九张表，没有新增迁移。
页面先使用中文。平台建店、平台账号恢复和 OWNER 员工密码重置已在 [第八阶段](platform-pilot.md) 实现；顾客入桌授权已在
[第四阶段](dining-guest-access.md) 通过独立 Guest 认证方案接入。

## 1. 先理解四个阶段

1. **初始化账号**：迁移创建表结构；初始化命令向表中写入开发餐厅和两个账号。两者分别执行。
2. **后端认证**：Controller 接收 DTO，账号服务校验密码；认证 Cookie 由框架签发，浏览器自动携带。
3. **页面联调**：React 调用 `/me` 恢复身份，按首次改密标记跳转；权限最终由后端执行。
4. **验证**：真实 PostgreSQL 测试约束和并发，浏览器验证 Cookie、表单、页面跳转及断网反馈。

建议按以下顺序阅读代码：

| 位置 | 学习重点 |
| --- | --- |
| `backend/TavoloFlow.Api/Accounts/DevelopmentAccountSeeder.cs` | 显式命令、配置、密码哈希、事务与重复执行 |
| `backend/TavoloFlow.Api/Controllers/AuthController.cs` | HTTP 输入输出、状态码、账号服务调用 |
| `backend/TavoloFlow.Api/Accounts/AccountService.cs` | 密码校验、带版本条件的原子更新 |
| `backend/TavoloFlow.Api/Accounts/StoreAuthentication.cs` | Cookie 内容、每次请求核对数据库、当前账号 |
| `backend/TavoloFlow.Api/Accounts/AccountSecurity.cs` | 首次改密权限策略；CSRF 验证与身份作用域在 `Common/BrowserSecurity.cs` |
| `frontend/src/routes/` | 文件名与 URL、父布局、搜索参数 |
| `frontend/src/router.tsx` | 使用自动生成的路由树创建 Router |
| `frontend/src/features/accounts/` | 独立页面、身份边界、文案、请求和查询缓存 |
| `frontend/src/components/ui/` | 按现有 shadcn 配置生成的基础组件 |

## 2. 本地运行

先按 [数据层说明](data-layer.md) 启动 PostgreSQL，配置
`ConnectionStrings:Default`，并显式执行：

```bash
dotnet ef database update --project backend/TavoloFlow.Api
```

通过 user-secrets 提供初始化配置。下面密码仅为占位符，执行前替换为自己的值，
不要把实际密码写入源码、提交记录或共享终端输出。

```bash
dotnet user-secrets set 'DevelopmentSeed:RestaurantId' 'cd5328d4-883c-40ce-9f96-0cb3a5cf1b83' --project backend/TavoloFlow.Api
dotnet user-secrets set 'DevelopmentSeed:RestaurantName' 'TavoloFlow 开发餐厅' --project backend/TavoloFlow.Api
dotnet user-secrets set 'DevelopmentSeed:Owner:Username' 'dev.owner' --project backend/TavoloFlow.Api
dotnet user-secrets set 'DevelopmentSeed:Owner:Password' '<YOUR_OWNER_PASSWORD>' --project backend/TavoloFlow.Api
dotnet user-secrets set 'DevelopmentSeed:Staff:Username' 'dev.staff' --project backend/TavoloFlow.Api
dotnet user-secrets set 'DevelopmentSeed:Staff:Password' '<YOUR_STAFF_PASSWORD>' --project backend/TavoloFlow.Api
dotnet run --project backend/TavoloFlow.Api --launch-profile http -- --seed-dev-accounts
```

也可使用对应的环境变量，例如 `DevelopmentSeed__Owner__Password`。
密码需 6–128 个字符且不能全部为空白，允许六位纯数字。用户名去首尾空白并转小写，最多 50 字符，
OWNER 和 STAFF 用户名必须不同。

初始化命令在 Development 之外拒绝执行，成功后退出，不启动 HTTP 服务。
它不自动迁移数据库，也不提供 HTTP 初始化入口。新餐厅默认停用、关闭接单；
账号仍可登录完成配置。

重复使用相同餐厅 ID、名称和两个账号归属执行时保持已有数据不变，包括改过的密码、
首次改密标记、凭据版本和餐厅服务状态。账号冲突、餐厅名称不一致或仅存在部分账号时
报错，不覆盖或补写未知数据。数据库写入失败会回滚整次初始化。

分别在两个终端启动：

```bash
# 仓库根目录
dotnet run --project backend/TavoloFlow.Api --launch-profile http
```

```bash
cd frontend
npm run dev
```

打开 `http://localhost:5173/staff/login`。Vite 将 `/api` 代理至
`http://localhost:5093`，浏览器始终使用同一站点。端口占用时 Vite 明确失败，
避免悄悄切换到不同端口。HTTP 开发模式只用于本机联调。

首次用初始化密码登录会进入改密页面，完成后进入账号页。再次运行初始化命令不会重置密码。

## 3. 一次登录请求如何工作

```mermaid
sequenceDiagram
    participant B as 浏览器
    participant A as ASP.NET Core
    participant D as PostgreSQL
    B->>A: GET /api/auth/csrf
    A-->>B: CSRF Cookie + 请求 token
    B->>A: POST /api/auth/login + X-CSRF-TOKEN
    A->>D: 查询规范化用户名
    A->>A: PasswordHasher 验证密码
    A-->>B: HttpOnly 登录 Cookie + 当前身份
    B->>A: GET /api/auth/me（自动携带 Cookie）
    A->>D: 核对账号启用状态、归属、角色、凭据版本
    A-->>B: 当前身份与首次改密标记
```

密码哈希用于验证输入是否正确，不用于还原原密码。登录 Cookie 包含受保护的账号、
角色、餐厅和凭据版本信息；每次请求都检查数据库，不能仅凭 Cookie 内的旧内容授权。
前端不读取认证 Cookie，也不把密码或身份凭据写入 localStorage/sessionStorage。

## 4. 接口和安全边界

| 接口 | 请求 / 成功响应 |
| --- | --- |
| `GET /api/auth/csrf` | `{ token }`；匿名也可调用 |
| `POST /api/auth/login` | `{ username, password }` → 当前身份 |
| `GET /api/auth/me` | 当前身份；未登录为 `401` |
| `POST /api/auth/change-password` | `{ currentPassword, newPassword }` → 当前身份及新 Cookie |
| `POST /api/auth/logout` | 无业务字段 → `204`；已失效凭据可返回 `401`，页面视为已退出 |

当前身份仅包含 `userId`、`username`、`role`（`OWNER` / `STAFF`）、
`restaurantId`、`restaurantName` 和 `mustChangePassword`。

所有 Controller 写请求都验证 `X-CSRF-TOKEN`，包括登录。前端每次写请求前获取新 token，
身份变化后再次获取；token 只在请求期间保留在内存。登录、改密和退出不自动重试。
认证响应均为 `Cache-Control: no-store`。

错误结构为 `{ code, message, requestId, errors? }`：

| 状态 / code | 行为 |
| --- | --- |
| `400 VALIDATION_FAILED` | 校验字段；不写数据库 |
| `400 CURRENT_PASSWORD_INCORRECT` / `PASSWORD_UNCHANGED` | 修正改密输入 |
| `400 CSRF_VALIDATION_FAILED` | 再次提交时获取新 token |
| `401 INVALID_CREDENTIALS` | 统一提示用户名或密码错误，不区分不存在、禁用或密码错误 |
| `401 UNAUTHENTICATED` | 清理私有缓存，进入登录页 |
| `403 PASSWORD_CHANGE_REQUIRED` | 进入首次改密页 |
| `403 FORBIDDEN` | 不允许该角色执行操作 |
| `409 CREDENTIALS_CHANGED` | 凭据已被另一请求改变，重新登录 |
| `429 RATE_LIMITED` | 根据 `Retry-After` 等待后重试 |
| 网络异常 / `5xx` | 结果可能未知，重新核对身份；不自动重发写操作 |

认证方案名为 `Store`，Cookie 名为 `TavoloFlow.Store`。使用 `HttpOnly`、`SameSite=Lax`，
不设置 Domain；生产固定 `Secure`，Development 随请求协议设置。
Cookie 持久保存到固定的 30 天到期时间，关闭浏览器后仍保留登录，不滑动续期。
已有票据仍按签发时的期限到期；重新登录后才获得新的 30 天期限。

改密在同一 SQL UPDATE 中修改哈希、清除 `must_change_password` 并递增
`credential_version`，WHERE 条件包含当前账号、餐厅、角色、启用状态和预期版本。
两个设备按同一版本改密至多一个成功。成功请求签发新的 30 天持久票据，
其他旧票据下一次请求被拒绝。

退出只删除当前浏览器 Cookie，不改变凭据版本，也不强制退出其他浏览器。
没有独立设备会话表，不能承诺服务端撤销单台设备或使被复制的退出前票据立即失效。

后续业务使用 `StoreStaff` / `StoreOwner` 策略及 `CurrentAccount` 的可信餐厅归属。
默认及兜底策略要求完成首次改密，OWNER 满足 STAFF 权限。`StoreAccount` 只用于
`/me`、改密和退出等自助账号功能，不能用它放行普通业务。
顾客使用独立 Guest 方案，平台使用独立 Platform 方案；三个身份可同时存在，CSRF 用途与缓存分别隔离。平台同样使用固定 30 天的持久票据，不滑动续期，不具有店铺业务权限；Guest 仍为固定 12 小时的会话 Cookie。

登录默认限制每来源 IP 30 次/分钟、每规范化用户名 10 次/5 分钟；
改密默认每账号 5 次/分钟。计数包含成功和失败尝试，不永久锁定账号。
配置项位于 `AccountRateLimits`：
`LoginPerIpPerMinute`、`LoginPerUsernamePerFiveMinutes`、`PasswordChangesPerMinute`。
限制为单实例内存状态，重启后重置，部署多实例时需要共享或边缘限制。

Data Protection 应用名固定为 `TavoloFlow`。开发使用框架的用户密钥目录；
生产通过 `DataProtection:KeyRingPath` 指定持久目录并限制文件访问。
密钥不写入仓库，重启后保留，容器部署应挂载持久卷。
生产保留 HTTPS 跳转，并采用框架默认的回环代理信任范围处理
`X-Forwarded-For` / `X-Forwarded-Proto`；Caddy 不在本机回环地址时，
应显式配置可信代理地址，不能信任任意转发头。

## 5. 前端结构与请求链路

### 第一步：通过路由文件找到页面

路由使用 TanStack 文件式约定，入口位于 `frontend/src/routes/`：

| 文件 | 职责 |
| --- | --- |
| `__root.tsx` | 根出口和页面不存在提示，不绑定店铺卡片布局 |
| `index.tsx` | `/` 跳转 `/staff` |
| `staff.tsx` | 店铺父路由，通过 `StaffLayout` 提供品牌、背景和宽内容区域 |
| `staff.index.tsx` | `/staff` 账号页，校验 `passwordChanged` 搜索参数 |
| `staff.login.tsx` | `/staff/login` 登录页 |
| `staff.change-password.tsx` | `/staff/change-password` 首次或主动改密 |
| `staff.menu.tsx` | `/staff/menu` 菜单管理，共用店铺布局与身份边界 |

文件名中的点表示父子关系，`index` 表示父路径的首页。`/staff` 的父布局和账号首页
分开，菜单页面共享店铺布局，而不继承账号页面的卡片宽度。
路由内部的首页标识为 `/staff/`，公开链接仍使用 `/staff`；Router 配置不保留尾部斜线。

Vite 插件在开发和构建时生成 `frontend/src/routeTree.gen.ts`，并自动按路由拆分代码。
这个文件需要随路由改动提交，但不能手工修改，也不参与 lint。插件放在 React 插件前。
`npm run build` 先执行 `vite build` 生成路由，再执行 `tsc -b` 检查类型，
因此首次构建不依赖之前启动过开发服务器；任一步失败，整个构建都失败。

### 第二步：跟踪页面中的身份与请求

三个页面分别放在 `LoginPage.tsx`、`ChangePasswordPage.tsx` 和 `AccountPage.tsx`。
路由只连接页面和 URL，身份仍由共享的 `AuthBoundary` 判断：

```mermaid
flowchart TD
    R[路由文件] --> P[账号页面]
    P --> B[AuthBoundary]
    B --> Q[accountQuery / GET /api/auth/me]
    Q --> L[未登录：登录页]
    Q --> C[首次改密：改密页]
    Q --> A[有效身份：显示当前页面]
    P --> F[提交表单]
    F --> API[features/accounts/api.ts → lib/api.ts：CSRF 后发送 POST]
    API --> S[replaceAccount：替换身份并清理私有缓存]
    S --> B
```

`features/accounts/queries.ts` 管理共享身份查询与缓存清理，全局 `QueryClient` 及默认 mutation 设置位于 `lib/query-client.ts`；
`features/accounts/api.ts` 保留账号 DTO 和账号接口函数，通用请求、CSRF、认证失败回调
及错误转换已提取到 `frontend/src/lib/api.ts`，供菜单复用。通用错误保留 `errors` 和
`requestId`；通用文案位于 `lib/api-messages.ts`。路由没有额外的身份 loader，也没有另一份登录状态。
账号查询的网络错误显示重试，不当作退出。首次离线加载身份时显示连接提示；
已有身份而查询暂停或后台身份查询网络失败时保留页面及表单，失败时提供重试；
实际 401 仍清理私有查询并返回登录页。

登录、改密、退出继续使用 `retry: false` 和 `networkMode: "always"`，断网不会排队
等联网后自动重发。身份变化后查询缓存仍按原有方式取消和清理。

### 第三步：理解页面与基础组件的分工

- `AccountLayout.tsx` 提供店铺布局和账号卡片。登录、改密卡片最大宽度为 `max-w-md`，
  账号卡片为 `max-w-2xl`；未来业务页面可以选择自己的宽度。
- `PasswordInput.tsx` 组合 Input、Field 和 Button，负责密码显示、自动填充属性、
  标签、说明与字段错误的关联，不保存密码到浏览器存储。
- `AccountFeedback.tsx` 提供请求错误和核对身份入口；`LogoutButton.tsx` 封装退出反馈。
- 基础 UI 使用现有 `base-nova / neutral` 配置生成的 Card、Input、Field、Alert、Badge
  和 Button；Field 所需的 Label、Separator 也由 CLI 一并添加。配色使用主题变量，
  默认浅色，不另建页面专用配色。
- 所有账号表单输入框、操作按钮和密码切换按钮至少 44px 高。字段错误用 FieldError，
  请求错误用 Alert，加载和成功结果提供状态播报。密码不一致时聚焦确认输入框。
- 页面导航保留 Link 的链接语义，通过 `button-variants.ts` 共用按钮样式。
  样式工具与组件导出分离，避免 Fast Refresh 警告；`Route` 导出例外只作用于路由目录。

上述账号页面阶段没有更换后端接口、当时的 16 小时登录规则或 CSRF 流程，也没有新增表单库、侧栏和业务菜单。后续认证调整已将 Store/Platform 改为固定 30 天的持久登录，当前规则以第 4 节为准。

## 6. 验证与学习实验

```bash
dotnet test TavoloFlow.slnx
```

```bash
cd frontend
npm run build
npm run lint
```

后端测试通过临时 PostgreSQL 和 `WebApplicationFactory` 验证，不访问开发数据库。
权限探测 Controller 只在测试宿主注册，生产 API 不包含测试接口。
时间测试推进可控制时钟，不实际等待 30 天；同时验证期限内请求不会滑动续期。

可在浏览器亲自做以下实验：

1. 未登录直接打开 `/staff`，观察跳转以及 Network 中 `/me` 的 `401`。
2. 用初始密码登录，直接输入 `/staff`，确认仍要求先改密。
3. 改密后刷新页面，确认账号继续有效。
4. 用普通窗口和无痕窗口同时登录，再在其中一个窗口改密；另一个窗口刷新后要求重新登录。
5. 同时登录两个窗口，仅退出其中一个，另一个仍可使用。
6. 在开发者工具模拟断网后退出或改密，观察“结果待确认”；恢复网络后点击“重新核对登录状态”。
7. 检查 Application 面板：认证 Cookie 为 HttpOnly，localStorage/sessionStorage 中没有账号密码或票据。

2026-10-20 验证记录：

- 后端 65 项测试全部通过，包括原有 43 项数据层测试及新增 22 项账号/初始化测试。
- 前端 build 通过；lint 无错误，保留现有按钮组件的一条 Fast Refresh 警告。
- Chromium 使用独立的临时 PostgreSQL 完成上述流程，并验证服务端已经保存改密但响应丢失时不自动重试。
- 验证过程中发现并关闭 TanStack Query 默认的离线 mutation 暂停/恢复行为；
  账号写操作使用 `networkMode: "always"` 和 `retry: false`，断网立即显示反馈，不在联网后自动重放。
- 临时数据库和开发服务器在验收后清理；用户开发数据库及账号未被初始化或修改。

2026-10-21 前端改造验收：

- 文件式路由与 shadcn 组件改造完成；删除预生成路由文件后执行 `npm run build`，
  路由自动重建且 TypeScript 检查通过。`npm run lint` 无错误、无警告。
- Chromium 在隔离 PostgreSQL 上完成 OWNER / STAFF 登录、首次与主动改密、刷新、
  双会话旧凭据失效、退出隔离和缺失 CSRF token 检查；改密响应丢失时没有自动重试。
- 补充验证 `/` 跳转、三个地址直接访问与刷新、前进后退、`passwordChanged` 参数和
  未知路径；身份加载时没有展示私有内容，身份查询失败可重试。
- 360px 手机布局没有横向溢出，控件高度至少 44px；键盘切换焦点、密码显示、自动填充、
  字段错误关联与聚焦均通过检查。浏览器没有运行时异常。
- 登录、改密和退出的断网反馈通过，恢复联网不自动重发 POST。验收发现并修复了
  已有身份查询暂停时遮挡操作结果提示的问题。
- 五张截图为本次统一主题后的界面。临时容器与服务器已清理，开发数据库未被修改。
  本次未修改后端源码，未重复运行后端测试套件；上方 65 项记录属于前一阶段。

页面截图：[桌面登录](screenshots/store-login-desktop.png)、
[手机登录](screenshots/store-login-mobile.png)、
[手机首次改密](screenshots/store-first-password-mobile.png)、
[桌面账号](screenshots/store-account-desktop.png)、
[手机账号](screenshots/store-account-mobile.png)。

## 7. 菜单阶段的衔接

账号页现已增加菜单入口。菜单查询按餐厅和账号隔离，复用现有退出及切换账号的缓存清理。
后台身份刷新失败不会卸载正在编辑的菜单表单，认证失效仍会清理数据。登录有效期、
改密及 CSRF 规则保持不变；最新菜单验收与说明见 [菜单管理模块](menu-management.md)。

## 第八阶段账号维护衔接

OWNER 在 `/staff/settings` 查询并重置本店 STAFF；平台在餐厅详情初始化、重置和启停店铺账号。密码由服务器随机生成，仅成功响应展示一次。重置要求目标 `expectedCredentialVersion`，原子更新哈希、首次改密标记和版本；旧票据失效。目标并发冲突为 `ACCOUNT_CHANGED`，不会误退出当前操作者。管理未知结果只 GET 核对，无法重新取回临时密码，需取得最新版本后再次人工确认。详见 [第八阶段](platform-pilot.md)。
