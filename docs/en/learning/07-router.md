# 7. TanStack Router and URLs

An owner viewing a particular bill copies its address to another authorized, signed-in device and expects the same bill to open. A customer typing a name and phone number wants to return to the menu and continue editing later. Both need state to survive, but the intended audience and lifetime differ.

## How long should state live, and who can see it?

| State | Where it lives | Observable behaviour |
| --- | --- | --- |
| Restaurant whose menu is open | Path parameter `/r/$slug` | Copying, reloading or opening the link directly locates that restaurant. |
| Selected entry in the bill list | Search parameter `sessionId` | Selection can live in history or a bookmark. Another device still needs access to the bill. |
| Open cart sheet on a phone | Browser history state on an entry with the same URL | Back closes the sheet first. Copying the URL does not send someone the open-sheet action. |
| Contact details being typed | Local checkout form. At submission the recovery protocol persists confirmed intent. | Editing can continue between menu and checkout. Name and phone stay out of the address bar. |
| Retrieved menu or bill details | Query cache, with the authoritative record on the server | The screen can show a copy while re-reading according to identity and query policy. |

The browser and user share the URL as state. Encoding a choice there gives it reload, sharing and history semantics and requires considering exposure and input validation. `push` adds a history entry, whereas `replace` replaces the current one, changing where Back leads. Temporary metadata can live in an entry’s state. Two history entries can have exactly the same URL. [useHistorySheet.ts](../../../frontend/src/lib/useHistorySheet.ts) · [Search parameters](https://tanstack.com/router/v1/docs/framework/react/guide/search-params)

## From a URL to a type-safe page

Follow three steps in `staff.orders.tsx`. `createFileRoute("/staff/orders")` declares the match. `validateSearch: billingSearch` takes runtime input and checks `sessionId` for UUID format, returning `undefined` for an invalid selection. `Route.useSearch()` supplies the validated type and the page calls `navigate({ search: { sessionId } })` on selection. A copied link and the UI now share a source of truth. A well-formed UUID still needs server-side existence and authorization checks. [staff.orders.tsx](../../../frontend/src/routes/staff.orders.tsx) · [state.ts](../../../frontend/src/features/billing/state.ts)

The file router plugin generates `routeTree.gen.ts` from `routes/`. `createRouter` matches URLs against the tree. TypeScript can check path segments, parameter names and declared search parameters, catching mistakes in the editor or build. A URL typed by a user arrives at runtime and still needs validation. `Link` expresses a clickable destination. Imperative `navigate` fits a successful operation whose response determines the new status page. The build generates the route tree with Vite before running the type checker. [router.tsx](../../../frontend/src/router.tsx) · [vite.config.ts](../../../frontend/vite.config.ts) · [File-based routing](https://tanstack.com/router/v1/docs/framework/react/routing/file-based-routing)

<a id="nested"></a>

## Why a nested route keeps the cart alive

Matching `/r/demo-ramen/checkout` selects both parent menu and child checkout. The parent loads the menu, creates `useOnlineCart` and provides `OnlineCheckoutContext`. The child mounts at the `Outlet` and reads the supplied cart and form. Entering checkout hides the menu but keeps its parent mounted, preserving state and image nodes. The page records scroll position separately for the return trip. On ordinary navigation back, the form survives while the reviewed lines leave confirmation state. Checkout reviews prices again next time. [r.$slug.tsx](../../../frontend/src/routes/r.$slug.tsx) · [OnlineMenuPage.tsx](../../../frontend/src/features/online-order/OnlineMenuPage.tsx) · [r.$slug.checkout.tsx](../../../frontend/src/routes/r.$slug.checkout.tsx)

Predict the outcome of three different ways to navigate.

- **Back from checkout.** The child route leaves the tree. The parent menu retains the same instance.
- **Full reload.** JavaScript starts again and the original React tree is gone. The cart and pending intent saved for this restaurant can be restored from `sessionStorage`. Direct checkout navigation without a reviewed cart returns the customer to the menu for review.
- **Switch restaurant slug.** The parent gives `OnlineMenuPage` a `key={slug}`. Changing restaurant recreates the component and loads the cart for the new restaurant ID. [useOnlineCart.ts](../../../frontend/src/features/online-order/useOnlineCart.ts) · [OnlineCheckoutPage.tsx](../../../frontend/src/features/online-order/OnlineCheckoutPage.tsx)

## How Router and Query share the work

Router maps the location to a page, validated parameters and a component hierarchy. Query organizes asynchronous data with keys and observers. Selecting a bill changes the URL and tells the page which details to observe. A kitchen change can invalidate the relevant queries without changing that URL. Router supports loaders, but the staff layout uses `AuthBoundary` to observe the shared identity query, so login, logout and expired credentials update pages together. Fetching identity independently in every loader would introduce another synchronization path. The frontend chooses the screen and the API checks access on each protected operation. [AuthBoundary.tsx](../../../frontend/src/features/accounts/AuthBoundary.tsx) · [queries.ts](../../../frontend/src/features/accounts/queries.ts)

## Exercise and self-check

Accept an online order in the local demo and select it in Bill as owner. Note the URL, reload, then manually change `sessionId` to `hello`. `billingSearch` passes a valid selection to the page and treats an invalid value as unspecified, so it cannot become a UUID in the details read. At phone width open the customer cart sheet, go to checkout and press Back. Compare the address bar with the UI. The sheet changes history while retaining the URL, and checkout has its own path.

**Self-check** — Can copying the customer menu URL to a new device recover the phone number being typed on the first one?

<details>
<summary>Show the answer</summary>

The link identifies the restaurant. The draft belongs to the original page, and the recovery intent is in that tab’s storage. Each has its own scope.

</details>

<a id="interview"></a>

## Interview practice in Italian

**«Quando metteresti uno stato nell’URL?»** Use reload, sharing and Back to explain the choice, then discuss runtime validation.

*Metto nell’URL le scelte che devono sopravvivere a un aggiornamento della pagina o che ha senso condividere. Nella lista dei conti il parametro sessionId identifica la selezione. Lo valido all’ingresso perché chiunque può modificare l’indirizzo. I dati personali digitati nel checkout restano nel modulo. Anche con un identificativo valido, l’API controlla l’accesso del ristorante.*

**Follow-up** — How can Back close the cart sheet without requiring a new shareable URL?

**«Che vantaggio dà una rotta annidata nel checkout?»** Explain parent and child matches, component lifetime and what happens at a full reload.

*Il menu rimane montato mentre la rotta figlia mostra il checkout nel suo outlet. Il componente padre possiede il carrello e lo passa tramite context. Tornando al menu ritrovo la stessa istanza e posso continuare a modificare l’ordine. Un ricaricamento completo ricrea l’albero React, quindi per recuperare una richiesta già inviata mi affido ai dati salvati nella scheda.*

**Follow-up** — Why intentionally change the parent menu’s key when the restaurant changes?

[Course overview](../learning-notes.md) · [Next chapter](08-runtime.md)
