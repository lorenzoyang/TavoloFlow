# 跟着一张订单学全栈

假设你能解释进程、网络请求和关系表，但第一次接手一个完整的 Web 项目。顾客在手机上按下「提交」，店员稍后才在厨房看到菜品。两者中间发生了什么？用一张纸画出浏览器、HTTP API 和 PostgreSQL 三栏。每读完一章，给图加上一条消息、一次状态变化，或一种失败后的处理方式。

本课程以中文为原稿。代码对应 TavoloFlow 的 ASP.NET Core 10、EF Core 10、PostgreSQL 18、React 19、TanStack Query v5 和 Router v1。版本以仓库的依赖声明及锁文件为准。首次运行请按[本地开发指南](local-development.md)启动 Demo Ramen。做线上下单练习前，先按该指南「试用线上点单」开启店铺并设置覆盖当前时间的营业时段。也可以仅打开源码与测试，完成每章的纸面推演。

## 按顺序学习

| 次序 | 精读章节 | 合上文档，检验自己能否做到 |
| --- | --- | --- |
| 1 | [HTTP 与一次下单](learning/01-http.md) | 画出首次提交、重复提交、响应丢失的消息顺序。 |
| 2 | [ASP.NET Core 与应用分层](learning/02-aspnet-core.md) | 指出一个新业务条件应放在哪一层，并说明依赖由谁创建。 |
| 3 | [EF Core 与关系数据库](learning/03-ef-core.md) | 从查询推导出 SQL 的形状，解释对象与数据库记录何时可能不同。 |
| 4 | [事务、并发与幂等](learning/04-concurrency.md) | 用两条请求的时间线解释一次竞争，以及保护规则为何有效。 |
| 5 | [React 与浏览器状态](learning/05-react.md) | 预测一次渲染、一个异步事件和一次后台刷新之后的界面。 |
| 6 | [TanStack Query 与服务器数据](learning/06-query.md) | 给不同账号设计查询键，判断什么时候会看到旧数据、什么时候会发 GET。 |
| 7 | [TanStack Router 与 URL](learning/07-router.md) | 判断一个选择该不该进 URL，解释刷新、后退、切换餐厅各保留哪些状态。 |
| 8 | [身份、测试与运行环境](learning/08-runtime.md) | 解释一笔操作在哪里获得授权，以及用哪一层测试证明它正确。 |

第一次读可以把 1–2、3–4、5–7、8 分成四轮。每轮先看一个成功案例，再改一个条件，**先写预测，再看源码或运行测试**。测试名中的场景和断言往往比从构造函数开始读更快。想先看餐厅的完整工作流，搜索测试方法 `AcceptedSession_UsesTheExistingKitchenPassAndBillPaths`，跟随店主接单、厨房处理和账单检查，再回头读顾客提交的入口。[工作流集成测试](../../backend/TavoloFlow.Api.Tests/OnlineStaffTests.cs)

## 按眼前的问题查阅

| 正在读代码时的疑问 | 从哪里开始 |
| --- | --- |
| 我的理解对吗，Controller 接 HTTP，Service 管逻辑？ | [用提交接口划分职责](learning/02-aspnet-core.md#controller-service) |
| 改完配送设置为什么又查一次数据库？ | [追踪对象和直接更新](learning/03-ef-core.md#tracking) |
| 两台设备同时操作，为什么前端禁用按钮还不够？ | [同一个请求号的两次提交](learning/04-concurrency.md#two-submissions) |
| 后台菜单更新了，为什么我输入的菜名还在？ | [编辑中的草稿](learning/05-react.md#draft) |
| 为什么有缓存，回到厨房页面还是会发请求？ | [看一次缓存的生命周期](learning/06-query.md#cache) |
| 为什么从结账退回菜单后购物车还在？ | [嵌套路由和组件寿命](learning/07-router.md#nested) |
| 同一个人能登录，为何未必有权限看一张账单？ | [身份、权限和数据归属](learning/08-runtime.md#identity) |

## 意大利面试速查

下列练习面向意大利初级 .NET、React 或全栈岗位。选题依据包括当地雇主列出的 ASP.NET Web API、ORM、SQL、React、TypeScript 和 Git 技能。各家公司采用的数据库、前端框架和面试形式会不同。这些是从岗位要求推导出的练习优先级，样本不支持对真题出现频率进行排名。[Blumatica 招聘页](https://www.blumatica.it/azienda/lavora-con-noi/) · [Trinaware 初级岗位要求](https://www.trinaware.it/azienda/lavora-con-noi)

| 想练习的口述话题 | 意大利语问题与示范回答 |
| --- | --- |
| HTTP 语义、超时恢复 | [第 1 章面试](learning/01-http.md#interview) |
| Controller / Service、依赖注入 | [第 2 章面试](learning/02-aspnet-core.md#interview) |
| ORM 的工作方式、SQL 与索引 | [第 3 章面试](learning/03-ef-core.md#interview) |
| 并发控制、幂等与事务 | [第 4 章面试](learning/04-concurrency.md#interview) |
| 渲染快照、Effect 与事件 | [第 5 章面试](learning/05-react.md#interview) |
| 服务端状态、缓存一致性 | [第 6 章面试](learning/06-query.md#interview) |
| URL 状态、嵌套路由 | [第 7 章面试](learning/07-router.md#interview) |
| 认证授权、集成测试 | [第 8 章面试](learning/08-runtime.md#interview) |

**最后做一次不看答案的模拟。** *Il cliente preme due volte “Ordina” e la prima risposta va persa. Come eviti di creare due ordini?* 用一分钟回答，然后画出两个 POST 和一个恢复用的 GET。检查答案中是否同时出现「原请求号」「数据库中的唯一性」「提交后才通知」「GET 一时查不到的含义」。最后再回答店主的一个问题：顾客看见「已收到」时，厨房是否已经有了这份订单？[提交与接单契约](../reference/online-ordering.md)
