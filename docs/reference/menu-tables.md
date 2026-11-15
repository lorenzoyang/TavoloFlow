# Menu, tables and the public entrance

OWNER maintains menu content/photos, shared option groups and physical tables. STAFF reads both and
can change dish and option availability. Suspended restaurants can prepare their catalog without enabling guest ordering.
Guests browse `/q/{token}` anonymously; [joining and ordering](dining-ordering.md) add authorization.

## Menu APIs

Store APIs use the trusted `CurrentAccount.RestaurantId` and require the first password change.
Writes require Store CSRF; JSON DTOs reject unknown fields. Responses are `no-store` except a successful
public photo read.

| Method and path                                   | Role        | Success                                             |
| ------------------------------------------------- | ----------- | --------------------------------------------------- |
| `GET /api/staff/menu`                             | OWNER/STAFF | 200, complete menu without paging                   |
| `POST /api/owner/menu/categories`                 | OWNER       | 201, category                                       |
| `PUT /api/owner/menu/categories/{id}`             | OWNER       | 200, category                                       |
| `PUT /api/owner/menu/categories/order`            | OWNER       | 204                                                 |
| `PUT /api/owner/menu/categories/{categoryId}/items/order` | OWNER | 204                                            |
| `DELETE /api/owner/menu/categories/{id}`          | OWNER       | 204                                                 |
| `POST /api/owner/menu/items`                      | OWNER       | 201, item initially available                       |
| `PUT /api/owner/menu/items/{id}`                  | OWNER       | 200, item preserving availability/photo             |
| `DELETE /api/owner/menu/items/{id}`               | OWNER       | 204                                                 |
| `PATCH /api/staff/menu-items/{id}/availability`   | OWNER/STAFF | 200, item                                           |
| `PATCH /api/owner/menu/default-language`          | OWNER       | 200, `{ defaultLanguage }`                          |
| `POST /api/owner/menu/option-groups`              | OWNER       | 201, option group                                   |
| `PUT /api/owner/menu/option-groups/{id}`          | OWNER       | 200, option group preserving option availability    |
| `DELETE /api/owner/menu/option-groups/{id}`       | OWNER       | 204, options and dish links removed                 |
| `PUT /api/owner/menu/option-groups/order`         | OWNER       | 204                                                 |
| `PATCH /api/staff/menu-options/{id}/availability` | OWNER/STAFF | 200, option                                         |
| `PUT /api/owner/menu/items/{id}/image`            | OWNER       | 200, item with new `imageId`                        |
| `DELETE /api/owner/menu/items/{id}/image`         | OWNER       | 200, item with null `imageId`; repeat also succeeds |
| `GET /api/public/menu-images/{imageId}`           | Anonymous   | 200, `image/webp`                                   |

Menu response: `restaurantId`, `defaultLanguage`, `availableLanguages`, `categories`, `items`,
`optionGroups` and `allergens`. Categories sort by their restaurant-wide position, then ID; items follow
that category order, sorting by their category-local position and then item ID. Option groups sort by their
restaurant-wide position. Category response is `id/nameZh/nameIt/nameEn`. Items also carry
`categoryId`, `itemCode`, three descriptions, `priceCents`, `allergenCodes`, `allergenReviewed`,
`isAvailable`, nullable `imageId` and `optionGroupIds` (in group order).

Category input contains the three names. An item content request is:

```json
{
  "categoryId": "00000000-0000-4000-8000-000000000001",
  "itemCode": "M01",
  "nameZh": null,
  "nameIt": "Ramen di esempio",
  "nameEn": "Example ramen",
  "descriptionZh": null,
  "descriptionIt": null,
  "descriptionEn": "An example description, not ingredient advice.",
  "priceCents": 1250,
  "allergenCodes": ["GLUTEN", "SOY"],
  "allergenReviewed": true,
  "optionGroupIds": ["00000000-0000-4000-8000-000000000002"]
}
```

