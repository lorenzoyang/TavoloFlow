# 部署验证与清理记录

本次清理删除未被引用的 `frontend/src/components/ui/toggle.tsx`，保留 `toggle-group.tsx` 和 `toggle-variants.ts`。
同时删除未受 Git 管理的旧项目 `backend/QiaoTavolo.Api`、`backend/QiaoTavolo.Api.Tests` 编译目录（约 72 MB），
合并重复的 Git 忽略规则，并修正 Prettier 对构建产物的忽略。学习文档、迁移、测试、图标源文件、现有依赖和本地环境文件保留。

## 首次部署配置验证结果（2026-10-25，业务子域名调整前）

| 检查 | 结果 |
|---|---|
| 后端构建与集成测试 | 250 项通过，包括新增的 6 项代理/健康检查场景 |
| 前端纯逻辑测试 | 59 项通过 |
| 前端生产构建、TypeScript、Oxlint、Prettier | 通过；构建后的 `dist` 已正确忽略 |
| API/迁移镜像、前端容器构建、发布包校验 | 通过 |
| Bash 语法和 ShellCheck | 通过 |
| 独立容器的完整部署冒烟测试 | 通过，包括两次发布、重建、恢复密钥、恢复空库和应用回退 |

冒烟测试修复了首次启动时动态 IP 分配与 Caddy 固定 IP 冲突的问题，生产网络已为动态地址保留独立范围。
所有测试使用临时数据库；本地开发数据库与环境文件未修改。

## netcup 教程适配（2026-10-25）

服务器改为 netcup，域名仍在 OVHcloud 注册，Cloudflare 继续提供 DNS。主教程现为
`deployment-netcup.md`，旧文件保留为跳转说明；构建脚本同时打包新教程和旧入口。
按 netcup 官方文档调整了系统安装、首次 root 登录、创建 deploy 用户、公钥复用和 SCP 防火墙说明，
并把备份下载改成适用于 deploy 用户需要 sudo 密码的交互式复制流程。

当时仅更换 VPS 提供商，Docker、Caddy、数据库、正式域名和 AMD64 构建配置不依赖提供商，无需调整。
本次适配检查文档链接、命令块语法、发布脚本语法和新发布包内容；上表是此前生产配置的验证结果，
不代表已登录 netcup 或完成公网部署。教程中的 SSH 私钥、公钥和注释名称已统一为用户重新生成的 `tavoloflow`，
包括 root/deploy 登录、发布包上传和备份下载命令；netcup 发布包内的教程和校验和同步更新。

## 业务子域名与独立官网（2026-10-25）

业务系统改为 `https://app.qiaotavoloflow.it`，仍由 netcup VPS 的 Caddy 提供前端和同源 API。
根域名及 `www` 预留给另一个 GitHub 仓库中的 Astro 官网，由用户之后独立开发和部署到 Cloudflare。
本仓库未添加官网代码、父域名 Cookie、CORS 或数据库迁移；PWA 保持 `/staff` 作用域。

生产环境示例、前端 Docker 构建、发布包 origin 和二维码测试统一为业务子域名；Caddy 删除 `www` 站点，
增加 HTTP 404 兜底，避免默认自动 HTTPS 把其他主机名也重定向；业务子域名仍自动跳转 HTTPS。
冒烟测试改为验证官网主机与 `www.app` 不被 VPS 接管，并检查所有生产 Cookie 都没有 `Domain` 属性。
教程增加 Cloudflare 灰云 `A app` 的创建、解析验证和域名委派步骤，根域名不再指向 VPS。

新发布版本为 `netcup-app-20261025T165231Z`。旧 `netcup-initial-20261025`、`ovh-initial-20261025` 包保留为历史文件，
其中前端仍写入旧根域名，不适用于本次首次部署。

本轮实际验证结果：

| 检查 | 结果 |
|---|---|
| 前端纯逻辑测试 | 59 项通过，二维码正式地址使用业务子域名 |
| 前端生产构建、TypeScript、Oxlint、Prettier | 通过；本机构建显式指定业务 origin，Docker 构建隔离本地环境文件 |
| API/迁移镜像、前端镜像构建与发布包 | 通过；编译后脚本包含新业务 origin，不包含旧根域名二维码地址 |
| Bash、Python 语法与 ShellCheck | 通过 |
| 修改文档中的 Bash 命令块 | 46 个通过语法检查 |
| 业务子域名 HTTP/HTTPS | HTTP 308 指向同主机 HTTPS；通过本地 CA 校验实际证书主机名 |
| 官网与无效别名隔离 | 根域名、www、www.app 的 HTTP 请求返回 404，TLS 连接无法取得对应的可信站点 |
| 三种身份登录与 CSRF | 通过；生产 Cookie 均为 Secure、HttpOnly 且不设置 Domain，错误作用域 CSRF 被拒绝 |
| 完整隔离部署冒烟测试 | 通过；空库与重复迁移、重复初始化、连续发布、旧资源保留、重启、恢复数据库和密钥、应用回退 |
| 发布包校验与最终文档同步 | 包内外 SHA256 通过；同步最终记录后核对 121 个运行文件（含镜像、前端和部署配置）与已测版本一致 |

