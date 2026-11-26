# 5. React 与浏览器状态

店主改了一半菜名，切到别的标签页看参考图片，再切回来。菜单已在后台刷新。此时哪个名字应该留在输入框里？这个问题同时涉及服务器数据、人在编辑的草稿，以及 React 怎样识别「这是刚才那个表单」。

## 从声明式 UI 到一次提交

组件描述「给定当前 props 和 state，界面应是什么样」。**触发**可能来自首次挂载或状态更新。**render** 是 React 调用组件，计算下一棵界面树。**commit** 才把必要的变更应用到 DOM。因此渲染函数要能安全地再次执行。在渲染中发送订单，会把「计算界面」变成一次不可随意重做的操作。一次重新渲染也不意味着整个页面的 DOM 都被替换。[React 渲染与提交](https://react.dev/learn/render-and-commit)

在同一父组件下，元素的类型、位置和 `key` 帮助 React 在前后两棵树之间识别组件，从而决定保留还是重建其本地状态。列表若用位置标识身份，重排后同一位置可能已换成别的菜，原有输入却跟着位置走。按菜品 ID 标识能让状态跟随菜品。切换到另一件编辑对象时，变更表单的 key 又可以有意重置输入。[React 状态的保留与重置](https://react.dev/learn/preserving-and-resetting-state) · [菜单编辑面板](../../../frontend/src/features/menu/MenuEditorSheet.tsx)

## 状态快照、闭包与异步

每次渲染得到一份状态快照。事件处理器是这次渲染创建的函数。JavaScript 闭包让它可以继续读到创建时的局部绑定。设某次渲染中 `quantity` 为 1，下面是用于预测结果的简化例子。

```tsx
function addTwo() {
  setQuantity(quantity + 1)
  setQuantity(quantity + 1)
}
```

两次传入的值都是 2，所以下一轮得到 2。要表示「在队列中前一次结果上增加一」，两次都应传 `setQuantity(q => q + 1)`，最终得到 3。`await` 会挂起当前异步函数的后续部分，期间浏览器可以处理别的事件、React 可以再次渲染。等待结束不会替旧闭包更新它捕获的状态。把对象原地改掉也会破坏「上一份快照」的含义。购物车的纯规则返回新状态，再由 hook 安排渲染与存储。[状态快照](https://react.dev/learn/state-as-a-snapshot) · [排队更新](https://react.dev/learn/queueing-a-series-of-state-updates) · [购物车规则](../../../frontend/src/features/orders/state.ts)

| 需要保存什么 | 怎么选 | 本项目实例 |
| --- | --- | --- |
| 改变后用户应立刻看到的本地值 | state。多个组件一起编辑时，放在共同父级，数据向下、事件向上。 | 自取或配送、结账表单。 |
| 已能从当前输入算出的值 | 渲染时计算，避免再维护一份需要同步的 state。较重计算可测量后再考虑记忆化。 | 根据购物车行、优惠和配送档位得到应付金额。 |
| 回调需要读取的最新值、计时器句柄 | ref 在渲染间保持身份。修改 `current` 本身不会让界面刷新。 | `useOnlineCart` 用 ref 在异步恢复时读取当前待确认请求。 |
| 同一子树下多个组件需要一份模型 | 上移所有权，再用 props 或 Context 分发。Context 的值由提供者决定。 | 父菜单通过 Context 给子结账页提供同一份购物车。 |
| 页面刷新后仍需要的内容 | 明确存储位置、身份范围和恢复时的校验。 | 当前标签页按餐厅保存购物车和待确认意图。 |

自定义 hook 封装带生命周期的行为。若菜单和结账各调用一次 `useOnlineCart`，它们会各自拥有一套 state、计时器和操作跟踪。父级只调用一次再传下来，才真正共享了实例的状态。[购物车 hook](../../../frontend/src/features/online-order/useOnlineCart.ts) · [结账 Context](../../../frontend/src/features/online-order/checkout-context.ts)

<a id="draft"></a>

## 后台刷新与编辑中的草稿

店主打开一道菜时，编辑器保留所选记录作为起始值。名称输入使用 `defaultValue`，随后浏览器 DOM 持有当前输入。过敏原、选项等交互由 React state 管理。后台查询返回新的菜单对象时，表单仍有原来的组件身份，`initial` 和用户正在输入的内容有各自的寿命。照片可以取最新的服务器结果，店主输入到一半的名称仍属于这次编辑。这里的取舍是允许草稿暂时落后，保存时再由服务端检查业务条件。若写一个「每次 menu 变化就重置表单」的 Effect，焦点回到窗口触发的无关刷新也会覆盖人的劳动。[编辑器所有者](../../../frontend/src/features/menu/MenuPage.tsx) · [表单字段](../../../frontend/src/features/menu/MenuForms.tsx)

## Effect、事件和必要的 TypeScript

「顾客刚才按了提交」有明确的因果事件，应在事件处理流程发 POST。「只要有待确认请求，页面就应该与外部系统核对它的状态」则适合 Effect。`useOnlineCart` 的恢复 Effect 安排 GET 检查，并在请求号改变或组件卸载时清理计时器。依赖数组描述同步逻辑读取了哪些响应式值。少写依赖可能继续用旧值。忘记清理会留下重复计时器。HTTP 层接收 `AbortSignal`。即使尽力取消了，回调还要判断当前操作是否有效，才能把结果写回当前界面。[恢复与清理](../../../frontend/src/features/online-order/useOnlineCart.ts) · [操作身份](../../../frontend/src/lib/operations.ts) · [React Effect](https://react.dev/learn/synchronizing-with-effects)

`MenuEditor` 是带 `kind` 字段的联合类型。判断 `editor.kind === "item-order"` 后，TypeScript 知道这个分支有 `snapshot`，从而能在编译期发现读错字段。运行时从地址栏、HTTP 或本地存储拿到的值仍要验证。例如 `restoreOnlineCart` 同时校验餐厅、格式以及待提交内容与购物车是否一致。一个 `as OnlineCart` 类型断言无法替代这步检查。[编辑器联合类型](../../../frontend/src/features/menu/MenuEditorSheet.tsx) · [购物车恢复规则](../../../frontend/src/features/online-order/state.ts)

## 动手与自测

本地 Demo 中以店主打开已有菜品，改一个名字并保留表单。切到别的浏览器标签页再返回，在 Network 中观察菜单重读，回到输入框检查文字。重新读取后草稿仍在。关闭编辑器、放弃改动再打开，看到的是已保存的名字。然后在源码找到这个输入的 `defaultValue` 和包围它的 `ItemForm` 的 key。

**自测**　把「按钮正在发送」只放进 ref，会发生什么？

<details>
<summary>展开参考答案</summary>

代码可以用 ref 判断是否已有操作，但 ref 的改变本身不会刷新按钮。用户可见的忙碌状态需要会触发渲染的更新。

</details>

<a id="interview"></a>

## 意大利语面试

**«Perché subito dopo setState leggo ancora il valore precedente?»** 从渲染快照和更新队列解释。

*Il gestore dell’evento appartiene a un render preciso e vede i valori di quel render. Il setter accoda un aggiornamento che React userà per il render successivo. Se il nuovo valore dipende dal precedente, uso la forma funzionale del setter. Quando invece mi serve conservare un riferimento senza aggiornare l’interfaccia, per esempio l’identità di un’operazione, posso usare un ref.*

**追问**　在事件处理器里加一个 `await` 会让旧的状态绑定自动更新吗？

**«Quando useresti un effetto e quando un gestore di eventi?»** 比较提交与恢复这两个具体动作。

*Invio l’ordine nel gestore della conferma, perché la causa è una scelta esplicita del cliente. Uso invece un effetto per mantenere sincronizzata la pagina con un sistema esterno: finché esiste una richiesta in sospeso, avvio un controllo periodico in lettura. Quando cambia la richiesta o esco dalla pagina, elimino il timer. Così un nuovo render non equivale a un nuovo acquisto.*

**追问**　金额发生变化时，需要用 Effect 把应付金额复制到另一份 state 吗？

[路线首页](../learning-notes.md) · [下一章：TanStack Query](06-query.md)
