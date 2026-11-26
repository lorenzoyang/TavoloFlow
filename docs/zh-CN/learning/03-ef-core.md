# 3. EF Core 与关系数据库

历史账单可能有几万张，页面只要某家餐厅某个日期范围内的前几十张。若程序先把整张表装进内存再筛选，虽然结果可能正确，网络、内存和延迟都已经付出了代价。读 EF 查询时，第一问应是「这段工作在哪里执行，何时往返数据库」？

## 从对象模型到查询计划

`ApplicationDbContext` 表示一次与数据库合作的工作单元。`DbSet` 给应用一个组合查询的入口。配置类把实体属性、关系、列、约束和索引映射到实际关系模型，Npgsql 提供 PostgreSQL 方言的翻译。链式的 `Where`、`OrderBy`、`Select` 通常只逐步构造 `IQueryable` 表达式。枚举、`ToArrayAsync`、`SingleOrDefaultAsync`、`LongCountAsync` 等终结操作才要求数据库给出结果。若提前 `ToList`，后续对该列表做的筛选就留在应用内存中。[上下文](../../../backend/TavoloFlow.Api/Data/ApplicationDbContext.cs) · [EF 查询执行](https://learn.microsoft.com/en-us/ef/core/querying/how-query-works)

看 `BillQueries.HistoryAsync`。它先用租户、状态和时间范围约束 `sessions`。然后做一次总数查询，再给明细加上游标、排序和 `limit + 1`。下面是明细的**概念 SQL**，用来推理访问方式。真实投影还包含账单摘要。

```sql
SELECT id, closed_at
FROM dining_sessions
WHERE restaurant_id = :restaurant
  AND status = 'CLOSED'
  AND closed_at >= :start_utc AND closed_at < :end_utc
  AND (closed_at, id) < (:last_time, :last_id)
ORDER BY closed_at DESC, id DESC
LIMIT :page_size_plus_one;
```

第一页省略游标条件。两张账单可能同一时刻关闭，`id` 给它们一个确定的次序。额外取一条即可判断还有没有下一页。比起深度 `OFFSET`，按最后一个排序键往后查更容易利用匹配的索引，但不适合直接跳到任意页。总数和明细在一次 `RepeatableRead` 事务里读取，因此在**同一页响应内**看到同一快照。点击下一页是另一次 HTTP 请求，会开启新的事务。[账单历史查询](../../../backend/TavoloFlow.Api/Billing/BillQueries.cs) · [EF 分页](https://learn.microsoft.com/en-us/ef/core/querying/pagination)

投影把「需要哪些列或计算结果」交给数据库。读取实体再逐行加载关联对象可能造成 N+1 次往返。把所有关联一律加载又可能造成行数膨胀。先看页面真正显示什么，再决定投影、聚合或分批查询。数据库最终选择何种访问路径由优化器决定，索引列顺序、筛选范围、数据量都会影响结果。调试时可在查询终结前查看 `ToQueryString()`。要研究实际代价，可在本地库对只读 SQL 查看 `EXPLAIN (ANALYZE, BUFFERS)`。耗时、返回行数和往返次数回答不同的问题。[EF 高效查询](https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying) · [PostgreSQL 执行计划](https://www.postgresql.org/docs/18/using-explain.html)

<a id="tracking"></a>

## 为什么保存之后还要读一遍

| 操作 | 数据库端 | 当前 DbContext 中的对象 |
| --- | --- | --- |
| 普通跟踪查询 | 执行 SELECT | 跟踪实体身份与状态。再查同一主键时，EF 可以复用该实例。 |
| `AsNoTracking` 查询 | 同样执行 SELECT | 返回读取时的值，适合展示或生成响应。这是对象跟踪策略，事务隔离级别单独决定。 |
| 修改跟踪实体，调用 `SaveChangesAsync` | 把待保存的变化传给数据库 | EF 根据跟踪状态决定需要的写入，并在成功后更新状态。 |
| `ExecuteUpdateAsync` | 立即执行集合式 UPDATE | 绕过变更跟踪，已加载的对象可能保留旧值。 |

`OnlineSettingsService.SetDeliveryAsync` 是一个同时用到两种写法的例子。它在事务里锁餐厅、直接更新配送属性、替换配送费档位，再通过 `ResponseAsync(restaurantId, …)` 以不跟踪方式回读餐厅并组装响应，最后提交。若直接用最初锁到的对象回答，数据库已经启用了配送，HTTP 响应却可能还说「关闭」。若在内存中手动复制每一个新属性，下一次新增字段就容易漏改一处。回读的成本是一次查询，换来的是响应值与这次实际写入一致。[配送设置实现](../../../backend/TavoloFlow.Api/Online/OnlineSettingsService.cs) · [EF 跟踪机制](https://learn.microsoft.com/en-us/ef/core/change-tracking/) · [集合式更新](https://learn.microsoft.com/en-us/ef/core/saving/execute-insert-update-delete)

## 表结构里有哪些业务知识

主键给一行稳定身份。外键要求引用目标存在。项目中菜品到分类的复合外键还包含餐厅 ID，因此「菜品和分类都存在、却属于不同餐厅」也会被数据库拒绝。同一餐厅的 `client_request_id` 唯一，允许多个并发写入者最终仍受同一约束。普通索引帮助查找，唯一索引还表达「最多一条」的规则。每个索引都占空间并增加写入维护成本。[菜品映射](../../../backend/TavoloFlow.Api/Data/Configurations/MenuItemConfiguration.cs) · [线上请求映射](../../../backend/TavoloFlow.Api/Data/Configurations/OnlineRequestConfiguration.cs)

迁移记录如何把已有数据库从旧结构演进到新结构。修改实体、生成迁移、应用迁移是三个动作。改动已有行的数据含义时，还要设计旧数据如何填充。CI 检查 EF 模型与迁移快照的差异，集成测试把真实迁移应用到临时 PostgreSQL。项目部署时显式应用迁移，因而单纯重启 API 不会顺便改表。[迁移历史](../../../backend/TavoloFlow.Api/Data/Migrations/) · [发布流程](../releasing.md)

## 动手与自测

打开 `HistoryAsync`，依次标记 `Where`、`LongCountAsync`、`Take`、`ToArrayAsync`。预测只增加一个过滤条件会不会增加一次往返。组合条件本身不执行 SQL，计数和最终取明细是两个独立执行点。再设想同一秒关闭了三张单，只靠时间翻页会遗漏谁？若下一页使用严格小于上一页末尾时间，剩余同时间记录可能全被跳过。

**自测**　加 `AsNoTracking` 能解决慢查询的所有问题吗？

<details>
<summary>展开参考答案</summary>

它减少实体跟踪开销。缺失的过滤条件、低效排序、传输过多的行仍需从 SQL、索引和投影上分析。

</details>

<a id="interview"></a>

## 意大利语面试

**«Quando viene eseguita una query con Entity Framework Core?»** 解释组合、执行、物化三个时刻。

*Con IQueryable descrivo la query per passi. Quando chiamo per esempio ToArrayAsync, il provider traduce l’espressione supportata in SQL e legge i risultati. Nello storico applichiamo prima i filtri del ristorante e del periodo. Se materializzassi subito tutta la tabella, i filtri successivi lavorerebbero in memoria e trasferirei molte più righe.*

**追问**　`LongCountAsync` 和 `ToArrayAsync` 用到同一查询变量时，数据库执行几次？

**«A cosa serve un indice e come verifichi che una query ne tragga vantaggio?»** 从访问模式出发，说出收益、成本和验证方法。

*Parto dai filtri e dall’ordinamento reali. Un indice coerente con questi criteri può ridurre le righe da esaminare, ma occupa spazio e va aggiornato a ogni scrittura interessata. Controllo il piano di esecuzione e provo con dati rappresentativi. Per lo storico considero anche il secondo campo di ordinamento, così la paginazione rimane deterministica a parità di data.*

**追问**　索引查得很快就能保证请求号唯一吗？指出普通索引和唯一索引的区别。

[路线首页](../learning-notes.md) · [下一章：事务和并发](04-concurrency.md)
