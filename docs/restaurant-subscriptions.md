# 餐厅收费周期

平台为每家餐厅维护老板联系方式、以后新建周期默认使用的年费，以及逐次收费周期。
这些资料由 Platform 管理；本店 OWNER 只读，STAFF 与 Guest 无权读取。
收费资料不会进入 `/api/auth/me` 或公开菜单。第一版不保留变更历史，也不提供站内通知。

平台收费管理、提醒汇总与 OWNER 的订阅页面均支持中文、意大利语、英语，使用店铺与平台共用的本机语言偏好。
表单、状态、确认区域和结果未知提示均从 `features/subscriptions/messages.ts` 的三语字典读取；
共享的 `SubscriptionStatus`、`PeriodDetails` 自行调用 `useStaffLanguage()`，调用方不再传入 `language`。
金额展示随界面语言切换，收费日期仍是餐厅当地日期。语言选择与错误翻译规则见仓库根目录 [`AGENTS.md`](../AGENTS.md#ui-conventions) 的 “UI Conventions”。

## 日期、金额和付款

每个周期保存开始日期、截止日期、约定年数、整个周期总金额及可空付费日期。
开始日期包含，截止日期不包含：2026-11-01 开始的一年默认在 2027-11-01 到期。
两年默认截止到 2028-11-01。前端按日历加年，闰日落在非闰年时取二月最后一天；
管理员可确认人工调整后的截止日期。日期均为餐厅当地日期，服务端使用 `TimeProvider`。

总价按默认年费乘年数预填，管理员可改成约定优惠总价。金额用 EUR 整数分，必须在
JavaScript 安全整数范围内；周期总金额须大于零，默认年费允许零或未配置。
默认年费变化不会改动已登记周期的总价。每个周期一次付清，付费日期为空即未付。
允许提前收款；2026-11-03 才收到 11 月 1 日开始周期的钱时，只填写付费日期，
保留原有开始与截止日期。付费日期不得在餐厅当地未来。

续费新增周期，允许与旧周期的截止日期相接，不允许重叠。未付款周期可修改约定；
已付款周期冻结总金额和付费日期，只能通过单独的期限接口调整截止日期。
建店可同时登记首个周期及首笔付款，与餐厅和两个账号全成或全败。
未付款可开户，旧餐厅迁移后显示未登记，不补造付款或期限。

## 提醒

- 开始日期已到且未付费的周期持续提示待付费，即使该周期已过期；付款后清除对应提示。
- 当地日期距离连续服务期限截止日 1–7 天时提示即将到期，截止当天即到期。
  已登记连续后续周期时看连续期限的最终截止日，付款提醒独立计算。
- 未登记、待开始、使用中、已到期是服务期限状态；已付款/未付款是另一个维度。
- 平台餐厅列表、平台提醒汇总、老板页面和店铺页面顶部的老板提醒在前台联网时每 60 秒刷新，
  恢复联网或回到前台时重新读取。关闭网页后不发送外部消息。
  到期与欠费均只提示，服务状态、接单、活动账单继续由既有业务规则控制。

## 接口与并发

平台根路径为 `/api/platform/restaurants/{id}/subscription`：

| 方法 | 相对路径 | 用途 |
|---|---|---|
| GET / PATCH | 空路径 | 查询资料 / 修改联系方式与默认年费 |
| POST | `/periods` | 新建周期，可同时登记已付费 |
| PATCH | `/periods/{periodId}` | 修改未付款周期约定 |
| PATCH | `/periods/{periodId}/expiry` | 单独调整期限 |
| POST | `/periods/{periodId}/payment` | 确认收到全款 |

OWNER 只读 `GET /api/owner/subscription`，由 `CurrentAccount` 决定餐厅。
平台提醒汇总为 `GET /api/platform/subscription-reminders`。
餐厅列表支持 `subscriptionStatus=UNPAID|DUE_SOON|EXPIRED|UNCONFIGURED`、`sort=EXPIRY`。

读取在同一 Repeatable Read 快照中返回 `{ summary, periods }`：含 `version` 的汇总，
以及按开始日期倒序的全部周期，不分页。界面展示的金额因此一定属于确认时冻结的版本。

平台写入携带读取时的 `expectedVersion`。事务先锁餐厅 UPDATE 并检查版本，确有变化时
递增版本并保存，最后返回更新后的完整资料；内容没有变化的保存不改版本。版本号是唯一的
重复保护：丢失、重复或迟到的请求只会作用于它确认时的那个版本，同一版本最多一次成功，
其余请求得到 `SUBSCRIPTION_CHANGED`。因此浏览器不保存待确认标记：结果未知（超时、断网
或离开前台）时只重新读取，由管理员核对后重新确认，不会重复登记。
每次生效的修改在服务端日志中记录平台操作者、餐厅和操作类型，不记录金额或联系方式。

## 迁移和验收

收费周期初版新增 `restaurant_subscription_periods` 一张表，当时连同原表共十张；后续加入菜品图片后，当前完整模型共十一张。
迁移需显式执行，见 [数据层](data-layer.md)。

后端 `SubscriptionTests` 使用 disposable PostgreSQL 验证周期、按版本防重复、并发、日期和
权限，`SubscriptionSummaryTests` 验证状态计算；前端纯逻辑测试验证日历计算和金额。
UI 验收至少走一遍未付开户、两年优惠价、提前/延后收款、续费、改价、独立延期，
以及断网后重新读取核对。

### 2026-10-24 验证记录（删除业务事件表后）

- `dotnet test TavoloFlow.slnx`：262 项通过，使用临时 PostgreSQL 容器。
- `dotnet ef migrations has-pending-model-changes --project backend/TavoloFlow.Api --no-build`：模型与迁移一致。
- 前端 `node --test --test-isolation=none tests/*.test.ts`：55 项通过；`npm run build`、
  `npm run lint`、`npm run format:check` 均通过。
- 本次没有重新执行浏览器验证。

### 2026-10-24 验证记录（初版）

以下记录早于删除业务事件表，其中的老板通知、标记已读和按编号查询原操作均已不再存在。

- `dotnet test TavoloFlow.slnx --no-restore -m:1`：262 项通过，使用临时 PostgreSQL 容器。
- `dotnet ef migrations has-pending-model-changes --project backend/TavoloFlow.Api --no-build`：模型与迁移一致。
- 前端 `node --test --test-isolation=none tests/*.test.ts`：55 项通过；`npm run build`、
  `npm run lint`、`npm run format:check` 均通过。
- Chromium 使用模拟 API 验证：旧周期页版本不能确认新金额；刷新后展示并提交新金额且仅提交一次；
  两年续费日期与总价预填；老板通知显示及标记已读。无浏览器运行时错误。
  此次没有执行完整部署环境的试运营 E2E。
- 截图使用虚构餐厅、联系人和费用，未展示临时密码或实际账户：
  [平台周期管理](screenshots/restaurant-subscriptions/platform-periods.png)、
  [老板通知与历史](screenshots/restaurant-subscriptions/owner-notifications.png)。