本轮未修改 C# 或数据库结构，未重复运行上方历史记录中的 250 项后端测试；后端生产行为通过真实容器部署冒烟验证。
修改文档中 42 个本地链接目标存在，本次未引入失效链接；`tables-public-menu.md` 原有 7 个 `screenshots/` 图片目标缺失，
已确认在改动前就缺失，保留原学习记录。部署教程的本地链接均有效。
本地 `.env.local` 和开发数据库未修改，临时验证使用独立容器、卷和本地 CA，不涉及真实 DNS 或公网 ACME。

## SSH 公钥导入教程补充（2026-10-25）

根据 netcup 官方 SCP 和镜像安装说明，将第 2.3 节补成连续的 WSL 复制公钥、SCP **Options → SSH Keys** 保存公钥、
镜像安装时选择公钥三个步骤。解释保存到账号与写入操作系统的区别，给出可选的 `clip.exe` 复制命令，
并说明已安装系统可通过 root/Screen 为 deploy 用户添加公钥，无需重新安装。
本次只修改文档，检查部署教程 Bash 命令块语法和本地链接；同步当前业务子域名发布包中的教程及 SHA256，
核对镜像、前端和部署工具与已测运行文件一致，无需重复执行应用测试或构建镜像。

## 运维文件所有权修复（2026-10-26）

旧教程及安装器使用 `cp -a`，会把 deploy 所有权复制到生产脚本、配置乃至 `/opt/tavoloflow` 目录本身。
备份服务以 root 身份执行这些文件，构成 deploy 修改文件后借定时任务提权的路径。

首次安装改用 `install -o root -g root` 明确设置文件与目录权限。安装器要求 root 执行，校验发布包后、读取旧状态和执行旧备份前，
先修复已有目录树的所有权并去掉组/其他用户写权限；生产 `.env` 为 600，状态与备份目录为 700。
之后逐文件安装运维工具，不再复制上传目录的属性；新前端资源不继承上传者所有权，旧资源也一并保护，仍保持可供 Caddy 读取。
备份服务明确 `User=root`/`Group=root`，教程增加第 7.2 节旧安装修复、第 7.3 节权限核对，并要求后续发布使用修复后的安装器。

本次新包为 `netcup-permissions-20261026`，业务域名仍为 `app.qiaotavoloflow.it`。旧包保留，但不能再用于安装运维脚本；
应用回退仍通过现有 `rollback.sh` 切换镜像和前端，保留修复后的运维文件。

| 检查 | 结果 |
|---|---|
| 安装器、教程和测试脚本 | Bash 语法、ShellCheck、文档命令块检查通过 |
| 普通用户安装 | 被拒绝，必须使用 sudo/root |
| 首次准备与首次发布 | deploy 所有且组可写的上传包安装后，正式目录、配置、脚本及前端都为 root:root，组/其他用户无写权限 |
| 实际写入与替换测试 | 普通用户追加 backup.sh、重命名替换它、在正式目录创建文件均失败；无法读取 .env，仍可读取前端 |
| 修复旧安装 | 故意把整个已部署目录改成 deploy 所有且组可写；第二次发布在执行旧备份前恢复 root 所有权，发布后所有权限检查通过 |
| 真实容器部署与回归 | 空库/重复迁移、三种身份与 CSRF、两次发布和旧资源保留、容器重建、备份恢复数据库与密钥、应用回退均通过 |
| 构建与发布包 | API/迁移镜像和前端构建通过；新包内外校验和通过 |

为了验证真实 root 与普通用户权限，冒烟测试从普通 WSL 用户启动一个临时 Docker-in-Docker 容器，内部安装器以 root 运行，
另用 UID/GID 10001 模拟 deploy 用户。测试容器需要 privileged，只读挂载 `deploy/` 测试工具和发布包，
不挂载宿主 Docker socket、不开放 Docker TCP 端口；测试结束清理临时容器及其数据卷。
这是本机测试工具，不加入生产 Compose，也不要求在 VPS 运行。

未修改业务代码或数据库结构，因此没有重复跑历史 250 项后端测试和 59 项前端纯逻辑测试；本次重点验证部署权限及完整实际运维流程。
没有登录或修改真实 VPS，没有操作本地开发数据库、真实 `.env` 或 SSH 密钥。

