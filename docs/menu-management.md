# 菜单管理模块

本阶段在已有店铺账号之上实现菜单维护。登录后点击导航中的「菜单」，进入
`/staff/menu`。OWNER 维护分类、菜品、过敏原与默认语言；STAFF 查看菜单并切换供应状态。
餐厅即使处于 `SUSPENDED` 也可以准备菜单；这不会启用顾客接单。

沿用九张表，没有新迁移。开发账号初始化命令继续保留，不随普通启动执行。
桌位管理与公开顾客菜单已在第三阶段完成，见 [桌位与公开菜单](tables-public-menu.md)。
平台管理、开桌、顾客授权、购物车和订单业务仍待后续开发。

## 1. 按四个小阶段学习

### 第一阶段：跟踪一次分类创建

打开 `frontend/src/routes/staff.menu.tsx`，它只负责连接 URL 和 `MenuPage`。
身份仍由 `AuthBoundary` 的共享 `/me` 查询提供，不在路由里重复请求。

```mermaid
sequenceDiagram
    participant P as 分类表单
    participant H as lib/api.ts
    participant C as MenuController
    participant S as MenuService
    participant D as PostgreSQL
    P->>H: 提交三种语言名称
    H->>C: 获取 CSRF token，再 POST categories
    Note over C: Cookie、首次改密、OWNER、CSRF 校验
    C->>S: 使用 CurrentAccount 的 RestaurantId
    S->>D: 开事务、锁餐厅行、保存分类
    S->>D: 提交内容事务（不改变默认语言）
    C-->>P: 201 + 分类 DTO
    P->>C: 重新 GET /api/staff/menu
```

建议先在界面创建一个只有意大利语名称的分类，再补中文名称。观察请求体、响应和
默认语言保持不变，理解“界面语言”和“菜单内容语言”是两件事。

### 第二阶段：菜品内容与审核

`backend/TavoloFlow.Api/Menus/` 中：

| 文件 | 作用 |
| --- | --- |
| `MenuContracts.cs` | 输入/输出 DTO，以及后端提供的 14 类过敏原选项 |
| `MenuValidation.cs` | 空白归一化与字段校验；业务错误抛出 `ApiException`，由全局 `ApiExceptionFilter`（`Common/ApiErrors.cs`）转换 |
| `MenuService.cs` | 餐厅隔离、一致快照查询、内容事务及独立语言设置 |

`MenuForms.tsx` 保存当前表单草稿；服务器刷新不会重新填充已打开的表单。
`features/menu/api.ts` 定义响应类型、查询键与写入函数；`lib/format.ts` 负责金额解析与显示，`lib/language.ts` 提供纯名称回退函数，
返回实际名称和语言，供界面选择同语言描述；`messages.ts` 集中存放菜单界面文案。关闭表单会放弃未保存输入，不持久化草稿。

练习：创建 `12,50` 欧元的菜品，查看网络请求中的 `priceCents: 1250`。
价格按十进制数字转换为整数欧分，不使用 `parseFloat(value) * 100`。
更改过敏原复选框后，原先的审核确认会清除；需要再次勾选才能保存。

### 第三阶段：员工供应状态与默认语言

老板编辑菜品的 DTO 不包含 `isAvailable`。员工和老板都使用专门的 PATCH 接口，
提交明确目标值。重复提交 `false` 仍然是售罄，不会反向切换。

菜单内容写事务先锁餐厅行，然后修改内容并提交。当前 MVP 继续将同一餐厅的菜单内容
写入串行处理，保护分类删除与菜品创建、编辑与删除等竞争；没有新增版本列。
只改变供应状态的请求使用字段级 SQL 更新，默认语言不参与这些写入。

默认语言是 OWNER 的稳定显示偏好，只能主动设置为 `zh`、`it`、`en` 之一。
即使菜单为空或没有对应翻译，下拉框仍提供全部三种语言；STAFF 只读。
删除最后一份翻译、移除翻译、清空菜单或售罄都不改变该设置，补回翻译后自然优先使用。
`availableLanguages` 仅统计现存分类及菜品名称，包含空分类和售罄菜品，不从描述推导，
不限制默认语言。读取使用 Repeatable Read 事务，再从已经加载的名称计算统计，避免重复查询。

