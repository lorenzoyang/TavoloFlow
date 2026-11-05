# Local demo / 本地体验

[中文](#中文) · [English](#english)

## 中文

### 启动

准备 Git 和 Docker Compose v2 或更高版本。Windows 使用 Docker Desktop 的 Linux 容器模式，直接在 PowerShell 执行下面命令，无需 Git Bash、Node、.NET SDK 或 `.env`。

```console
git clone <本仓库地址>
cd TavoloFlow
docker compose -f demo/compose.yaml up -d --build
```

首次启动需要联网下载依赖和构建镜像，请等待命令成功结束。打开 <http://127.0.0.1:8080>。

| 角色       | 账号               | 密码     | 入口                                   |
| ---------- | ------------------ | -------- | -------------------------------------- |
| 店主 OWNER | `demo.ramen.owner` | `123456` | <http://127.0.0.1:8080/staff/login>    |
| 员工 STAFF | `demo.ramen.staff` | `123456` | <http://127.0.0.1:8080/staff/login>    |
| 平台管理员 | `demo.admin`       | `123456` | <http://127.0.0.1:8080/platform/login> |

店铺账号无需首次改密，可以直接体验。平台管理员负责建店和管理账号，店主负责本店业务，两者权限独立。

### 初始数据

Demo Ramen 使用 LACQUER 主题、EUR 和 Europe/Rome 时区。服务、点单和入桌码均开启，默认菜单语言为英语；分类与菜品提供中、意、英三语。界面继续按浏览器语言或设备上已有的语言偏好显示。

- 8 张启用的空桌：T01–T08，二维码 token 在本机初始化时随机生成。
- 4 个分类、12 道可售菜品，包含价格、描述、示例过敏原及审核标记。
- 12 张随仓库提供的 AI 菜品照片，运行时无需 API Key 或在线生成。来源与提示词见 [图片说明](../demo/images/README.md)。
- 自首次初始化当天开始的一年期服务周期，示例年费 €199，已收款。
- 不预置用餐、订单或历史账单，从开桌开始体验。

菜品配方、过敏原与收款信息均为虚构演示数据。

页面预览：[手机](screenshots/demo-menu-mobile.png) · [桌面](screenshots/demo-menu-desktop.png)。

### 五分钟体验

1. 用店主账号登录，进入桌位管理，查看 T01 的二维码并复制顾客菜单链接。直接打开链接即可在本机模拟扫码。
2. 进入楼面，为 T01 开桌，在确认后取得入桌码。
3. 在另一个标签页打开刚才的顾客链接，填写入桌码，选择菜品并确认下单。
4. 打开厨房，把菜品标记为已做好。厨房和传菜页的声音需要先点击页面，浏览器才允许播放。
5. 从首页进入传菜页，将菜品标记为已上桌。
6. 用店主账号进入账单页，核对金额并确认线下收款，然后查看历史账单。
7. 如需体验管理员，用同一浏览器打开平台入口即可；平台、店铺、顾客身份互相独立。

如果要同时用 OWNER 和 STAFF 操作，请使用不同的浏览器配置、另一种浏览器或无痕窗口。同一浏览器的所有普通标签页共用店铺账号 Cookie。

同时运行本地开发环境时，demo 使用 `127.0.0.1`，开发使用 `localhost`，或使用独立浏览器配置。Cookie 不按端口隔离；若两套应用都通过 `localhost` 访问，可能反复登出或出现 CSRF 验证失败。

### 状态、日志、停止与重置

以下命令均从仓库根目录执行：

```console
docker compose -f demo/compose.yaml ps -a
docker compose -f demo/compose.yaml logs --tail 100 init api web
```

`init` 显示 `Exited (0)` 是正常情况：初始化完成后它会退出。若失败，先检查其日志，修复原因后重新运行启动命令；API 和 web 会等待初始化成功。

正常停止和再次启动，保留数据库、改过的密码、菜单、订单及 Data Protection 密钥：

```console
docker compose -f demo/compose.yaml down
docker compose -f demo/compose.yaml up -d
```

**重置会永久删除这个 demo 项目的数据库和密钥，恢复公开的初始账号。** 它不会删除其他 Compose 项目的数据：

```console
docker compose -f demo/compose.yaml down -v
docker compose -f demo/compose.yaml up -d --build
```

重置后，浏览器旧登录和顾客访问凭据会失效；旧二维码链接也需重新获取。

### 端口与运行边界

默认只开放本机 `127.0.0.1:8080`，数据库和 API 不发布宿主机端口。公开密码仅用于本机 demo。生产部署继续使用[部署指南](deployment-guide.md)。

如 8080 已占用，可设置 `DEMO_PORT`，之后打开相应端口；二维码会使用当前浏览器地址。PowerShell：

```powershell
$env:DEMO_PORT = "8081"
docker compose -f demo/compose.yaml up -d --build
```

macOS / Linux：

```sh
DEMO_PORT=8081 docker compose -f demo/compose.yaml up -d --build
```

默认入口不用于手机局域网扫码；手机连接与真实设备 PWA 验证见[本地 WSL 手机测试](zh-CN/local-wsl-testing.md)和 [PWA 说明](pwa.md)。localhost 的安装能力取决于浏览器；本地 HTTP 不能替代真实 HTTPS 设备验收。

镜像按本机架构构建，支持 amd64 和 arm64 发布目标；实际验收的平台见文末验证记录。无需设置固定子网，也不会沿用正式站点域名。

### 数据维护

`demo/data/` 保存餐厅、公开示例账号、桌位与菜单 JSON，`demo/images/` 保存 640×640 WebP。修改种子文件后重新构建，只会影响新建或明确重置的数据库。

init 显式执行迁移包和 `--seed-demo`，API 启动时不自动迁移。种子命令仅允许 Development 环境，在一个事务中导入所有基础数据，不创建额外的元数据表。

检测到任何餐厅或平台账号时，直接跳过导入，并在日志中说明数据库已有业务数据。不会覆盖改过的密码或补回删除的菜品；删除餐厅后，剩余的平台账号同样会阻止重新导入。如果希望恢复完整示例数据，请明确重置 demo 数据卷。首次种子导入失败则整次回滚，可修复后重试；表结构迁移与种子事务分别执行。正常使用只有一个 init 任务，不支持并发初始化。

数据库卷和密钥卷使用独立的 `tavoloflow-demo` 项目名。已有旧版 demo 卷可继续使用，不执行自动清理；如需完全重新开始，使用前面的重置命令。

## English

### Start

Install Git and Docker with Compose v2 or newer. On Windows, use Docker Desktop in Linux container mode and run these commands directly in PowerShell. No Git Bash, Node, .NET SDK or `.env` setup is required.

```console
git clone <repository-url>
cd TavoloFlow
docker compose -f demo/compose.yaml up -d --build
```

The first build needs internet access to download dependencies. Wait for the command to complete, then open <http://127.0.0.1:8080>.

| Role                   | Username           | Password | Entry                                  |
| ---------------------- | ------------------ | -------- | -------------------------------------- |
| Owner                  | `demo.ramen.owner` | `123456` | <http://127.0.0.1:8080/staff/login>    |
| Staff                  | `demo.ramen.staff` | `123456` | <http://127.0.0.1:8080/staff/login>    |
| Platform administrator | `demo.admin`       | `123456` | <http://127.0.0.1:8080/platform/login> |

Store accounts can enter immediately without a first-login password change. Platform administration and store operations have separate permissions.

### Included data

Demo Ramen uses the LACQUER theme, EUR, Europe/Rome and an English default menu. Service, ordering and join codes are enabled. The menu contains Chinese, Italian and English names and descriptions; interface language follows the existing device/browser preferences.

- Eight enabled, unopened tables, T01–T08, with locally generated random QR tokens.
- Four categories and twelve available dishes, with prices, descriptions, sample allergens and review flags.
- Twelve bundled AI-generated dish photos. Running the demo needs no image-generation service or API key. See [image provenance and prompts](../demo/images/README.md).
- A paid one-year service period starting on the first initialization date, with an illustrative €199 annual fee.
- No visits, orders or closed bills: start by opening a table.

Recipes, allergen information and fee collection are fictional demonstration data.

Preview: [mobile](screenshots/demo-menu-mobile.png) · [desktop](screenshots/demo-menu-desktop.png).

### Five-minute walkthrough

1. Sign in as the owner. Open table management, view T01's QR code and copy its guest menu link. Open that link locally to simulate scanning.
2. On the floor page, open T01, confirm the action and obtain the join code.
3. In another tab, open the guest link, enter the join code, choose dishes and submit an order.
4. Open the kitchen and mark the dishes ready. Tap the page to allow the browser to play alert sounds.
5. Open the pass screen from Home and mark the dishes served.
6. As the owner, open the bill, confirm the amount and receipt of offline payment, then inspect bill history.
7. Optionally open the platform login in the same browser; platform, store and guest identities are independent.

To use owner and staff simultaneously, use separate browser profiles, another browser, or a private window. Ordinary tabs in one browser share the store login.

When running local development alongside the demo, use `127.0.0.1` for the demo and `localhost` for development, or separate browser profiles. Cookies are not isolated by port; using `localhost` for both applications can cause repeated sign-outs or CSRF validation failures.

### Status, logs and lifecycle

Run commands from the repository root:

```console
docker compose -f demo/compose.yaml ps -a
docker compose -f demo/compose.yaml logs --tail 100 init api web
```

An `init` container with `Exited (0)` is expected. It exits after initialization. If it fails, inspect its logs, fix the cause and rerun the start command; API and web wait for successful initialization.

Stop and restart while preserving passwords, menu edits, orders and encryption keys:

```console
docker compose -f demo/compose.yaml down
docker compose -f demo/compose.yaml up -d
```

**Reset permanently deletes this demo project's database and keys and restores the published initial credentials.** Other Compose projects are unaffected:

```console
docker compose -f demo/compose.yaml down -v
docker compose -f demo/compose.yaml up -d --build
```

After reset, sign in again and obtain new guest menu links. Previous guest grants and QR links are no longer valid.

### Port and platform notes

Only `127.0.0.1:8080` is published. PostgreSQL and API ports remain internal. The public credentials are for local demonstration. For a production installation, use the [deployment guide](deployment-guide.md).

If port 8080 is occupied, set `DEMO_PORT` and open the selected port. QR links follow the current browser origin. PowerShell:

```powershell
$env:DEMO_PORT = "8081"
docker compose -f demo/compose.yaml up -d --build
```

macOS / Linux:

```sh
DEMO_PORT=8081 docker compose -f demo/compose.yaml up -d --build
```

This default setup is local to the computer. For phone/LAN testing and real-device PWA checks, see [WSL phone testing](zh-CN/local-wsl-testing.md) and [PWA notes](pwa.md). Browser support for installing from localhost varies; local HTTP does not replace a real HTTPS device check.

The Docker build selects amd64 or arm64 native assets. Tested platforms are recorded below. The demo does not reserve a fixed subnet or embed the production origin.

### Maintaining fixtures

`demo/data/` contains editable JSON and `demo/images/` contains 640×640 WebP assets. Rebuild after changing them; fixture updates apply to fresh or explicitly reset databases only.

The init task explicitly runs the migration bundle and `--seed-demo`; the API does not migrate on startup. Seeding is allowed only in Development. All base data commits in one transaction, without an additional metadata table.

If any restaurant or platform account exists, seeding immediately skips and reports that the database already contains business data. Changed passwords and deleted dishes are preserved; after deleting a restaurant, the remaining platform account also prevents reimport. Explicitly reset the demo volumes to restore the complete sample data. A failed initial seed transaction rolls back completely and can be retried; schema migrations run separately beforehand. Normal use has one init task; concurrent initialization is not supported.

Database and key volumes belong to the independent `tavoloflow-demo` project. Existing volumes from the earlier demo implementation remain usable and are not automatically cleaned up; use the reset commands above for a completely fresh start.

## Validation / 验证记录

后端仅保留真实 fixture 导入及重复执行、非 Development 环境拒绝两个测试方法。运行测试需要 Docker，使用一次性 PostgreSQL，不访问开发库或当前 demo 数据。

The backend retains two focused test methods: real-fixture import with repeat-run preservation, and rejection outside Development. Tests require Docker and use disposable PostgreSQL, separate from development and the running demo.

```console
dotnet test TavoloFlow.slnx
```

2026-11-05：精简版本在 Linux amd64 / Docker Compose 5.6.1 验收通过。后端 268 项测试全部通过，包含上述两个方法的三个用例。在独立项目、18080 端口和全新数据卷上验证了构建初始化、三个账号登录、十二张图片和深层路由；停止并重新启动后，登录、修改后的密码、菜单状态和二维码均保留。新数据库没有额外的元数据表，重复初始化明确记录跳过导入。临时验收项目已清理，原有运行中的 demo 未重启或重置。八处部署文档旧链接、Demo 文档格式和 Git 差异检查通过。

首次与镜像构建同时执行回归时，一组测试的临时 PostgreSQL 在启动阶段连接被拒绝；构建结束后单独重跑全套测试通过。arm64 原生运行、Windows/macOS 宿主机和真实手机 PWA 安装尚未实测。

2026-11-05: The slimmed implementation passed validation on Linux amd64 / Docker Compose 5.6.1. All 268 backend tests passed, including the three cases in the two focused methods above. A separate project on port 18080 with fresh volumes verified image builds, initialization, all three logins, twelve dish photos and deep routes. Stopping and starting retained logins, the changed password, menu availability and QR links. The new database has no additional metadata table, and repeat initialization explicitly logs that import was skipped. The temporary acceptance project was cleaned up; the existing running demo was neither restarted nor reset. Eight moved-document links, Demo documentation formatting and Git whitespace checks passed.

During the first regression run alongside image building, one test group's temporary PostgreSQL refused a connection during startup; the complete suite passed when rerun after the build. Native arm64, Windows/macOS hosts and real-phone PWA installation have not been tested.