Use an actual category UUID and restaurant-reviewed ingredients/allergens. Item content input excludes
`isAvailable` and `imageId`. `optionGroupIds` is required and replaces the dish's option groups; send
an empty array for none. Availability uses `{ "isAvailable": false }`; default language uses
`{ "defaultLanguage": "it" }`. These endpoints update only their own setting.

## Content, language and concurrency

- Trim names, descriptions and item codes; blank optional values become null. Require at least one
  nonblank name. Category names allow 100 characters, item names 150 and codes 40. A description needs
  a name in the same language. Non-null codes are case-sensitive and unique per restaurant.
- Prices are integer cents in `1..9007199254740991`. Forms accept decimal strings with a dot or comma
  and up to two decimal places, without currency symbols or thousands separators. Do not calculate
  cents with `parseFloat(value) * 100`.
- Every item content save requires `allergenReviewed: true`, including sold-out items. Validate the 14
  supported application codes, deduplicate them and store canonical ordering. Old unreviewed data may
  be viewed or made unavailable, but restoring it requires OWNER review. An empty reviewed array means
  no declarable allergen was identified, not absence of cross-contact.
- Default language is an OWNER preference (`zh`, `it`, `en`), valid even for an empty menu or missing
  translation. Content edits, deletions and availability never repair or replace it.
- `availableLanguages` is read-only metadata derived from loaded category/item names, including empty
  categories and sold-out items. Descriptions do not add languages; the metadata does not constrain
  default or interface language choices.
- General name fallback is default → Italian → Chinese → English, deduplicated. A caller's selected
  language comes first; staff uses the device interface language. Descriptions follow the resolved
  name language and are omitted if absent there.

Menu reads use one Repeatable Read transaction for content/settings. Content and availability writes
lock restaurant UPDATE first, serializing menu changes and coordinating with ordering's restaurant
SHARE. Item deletion calls `CatalogDeletionService` directly: its own transaction takes restaurant
UPDATE then item UPDATE, clears historical links and deletes the item. Do not add an outer transaction.
Category deletion requires an empty category. All snapshots survive catalog deletion.

Category order is one restaurant-wide setting shared by the staff menu, QR menu and online menu in
every language. New categories append after the current maximum position; renaming preserves position,
and deletion may leave gaps. The migration backfills positions per restaurant in the previous ID order.
`PUT /api/owner/menu/categories/order` takes `{ "categoryIds": [...] }`: an exact permutation of every
current category ID (an empty array for an empty menu). Null, duplicate, missing, extra or foreign IDs
receive `409 CATEGORIES_CHANGED`, with no partial changes. The write uses the same restaurant UPDATE
lock as category creation/deletion, then assigns consecutive positions from zero in one transaction.
Positions are non-negative and need not be unique in the database. Repeating a target order is harmless;
concurrent reorderings of the same category set use last-write-wins. Category content requests cannot
set position. The OWNER's inline sorting list uses up/down buttons and saves each move immediately;
the "All dishes" filter stays first. After a conflict or unknown result, reread and check before moving
again; writes are not retried automatically.

Concurrent content saves use last-write-wins. A content save never overwrites availability, the photo
or default language. Category name edits also preserve position. Form snapshots survive background
refresh; drafts are not persisted on closing the form. Writes are not automatically retried or queued
offline. After an unknown result, reread and compare before resubmitting: category/item creation has
no idempotency key. A known successful write
followed by refresh failure is reported separately.

## Dish order within a category

Each dish has a non-negative `menu_items.position` within its category. All menu readers use that
order in every language. The migration preserves the previous ID order separately for each restaurant
and category; demo imports assign positions in fixture order. Creating a dish or moving it to another
category appends after the destination's maximum position, under the restaurant UPDATE lock. Other
content edits preserve position. Deleting or moving a dish leaves gaps; readers show a continuous list.