通用名称回退为 **默认语言 → 意大利语 → 中文 → 英语**，去重并跳过空名称。
调用方主动选择语言时将它放在最前；后台传入本设备的界面语言（中文或意大利语），
所以先显示该语言，没有时才进入通用顺序。描述跟随实际名称语言，该语言没有描述就省略。

这次简化前，默认语言是由菜单内容派生的值，删除菜品还要同时修正餐厅设置，
因此删除服务需要加入外层事务。现在偏好与内容独立，`WriteAsync` 不再查询或修正语言，
设置接口只需校验合法代码并执行单字段更新；删除服务也可以独立拥有事务。
保留餐厅锁是为了内容并发安全，并不意味着还要维护自动语言切换。已有设置原样保留，无需迁移。

使用两个浏览器会话学习：员工设为售罄，老板修改价格，刷新后确认新价格和售罄同时保留。

### 第四阶段：错误、删除和验收

菜单操作失败不会清空表单。请求不会离线排队或自动重试，也不提前修改本地列表。
成功后取消旧菜单读取并重新查询，避免保存前发出的读请求成为保存后的结果。
已收到成功响应但刷新失败时，明确显示“操作已成功，但菜单刷新失败”。

如果写入响应因断网丢失，不能推断服务器是否保存。点击“重新读取菜单并核对结果”，
比较列表和仍保留的表单后再操作。分类/菜品创建没有幂等键，盲目再次创建可能产生重复记录。

菜单查询键包含餐厅和账号；退出、账号切换及 401 会取消并清除私有查询。
已有有效身份时，后台身份查询网络失败会显示重试提示并保留表单；实际 401 仍返回登录页。

## 2. 接口契约

所有接口使用店铺 Cookie；写请求要求 `X-CSRF-TOKEN`。餐厅来自服务端身份，
不接受客户端提供的餐厅或角色。首次改密未完成时返回 `403 PASSWORD_CHANGE_REQUIRED`。

| 方法与路径 | 权限 | 成功结果 |
| --- | --- | --- |
| `GET /api/staff/menu` | OWNER / STAFF | 200：完整菜单，无分页 |
| `POST /api/owner/menu/categories` | OWNER | 201：创建的分类 |
| `PUT /api/owner/menu/categories/{id}` | OWNER | 200：编辑后的分类 |
| `DELETE /api/owner/menu/categories/{id}` | OWNER | 204 |
| `POST /api/owner/menu/items` | OWNER | 201：创建的菜品，默认可供应 |
| `PUT /api/owner/menu/items/{id}` | OWNER | 200：编辑后的菜品，保留供应状态 |
| `DELETE /api/owner/menu/items/{id}` | OWNER | 204 |
| `PATCH /api/staff/menu-items/{id}/availability` | OWNER / STAFF | 200：更新后的菜品 |
| `PATCH /api/owner/menu/default-language` | OWNER | 200：`{ "defaultLanguage": "it" }` |
| `PUT /api/owner/menu/items/{id}/image` | OWNER | 200：更新后的菜品（新的 `imageId`） |
| `DELETE /api/owner/menu/items/{id}/image` | OWNER | 200：更新后的菜品（`imageId: null`），重复删除同样成功 |
| `GET /api/public/menu-images/{imageId}` | 匿名 | 200：`image/webp`，可长期缓存 |

菜单响应包含 `restaurantId`、`defaultLanguage`、`availableLanguages`、`categories`、
`items`、`allergens`。分类按 ID、菜品按分类 ID 和自身 ID 稳定排序。
菜品/分类响应不暴露 EF 导航对象。菜品响应含可空的 `imageId`（员工菜单与公开 bootstrap 相同）。
除菜品图片 GET 外，所有接口响应继续使用 `Cache-Control: no-store`。

分类输入为 `nameZh`、`nameIt`、`nameEn`。菜品输入示例：

```json
{
  "categoryId": "本店已有分类 UUID",
  "itemCode": "M01",
  "nameZh": "宫保鸡丁",
  "nameIt": "Pollo Kung Pao",
  "nameEn": null,
  "descriptionZh": "鸡肉、花生与时蔬，微辣。",
  "descriptionIt": null,
  "descriptionEn": null,
  "priceCents": 1250,
  "allergenCodes": ["PEANUTS", "SOY"],
  "allergenReviewed": true
}
```

