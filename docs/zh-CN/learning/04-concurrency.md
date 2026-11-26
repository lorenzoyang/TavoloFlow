# 4. 事务、并发与幂等

两个店员在两台平板上同时看见「等待接单」。两人都取得了真实数据，但只有一个决定可以生效。这里要保护的**业务不变量**是「一个请求最多产生一次接单结果」。先写出这句话，再决定靠什么机制保护它。

## 给不同时间尺度选机制

| 机制 | 它能保证什么 | 一个边界 |
| --- | --- | --- |
| 数据库事务 | 多条写入一起提交或回滚，其他连接按隔离级别观察结果 | 一段普通的「先查后写」即使包装成事务，两个事务仍可能先后都读到旧状态。 |
| 唯一约束 | 无论写入从哪个应用实例抵达，数据库只接受满足唯一性的最终数据 | 还要定义后来者收到原结果还是业务冲突。 |
| 行锁或事务级 advisory lock | 相互合作的写入者就某个资源排队，后到者可以据新状态重新判断 | 锁持有期间会让冲突者等待，锁顺序不一致可能死锁。 |
| 业务版本号 | 检查用户确认时看到的状态和当前状态是否一致 | 人在页面上思考时不能一直持有数据库锁，提交时仍须原子地检查再修改。 |
| 幂等键 | 同一次用户意图的多次传输可关联并恢复原结果 | 两次独立购买应有不同的键，即使菜品完全相同。 |