`PUT /api/owner/menu/categories/{categoryId}/items/order` takes `{ "itemIds": [...] }`: every current
dish in this restaurant's category, including sold-out and unreviewed dishes. An existing empty category
accepts an empty array. Missing/foreign categories return `MENU_RESOURCE_NOT_FOUND` (404); null,
duplicate, missing, extra, foreign or other-category dish IDs return `CATEGORY_ITEMS_CHANGED` (409).
Validation and assignment of consecutive positions from zero happen inside one `MenuWrites` transaction.
Only position changes are tracked, with one `SaveChangesAsync` so EF batches the writes. No position
uniqueness constraint is needed. Repeating the same target is harmless; concurrent same-set reorderings
use last-write-wins. This endpoint changes no content, availability, photo or option links and needs
no allergen review. Content DTOs do not accept position.

OWNER selects a category with at least two dishes, then opens the dish-order form in the existing
editor sheet. The compact list shows names, prices and up/down controls. Moves edit an in-memory
snapshot; Save submits once, Cancel discards it, and background reads never replace the draft.
Submission disables editing/closing; success closes the sheet and refreshes the menu while keeping
the selected category. A successful save followed by failed refresh is reported separately.
Failures freeze the draft. "Reload and reset order" reads by GET and replaces the draft with the
server's current order; failed reads keep it frozen, and a deleted category can only be closed.
There is no automatic write retry or persisted draft. Unmount/identity changes cancel tracked work
and late results are ignored.

## Option groups

Option groups are a restaurant-wide library that dishes share: sizes, sweetness, ice, toppings, spice
level or extras. They are generic, never drink-specific. A group has three names, `minSelect` and
`maxSelect`, which are its whole rule (`1/1` a required single choice, `0/3` up to three optional
extras), and 1–30 options. Each option has three names, `priceDeltaCents` (`0..9007199254740991`,
added to the dish price per portion), its own `allergenCodes` and `isAvailable`. A restaurant has at
most 50 groups and a dish at most 10. Required groups are never preselected for the guest.

```json
{
  "nameZh": "杯型",
  "nameIt": "Formato",
  "nameEn": "Size",
  "minSelect": 1,
  "maxSelect": 1,
  "options": [
    {
      "id": "…existing option…",
      "nameZh": "中杯",
      "nameIt": "Media",
      "nameEn": "Regular",
      "priceDeltaCents": 0,
      "allergenCodes": []
    },
    {
      "id": null,
      "nameZh": "大杯",
      "nameIt": "Grande",
      "nameEn": "Large",
      "priceDeltaCents": 100,
      "allergenCodes": []
    }
  ],
  "menuItemIds": ["00000000-0000-4000-8000-000000000003"],
  "allergenReviewed": true
}
```

- A save replaces the whole group: options sent with their id are edited in place and keep their
  availability, options without an id are added (available), options left out are deleted, and the
  array order is the option order. `menuItemIds` replaces the dishes that use the group. Foreign ids
  return `MENU_RESOURCE_NOT_FOUND`. `0 <= minSelect <= maxSelect <= options`, `maxSelect >= 1`.
- Every save requires `allergenReviewed: true`, as for dishes; options store canonical allergen codes.
  Orders add the chosen options' allergens to the dish's, so the dish never has to list them.
- Display order is one restaurant-wide `position`; each dish shows its own groups in that relative
  order. New groups come last. The order endpoint takes `{ "groupIds": [...] }`, exactly the current
  groups in their new order, so a repeat changes nothing; a list made from an outdated menu returns
  `OPTION_GROUPS_CHANGED` (409).
- Links can be set from either side: the dish's `optionGroupIds` or the group's `menuItemIds`.
  Deleting a group, a dish or the restaurant removes options and links through `ON DELETE CASCADE`;
  order snapshots keep the chosen options.
- All option writes lock restaurant UPDATE first (`MenuWrites`), like every other menu write, so an
  order's restaurant SHARE lock always prices and snapshots a consistent menu. Option names do not
  count towards `availableLanguages`.

Templates (size, sugar, ice/temperature, toppings, spice) are frontend constants
(`features/menu/option-templates.ts`) with names in all three languages that only prefill a new
group's form; prices start at zero and allergens unchecked. Ice and temperature share one group, so no
rule between groups is needed. Out of scope: rules between options, several portions of one option, a
price per dish inside a shared group, negative deltas and combos.