此示例仅说明请求结构，实际配料及过敏原必须由餐厅核对。
供应输入为 `{ "isAvailable": false }`；默认语言输入及成功响应均为 `{ "defaultLanguage": "it" }`。
默认语言响应不再含 `availableLanguages`；完整菜单 GET 仍包含该只读统计。非法语言返回
`400 VALIDATION_FAILED`，`errors.defaultLanguage` 提供字段提示，权限与 CSRF 校验不变。
菜单请求 DTO 拒绝未定义字段，不能通过供应接口夹带价格或名称。

菜品图片的上传请求体就是图片文件本身（不用 multipart），格式按文件内容判断，不看 `Content-Type`。
图片 GET 成功时返回 `Cache-Control: public, max-age=31536000, immutable` 和
`X-Content-Type-Options: nosniff`；生产 Caddy 为这条路径单独设了不加 `no-store` 的规则。

## 3. 数据规则与失败行为

- 名称、描述、编号去首尾空白，空内容保存为 `null`；至少一种名称非空。
  分类名称最多 100 字符，菜品名称 150 字符，编号 40 字符。描述需有同语言名称。
- 编号可空，同店非空编号唯一且区分大小写。空编号可重复；释放或删除后可复用。
- `priceCents` 在 `1..9007199254740991` 内。界面接受点或逗号作为小数点、最多两位小数，
  不接受货币符号或千位分隔符；数据库继续使用 `bigint`。
- 每次菜品内容保存都必须 `allergenReviewed=true`，包括售罄菜品。未知代码被拒绝，
  重复代码归并为固定顺序；空数组表示审核后未识别出需声明的过敏原，不保证不存在交叉接触。
- 旧的未审核数据仍可查看或设为售罄；恢复供应前必须由 OWNER 编辑并完成审核。
- 后台名称按界面语言（中文或意大利语）、餐厅默认语言、意大利语、中文、英语去重回退；通用顺序见第三阶段。描述不跨语言拼接。
- 分类只能为空时删除。菜品删除复用 `CatalogDeletionService`，先清空订单明细的可空菜品引用，
  保留名称、价格、编号、过敏原快照及餐厅归属。删除服务自行开启事务，先锁餐厅再锁菜品，
  原子提交引用清空与删除；`MenuService` 不再包一层事务。两种删除服务都不应被外层事务包装。
- 菜品图片可选，每道菜最多一张，存在 `menu_item_images` 表（`bytea`），菜单读取不加载图片字节。
  `menu_items.image_id` 指向当前图片，只由图片写接口在同一事务内与图片表一起修改，没有反向外键。
- 图片写入与内容保存分开：换图不要求重新审核过敏原，内容保存和供应切换也不会改动图片。
  写入沿用菜单写锁顺序（先锁餐厅），解码与压缩在事务和锁之外完成。
- 服务端只接受 JPEG、PNG、WebP，上限 15 MB、约 5000 万像素；用 SkiaSharp 解码，按 EXIF 方向摆正，
  转为 sRGB，居中裁成 640×640 后编码为 WebP（质量 80），不保留 EXIF/GPS 等元数据，
  也从不原样返回上传的字节。选用 SkiaSharp（MIT）而不是 ImageSharp：2026-10 时 ImageSharp 没有已知漏洞的
  版本（3.2.0、4.1.2 起）在 Release 构建时都要求 Six Labors 许可证密钥，而不要求密钥的 3.1.x 仍有安全公告。
  `deploy/Dockerfile.api` 只按 `linux-x64` 发布，否则 SkiaSharp 会带上所有平台的原生库（约 450 MB）。
- 每次上传生成新的随机 `imageId`，所以图片 URL 内容永不改变；被替换或删除的旧 URL 返回 404。
  删除菜品时数据库级联删除图片；订单快照不含图片，历史订单不受影响。
- 图片写入不在浏览器保存未知结果标记：重复上传只是再替换一次，刷新后的菜单就能看出结果。

错误统一为 `code`、`message`、`requestId`，字段校验附 `errors`：

