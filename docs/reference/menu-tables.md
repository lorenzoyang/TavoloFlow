# Menu, tables and the public entrance

OWNER maintains menu content/photos and physical tables. STAFF reads both and can change dish
availability. Suspended restaurants can prepare their catalog without enabling guest ordering.
Guests browse `/q/{token}` anonymously; [joining and ordering](dining-ordering.md) add authorization.

## Menu APIs

Store APIs use the trusted `CurrentAccount.RestaurantId` and require the first password change.
Writes require Store CSRF; JSON DTOs reject unknown fields. Responses are `no-store` except a successful
public photo read.

| Method and path                                 | Role        | Success                                             |
| ----------------------------------------------- | ----------- | --------------------------------------------------- |
| `GET /api/staff/menu`                           | OWNER/STAFF | 200, complete menu without paging                   |
| `POST /api/owner/menu/categories`               | OWNER       | 201, category                                       |
| `PUT /api/owner/menu/categories/{id}`           | OWNER       | 200, category                                       |
| `DELETE /api/owner/menu/categories/{id}`        | OWNER       | 204                                                 |
| `POST /api/owner/menu/items`                    | OWNER       | 201, item initially available                       |
| `PUT /api/owner/menu/items/{id}`                | OWNER       | 200, item preserving availability/photo             |
| `DELETE /api/owner/menu/items/{id}`             | OWNER       | 204                                                 |
| `PATCH /api/staff/menu-items/{id}/availability` | OWNER/STAFF | 200, item                                           |
| `PATCH /api/owner/menu/default-language`        | OWNER       | 200, `{ defaultLanguage }`                          |
| `PUT /api/owner/menu/items/{id}/image`          | OWNER       | 200, item with new `imageId`                        |
| `DELETE /api/owner/menu/items/{id}/image`       | OWNER       | 200, item with null `imageId`; repeat also succeeds |
| `GET /api/public/menu-images/{imageId}`         | Anonymous   | 200, `image/webp`                                   |

Menu response: `restaurantId`, `defaultLanguage`, `availableLanguages`, `categories`, `items` and
`allergens`. Categories sort by ID; items by category ID and item ID. Category response is
`id/nameZh/nameIt/nameEn`. Items also carry `categoryId`, `itemCode`, three descriptions, `priceCents`,
`allergenCodes`, `allergenReviewed`, `isAvailable` and nullable `imageId`.

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
  "allergenReviewed": true
}
```

Use an actual category UUID and restaurant-reviewed ingredients/allergens. Item content input excludes
`isAvailable` and `imageId`. Availability uses `{ "isAvailable": false }`; default language uses
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

Concurrent content saves use last-write-wins. A content save never overwrites availability, the photo
or default language. Form snapshots survive background refresh; drafts are not persisted on closing
the form. Writes are not automatically retried or queued offline. After an unknown result, reread and
compare before resubmitting: category/item creation has no idempotency key. A known successful write
followed by refresh failure is reported separately.

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

| Field             | Content                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `restaurant`      | `id`, `name`, `currencyCode`, `defaultLanguage`, `serviceStatus`, `orderingEnabled`, `joinCodeRequired`, `theme` |
| `table`           | `id`, `tableLabel`, `isEnabled`                                                                                  |
| `activeSessionId` | Nullable ACTIVE visit ID; not a credential                                                                       |
| `menu`            | `availableLanguages`, `categories`, `items` using the menu DTOs, including `imageId`                             |

Ownership comes only from the QR token. `PublicMenuService` reads entrance and menu in one Repeatable
Read transaction; `MenuReader` does not start another. Bootstrap creates no visit and exposes no code,
orders, bill, account, subscription/contact information or platform-only map URL.

`publicRequest` omits credentials and store-auth failure handling. The guest route stays outside store
AuthBoundary and never fetches store `/me`. The anonymous query key is `["public", "qr", token]` and
survives store login/logout. Bootstrap refreshes every 30 seconds while foreground polling is allowed,
and on focus/reconnect or manual refresh. Access and ordering use separate guest-scoped requests.

Suspended service, disabled table and paused ordering still permit menu browsing. The primary entrance
notice prioritizes service suspension, disabled table, paused ordering, then no open visit. Guests can
always select zh/it/en: explicit choices persist per restaurant; otherwise use the owner's default,
not browser language. Blocked storage retains the current in-memory choice.

A confirmed `QR_NOT_FOUND` replaces cached menu data and hides the old menu. Network failures retain
earlier data with a warning. Sold-out dishes remain visible; unreviewed allergens show pending review.
The restaurant theme applies after bootstrap loads; invalid/loading entrances keep the default theme.

## Errors and verification

Common errors include `VALIDATION_FAILED` (400), `MENU_RESOURCE_NOT_FOUND`, `TABLE_NOT_FOUND` and
`QR_NOT_FOUND` (404), plus conflicts `ITEM_CODE_CONFLICT`, `CATEGORY_NOT_EMPTY`,
`ALLERGEN_REVIEW_REQUIRED`, `TABLE_LABEL_CONFLICT` and `TABLE_HAS_ACTIVE_SESSION` (409).
Photo errors are `IMAGE_INVALID` (400), `IMAGE_TOO_LARGE` (413) and `MENU_IMAGE_NOT_FOUND` (404).
Account/CSRF errors follow [accounts](accounts-platform.md).

Sources: [menu DTOs](../../backend/TavoloFlow.Api/Menus/MenuContracts.cs),
[menu service](../../backend/TavoloFlow.Api/Menus/MenuService.cs),
[image pipeline](../../backend/TavoloFlow.Api/Menus/MenuImages.cs),
[table service](../../backend/TavoloFlow.Api/Tables/TableService.cs) and
[public reader](../../backend/TavoloFlow.Api/Menus/PublicMenuService.cs).

Tests: [menu integration](../../backend/TavoloFlow.Api.Tests/MenuTests.cs),
[tables/bootstrap integration](../../backend/TavoloFlow.Api.Tests/TableAndPublicMenuTests.cs),
[language](../../frontend/tests/menu-language.test.ts) and
[public menu/QR](../../frontend/tests/public-menu.test.ts).
Manually check simultaneous price/availability edits, unknown create results, photo replacement,
plain/card PNG downloads, invalid versus offline QR behavior, and 360px forms in every language.
