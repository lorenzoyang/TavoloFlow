# 8. 身份、测试与运行环境

一张账单的 ID 可以从 URL 传给服务器。店主于是问：「如果别人知道这个 ID 呢？」回答这个问题，要把浏览器里的页面、服务器识别的人、数据库记录的归属分开。最后再考虑，用什么测试能证明这几层真的连在一起。

<a id="identity"></a>

## 身份、权限和数据归属

1. **认证（autenticazione）**回答「当前请求代表谁」。店员登录后，服务器生成包含身份声明的票据，使用 ASP.NET Core Data Protection 保护它，并通过 HttpOnly cookie 交给浏览器。后续同源请求携带 cookie。服务器验证票据后还会核对数据库中的账号状态和凭证版本，使停用账号或凭证变化能及时生效。持久化 Data Protection 密钥使重启后的实例仍能读取有效票据。[店员认证](../../../backend/TavoloFlow.Api/Accounts/StoreAuthentication.cs)
2. **授权（autorizzazione）**回答「这个身份可执行什么动作」。例如账单控制器要求店员身份，确认收款的接口进一步要求 OWNER。访问受保护端点时，缺少有效身份通常触发 401，需要的角色或策略未满足则可能得到 403。前端隐藏按钮可以改善体验，最终决定发生在服务器。[账单端点与策略](../../../backend/TavoloFlow.Api/Controllers/BillingController.cs)
3. **数据归属**回答「操作的是哪家餐厅的这条记录」。服务的餐厅 ID 来自经验证的 `CurrentAccount`。锁与查询带上餐厅和业务资源 ID。即使两个人都是 OWNER，甲也只能操作甲的餐厅。对范围外的资源可表现为找不到，从而与不存在的资源一致。[会话锁的查询条件](../../../backend/TavoloFlow.Api/Data/RowLocks.cs) · [账单权限测试](../../../backend/TavoloFlow.Api.Tests/BillingTests.cs)

同一浏览器还可能打开顾客扫码页和平台管理页。项目区分 Store、Guest、Platform 身份，公共菜单读取省略凭证，公共提交则需要其作用域内的防伪令牌和 cookie。店员的登录状态不会赋予匿名下单者员工权限。`AuthBoundary` 观察身份的本地副本，服务端策略处理实际请求，两者的职责由不同测试覆盖。[浏览器身份与 CSRF](../../../backend/TavoloFlow.Api/Common/BrowserSecurity.cs) · [前端请求封装](../../../frontend/src/lib/api.ts)

## 为什么有登录 cookie 还要有 CSRF 令牌

cookie 能由浏览器根据目标站点与 cookie 策略自动附带。服务器收到有效票据只能说明请求带有该身份的凭证。对于写操作，还希望确认页面能提供为当前身份范围签发的请求令牌。前端先取防伪令牌，再通过 `X-CSRF-TOKEN` 发送。MVC 的 `CsrfValidationFilter` 对相关方法验证 cookie 与请求令牌。`HttpOnly` 限制脚本读取 cookie，`SameSite` 限制部分跨站携带场景，服务器端授权检查具体动作。这些机制分别针对不同条件。店员、顾客和平台可共享浏览器，因此绑定并选择正确的令牌作用域也很重要。[防伪过滤器与身份范围](../../../backend/TavoloFlow.Api/Common/BrowserSecurity.cs) · [ASP.NET Core 防伪机制](https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0)

## 一个功能需要哪几种证据

| 要证明的命题 | 在仓库里看哪里 | 这种测试实际经过什么 |
| --- | --- | --- |
| 「超时后，购物车保留原请求号与原内容」 | [线上购物车测试](../../../frontend/tests/online-order.test.ts) | 用 Node 直接测 `createOnlineIntent`、序列化恢复和失败分类，输入输出可精确枚举。 |
| 「两个同时发出的请求只生成一笔」 | [下单集成测试](../../../backend/TavoloFlow.Api.Tests/OnlineOrderingTests.cs) | `WebApplicationFactory` 承载应用，测试客户端发 HTTP，真实 PostgreSQL 执行迁移、事务、唯一约束和锁。 |
| 「拒绝或重复提交不会多通知一次」 | [配送边界与推送断言](../../../backend/TavoloFlow.Api.Tests/OnlineDeliveryQuoteTests.cs) | 数据库与应用走真实路径，外部投递用可观察的替身，从而能断言调用时机。 |
| 「手机后退会先关购物车抽屉」 | [本地 Demo](../local-development.md) | 在浏览器操作并观察历史、焦点与显示结果，能发现纯函数测试触及不到的交互问题。 |

替身的边界按要验证的事实选择。可控制的时钟让「恰好过期」变得可重复，假的路由报价让测试无需依赖外部网络。把 PostgreSQL 换成内存集合则无法证明 `FOR UPDATE`、唯一索引或事务可见性。在仓库内先读测试断言，区分「POST 返回成功」「数据库只插入一份」「浏览器正确显示」这三个强度不同的命题。[测试应用工厂](../../../backend/TavoloFlow.Api.Tests/AccountTestHost.cs) · [一次性数据库夹具](../../../backend/TavoloFlow.Api.Tests/PostgreSqlFixture.cs)

