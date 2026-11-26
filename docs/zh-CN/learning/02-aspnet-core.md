# 2. ASP.NET Core 与应用分层

在 IDE 打开 `OnlineOrderController.Submit`。它只有几行，却能触发一整笔下单。把断点放在第一行，会发现路由已经匹配、参数已经有值，一些无效请求甚至到不了这里。理解这几行前后有哪些程序在工作，比记框架属性名更重要。

<a id="controller-service"></a>

## Controller 与 Service 到底怎么配合

**Controller 把 HTTP 请求接进来，Service 完成一个业务用例，Controller 再把结果表达成 HTTP 响应。** 在本项目中，`Submit` 从路径取得餐厅 `slug`，从 JSON 取得 `OnlineRequestInput`，从 `HttpContext` 取得该浏览器的提交来源，然后调用 `requests.SubmitAsync`。服务返回业务数据和 `Created` 标志，控制器据此选择 201 或 200。旁边的 `Menu` 更简单，只需把菜单读取结果包装为 200。[OnlineOrderController](../../../backend/TavoloFlow.Api/Controllers/OnlineOrderController.cs)

把 action 的核心两行单独读一遍。第一行把 HTTP 上下文转为用例需要的输入，最后的 `ct` 把这次请求的取消信号往下传。第二行才决定客户端看到哪种成功响应。沿第一行进入 Service，能找到菜单价格与并发控制。沿第二行看 HTTP 集成测试，能找到首次和重复提交的协议约定。

```csharp
var result = await requests.SubmitAsync(slug, input, browser.Require(HttpContext), ct);
return StatusCode(result.Created ? 201 : 200, result.Response);
```

| 要添加的规则 | 代码落点与原因 |
| --- | --- |
| 新的公开 URL、请求正文大小、成功状态码 | Controller 或对应的 HTTP 配置。换一种传输方式，这些决定会改变。 |
| 餐厅是否还接单、确认的价格是否有效、失败时哪些写入一起回滚 | Service 协调这次用例及其事务。另一个入口调用同一用例时仍应遵守这些规则。 |
| 满额免配送费如何计算 | 规则可写成只依赖参数的领域函数，交给用例调用，测试可直接覆盖金额边界。 |
| 多个接口共用的错误正文、CSRF 检查 | 用全局过滤器统一处理，每个 Controller 可以专注于自己的参数和返回值。 |

「Service」有两层常见含义。ASP.NET Core 的 DI 容器把可以解析的依赖统称为服务，包括时钟、数据库上下文和业务对象。项目里的 `OnlineRequestService` 则特指一个应用服务，负责组织一组业务操作。一个 Controller 可以注入多个服务。同一条领域规则也可以被下单、店员接单和修改账单分别调用。文件名相似只是导航线索，判断职责要看它拥有哪条规则。[提交用例](../../../backend/TavoloFlow.Api/Online/OnlineRequestService.cs) · [配送规则](../../../backend/TavoloFlow.Api/Online/OnlineDelivery.cs)

## 一次请求怎样穿过框架

1. 应用启动时，`Program.cs` 注册控制器、序列化配置、服务与过滤器，并装配请求管道。**注册依赖**和**处理某一次请求**是两个时刻。
2. 请求进入按顺序组成的中间件管道。中间件可以调用下一层再处理返回结果，也可以提前生成响应。项目先处理可信代理头，业务路径上先匹配路由，再应用线上限流、认证、授权。路由让后续步骤知道选中了哪个端点及其元数据。
3. 进入 MVC 后，授权过滤器可以提前拒绝写请求。模型绑定和 JSON 格式化器根据路由、查询串和正文构造参数。`[ApiController]` 配合项目的无效模型响应配置处理绑定错误。请求体能解析只能说明形状可用。例如一个结构完全合法的订单仍可能包含已售罄菜品。
4. Action 调用 Service 并返回结果，MVC 把结果写入 HTTP 响应。业务拒绝走 `ApiExceptionFilter`，生成带 `code` 和 `requestId` 的错误正文。未预料的异常还有管道级处理。由此可以用同一错误码驱动三种界面语言。[应用启动](../../../backend/TavoloFlow.Api/Program.cs) · [错误模型与过滤器](../../../backend/TavoloFlow.Api/Common/ApiErrors.cs) · [ASP.NET Core 中间件](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/?view=aspnetcore-10.0)

