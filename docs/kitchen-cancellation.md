# 厨房：逐菜出餐与取消

顾客一次提交仍是一笔订单；厨房按订单查看桌号、下单时间、整单备注和菜品快照，但按明细行处理。
“炒饭 ×3”一次出餐或取消三份，不支持分批数量。此处的已出餐只表示厨房完成，不表示服务员已取餐或送达。

## 状态与页面

明细状态只有 `NEW`（待出餐）、`READY`（已出餐）、`CANCELLED`（已取消）。STAFF 和 OWNER 都只能将 NEW 改为 READY 或 CANCELLED；终态不能撤销或互转，老板也不能取消已出餐菜品。本阶段不做免单。

订单状态由明细汇总：有任一 NEW 则为 NEW；全部处理后为 PROCESSED，`processedAt` 是最后一个明细处理时间。

| 厨房标签 | 内容 | 排序 |
|---|---|---|
| 待处理 | NEW 订单，显示所有明细 | `(created_at, id)` 升序 |
| 已处理 | PROCESSED 订单，包括全部取消 | `(processed_at, id)` 降序 |

待处理卡片中，待出餐行有“出餐完成”主按钮与更多菜单中的“取消菜品”。取消使用 ConfirmDialog，明确桌号、菜名、整行数量及扣除金额，提示先与厨房沟通，不填写原因。
已处理行留在原顺序，压缩显示并隐藏详细备注与操作：出餐用勾号，取消用删除线和文字标签。卡片显示“待出餐 X 项／共 Y 项”（按明细行计，不是份数）。最后一项处理后整卡移出。
已处理标签保留完整订单与逐项备注、处理时间；全部取消的订单使用中性色。没有整单写入按钮或独立已取消标签。

## 接口契约

使用店铺 Cookie、首次改密策略、可信 `CurrentAccount.RestaurantId`；写操作验证店铺 CSRF。不能从客户端指定餐厅或角色。

| 方法与路径 | 输入 | 结果 |
|---|---|---|
| `GET /api/staff/orders` | `status=NEW/PROCESSED`，默认 NEW；cursor；limit 默认 50/max 100 | `{ items, nextCursor, totalCount, pendingCount, createdOrderCount }` |
| `GET /api/staff/orders/{id}` | 订单 ID | 完整当前订单，用于未知结果核对 |
| `POST /api/staff/orders/{id}/items/{itemId}/ready` | `{}` | 指定行 NEW → READY，返回完整订单 |
| `POST /api/staff/orders/{id}/items/{itemId}/cancel` | `{}` | 指定行 NEW → CANCELLED，返回完整订单 |

旧 `/orders/{id}/ready`、`/cancel` 已移除。取消不需要 expectedStatus 或 reason，因为唯一合法来源是 NEW。

厨房订单包含 `id, sessionId, tableLabel, status, createdAt, processedAt, cancelReason, defaultLanguage, totalAmountCents, payableAmountCents, orderNote, items`。
`cancelReason` 仅保留旧整单取消原因，新操作不写入。每个 item 在原快照字段上增加 `status, readyAt, cancelledAt`；顾客与账单共用此明细契约。
`totalAmountCents` 永远是原始下单金额；`payableAmountCents` 为未取消明细的单价乘数量之和。

- 列表只含 ACTIVE 用餐，行与计数来自同一 Repeatable Read 快照；游标绑定餐厅、状态和排序位置。
- `totalCount` 为当前分类订单数，`pendingCount` 为所有活动待处理订单数；这两个数仍按订单计。
- `createdOrderCount` 包含餐厅所有现存订单（含已处理、取消和关闭用餐），逐菜处理不会改变它。它用于发现新提交，不是审计序号。
- 单笔读取在 Session SHARE 锁下执行；关桌后返回 `409 SESSION_CLOSED`，历史另走 OWNER 账单历史接口。
- 写入时联合验证餐厅、订单、明细绑定，不存在、跨店或错误绑定均返回 `404 ORDER_ITEM_NOT_FOUND`；普通订单 GET 不存在仍返回 `ORDER_NOT_FOUND`。
- 重复操作、已出餐取消或竞争失败返回 `409 ORDER_ITEM_CHANGED`，不会覆盖时间或重复扣减。

## 事务与账单

写入先按可信餐厅与订单、明细 ID 找到 session，再只锁 Session UPDATE，不反向锁餐厅或桌位。
重新读取明细状态后执行带 `status = 'NEW'` 的条件 UPDATE。取消与 BillVersion +1 同事务提交；出餐不增加版本。服务暂停、桌位禁用、停止接单均不阻止处理既有菜品。

