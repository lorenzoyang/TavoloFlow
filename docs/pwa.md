# 店铺端 PWA：安装到主屏幕

店铺端 `/staff` 可以安装到手机主屏幕或电脑桌面，从图标直接打开独立窗口，不用再找网址。
正式安装入口为 `https://app.qiaotavoloflow.it/staff`；根域名官网由另一个 Astro 仓库独立部署。
顾客页 `/q/*` 和平台管理 `/platform` 仍是普通网页。本次没有做推送通知（见第 8 节）。

## 1. 文件与作用

| 文件 | 作用 |
|---|---|
| `frontend/public/staff.webmanifest` | 应用名称、图标、启动页和作用域 |
| `frontend/public/sw.js` | service worker：页面加载失败时显示离线页，不缓存任何内容 |
| `frontend/public/icons/`、`frontend/public/apple-touch-icon.png` | 应用图标及其 SVG 源文件 |
| `frontend/src/features/accounts/useInstallApp.ts` | 链接 manifest、注册 service worker、保存 Chromium 的安装邀请 |
| `frontend/src/features/accounts/AccountPage.tsx` | 首页「安装到本设备」区域 |
| `frontend/tests/pwa.test.ts` | 检查 manifest 作用域、图标尺寸，以及 `index.html` 不链接 manifest |

## 2. 为什么只由店铺布局链接 manifest

浏览器只在页面链接了 manifest 时才会提示安装。整个前端共用一个 `index.html`，如果在里面静态写
`<link rel="manifest">`，顾客扫码打开的 `/q/{token}` 也会被提示安装。所以 `StaffLayout` 挂载时才插入链接，
卸载时移除；顾客页和平台页从不渲染这个布局。登录页同样在店铺布局内，登录前也可以安装。

manifest 的 `id`、`start_url`、`scope` 都是 `/staff`，**不带结尾斜杠**。路由配置了 `trailingSlash: "never"`，
首页地址就是 `/staff`；作用域按前缀匹配，写成 `/staff/` 时 `/staff` 本身反而落在应用之外，
已安装的应用打开首页会出现“超出范围”的地址栏。service worker 的注册作用域同样是 `/staff`，
`tests/pwa.test.ts` 会检查这一点。

应用身份由域名和 manifest `id` 共同决定。正式域名上线后再让门店安装；在 localhost 或其他地址装的测试应用
是另一个应用，测试后卸载即可。
manifest 和 worker 中的路径仍使用相对业务 origin 的 `/staff`、`/sw.js` 等地址；不将作用域扩展到官网，也不共享父域名 Cookie。

## 3. Service worker 做什么、不做什么

- 只处理页面导航（打开应用、刷新）：有 navigation preload 的响应时直接使用，否则请求网络；网络失败时返回内置的离线页。
- `/api`、脚本、样式和图片等其他请求一律交给浏览器处理，worker 不调用 `respondWith`。
- **不使用 Cache Storage**：不缓存 API、页面或静态资源，所以不会出现“卡在旧版本”的问题。
  数据和写操作仍然全部依赖网络，没有离线队列。
- 离线页与应用同色，提供「重新加载」按钮。设备恢复联网时立即重新加载；设备显示已联网、服务器却仍不可达时
  （Wi-Fi 正在连接、服务器重启），页面可见期间每 10 秒重试一次。开机时还没连上 Wi-Fi 的厨房平板因此能自行恢复。
- 新版本 worker 安装后立即接管（`skipWaiting` 加 `clients.claim`）。worker 不缓存内容，立即接管不会造成新旧版本混用。
- 只在生产构建中、且在安全上下文（HTTPS 或 localhost）中注册。`npm run dev` 不注册，避免干扰热更新。

从 Chromium 菜单安装其实不需要 service worker；但自动安装邀请（`beforeinstallprompt`，首页的一键「安装应用」
按钮依赖它）要求 worker 带有真正起作用的 fetch 处理，空处理会被忽略。返回离线页正是这个处理的实际工作。

