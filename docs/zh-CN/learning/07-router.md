# 7. TanStack Router 与 URL

店主正在看某一张账单，复制地址给另一台已登录且有权限的设备。对方希望看到同一张单。另一个场景里，顾客正在输入姓名和电话，打算在返回菜单后继续填。这两种状态都需要保留，但保留范围和用户预期不同。

## 先问状态该活多久、谁能看见

| 状态 | 放在哪里 | 用户可观察到的结果 |
| --- | --- | --- |
| 哪家餐厅的菜单 | 路径参数 `/r/$slug` | 复制链接、刷新、直接打开都能定位餐厅。 |
| 账单列表选中了哪条记录 | 查询参数 `sessionId` | 选中项可放进历史记录和书签。另一台设备还需有权读取该账单。 |
| 手机菜单上的购物车抽屉是否已打开 | 同一 URL 的一条浏览器 history state | 系统后退可先关闭抽屉，复制 URL 不会把打开动作带给别人。 |
| 正在输入的联系方式 | 结账表单的本地状态。提交时按恢复协议保存确认过的意图 | 在菜单与结账之间往返可以继续编辑，姓名和电话不会出现在地址栏。 |
| 已取得的菜单、账单详情 | Query 缓存，权威记录在服务器 | 页面可先显示已有副本，再根据当前身份和查询策略重读。 |

