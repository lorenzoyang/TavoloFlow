# 单机部署与本地演练

该目录独立于根目录开发 `compose.yaml`。运行命令前确认 `COMPOSE_PROJECT_NAME`，不要混用开发、演练和生产环境。需要 Docker Compose v2、Bash、OpenSSL、Python 3 和足够的磁盘空间。API 不会在启动时迁移数据库。

## 1. 从空卷启动本地 HTTPS 环境

在仓库根目录执行：

```bash
./deploy/init-local.sh
docker compose --env-file deploy/.env.local -f deploy/compose.yaml build api migrate web
docker compose --env-file deploy/.env.local -f deploy/compose.yaml up -d --wait db
docker compose --env-file deploy/.env.local -f deploy/compose.yaml run --rm migrate
docker compose --env-file deploy/.env.local -f deploy/compose.yaml run --rm admin
docker compose --env-file deploy/.env.local -f deploy/compose.yaml up -d --wait api web
```

访问 `https://localhost:8443/platform/login`，店铺入口为 `/staff/login`。本地 Caddy 使用私有 CA；浏览器需要信任这个演练 CA。可导出证书，再按操作系统/浏览器流程导入受信任根证书：

```bash
docker compose --env-file deploy/.env.local -f deploy/compose.yaml cp web:/data/caddy/pki/authorities/local/root.crt /tmp/tavoloflow-local-root.crt
curl --cacert /tmp/tavoloflow-local-root.crt https://localhost:8443/api/health/ready
```

本地直接使用 HTTPS 的 8443 入口；8088 上的自动 HTTPS 跳转不用于端口映射验收。生产使用标准 80/443。

初始化脚本拒绝覆盖已有配置，生成平台管理员和两组数据库随机密码。默认用户名 `platform.admin`；初始平台密码在 `deploy/secrets-local/platform-password`，仅由本机操作者安全读取并交付。不要粘贴进聊天、截图或日志。秘密目录权限为 0700；Compose 的文件型 secret 是 bind mount，内部文件为 0644 以供非 root 容器读取，依赖父目录阻止其他宿主机用户访问。生产使用等效的秘密管理和宿主机访问控制。

再次运行 `admin` 不覆盖已有密码。命令行恢复时，先安全更换 `platform-password` 文件，再执行：

```bash
docker compose --env-file deploy/.env.local -f deploy/compose.yaml run --rm admin --reset-platform-password
```

恢复命令必须匹配已有用户名；会递增凭据版本，但不会启用已禁用的平台账号。平台也可在页面主动改密；之后初始化 secret 文件中的旧密码不再用于登录。

## 2. 部署边界

- Caddy 同源提供 React 静态资源和 `/api`。深层页面刷新返回 SPA；未知 API 路径仍由后端返回错误，不返回 HTML。
- 仅 Caddy 发布宿主机端口。API 使用 UID 1654；PostgreSQL 18 与 API 留在 Docker 网络。
- `tavoloflow_app` 只有业务表 DML、序列及 schema 使用权限，不具备建表权限。`tavoloflow_migrator` 为本模板的数据库初始化管理员，权限更高，仅迁移/备份/恢复工具使用其 secret。API 容器不挂载迁移密码。
- 迁移镜像含 EF bundle；显式 `run --rm migrate`，成功后再更新 API。升级前备份并审核迁移，不自动执行回滚。
- `postgres`、`keys`、`caddy_data`、`caddy_config` 分别持久化。正常重建使用 `up -d` 或 `--force-recreate`，不要执行 `down -v`。
- API 只信任 `PROXY_IP` 对应的 Caddy 及框架 loopback 默认值的转发头，最多一跳。IP 分配池 `PROXY_DYNAMIC_RANGE` 必须在子网内且排除 Caddy 静态 IP，避免重建时代理地址被占用。运行多套隔离环境时三项地址配置都须调整。
- `AllowedHosts` 是主机名列表，不含协议/端口。生产必须配置实际域名，不能写 `*`；不要随意开启任意代理信任。
- 生产启动缺少绝对、可写的密钥目录会失败。密钥卷用文件权限保护；本模板没有额外的密钥静态加密设施，卷和备份都应按敏感凭据保护。
- `/api/health/live` 只报告存活，`ready` 连接数据库并检查是否还有待执行迁移。探针不暴露异常、连接串或业务数据。内部 HTTP health 探针例外不启用 HTTPS 重定向。