## 4. 各平台的安装方式与差异

| 设备与浏览器 | 安装方式 | 厨房提醒声 | 登录状态 |
|---|---|---|---|
| Android · Chrome | 首页「安装应用」，或 Chrome 菜单「添加到主屏幕 / 安装应用」 | 从图标打开即可直接播放 | 与 Chrome 共享 |
| 电脑 · Chrome / Edge | 首页「安装应用」，或地址栏的安装图标 | 从图标打开即可直接播放 | 与浏览器共享 |
| iPhone / iPad · Safari | 「分享」→「添加到主屏幕」（Safari 26 的「分享」在「⋯」菜单内） | 仍需先点按一次页面 | 独立存储，首次需在应用内登录 |

- 首页的安装区在已安装应用的独立窗口中不显示。站点被使用一段时间后（至少一次点按、约 30 秒），Chromium 才会
  发出安装邀请；在此之前，以及在其他浏览器中，安装区显示上表中的手动步骤。用户拒绝后这次邀请作废，
  浏览器下次发出新邀请时按钮才重新出现。
- **厨房声音**：Chrome 的自动播放政策允许已添加到主屏幕（手机）或已安装（电脑）的应用不经点按就播放声音，
  Web Audio 同样适用。厨房页一打开就会尝试启动声音，所以在已安装的 Chromium 应用中直接就能发声，
  厨房代码没有为此改动。iPhone/iPad 上的 Safari（WebKit）没有这个例外，现有的「点按页面任意位置即可开启」
  提示照常出现。厨房设备建议使用 Android 平板，或电脑上的 Chrome。
- 锁屏或切到后台时，安装后的应用和网页一样暂停轮询和声音；厨房请开启「屏幕常亮」。
- 传菜屏（出餐口平板）的声音规则相同；设置步骤（屏幕常亮、系统音量、引导式访问/屏幕固定）见 [传菜屏](pass-screen.md)。
- 登录规则不变：店铺登录仍是固定 30 天，到期或修改密码后需要重新登录。
- iOS 使用 `apple-touch-icon.png`，它优先于 manifest 图标。这个图标是不透明的满版方形，圆角由系统添加，
  因为透明像素会显示成黑色。iOS 26 起，所有添加到主屏幕的网站默认以 Web App 方式打开。

## 5. 部署要求

`deploy/Caddyfile` 和发布脚本已实现以下生产要求；首次上线按 [netcup 部署教程](zh-CN/deployment-guide.md) 操作：

1. **HTTPS**。安装、service worker 和屏幕常亮都要求安全上下文。在局域网用 `http://` 测试时，浏览器不提供安装，
   首页只显示手动步骤，添加到主屏幕的只是普通书签。
2. `/sw.js` 和 `/staff.webmanifest` 加 `Cache-Control: no-cache`，让更新及时生效；manifest 的 MIME 类型为
   `application/manifest+json`，`sw.js` 为 `text/javascript`。
3. 前端深链接（`/staff/*`、`/q/*`，以及线上自取的 `/r/*`、`/o/*`）回退到 SPA 入口 `index.html`（原有要求）。
4. 带哈希的 `/assets/*` 长期缓存。发布脚本保留共享资源池中的历史文件；至少保留一周且保留上一版。已安装的应用
   可能连续开着好几天，仍在运行旧版本的页面切换路由时还会加载旧文件。新版本在应用重新打开或刷新后生效。

## 6. 本地测试

开发模式不注册 service worker，请测试生产构建：

```bash
cd frontend
npm run build
npm run preview   # http://localhost:4173，/api 沿用开发代理转发到 5093
```

在 Chrome DevTools 的 Application 面板中检查：

- **Manifest**：没有错误；勾选 “Show only the minimum safe area for maskable icons” 检查图标裁切。
- **Service workers**：`/sw.js` 已激活，scope 为 `http://localhost:4173/staff`。
- **Cache storage**：为空。
- 打开 `/q/{token}`：没有 manifest、没有安装图标，页面不受 worker 控制。

