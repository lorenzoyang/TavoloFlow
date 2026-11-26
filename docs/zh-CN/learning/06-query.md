# 6. TanStack Query 与服务器数据

首页和厨房都要知道当前店员是谁。若两个组件各自在 Effect 中 fetch、记录 loading、缓存结果，登出时谁来清理？如果一次旧的 GET 比登录新账号的请求更晚返回，又该显示谁？TanStack Query 处理的是**异步取得、可共享、会过时的数据副本**。

## Query key 怎样把两个组件连起来

`QueryClient` 管理缓存。一个 query key 标识一组可共享的结果，`queryFn` 描述怎样取得它。组件通过 `useQuery` 观察相应条目，库让订阅者得到数据、错误和获取状态，并在结果变化时通知相关观察者。同一客户端上同一键的并发读取通常可共享正在进行的请求。共享的是该次读工作的结果。两次相隔很久的读取仍可能各发一次网络请求。[Query keys](https://tanstack.com/query/v5/docs/framework/react/guides/query-keys) · [项目 QueryClient](../../../frontend/src/lib/query-client.ts)

厨房的基础键是 `["kitchen", restaurantId, userId]`，队列视图还追加状态。这样，改变餐厅、用户或状态就订阅另一组结果。在 `useInfiniteQuery` 中，游标作为 `pageParam` 传给取数函数，各页存在同一个列表条目之下。若把一个会改变结果的条件漏出键，两个不同视图就可能复用错数据。项目的店员身份另有共享键 `["auth","me"]`。身份变化时取消并清除店员私有查询，替换身份结果。缓存分区改善界面的一致性，数据能否读取仍由 API 授权。[厨房查询](../../../frontend/src/features/kitchen/useKitchen.ts) · [视图键](../../../frontend/src/lib/store-views.ts) · [账号切换](../../../frontend/src/features/accounts/queries.ts)

<a id="cache"></a>

## 沿时间轴看一条缓存

假设界面一直在线，查询使用项目的默认配置，且已启用。

| 时刻 | 缓存里有什么 | 用户可能看见什么 |
| --- | --- | --- |
| T0 首次挂载 | 这个键没有数据，发起 GET | 首次加载提示。 |
| T1 GET 返回 | 写入结果，通知订阅组件。项目 `staleTime: 0`，数据立即可视为过时 | 渲染已有数据。此设置不会让页面立刻无限发送 GET。 |
| T2 切走后重新回到应用 | 若满足条件，重新聚焦等事件可触发后台读取 | 原内容仍在，后台可显示同步状态。`isFetching` 可以为真且同时存在数据。 |
| T3 最后一个观察者卸载 | 条目变为非活跃，仍可供稍后复用 | 再次挂载有机会先显示缓存再重取。 |
| T4 无人使用超过回收期限 | 条目可被回收 | 下一次访问可能回到 T0。v5 在浏览器中的默认 `gcTime` 是五分钟。 |

`staleTime` 回答「多久把数据视为新鲜」，`gcTime` 回答「不用的副本可以留多久」，轮询间隔回答「什么时候主动再读」。库的浏览器默认值还允许对失败读取重试。项目显式设 `queries.retry: false`，保留聚焦和重连时的重读。厨房另配前台每十秒轮询、后台停轮询，恢复后要求收到新轮询才把屏幕视为同步。数据刚进入缓存只能证明一次读取成功，无法保证餐厅在下一刻没有新订单。[TanStack Query v5 默认值](https://tanstack.com/query/v5/docs/framework/react/guides/important-defaults) · [项目配置](../../../frontend/src/lib/query-client.ts) · [厨房同步判断](../../../frontend/src/features/kitchen/useKitchen.ts)

## 服务端写入后，谁让其他页面知道

一份菜标记为做好会影响厨房、出餐等多个视图。mutation 表达一次带副作用的动作。库无法从一个返回的 DTO 自动推断整个餐厅哪些列表受影响。`invalidateStoreViews` 按账号和视图前缀标记相关键过时，活跃的可重新请求。也可以在响应完整、身份确定时直接 `setQueryData`，例如登录后替换当前身份。手工修补多份缓存更快，但维护者要负责让每个投影一致。[跨页面失效](../../../frontend/src/lib/store-views.ts) · [店员账号查询](../../../frontend/src/features/accounts/queries.ts) · [失效的语义](https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation)

推演一个实际竞争：A 账号正在编辑。读 R1 在保存前发出，写 W 随后成功，界面需要的是 W 之后的状态。`refreshAfterWrite` 取消同键旧查询，确认当前仍是 A，再发新读 R2，结束时再核对账号。换号后一个晚到的「已保存」提示也可能误导 B。这里既要解决**数据属于谁**，也要解决**这次读在写之前还是之后开始**。[保存后刷新](../../../frontend/src/features/accounts/queries.ts)

读失败可以重读。写失败可能表示响应丢失，重放会产生另一次业务效果。项目设 `mutations.retry: false` 和 `networkMode: "always"`，让实际执行的写能及时失败，避免离线排队后重放。顾客提交还有专门的持久意图与 GET 恢复流程。`useMutation` 本身不能证明数据库已经提交或回滚。[提交恢复](../../../frontend/src/features/online-order/useOnlineCart.ts)

## 动手与自测

登录本地店员厨房，Network 筛选厨房队列 API，保持前台二十多秒，观察 GET 的出现。把页面切到后台，再回来。找到 `useKitchen` 的 `refetchInterval`、`enabled` 和 `syncIsFresh`，分别解释何时发请求、什么结果能算恢复后的新同步。已有列表可显示，活动页面继续重读，恢复后的旧数据显示与同步确认是两个状态。

**自测**　同一家餐厅两个账号轮流用一台平板，只拿餐厅 ID 作键够吗？

<details>
<summary>展开参考答案</summary>

这里私有数据和权限还与用户有关，键中要有账号范围，切换身份也要清理旧查询。另一个自测是给表单键加上菜名输入值。这会把正在输入的本地草稿误建模成许多独立服务器查询。

</details>

<a id="interview"></a>

## 意大利语面试

**«Perché usare una libreria per i dati del server quando React ha già useState?»** 说清权威数据在哪里，以及一个组件卸载后谁负责共享、刷新。

*Con useState gestisco bene una bozza locale. Per un elenco condiviso devo anche coordinare richieste simultanee, aggiornamenti in background e invalidazione. Con TanStack Query i componenti osservano una voce identificata da una chiave. In cucina includiamo nella chiave ristorante, utente e stato della coda. Il server conserva il dato autorevole, mentre il client decide quando aggiornare la copia.*

**追问**　店主输入到一半的菜名会放入同一份查询缓存吗？

**«Qual è la differenza tra staleTime e gcTime?»** 用离开厨房再返回举例。

*StaleTime indica per quanto tempo considero fresco un risultato. Scaduto quel periodo, posso ancora mostrarlo e aggiornarlo in background quando si verifica un evento opportuno. GcTime entra in gioco quando nessun componente osserva più quella query e determina per quanto tempo conservarla. Il polling della cucina ha un intervallo separato, legato alla necessità di mostrare nuovi ordini.*

**追问**　项目 `staleTime` 为零为什么仍然能立刻显示旧队列？

[路线首页](../learning-notes.md) · [下一章：TanStack Router](07-router.md)