| 状态/代码 | 含义 |
| --- | --- |
| `400 VALIDATION_FAILED` | 输入字段不合法或缺少审核确认 |
| `404 MENU_RESOURCE_NOT_FOUND` | 条目不存在或不属于本店 |
| `409 ITEM_CODE_CONFLICT` | 本店已有相同编号 |
| `409 CATEGORY_NOT_EMPTY` | 分类仍有菜品 |
| `409 ALLERGEN_REVIEW_REQUIRED` | 未审核菜品不能恢复供应 |
| `400 IMAGE_INVALID` | 不是 JPEG/PNG/WebP，或图片内容损坏 |
| `413 IMAGE_TOO_LARGE` | 图片超过 15 MB 或约 5000 万像素 |
| `404 MENU_IMAGE_NOT_FOUND` | 图片不存在（已被替换或删除） |

401、403、CSRF 等错误复用账号模块。数据库唯一索引是并发编号冲突的最终保障，
业务服务把对应异常转换为 409；没有新建冲突表或菜单版本字段。

过敏原类别参考[欧盟委员会说明](https://food.ec.europa.eu/food-safety/campaign-2026/allergies_en)。
本项目的内部代码不是官方编码，也不替代餐厅的配料审核与信息提供责任。

## 4. 运行与验收记录

先按 [店铺账号说明](store-accounts.md) 配置数据库、执行迁移及显式初始化开发账号。
启动后端 HTTP profile 和前端 Vite，访问 `http://localhost:5173`。本阶段无需新增配置或迁移。

2026-10-21 原菜单模块验收（本次语言简化前）：

- `dotnet test TavoloFlow.slnx --no-restore --verbosity minimal`：88 项通过，其中 23 项菜单测试。
  使用一次性 PostgreSQL 容器，覆盖真实登录/CSRF、权限、两店隔离、校验、历史快照、事务回滚、
  默认语言以及并发编号/分类删除/供应状态操作。
- `npm run build`、`npm run lint`：通过；没有新增前端测试框架。
- Chromium 两个独立 Cookie 会话：老板和员工首次改密、分类/菜品维护、审核确认、默认语言设置、
  非空分类删除失败、跨分类移动、员工售罄/恢复、老板改价保留售罄、刷新恢复均通过。
- 断网写入未自动重发；模拟“服务器保存成功但响应丢失”时只提交一次，手动重读确认保存结果。
- 360px 手机页面和菜品表单无横向溢出；后台身份查询 503 后表单保留、重试恢复，
  退出后切换 STAFF 及另一标签页退出导致的菜单 401 均正确清理界面；浏览器没有未处理 JavaScript 异常。

2026-10-22 稳定语言偏好改动验收：

- `dotnet test TavoloFlow.slnx --no-restore --verbosity minimal`：91 项全部通过，其中 26 项菜单测试。
  首次运行发现 Docker Desktop 未启动，启动后在一次性 PostgreSQL 容器中完成验收。
- 测试覆盖删除最后一份翻译、移除/补回翻译、清空菜单时保留设置，空菜单及缺少翻译时选择
  三种合法语言、非法值字段错误、设置接口仅返回 `defaultLanguage`，以及权限与 CSRF 限制。
- 删除原子性测试在历史引用已清空之后、删除 SQL 执行之前注入异常，确认菜品和历史引用一起回滚。
  分类删除与菜品创建、菜品编辑与删除、老板编辑与员工售罄、显式语言设置与内容写入的并发回归通过。
- 前端 `npm run build`、`npm run lint` 通过。Node 24 原生测试命令
  `node --test tests/menu-language.test.ts`（在 `frontend/` 执行）5 项通过，没有引入测试框架。
  覆盖通用顺序、重复语言、单一名称、空白翻译、补回默认语言及后台显式中文选择。
- Chromium 两个独立会话验证了空菜单设置、刷新保留、翻译增删、中文优先、名称语言对应描述
  （没有同语言描述时省略）、STAFF 设置只读与 API 拒绝越权、售罄不改变偏好。
- 表单在刷新及模拟写请求断网后保留草稿，失败写入没有自动重试。360px 页面与表单无横向溢出，
  浏览器没有未处理 JavaScript 异常。

本次截图：[老板桌面](screenshots/menu-owner-desktop.png)、[员工桌面](screenshots/menu-staff-desktop.png)、
[菜品编辑](screenshots/menu-item-editor.png)、[手机页面](screenshots/menu-owner-mobile.png)、
[空菜单设置](screenshots/menu-empty-language.png)。
浏览器验收同样使用临时独立数据库，未写入本地开发数据库；截图不包含密码或凭据。