原始数量、价格、名称、备注及过敏原快照不变。取消只让该行退出应收，部分取消后的订单仍可能待处理。
每次逐项操作检查整单是否已无 NEW，并原子维护订单状态与 processedAt。时钟倒退时逐项时间钳制到下单时间；整单时间取所有明细终态时间的最大值。
下单、取消和所有关桌共用 Session UPDATE 锁，避免遗漏取消金额或把已关桌的菜品继续处理。

账单按明细计数：`itemCount, newItemCount, cancelledItemCount`，订单数仍保留。未出完菜不能结账，已有订单且所有明细取消才能 VOIDED；曾下单的用餐不能 EMPTY。详见 [账单与历史](billing-history.md)。

## 前端同步与恢复

- 可见且在线时每 10 秒刷新全部已加载分页；30 秒陈旧、失败、离线或恢复前台后未重新同步均禁写。使用 `syncIsStalled` 的宽限避免短暂刷新闪警告。
- 菜品写入或未知结果期间只锁本订单，其他订单仍能操作。写入前保存最少标识 `{ orderId, sessionId, itemId, kind }` 到按标签页、餐厅、账号隔离的 sessionStorage，不保存菜名、原因或请求正文。
- 持久记录只有结果未知后才显示提示；结果核对 GET 原订单，检查目标 item 的状态，绝不自动重发 POST。目标仍为 NEW 时清除标记，用户可以重新核对后手动操作；取消再次弹确认。
- 旧整单标记转换为 `itemId: null` 的只读核对记录，GET 后提示查看逐项状态，不推断某个菜品或发起新写入。
- 收到新响应前取消旧列表请求，验证完整订单金额与状态，再更新厨房及失效桌台、账单查询。页面隐藏、身份变化、离线均取消请求并丢弃迟到响应；确认弹窗同时关闭。
- 声音默认开启，浏览器需要手势解锁；首次加载、回前台、重连建立静默基线，两个标签共享新单计数基线。声音、常亮仅保留设备偏好。

## 数据升级与发布

`ItemLevelOrderProcessing` 新迁移保留所有既有迁移和订单。旧 NEW/READY/CANCELLED 整单状态分别复制给其明细；READY/CANCELLED 订单汇总为 PROCESSED。旧完成、取消时间复制到明细；旧 READY 后被取消的记录保留两个时间，旧取消原因保留在订单上。
这些时间是历史整单事件的兼容值，并非真实逐菜出餐时间。原始金额、内容快照和已关闭账单金额不变。

前后端与数据库作为同一版本发布，使用现有显式 migration bundle 流程，发布后旧页面需刷新；不自动启动迁移。部分完成与无原因取消无法无损降级为旧整单模型，迁移 Down 明确拒绝，回退需恢复升级前备份。

## 验证与学习实验

后端 `KitchenTests` 覆盖同菜不同备注、多份整行处理、终态权限、CSRF/租户与绑定、分页、并发重复操作和不同明细并发、时钟倒退、取消事务回滚与安全整数限制。`BillingTests` 验证与结账竞争；`ItemProcessingMigrationTests` 验证旧状态升级、时间和历史金额；数据层测试验证空库迁移及约束。

前端 `tests/kitchen.test.ts` 验证持久标识、旧记录 GET 核对、状态判定和同步门禁；订单结果测试涵盖部分与全部取消的恢复；账单测试验证明细级关单条件。

人工验收：手机与平板点击一行出餐，确认留在原位；取消另一行且不填原因；最后一项处理后整卡进入已处理。双设备同时操作同一行只能成功一次；断网后恢复只发 GET。再比较桌台、顾客、账单及历史的应收与明细状态。

### 本次验证记录（2026-10-27）

- `dotnet build TavoloFlow.slnx --no-restore -m:1`：通过，无警告；`dotnet test TavoloFlow.slnx --no-build -m:1`：257 项通过，使用一次性 PostgreSQL 容器，包含升级测试。
- `npm run build`、`npm run lint`、`npm run format:check`：通过；Node 24 下 `node --test --test-isolation=none tests/*.test.ts`：60 项通过。
- Chromium 模拟 390×844 手机及 1100×900 平板，以模拟 API 验证逐项操作、紧凑行、取消菜单与无需原因的确认、最后一项处理后移出、已处理页完整详情、横向溢出检查；另验证丢失写响应后的 GET-only 恢复，以及双页面竞争后旧取消确认失效。无页面运行错误。
- 浏览器验证使用模拟身份和接口，没有访问真实商家或生产数据库；实际事务、接口与迁移由后端集成测试覆盖。未在实体手机／iOS 上验收，当前 Linux 浏览器环境缺少中文字体，中文文案通过 DOM 校验。