## Dish photos

Upload the raw file body, without multipart. Detection uses content, not the submitted Content-Type.
The server accepts JPEG/PNG/WebP up to 15 MiB and 50 million decoded pixels. SkiaSharp applies EXIF
orientation, converts to sRGB, center-crops to 640×640 and encodes WebP at quality 80 without metadata.
Uploaded bytes are never served unchanged. Decode/encode happens before acquiring transaction locks.

Photo writes then take the restaurant-before-item lock order and atomically replace `menu_item_images`
and the item's `image_id`. There is one optional photo per item. Menu queries do not load photo bytes;
image changes need no allergen review. Content/availability writes do not change photos.

Each upload has a new random ID. Successful public reads return
`Cache-Control: public, max-age=31536000, immutable` and `X-Content-Type-Options: nosniff`.
The production Caddy image route preserves that cache policy; absent/replaced/deleted URLs return 404.
Deleting an item cascades its photo. Order snapshots never contain images. The browser persists no
photo-write recovery marker; a menu reread shows the current image. The production API publishes for
`linux-x64` to avoid bundling native SkiaSharp libraries for every platform.

## Table APIs and deletion

| Method and path                        | Role        | Success                             |
| -------------------------------------- | ----------- | ----------------------------------- |
| `GET /api/staff/tables`                | OWNER/STAFF | 200, `TableResponse[]` sorted by ID |
| `POST /api/owner/tables`               | OWNER       | 201, enabled table                  |
| `PATCH /api/owner/tables/{id}/label`   | OWNER       | 200, renamed table                  |
| `PATCH /api/owner/tables/{id}/enabled` | OWNER       | 200, table                          |
| `DELETE /api/owner/tables/{id}`        | OWNER       | 204                                 |

Create/rename input is `{ "tableLabel": "8" }`; enablement is `{ "isEnabled": false }`.
Labels are trimmed, 1–50 characters and case-sensitive unique per restaurant. Response fields are
`id`, `tableLabel`, `isEnabled`, `qrPath` and nullable `activeSessionId`.

The server generates a fixed 32-byte random Base64URL QR token. `qrPath` is `/q/{token}`. Renaming or
disabling a table preserves the ID/token. Rename and enablement are separate field-only updates under
the table UPDATE lock, also used by opening and deletion.

Deletion uses `CatalogDeletionService`'s own transaction. ACTIVE visits block it. Otherwise CLOSED
visits lose their `table_id` link but retain label snapshots, tenant and bill history. Recreating the
same label gets a new ID/token; the old QR becomes invalid. There is no rotate/reset endpoint.

## QR images and printable cards

`TableQr` generates a 1024×1024 black/white PNG locally with `qrcode`: medium error correction and
four-module margin. The dialog offers both the plain QR PNG and a printable table-card PNG containing
restaurant name and table label. Copy/open actions use the same URL; no external QR service receives it.
If clipboard access fails, select the read-only URL manually.

Optional `VITE_PUBLIC_BASE_URL` must be an HTTP(S) origin without credentials, path, query or fragment.
Blank uses the current browser origin; invalid configuration blocks URL generation. It is a public
build-time setting, not an API host configuration. Existing printed codes keep their original URL
after a host/port change and need reprinting or an old-address redirect.

