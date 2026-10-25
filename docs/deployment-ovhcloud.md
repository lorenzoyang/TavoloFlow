# 部署教程已迁移到 netcup

服务器方案已改为 netcup，请从 [netcup 中文部署教程](deployment-netcup.md) 继续。

SSH 密钥统一使用 `~/.ssh/tavoloflow`，公钥为 `~/.ssh/tavoloflow.pub`；使用你重新生成的这把密钥。
下一步是新教程第 2 节购买和安装 VPS，再按第 3 节导入已有公钥、首次 root 登录并创建 deploy 管理用户。

域名 `qiaotavoloflow.it` 继续在 OVHcloud 续费；第 5 节仍说明如何在 OVHcloud 更改 nameserver，
由 Cloudflare 创建灰云 `A app` 记录指向 netcup 的公网 IP。业务系统地址为 `https://app.qiaotavoloflow.it`，
根域名及 `www` 留给独立仓库的 Astro 官网，不由此 VPS 提供。本文件保留为旧链接入口，不再维护原来的 OVHcloud VPS 操作步骤。