URL 是浏览器与用户共同持有的状态。把选择编码进去，就同时获得刷新、分享和前进后退的语义，也要考虑暴露范围和输入校验。`push` 新增一条历史，`replace` 替换当前条目，两者对「按后退会去哪」有不同影响。应用还可以把临时元数据放在历史条目的 state 里，两个条目可以有完全相同的 URL。[项目的抽屉历史](../../../frontend/src/lib/useHistorySheet.ts) · [TanStack Router 搜索参数](https://tanstack.com/router/v1/docs/framework/react/guide/search-params)

## 从 URL 得到类型安全的页面

打开 `staff.orders.tsx`，只需沿三步读。`createFileRoute("/staff/orders")` 声明匹配关系。`validateSearch: billingSearch` 接收运行时输入，检查 `sessionId` 是否符合 UUID 形状，不合格时得到 `undefined`。`Route.useSearch()` 取得校验后的类型，页面需要改变选择时调用 `navigate({ search: { sessionId } })`。因此可复制的链接和界面当前选择来自同一处。UUID 格式正确只证明它像一个 ID，资源存在性与访问权限由服务器检查。[账单路由](../../../frontend/src/routes/staff.orders.tsx) · [billingSearch](../../../frontend/src/features/billing/state.ts)

文件路由插件根据 `routes/` 生成 `routeTree.gen.ts`，`createRouter` 使用这棵树匹配地址。路径段、参数名以及声明过的搜索参数可以参与 TypeScript 检查，拼错的位置在编辑器或构建阶段就可能被发现。手工输入的 URL 来自运行时，仍需要前面的校验。`Link` 适合可点击的目的地。命令式 `navigate` 适合在操作成功后跳转到刚刚得到的新状态页。Vite 构建先生成路由树，再执行项目类型检查。[路由入口](../../../frontend/src/router.tsx) · [Vite 插件顺序](../../../frontend/vite.config.ts) · [文件路由](https://tanstack.com/router/v1/docs/framework/react/routing/file-based-routing)

<a id="nested"></a>

## 嵌套路由为什么保得住购物车

匹配 `/r/demo-ramen/checkout` 时，路由树上同时有父菜单和子结账节点。父级加载菜单，创建 `useOnlineCart` 模型，提供 `OnlineCheckoutContext`。`Outlet` 是子页面插入的位置。子页读取提供者中的购物车和表单。进入结账时，父级把菜单界面隐藏，父组件仍在树上，所以它持有的 state 和图片节点得以保留。页面另外记录滚动位置，供返回时恢复。普通页面内返回菜单，表单保留，但确认过的菜品列表会退出核对状态，下次结账重新核价。[父路由](../../../frontend/src/routes/r.$slug.tsx) · [菜单与 Outlet](../../../frontend/src/features/online-order/OnlineMenuPage.tsx) · [子路由](../../../frontend/src/routes/r.$slug.checkout.tsx)

比较三种动作，能检验是否真正理解了这个机制。

- 从结账**后退**：路由移除子页面，父菜单仍持有同一实例。
- **整页刷新**：浏览器重新启动 JS，原 React 树已销毁。能从 `sessionStorage` 恢复的是该餐厅持久化的购物车及待确认意图。直接进入结账链接时，若缺少这次核价的结果，页面会返回菜单，让顾客重新核对。
- 从一个餐厅**切换到另一个 slug**：父路由给 `OnlineMenuPage` 设置 `key={slug}`，餐厅身份改变会重建组件，随后按新餐厅 ID 读取购物车。[持久化和核价](../../../frontend/src/features/online-order/useOnlineCart.ts) · [结账入口](../../../frontend/src/features/online-order/OnlineCheckoutPage.tsx)

## Router 与 Query 的分工

Router 将当前位置解析为匹配的页面、已验证参数和组件层级。Query 用键和观察者组织异步数据。以账单为例，点击列表项改变 URL，页面由此知道应该订阅哪张账单。厨房状态改变时可以让相关查询失效，URL 无需变化。Router 也具备 loader 能力，但项目店员布局让 `AuthBoundary` 观察共享身份查询，使登录、退出和身份过期能一起更新各页面。每个 loader 再独立请求一次身份会多引入一种同步途径。前端边界决定显示哪个界面。API 同时在每个受保护操作上检查权限。[身份边界](../../../frontend/src/features/accounts/AuthBoundary.tsx) · [共享身份查询](../../../frontend/src/features/accounts/queries.ts)

## 动手与自测

在本地 Demo 接下一张线上单，用店主账号打开「结账」并选中它。记录地址，刷新，再把 `sessionId` 手动改成 `hello`。有效值经 `billingSearch` 交给页面。无效值被当作未指定，不会作为该 UUID 传给详情读取。然后在手机宽度的顾客菜单依次打开购物车抽屉、结账、后退，比较地址栏和 UI。抽屉可改变历史而保持 URL，结账则有独立路径。

**自测**　在一台新设备上复制顾客菜单 URL，能否得到原设备正在填写的电话？

<details>
<summary>展开参考答案</summary>

链接能定位餐厅。输入草稿属于原页面，恢复意图属于原标签页的存储，它们有自己的数据范围。

</details>

<a id="interview"></a>

## 意大利语面试

**«Quando metteresti uno stato nell’URL?»** 从刷新、分享和后退三个用户动作举例，再说运行时校验。

*Metto nell’URL le scelte che devono sopravvivere a un aggiornamento della pagina o che ha senso condividere. Nella lista dei conti il parametro sessionId identifica la selezione. Lo valido all’ingresso perché chiunque può modificare l’indirizzo. I dati personali digitati nel checkout restano nel modulo. Anche con un identificativo valido, l’API controlla l’accesso del ristorante.*

**追问**　为什么购物车抽屉可以支持后退，却不需要一个可分享的新 URL？

**«Che vantaggio dà una rotta annidata nel checkout?»** 解释父子匹配、组件寿命以及整页刷新的边界。

*Il menu rimane montato mentre la rotta figlia mostra il checkout nel suo outlet. Il componente padre possiede il carrello e lo passa tramite context. Tornando al menu ritrovo la stessa istanza e posso continuare a modificare l’ordine. Un ricaricamento completo ricrea l’albero React, quindi per recuperare una richiesta già inviata mi affido ai dati salvati nella scheda.*

**追问**　换一家餐厅时为什么有意给父菜单换 key？

[路线首页](../learning-notes.md) · [下一章：身份、测试与运行环境](08-runtime.md)