Release builds use the deployment's public origin; other hosts on the same domain are not QR origins.
For release builds, use the [frontend configuration notes](../../frontend/README.md#deployment-and-qr-origin).
Phone/LAN setup, including Windows/WSL forwarding, is in the
[local development guide](../en/local-development.md#part-4-testing-from-a-phone).

## Anonymous bootstrap and guest browsing

`GET /api/public/qr/{token}/bootstrap` returns:

| Field             | Content                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `restaurant`      | `id`, `name`, `currencyCode`, `defaultLanguage`, `serviceStatus`, `dineInEnabled`, `orderingEnabled`, `joinCodeRequired`, `theme` |
| `table`           | `id`, `tableLabel`, `isEnabled`                                                                                                   |
| `activeSessionId` | Nullable ACTIVE visit ID; not a credential                                                                                        |
| `menu`            | `availableLanguages`, `categories`, `items`, `optionGroups` using the menu DTOs, including `imageId`                              |

Ownership comes only from the QR token. `PublicMenuService` reads entrance and menu in one Repeatable
Read transaction; `MenuReader` does not start another. Bootstrap creates no visit and exposes no code,
orders, bill, account, subscription/contact information or platform-only map URL.

`publicRequest` omits credentials and store-auth failure handling. The guest route stays outside store
AuthBoundary and never fetches store `/me`. The anonymous query key is `["public", "qr", token]` and
survives store login/logout. Bootstrap refreshes every 30 seconds while foreground polling is allowed,
and on focus/reconnect or manual refresh. Access and ordering use separate guest-scoped requests.

Suspended service, dine-in that the platform has not turned on (`dineInEnabled: false`), disabled table
and paused ordering still permit menu browsing. The primary entrance notice prioritizes service
suspension or missing dine-in (the same guest copy), disabled table, paused ordering, then no open visit. Guests can
always select zh/it/en: explicit choices persist per restaurant; otherwise use the owner's default,
not browser language. Blocked storage retains the current in-memory choice.

A confirmed `QR_NOT_FOUND` replaces cached menu data and hides the old menu. Network failures retain
earlier data with a warning. Sold-out dishes remain visible; unreviewed allergens show pending review.
A dish with option groups opens an option picker instead of entering the cart at once; its price reads
"from" when an option costs extra, and it shows as sold out once a required group has fewer options in
stock than its minimum.
The restaurant theme applies after bootstrap loads; invalid/loading entrances keep the default theme.

## Errors and verification

Common errors include `VALIDATION_FAILED` (400), `MENU_RESOURCE_NOT_FOUND`, `TABLE_NOT_FOUND` and
`QR_NOT_FOUND` (404), plus conflicts `ITEM_CODE_CONFLICT`, `CATEGORY_NOT_EMPTY`,
`ALLERGEN_REVIEW_REQUIRED`, `CATEGORIES_CHANGED`, `CATEGORY_ITEMS_CHANGED`, `OPTION_GROUPS_CHANGED`, `TABLE_LABEL_CONFLICT` and
`TABLE_HAS_ACTIVE_SESSION` (409).
Photo errors are `IMAGE_INVALID` (400), `IMAGE_TOO_LARGE` (413) and `MENU_IMAGE_NOT_FOUND` (404).
Account/CSRF errors follow [accounts](accounts-platform.md).

Sources: [menu DTOs](../../backend/TavoloFlow.Api/Menus/MenuContracts.cs),
[menu service](../../backend/TavoloFlow.Api/Menus/MenuService.cs),
[option service](../../backend/TavoloFlow.Api/Menus/MenuOptionService.cs),
[image pipeline](../../backend/TavoloFlow.Api/Menus/MenuImages.cs),
[table service](../../backend/TavoloFlow.Api/Tables/TableService.cs) and
[public reader](../../backend/TavoloFlow.Api/Menus/PublicMenuService.cs).

Tests: [menu integration](../../backend/TavoloFlow.Api.Tests/MenuTests.cs),
[category-order migration](../../backend/TavoloFlow.Api.Tests/CategoryOrderMigrationTests.cs),
[dish-order migration](../../backend/TavoloFlow.Api.Tests/ItemOrderMigrationTests.cs),
[option groups](../../backend/TavoloFlow.Api.Tests/MenuOptionTests.cs),
[tables/bootstrap integration](../../backend/TavoloFlow.Api.Tests/TableAndPublicMenuTests.cs),
[language](../../frontend/tests/menu-language.test.ts) and
[public menu/QR](../../frontend/tests/public-menu.test.ts).
Manually check category sorting, dish-order drafts and their conflict/unknown-result rereads,
simultaneous price/availability edits, unknown create results, photo replacement,
plain/card PNG downloads, invalid versus offline QR behavior, and 360px forms in every language.