Android 真机：开启 USB 调试，在电脑 Chrome 的 `chrome://inspect` 中设置端口转发 `4173 → localhost:4173`，
手机访问 `http://localhost:4173/staff` 即可安装（localhost 属于安全上下文）。iPhone/iPad 需等 HTTPS 正式地址上线后测试。

## 7. 图标

| 输出 | 尺寸 | 来源与用途 |
|---|---|---|
| `public/icons/icon-192.png`、`icon-512.png` | 192、512 | `public/favicon.svg`：圆角、四角透明，用于电脑窗口和 Android 启动画面 |
| `public/icons/icon-maskable-512.png` | 512 | `public/icons/maskable.svg`：满版，图形在半径 40% 的安全区内，供 Android 裁成各种形状 |
| `public/apple-touch-icon.png` | 180 | `public/icons/maskable.svg`：iOS 主屏幕 |

更换品牌图形时同时修改两个 SVG，再用 SVG 渲染工具按上表宽度导出 PNG。本次使用的是 `@resvg/resvg-js` 2.6.2，
未加入项目依赖。`tests/pwa.test.ts` 会核对 PNG 尺寸与 manifest 的声明一致。

## 8. 未做的部分

- **推送通知（Web Push）**：要在关闭应用或锁屏时提醒新订单，后端需要配置 VAPID 密钥，新增推送订阅表和订阅/退订接口，
  并在下单后异步发送；iPhone/iPad 只在已安装的应用中支持。以后作为独立功能设计。
- **平台管理端安装**：`/platform` 仍按网页使用。
- **离线使用**：数据和写操作都需要网络。

## 9. 自己动手做的实验

1. 把 `staff.webmanifest` 的 `scope` 临时改为 `/staff/`，重新构建并安装，观察应用打开首页 `/staff` 时出现的
   “超出范围”地址栏，`tests/pwa.test.ts` 也会失败；改回后两者恢复正常。
2. 在已安装的应用中打开厨房并刷新，不点按页面，观察没有「点按页面」提示；再在普通标签页直接打开
   `/staff/kitchen`，对比提示的出现。
3. 在 DevTools 中把 Network 设为 Offline 后刷新应用，观察离线页；恢复在线后页面自动回到应用。
   Network 面板中的 `/api` 请求全部来自网络。
4. 用新的浏览器配置只打开 `/q/{token}`，确认 Application 面板中既没有 manifest，也没有 service worker 注册。

## 10. 验证

```bash
cd frontend
node --test --test-isolation=none tests/*.test.ts
npm run build
npm run lint
```

本次验证（2026-10-25）：前端纯逻辑测试 59 项全部通过（新增 PWA 3 项），build 和 lint 通过。
使用独立的临时 PostgreSQL 和 `vite preview`，在真实 Chromium 中自动验收 20 项全部通过：店铺页只有一个 manifest 链接，
worker 作用域为 `/staff` 且控制店铺页；manifest 解析无误，可安装；登录并完成首次改密后，首页出现安装区，
安装邀请变成一键按钮，每个邀请只调用一次 `prompt()`；店铺页之间切换后仍只有一个 manifest 链接；
Cache Storage 为空；断网刷新显示离线页，恢复联网后回到应用；独立窗口下不显示安装区；
顾客页没有 manifest、不受 worker 控制、不可安装，只访问顾客页的新浏览器配置没有任何 worker 注册；页面没有未捕获异常。
普通标签页中直接打开厨房页仍会出现「点按页面」提示，与原有行为一致。

未能自动验证：已安装应用中无需点按即可发声（无头 Chromium 无法完成真正的安装，这一点依据 Chrome 公布的自动播放政策），
以及 Android 和 iPhone/iPad 真机上的表现。需在 HTTPS 部署后用真机核对：安全区、底部导航、主从视图侧滑面板、
二维码和桌卡下载，以及「打开菜单」在应用外打开。