## 菜品图片（2026-10-27）

新增可选菜品图片：迁移 `AddMenuItemImages`（新表 `menu_item_images`、`menu_items.image_id`），API 依赖 SkiaSharp。
`deploy/Dockerfile.api` 改为按 `linux-x64` 发布（`dotnet restore/publish -r linux-x64`，迁移包加 `--runtime linux-x64`）：
不指定 RID 时 SkiaSharp 会带上所有平台的原生库，发布目录约 475 MB；改后 API 目录约 67 MB（其中 `libSkiaSharp.so`
约 12 MB，迁移包也会带一份）。Caddy 新增 `/api/public/menu-images/*` 路由，排在 `@api` 之前且不加 `no-store`。
冒烟测试会上传一张菜品图片，并检查 `image/webp`、`immutable` 和 `nosniff`。

冒烟测试恢复步骤原先用 `pg_isready` 走 Unix socket 等待临时 PostgreSQL，可能撞上官方镜像初始化阶段的临时服务器关闭，
偶发 `the database system is shutting down`；现与生产健康检查一致，改为探测 `127.0.0.1`。

| 检查 | 结果 |
|---|---|
| 后端集成测试 | 264 项通过，含 3 项图片场景（方向摆正、裁剪与缓存头，替换/删除/级联，权限与非法输入） |
| 迁移与依赖 | 无待生成的模型变更；`dotnet list package --vulnerable` 无漏洞包 |
| 前端纯逻辑测试、构建、Oxlint、Prettier | 67 项通过；构建、检查均通过 |
| 本地界面 | 在演示库的临时副本上，手机与桌面访客菜单有图/无图混排、无横向滚动；编辑面板上传、超限拦截、非法文件报错、嵌套删除确认均正常 |
| Caddy 路由 | `caddy adapt` 确认图片路由位于 `@api` 之前，只反向代理 |
| 真实容器部署与回归 | 通过；含图片上传与 Caddy 缓存头、权限与写保护、迁移、HTTPS、Cookie/CSRF、两次发布、重启、备份恢复与应用回退 |

验证使用临时数据库和临时容器；本地开发数据库、演示数据库与 `.env` 未修改，测试发布包和镜像已删除。

## 可复现验证

```bash
dotnet test TavoloFlow.slnx
cd frontend
npm run build
npm run lint
npm run format:check
node --test --test-isolation=none tests/*.test.ts
cd ..
for script in deploy/*.sh; do
  if [ -f "$script" ]; then bash -n "$script"; fi
done
# 当前冒烟脚本只支持默认域名；此处显式使用默认 PUBLIC_ORIGIN 构建测试包。
PUBLIC_ORIGIN=https://app.qiaotavoloflow.it bash deploy/build-release.sh
# 替换为刚生成的包；需要 Docker，使用临时测试容器和独立数据库卷。
bash deploy/smoke-test.sh artifacts/tavoloflow-实际版本号.tar.gz
```

`deploy/build-release.sh` 支持自定义 `PUBLIC_ORIGIN`，但当前 `smoke-test.sh` 的测试配置和主机名断言
固定使用 `app.qiaotavoloflow.it`，不能用它验证自定义域名的发布包。测试包与实际自定义域名的部署包须分别构建，
验证记录也应分别说明；正式安装仍要求生产 `.env` 的 `https://` 加 `DOMAIN` 与包内 `public-origin.txt` 一致。

普通用户运行时，容器冒烟测试在临时测试容器内创建独立 `tavoloflow-smoke-*` Compose 项目，使用内部回环端口 18080/18443、独立网段 172.30.81.0/24。
它不使用开发 Compose、开发数据库或真实域名 DNS。测试包仅将 Caddy 改为本地 CA，客户端仍校验这个 CA 和正式域名名称；
不会向公网证书机构申请证书。测试完成自动清理临时容器、卷和临时文件。

测试覆盖显式空库迁移与重复迁移、管理员初始化与重复初始化、非 root 运行、数据库/API 无宿主机端口、
业务域名 HTTPS 跳转与证书主机名、根域名/www/www.app 不由 VPS 提供、前端深链接、静态资源 404、缓存和 MIME、
三种身份的生产 Cookie（Secure、HttpOnly、无 Domain）与 CSRF、
创建餐厅/桌位/开桌/顾客加入、连续发布两版后旧资源可读、容器重建后登录与加入码保留、备份恢复和应用回退。

正式 ACME 证书签发、netcup 网络、OVHcloud 域名委派和 Cloudflare DNS、生效后的域名访问、Android/iOS 安装和完整营业操作，需要按
[部署教程](deployment-guide.md)在购买并配置 VPS 后人工验收。本地测试不等于已经部署到公网，也不是容量压测。