## 依赖注入、对象寿命和请求取消

如果服务自己创建数据库连接、读取系统时钟并调用真实验证服务，一条「餐厅刚刚打烊」的测试就要同时控制时间、连接和网络。构造函数注入把**需要什么**写在类的边界，启动代码决定**这次给哪个实现**。项目向下单服务提供 `TimeProvider` 和 `IOnlineVerification`，测试就能控制时间与验证结果。普通业务服务直接注册具体类也能注入，是否需要接口取决于有没有需要替换的边界。[依赖注册](../../../backend/TavoloFlow.Api/Program.cs) · [验证集成测试](../../../backend/TavoloFlow.Api.Tests/OnlineVerificationTests.cs)

| DI 生命周期 | 同一次解析/请求中会发生什么 | 在本项目中怎么想 |
| --- | --- | --- |
| Transient | 每次从容器请求该服务时创建实例 | 适合理解为独立、短命的对象，勿依赖它替其他消费者保存状态。 |
| Scoped | 在一个作用域内复用。Web 中通常每个请求一个作用域 | `AddDbContext` 默认使用此寿命，同一请求中合作的服务能拿到同一个上下文。 |
| Singleton | 整个应用容器共享实例 | 系统时钟、推送队列供多个请求使用。涉及可变状态时要考虑并发，不能让单例长期持有请求的 DbContext。 |

DbContext 记录一组短期的数据操作，具有可变的跟踪状态，不能用一个实例并行执行多个数据库操作。作用域决定实例何时复用和释放，事务边界取决于哪些写入必须一起成功。`CancellationToken` 把取消信号传递到异步 I/O。调用者停止等待时，是否已有数据提交仍要通过业务协议判断。[数据层注册](../../../backend/TavoloFlow.Api/Data/DataServiceCollectionExtensions.cs) · [DbContext 生命周期](https://learn.microsoft.com/en-us/ef/core/dbcontext-configuration/)

## 动手与自测

在 IDE 对 `SubmitAsync` 使用「转到定义」，圈出四处边界：谁读取浏览器上下文、谁开启事务、谁产生 `Created`、谁选择 HTTP 状态码。再搜索 `AddScoped<OnlineRequestService>` 回到装配处。浏览器上下文和状态码位于 Controller，事务与首次创建的判断位于 Service，容器在启动时获得注册信息。

**自测**　新需求规定「折前菜品金额加配送费必须能精确表示到分」，只在 Controller 校验会漏掉哪个入口？

<details>
<summary>展开参考答案</summary>

店员接受已保存的配送报价也要检查。提取共同金额规则，由各用例在掌握可信金额后调用，前端可提前提示。[店员接单](../../../backend/TavoloFlow.Api/Online/OnlineStaffService.cs)

</details>

<a id="interview"></a>

## 意大利语面试

**«Come dividi le responsabilità tra controller e servizio?»** 用一次下单回答职责、结果和复用点。

*Nel controller raccolgo i dati della richiesta e traduco il risultato in una risposta HTTP. Il servizio verifica se il ristorante può accettare la richiesta e coordina le scritture nella stessa transazione. Nel nostro caso restituisce anche se la richiesta è stata creata ora. In questo modo il controller può scegliere tra 201 e 200 e la regola sui prezzi resta riutilizzabile.*

**追问**　金额规则还给哪个用例使用？举出接单时校验旧报价的例子。

**«Perché registreresti un DbContext come scoped?»** 依次解释工作单元、并发与销毁。

*Il contesto tiene traccia delle entità caricate durante un’unità di lavoro. Con uno scope per richiesta i servizi che collaborano ricevono lo stesso contesto, che viene poi rilasciato. Condividerlo tra richieste concorrenti mescolerebbe stati diversi e creerebbe problemi di accesso simultaneo. Se devo rendere atomiche più scritture, definisco esplicitamente anche il confine della transazione.*

**追问**　多个浏览器请求同时查菜单时共享什么？同一个应用容器可以共享时钟，每个请求拥有自己的上下文。

[路线首页](../learning-notes.md) · [下一章：EF Core](03-ef-core.md)