生产从 `.env.example` 复制配置，填写正式域名和秘密文件位置，使用 `tls.production.conf`，开放 DNS 与 80/443 后由 Caddy 获取证书。镜像当前按主版本跟随更新；正式发布时记录并固定已验收的镜像 digest。此阶段只演练 localhost，没有部署公网服务器。

## 3. 备份与新环境恢复

```bash
mkdir -p deploy/backups
./deploy/backup.sh deploy/.env.local deploy/backups/pilot-2026-10-23
```

输出包括 `database.dump`（PostgreSQL 自定义格式）、`keys.tar.gz`、迁移清单、UTC 时间和 `SHA256SUMS`。目录 0700、文件 0600；中途失败保留 `INCOMPLETE`，不能恢复。数据库快照之后归档密钥，以包含快照引用的密钥。Caddy 证书卷独立持久化；这份备份针对业务数据与 Data Protection，恢复到新域名时重新申请证书。

恢复脚本只接收明确的新 Compose 项目，拒绝已有容器/卷；不会恢复到正在运行的数据库。先生成另一套本地配置：

```bash
./deploy/init-local.sh deploy/.env.restore deploy/secrets-restore tavoloflow-restore
```

编辑 `.env.restore`，使用不同端口与网络，例如 `HTTP_PORT=8089`、`HTTPS_PORT=8444`、`PROXY_SUBNET=172.30.81.0/28`、`PROXY_DYNAMIC_RANGE=172.30.81.8/29`、`PROXY_IP=172.30.81.2`，再执行：

```bash
./deploy/restore-isolated.sh deploy/backups/pilot-2026-10-23 deploy/.env.restore
```

工具先校验清单和密钥归档路径，再 `pg_restore --single-transaction --no-owner --no-privileges`，恢复密钥文件。所有餐厅设为 SUSPENDED、关闭接单，Store/Platform 凭据版本递增。目标新数据库角色由新 secrets 初始化；恢复的是备份中店铺/平台的密码哈希，新建配置的 `platform-password` 不会替换备份中的管理员密码。

工具不启动 API/web。核对迁移、九张表、账号、订单快照、历史金额后，可在仅绑定 localhost 的隔离环境启动 API/web，登录并主动读取活动用餐码，验证密钥解密。两套 localhost 服务应使用独立浏览器配置/上下文：Cookie 不按端口隔离，不能依赖 8443/8444 区分身份。验证后停止恢复环境，保留卷和备份；不要直接对公网开放恢复环境。

实际灾难恢复时需将备份时间之后的线下交易、活动账单、账号禁用/改密逐项人工核对。恢复旧哈希可能恢复已撤销的密码；须重新交付或恢复管理员密码、禁用不再有效的账号。恢复密钥意味着旧 Guest 票据及活动入桌码可能仍有效；本工具没有轮次撤销字段，不会宣称暂停服务已撤销顾客授权。正式切换前在受控环境核对并结束旧活动用餐，再另开新轮次；不要直接修改历史金额来“对平”。

## 4. 定时与离机保存

由受限的运维账号运行，例如每日闭店后执行（替换绝对路径，并先创建备份父目录）：

```cron
15 3 * * * /srv/TavoloFlow/deploy/backup.sh /srv/TavoloFlow/deploy/.env.production /srv/backups/tavoloflow/$(date +\%F-\%H\%M) >> /srv/backups/tavoloflow-backup.log 2>&1
```

按 [试运营手册](../docs/pilot-operations.md) 约定备份频率、保留期和负责人。备份成功后校验并加密复制到独立设备/存储，源端与离机端均限制访问；定期下载一份到新隔离项目演练恢复。校验和用于检错，不代替来源认证或加密。本阶段没有远端上传，也不配置未经确认的远端账号。

设计依据：[ASP.NET Core 代理](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0)、[EF Core 迁移部署](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying)、[PostgreSQL 18 SQL dump](https://www.postgresql.org/docs/18/backup-dump.html)。