数据库课里的 ACID 可以映射到这里。接单时会话和订单一起出现体现原子性。约束与服务共同维护一致性。并发事务在各自可见的版本上工作体现隔离性。提交后的业务记录可以供新请求读取，持久性的范围取决于数据库的持久化配置。PostgreSQL 通过 MVCC 让普通读取看到数据的某个版本。默认 Read Committed 下，每条普通 SELECT 取得该语句开始时的已提交快照。Repeatable Read 让一次事务内的读取共用稳定快照。对竞争写入仍需依据不变量选合适的条件更新、锁或冲突处理。[PostgreSQL 隔离级别](https://www.postgresql.org/docs/18/transaction-iso.html) · [显式锁](https://www.postgresql.org/docs/18/explicit-locking.html)

<a id="two-submissions"></a>

## 场景一：顾客的两次提交都带 A

1. 请求甲、乙都可能在事务外找不到 A。这次快速查询是为了便宜地返回已有结果，读到空值还不足以允许创建。
2. 甲先取得餐厅共享行锁、该餐厅的提交事务锁，再分配当日序号。它在锁内又查一次 A，校验等待上限、菜单、报价和优惠，写入记录并提交。
3. 若乙走到了事务内，它取得同一提交锁时甲已结束。乙分配序号后复查 A，这次找到原记录，回滚自己事务里的序号更新，返回原结果。若乙在快速查询时已找到 A，连这段等待也省了。
4. 只有首次成功提交才把推送交给队列。这样不会把回滚的请求推给店员。提交成功与推送入队之间仍有间隔。这个通知是尽力送达，持久依据是待接请求列表。

为什么除了唯一索引还要有餐厅级提交锁？同一浏览器的待接上限与同一 IP 的等待数量可能涉及**不同请求号**，也可能跨越餐厅当地午夜。当日计数器只能把同一天对该行的更新排队，无法单独覆盖跨天的判定。代价是同一家餐厅的提交要短暂排队，所以外部验证安排在进入这段临界区之前。[SubmitAsync 和 NextNumberAsync](../../../backend/TavoloFlow.Api/Online/OnlineRequestService.cs) · [唯一索引](../../../backend/TavoloFlow.Api/Data/Configurations/OnlineRequestConfiguration.cs)

## 场景二：店员甲接单，店员乙拒单

这次是两个不同意图作用于**同一条已有记录**。两人操作前看到的 WAITING 都合理。这个阶段由接受时间、拒绝时间和到期时间推导。甲取得该请求的 `FOR UPDATE`，复查当前阶段，创建会话、订单与明细，提交。乙等到行锁后在自己的事务内重新读取，发现请求已离开等待阶段，得到冲突。如果乙先取得锁，最后会留下拒单决定。规定统一的锁获取顺序可以减少交叉等待。行锁由数据库管理，多进程部署时仍有效。[阶段判定](../../../backend/TavoloFlow.Api/Online/OnlineRequestState.cs) · [接单和拒单服务](../../../backend/TavoloFlow.Api/Online/OnlineStaffService.cs) · [RowLocks](../../../backend/TavoloFlow.Api/Data/RowLocks.cs) · [竞争测试](../../../backend/TavoloFlow.Api.Tests/OnlineStaffTests.cs)

## 场景三：顾客要求结账，厨房刚取消一道菜

店主在屏幕上确认的版本是 V、金额是 1400 分。厨房随后取消一道菜，金额和账单版本随事务更新。店主的旧确认到达时，关账服务取得会话锁，读取当前账单，再检查 `expectedBillVersion` 和确认金额。遇到 `BILL_CHANGED`，前端可以给店主看新值并重新确认。如果是先前已经成功且与既有关闭结果相符的重复确认，则可以返回已落库的关闭结果。这里用锁覆盖毫秒级服务端操作，用版本号覆盖人类阅读页面的数秒或数分钟。[关账流程](../../../backend/TavoloFlow.Api/Billing/BillingService.cs) · [确认与回放测试](../../../backend/TavoloFlow.Api.Tests/BillingTests.cs)

## 动手与自测

从仓库根目录运行以下命令，需要 .NET SDK 与 Docker。测试夹具创建临时 PostgreSQL 并应用项目迁移。

```bash
dotnet test TavoloFlow.slnx --filter 'FullyQualifiedName~Submit_ConcurrentRepeats_StoreOneRequest|FullyQualifiedName~AcceptAndReject_Racing_ExactlyOneWins|FullyQualifiedName~Checkout_ConfirmationAndRepeatedRequests_ClosesExactlyOnceWithoutChangingVersion'
```

先写下三种预期：A 只对应一条请求。接单与拒单只成功一个。重复关账保留第一次的关闭结果。对照断言，找出哪项检查的是返回码，哪项检查了落库状态。

**自测**　把等待上限的查询移到锁外，只保留请求号唯一索引，会怎样？

<details>
<summary>展开参考答案</summary>

两个不同请求号都可能读到剩余的最后一个名额，随后都写入，唯一索引依然满足。

</details>

<a id="interview"></a>

## 意大利语面试

**«Perché una transazione da sola può non bastare contro una race condition?»** 描述两次读取的先后，再解释如何让最终决定串行化。

*Due transazioni possono leggere entrambe una richiesta ancora in attesa e prendere decisioni incompatibili. Nel nostro flusso blocchiamo la riga della richiesta prima di decidere. Quando il secondo operatore ottiene il lock, rilegge lo stato e trova la decisione già presa. La transazione serve anche a salvare insieme la decisione, la sessione e le righe dell’ordine.*

**追问**　为什么不从店员打开页面时就持锁？考虑等待时长、断线和其他用户。

**«Come rendi idempotente la creazione di un ordine?»** 从同一次购买的身份讲到响应丢失后的恢复。

*Il client genera una chiave per il singolo tentativo di acquisto e la conserva prima di inviare il POST. Il server cerca la chiave nel ristorante corretto e, se la trova, restituisce il risultato salvato. Un vincolo univoco protegge i dati e un controllo nella transazione gestisce gli arrivi simultanei. In caso di risposta persa il client può iniziare con una lettura.*

**追问**　为什么不能拿「菜品列表的哈希」代替请求号？同一位顾客可能确实想再买一份。

[路线首页](../learning-notes.md) · [下一章：React](05-react.md)
