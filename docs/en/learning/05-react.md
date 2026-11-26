# 5. React and browser state

The owner has typed half a new dish name, switches tabs to look at a photo and returns. The menu refreshed in the background. Which name belongs in the field? To answer, distinguish server data from the draft and understand how React recognizes the same form.

## From a declarative UI to a commit

A component describes the UI for given props and state. Initial mount or a state update can **trigger** work. During **render**, React calls components to calculate the next UI tree. At **commit**, it applies the necessary DOM changes. A render function must be safe to run again. Placing an order during render would turn UI calculation into a purchase that cannot safely be repeated. Re-rendering a page can leave much of its DOM intact. [React render and commit](https://react.dev/learn/render-and-commit)

Under the same parent, element type, position and `key` help React match components across trees and decide whether to preserve local state. With positional list keys, a reorder may put another dish under the old input. A dish ID ties the input to the dish. Conversely, changing the form key deliberately resets inputs when you edit a different item. [Preserving and resetting state](https://react.dev/learn/preserving-and-resetting-state) · [MenuEditorSheet.tsx](../../../frontend/src/features/menu/MenuEditorSheet.tsx)

## Snapshots, closures and asynchronous events

Each render receives a state snapshot. A handler is a function created for that render. Its JavaScript closure retains access to the local bindings present when it was created. Suppose `quantity` is 1 for this render. Predict the result below.

```tsx
function addTwo() {
  setQuantity(quantity + 1)
  setQuantity(quantity + 1)
}
```

Both calls pass 2, so the next value is 2. To increment the previous queued result twice, pass `setQuantity(q => q + 1)` twice and the result is 3. An `await` suspends the remainder of the async function. Other events and renders can run, but resuming does not replace an old closure’s captured state. Mutating objects in place also breaks the meaning of a previous snapshot. Pure cart rules return new state, then the hook arranges rendering and storage. [State as a snapshot](https://react.dev/learn/state-as-a-snapshot) · [Queueing state updates](https://react.dev/learn/queueing-a-series-of-state-updates) · [state.ts](../../../frontend/src/features/orders/state.ts)

| What to keep | Where and why | Project example |
| --- | --- | --- |
| A local value the user must immediately see | State. For several editors, lift it to their common parent. Data goes down and events go up. | Pickup or delivery, checkout fields. |
| A value derivable from current inputs | Compute during render. Another copy of state would need synchronization. Measure expensive calculations before memoizing. | Payable amount from cart lines, discount and delivery tier. |
| Latest value for a callback, or a timer handle | A ref keeps its identity across renders. Updating `current` alone does not refresh the UI. | `useOnlineCart` checks the current pending intent during async recovery. |
| One model for several descendants | Lift ownership and distribute via props or Context. The provider supplies the value. | Parent menu provides its cart to checkout. |
| Data needed after reload | Choose storage, identity scope and validation on restore. | This tab stores cart and pending intent per restaurant. |

A custom hook packages behaviour with a lifecycle. If menu and checkout each called `useOnlineCart`, each would own state, timers and operation tracking. Calling it once in the parent and passing down the result shares an actual instance. [useOnlineCart.ts](../../../frontend/src/features/online-order/useOnlineCart.ts) · [checkout-context.ts](../../../frontend/src/features/online-order/checkout-context.ts)

<a id="draft"></a>

## Background refresh during an edit

When the owner opens a dish, the editor snapshots the selected record as initial values. Name inputs use `defaultValue` and the DOM then holds the typed text. React state controls interactions such as allergens and options. When a background query returns a new menu object, the form keeps its component identity. The initial values and ongoing input have separate lifetimes. A photo can reflect the latest server result while the name remains the owner’s draft. This permits a temporarily outdated draft and leaves business validation to the server on save. An effect that reset the form on every menu change would erase edits even on an unrelated focus refresh. [MenuPage.tsx](../../../frontend/src/features/menu/MenuPage.tsx) · [MenuForms.tsx](../../../frontend/src/features/menu/MenuForms.tsx)

## Effects, events and the TypeScript you need

“The customer pressed Submit” identifies an event to handle with a POST. “While an intent is pending, check its external status” fits an effect. The recovery effect in `useOnlineCart` schedules GETs and cleans up timers when the request ID changes or the component unmounts. The dependency array describes the reactive values the synchronization reads. Missing a dependency can retain stale values. Missing cleanup can leave duplicate timers. The HTTP layer takes an `AbortSignal`, and a callback still checks that its operation is current before updating the screen. [useOnlineCart.ts](../../../frontend/src/features/online-order/useOnlineCart.ts) · [operations.ts](../../../frontend/src/lib/operations.ts) · [Synchronizing with effects](https://react.dev/learn/synchronizing-with-effects)

`MenuEditor` is a union discriminated by `kind`. After `editor.kind === "item-order"`, TypeScript knows this branch has `snapshot` and can catch an invalid field access at compile time. Values from URLs, HTTP and local storage need runtime validation. `restoreOnlineCart` verifies restaurant, format and consistency between pending intent and lines. A type assertion such as `as OnlineCart` performs none of those checks. [MenuEditorSheet.tsx](../../../frontend/src/features/menu/MenuEditorSheet.tsx) · [state.ts](../../../frontend/src/features/online-order/state.ts)

## Exercise and self-check

In the local demo, open an existing dish as owner, edit the name and leave the form open. Switch browser tabs and return. Watch the menu read in Network and inspect the input. Your draft should survive. Discard the edit, close and reopen to see the saved name. Find the field’s `defaultValue` and its enclosing `ItemForm` key.

**Self-check** — What happens if “button is sending” exists only in a ref?

<details>
<summary>Show the answer</summary>

Code can check the ref for an in-flight operation, but changing it alone will not redraw the button. Visible busy state needs an update that triggers rendering.

</details>

<a id="interview"></a>

## Interview practice in Italian

**«Perché subito dopo setState leggo ancora il valore precedente?»** Explain render snapshots and the update queue.

*Il gestore dell’evento appartiene a un render preciso e vede i valori di quel render. Il setter accoda un aggiornamento che React userà per il render successivo. Se il nuovo valore dipende dal precedente, uso la forma funzionale del setter. Quando invece mi serve conservare un riferimento senza aggiornare l’interfaccia, per esempio l’identità di un’operazione, posso usare un ref.*

**Follow-up** — Does adding `await` to an event handler refresh its old state binding?

**«Quando useresti un effetto e quando un gestore di eventi?»** Compare submission and recovery.

*Invio l’ordine nel gestore della conferma, perché la causa è una scelta esplicita del cliente. Uso invece un effetto per mantenere sincronizzata la pagina con un sistema esterno: finché esiste una richiesta in sospeso, avvio un controllo periodico in lettura. Quando cambia la richiesta o esco dalla pagina, elimino il timer. Così un nuovo render non equivale a un nuovo acquisto.*

**Follow-up** — Do you need an effect to copy a newly calculated payable amount into separate state?

[Course overview](../learning-notes.md) · [Next chapter](06-query.md)