## 从开发到部署再走一次请求

| 环境 | 浏览器如何找到 API | 学习时值得查的细节 |
| --- | --- | --- |
| 本机开发 | Vite 提供开发页面，代理 `/api` 到 ASP.NET Core。PostgreSQL 可单独用 Compose 启动 | Network 里看到同源路径。Dev server 的热更新缩短前端反馈周期。 |
| 本地 Demo | 独立 Compose 项目组装 Web、API、数据库和一次性初始化任务 | init 用迁移及示例资料复现餐厅。镜像打包程序与运行依赖，卷承载需要跨容器生命周期保存的数据。 |
| 生产 | Vite 已把资源构建为静态文件。Caddy 终止 TLS、提供资源并反代 API。Kestrel 执行业务应用 | 业务页面直达要回退到前端入口，API 按真实状态返回。可信代理头恢复原始访问信息，数据库和密钥需要持久化。 |
| CI | GitHub Actions 在 push/PR 触发约定检查，用测试进程和一次性数据库验证项目 | 分开检查格式、类型/编译、模型迁移差异与业务断言，能定位不同类别的回归。 |

先读 Vite 代理和 Caddy 分流，再观察为什么相同的相对 API 路径在两个环境都能工作。生产发布脚本显式执行迁移。前端构建、API 进程重启和数据库结构变化有各自的生命周期。[Vite 配置](../../../frontend/vite.config.ts) · [Demo Compose](../../../demo/compose.yaml) · [生产 Caddy](../../../deploy/Caddyfile) · [CI 工作流](../../../.github/workflows/ci.yml) · [部署指南](../self-hosting.md)

## 动手与自测

从仓库根目录运行第 4 章的后端测试。再在 `frontend/` 下用 Node 24 运行下面的命令。在输出中找 `a saved cart restores only for its restaurant` 和 `an understood rejection frees the cart` 两个测试，然后打开测试体，分别定位保留原 ID 和区分未知结果的断言。

```bash
node --test --test-isolation=none tests/online-order.test.ts
```

前端规则测试可在没有 HTTP 服务的情况下通过。锁竞争的集成测试需要 Docker 中的 PostgreSQL。

**自测**　同一家店重复提交成功去重，能否证明另一家店不能读到账单？

<details>
<summary>展开参考答案</summary>

它们验证不同的不变量。后者要用不同餐厅的账号和资源验证查询范围，可搜索 `Endpoints_IdentityCsrfAndTenant_RejectUnauthorizedAccess`。[账单测试](../../../backend/TavoloFlow.Api.Tests/BillingTests.cs)

</details>

<a id="interview"></a>

## 意大利语面试

**«Qual è la differenza tra autenticazione e autorizzazione in un’applicazione multi-tenant?»** 给出身份、动作权限和记录归属三个具体判断。

*L’autenticazione identifica l’utente della richiesta. L’autorizzazione stabilisce se il suo ruolo può compiere l’azione, per esempio chiudere un conto. In un sistema con più ristoranti verifico anche l’appartenenza del dato: ricavo il ristorante dall’identità verificata e lo includo nella query insieme all’identificativo del conto. Due titolari possono avere lo stesso ruolo e accedere a dati diversi.*

**追问**　如果用户在前端改了 `sessionId`，哪个条件仍然有效？

**«Quando useresti un test di integrazione con un database reale?»** 指出只有真实系统能证明的性质，并说出可以替换的依赖。

*Lo uso quando il risultato dipende dal comportamento del database, per esempio da un vincolo univoco o dall’attesa su una riga bloccata. Avvio PostgreSQL in un container temporaneo, applico le migrazioni e invio due richieste attraverso l’API. Verifico sia le risposte sia i dati finali. Per rendere il test ripetibile posso invece controllare l’orologio e sostituire il servizio di notifiche.*

**追问**　如果两次 HTTP 响应都成功，还要查数据库吗？需要验证业务记录数量与返回的身份是否一致。

## 综合口述参考

先录下自己对首页综合题的一分钟回答，再对照这段。试着给每一句标出能证明它的前端或后端测试。

*Prima del POST il browser salva i dati confermati e l’identificativo del tentativo. Se la risposta si perde, il cliente può aver visto un errore anche se il database ha già registrato la richiesta. Al ritorno la pagina cerca il risultato con un GET. Se ancora non lo trova, il primo invio potrebbe essere in corso. Un nuovo tentativo esplicito riusa la stessa chiave. Il server controlla di nuovo dentro la transazione e il vincolo univoco protegge i dati anche con richieste concorrenti. Solo il primo inserimento confermato genera una notifica. A quel punto il ristorante ha ricevuto la richiesta. L’ordine per la cucina nasce quando il personale la accetta.*

如果面试官接着问「两位店员又同时点了接单呢」，转到行锁与状态检查。如果问「厨房里的菜什么时候更新」，转到活跃订阅、轮询和恢复后的新鲜度。这能把一个端到端案例自然延伸到数据库或前端方向。

[路线首页与面试速查](../learning-notes.md) · [上一章：TanStack Router](07-router.md)
