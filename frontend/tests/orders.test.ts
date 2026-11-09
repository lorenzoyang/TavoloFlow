import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addItem,
  cartKey,
  CartError,
  createIntent,
  editLine,
  emptyCart,
  persistCart,
  refreshCart,
  restoreCart,
  submissionFailure,
  totalCents,
  validateCart,
} from "../src/features/orders/state.ts";
import {
  chosenOptions,
  combinedAllergens,
  hasExtraCost,
  missingGroups,
  orderable,
  selectionIssue,
  unitPriceCents,
} from "../src/features/orders/options.ts";
import { optionNames, optionSummary } from "../src/lib/options.ts";
import type { OptionGroup } from "../src/features/menu/api.ts";
import { parsePendingAction } from "../src/features/dining/state.ts";
import { confirmedOrder } from "../src/features/orders/response.ts";
import type { Order } from "../src/features/orders/api.ts";

const item = {
  id: "00000000-0000-4000-8000-000000000001",
  categoryId: "category",
  nameZh: "炒饭",
  nameIt: "Riso",
  nameEn: "Rice",
  descriptionZh: null,
  descriptionIt: null,
  descriptionEn: null,
  itemCode: "A1",
  priceCents: 700,
  isAvailable: true,
  allergenReviewed: true,
  allergenCodes: ["SOY"],
  imageId: null,
  optionGroupIds: [] as string[],
};
const session = "00000000-0000-4000-8000-000000000002";
const id = "00000000-0000-4000-8000-000000000003";
const blank = () => emptyCart("restaurant", "table", session);
const throwsIssue = (fn: () => unknown, issue: string) =>
  assert.throws(fn, (e: unknown) => e instanceof CartError && e.issue === issue);

test("cart merges the same dish and normalized note, keeping different preparation notes separate", () => {
  let cart = addItem(addItem(blank(), item), item);
  assert.equal(cart.lines.length, 1);
  assert.equal(cart.lines[0].quantity, 2);
  cart = editLine(cart, 0, { remark: " 少盐 " });
  cart = addItem(cart, item);
  assert.equal(cart.lines.length, 2);
  cart = editLine(cart, 1, { remark: "少盐" });
  assert.equal(cart.lines.length, 1);
  assert.equal(cart.lines[0].quantity, 3);
  assert.equal(totalCents(cart.lines), 2100);
  assert.equal(editLine(cart, 0, { quantity: 0 }).lines.length, 0);
});

test("line, total quantity, note and line count limits reject instead of silently changing the draft", () => {
  const cart = addItem(blank(), item);
  throwsIssue(() => editLine(cart, 0, { quantity: 21 }), "limits");
  throwsIssue(() => editLine(cart, 0, { quantity: 1.5 }), "limits");
  throwsIssue(() => editLine(cart, 0, { remark: "x".repeat(201) }), "limits");
  throwsIssue(
    () => validateCart({ ...cart, lines: Array.from({ length: 31 }, () => cart.lines[0]) }),
    "limits",
  );
  throwsIssue(
    () =>
      validateCart({
        ...cart,
        lines: Array.from({ length: 6 }, () => ({ ...cart.lines[0], quantity: 20 })),
      }),
    "limits",
  );
  assert.equal(cart.lines[0].quantity, 1);
});

test("integer cents remain exact at the safe boundary and reject arithmetic overflow", () => {
  const cart = addItem(blank(), { ...item, priceCents: Number.MAX_SAFE_INTEGER });
  assert.equal(totalCents(cart.lines), Number.MAX_SAFE_INTEGER);
  throwsIssue(() => editLine(cart, 0, { quantity: 2 }), "amount");
  throwsIssue(
    () => addItem(cart, { ...item, id: "00000000-0000-4000-8000-000000000005" }),
    "amount",
  );
});

test("unavailable or unreviewed dishes cannot be added; a changed price requires a refreshed review", () => {
  throwsIssue(() => addItem(blank(), { ...item, isAvailable: false }), "unavailable");
  throwsIssue(() => addItem(blank(), { ...item, allergenReviewed: false }), "unavailable");
  const cart = addItem(blank(), item);
  throwsIssue(() => refreshCart(cart, []), "unavailable");
  throwsIssue(() => refreshCart(cart, [{ ...item, isAvailable: false }]), "unavailable");
  assert.equal(refreshCart(cart, [{ ...item, priceCents: 900 }]).lines[0].item.priceCents, 900);
  assert.equal(cart.lines[0].item.priceCents, 700);
});

test("pending intent survives reload with identical request id, content and session and blocks edits", () => {
  const cart = editLine(addItem(blank(), item), 0, { remark: " 少盐 " });
  const pending = createIntent(cart, session, id);
  const frozen = { ...cart, pending };
  const restored = restoreCart(JSON.stringify(frozen), blank());
  assert.deepEqual(restored.pending, pending);
  assert.equal(restored.pending?.items[0].remark, "少盐");
  assert.equal(addItem(restored, item), restored);
  assert.equal(editLine(restored, 0, { quantity: 0 }), restored);
});

test("unopened draft remains unbound until explicit confirmation and is isolated by table and restaurant", () => {
  const cart = addItem(emptyCart("r", "t", null), item);
  const restored = restoreCart(JSON.stringify(cart), emptyCart("r", "t", session));
  assert.equal(restored.sessionId, null);
  const input = createIntent(restored, session, id);
  assert.equal(input.sessionId, session);
  assert.equal(restored.sessionId, null);
  assert.notEqual(cartKey("r", "t"), cartKey("r", "other"));
  assert.notEqual(cartKey("r", "t"), cartKey("other", "t"));
  throwsIssue(() => restoreCart(JSON.stringify(cart), emptyCart("r", "other", session)), "damaged");
});

test("corrupt pending content is never silently treated as an empty/new order", () => {
  const cart = addItem(blank(), item);
  const pending = createIntent(cart, session, id);
  for (const raw of [
    "{",
    "null",
    JSON.stringify({ ...cart, pending: {} }),
    JSON.stringify({ ...cart, pending: { ...pending, items: [] } }),
    JSON.stringify({ ...cart, pending: { ...pending, sessionId: id } }),
    JSON.stringify({
      ...cart,
      pending: { ...pending, items: [{ ...pending.items[0], quantity: 2 }] },
    }),
  ])
    throwsIssue(() => restoreCart(raw, blank()), "damaged");
});

// A required size (large +1 €) and up to two toppings, the second of which contains milk.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const option = (
  n: number,
  group: number,
  name: string,
  delta: number,
  allergens: string[] = [],
) => ({
  id: uuid(n),
  groupId: uuid(group),
  nameZh: name,
  nameIt: null,
  nameEn: null,
  priceDeltaCents: delta,
  allergenCodes: allergens,
  isAvailable: true,
});
const groups: OptionGroup[] = [
  {
    id: uuid(100),
    nameZh: "杯型",
    nameIt: "Formato",
    nameEn: null,
    minSelect: 1,
    maxSelect: 1,
    options: [option(101, 100, "中杯", 0), option(102, 100, "大杯", 100)],
  },
  {
    id: uuid(200),
    nameZh: "小料",
    nameIt: "Topping",
    nameEn: null,
    minSelect: 0,
    maxSelect: 2,
    options: [
      option(201, 200, "珍珠", 80),
      option(202, 200, "奶盖", 120, ["MILK"]),
      option(203, 200, "布丁", 100, ["EGGS", "MILK"]),
    ],
  },
];
const tea = { ...item, id: uuid(10), nameZh: "奶茶", optionGroupIds: [uuid(100), uuid(200)] };
const [medium, large, pearls, foam, pudding] = [101, 102, 201, 202, 203].map(uuid);
const withOption = (id: string, patch: object) =>
  groups.map((g) => ({
    ...g,
    options: g.options.map((o) => (o.id === id ? { ...o, ...patch } : o)),
  }));

test("option rules require every group's minimum, respect its maximum and reject foreign or sold-out options", () => {
  assert.equal(selectionIssue(tea, groups, [large, pearls]), null);
  assert.equal(selectionIssue(tea, groups, [pearls]), "missing");
  assert.deepEqual(
    missingGroups(tea, groups, [pearls]).map((g) => g.nameZh),
    ["杯型"],
  );
  assert.equal(selectionIssue(tea, groups, [medium, large]), "tooMany");
  assert.equal(selectionIssue(tea, groups, [large, pearls, foam, pudding]), "tooMany");
  assert.equal(selectionIssue(tea, groups, [large, uuid(999)]), "unknown");
  assert.equal(selectionIssue(tea, groups, [large, large]), "unknown");
  assert.equal(selectionIssue(item, groups, [large]), "unknown");
  assert.equal(
    selectionIssue(tea, withOption(pearls, { isAvailable: false }), [large, pearls]),
    "unavailable",
  );
  // Display order follows the groups and then each group's own order, whatever the tap order.
  assert.deepEqual(
    chosenOptions(tea, groups, [foam, large, pearls]).map((o) => o.nameZh),
    ["大杯", "珍珠", "奶盖"],
  );
  assert.equal(unitPriceCents(tea, chosenOptions(tea, groups, [foam, large, pearls])), 1000);
  assert.deepEqual(combinedAllergens(tea, [groups[1].options[1], groups[1].options[2]]), [
    "SOY",
    "MILK",
    "EGGS",
  ]);
  assert.equal(hasExtraCost(tea, groups), true);
  assert.equal(hasExtraCost(item, groups), false);
});

test("a dish stays orderable while each required group keeps enough options in stock", () => {
  assert.equal(orderable(tea, groups), true);
  const noToppings = groups.map((g) =>
    g.id === uuid(200)
      ? { ...g, options: g.options.map((o) => ({ ...o, isAvailable: false })) }
      : g,
  );
  assert.equal(orderable(tea, noToppings), true);
  const noSizes = groups.map((g) =>
    g.id === uuid(100)
      ? { ...g, options: g.options.map((o) => ({ ...o, isAvailable: false })) }
      : g,
  );
  assert.equal(orderable(tea, noSizes), false);
  assert.equal(orderable({ ...tea, isAvailable: false }, groups), false);
});

test("cart lines keep their options: identical choices merge, prices include deltas and the intent sends the ids", () => {
  throwsIssue(() => addItem(blank(), tea, groups, [pearls]), "options");
  let cart = addItem(blank(), tea, groups, [pearls, large]);
  cart = addItem(cart, tea, groups, [large, pearls]);
  cart = addItem(cart, tea, groups, [medium]);
  assert.equal(cart.lines.length, 2);
  assert.equal(cart.lines[0].quantity, 2);
  assert.deepEqual(
    cart.lines[0].options.map((o) => o.nameZh),
    ["大杯", "珍珠"],
  );
  assert.equal(totalCents(cart.lines), 880 * 2 + 700);
  const intent = createIntent(cart, session, id);
  assert.deepEqual(
    intent.items.map((l) => [l.expectedUnitPriceCents, l.optionIds]),
    [
      [880, [large, pearls]],
      [700, [medium]],
    ],
  );
  const repriced = refreshCart(cart, [tea], withOption(large, { priceDeltaCents: 150 }));
  assert.equal(createIntent(repriced, session, id).items[0].expectedUnitPriceCents, 930);
  throwsIssue(
    () => refreshCart(cart, [tea], withOption(pearls, { isAvailable: false })),
    "options",
  );
  throwsIssue(
    () => refreshCart(cart, [{ ...tea, optionGroupIds: [uuid(100)] }], groups),
    "options",
  );
  throwsIssue(() => refreshCart(cart, [tea], []), "options");
});

test("a saved cart restores its options and pending option ids; damaged options never restore", () => {
  const cart = addItem(blank(), tea, groups, [large, foam]);
  const pending = createIntent(cart, session, id);
  const restored = restoreCart(JSON.stringify({ ...cart, pending }), blank());
  assert.deepEqual(restored.pending, pending);
  assert.deepEqual(restored.lines[0].options, cart.lines[0].options);
  for (const raw of [
    JSON.stringify({ ...cart, lines: [{ ...cart.lines[0], options: [{ id: "x" }] }] }),
    JSON.stringify({
      ...cart,
      lines: [
        { ...cart.lines[0], options: [{ ...cart.lines[0].options[0], priceDeltaCents: -1 }] },
      ],
    }),
    JSON.stringify({
      ...cart,
      pending: { ...pending, items: [{ ...pending.items[0], optionIds: [large] }] },
    }),
    JSON.stringify({ ...cart, lines: [{ ...cart.lines[0], options: undefined }] }),
    JSON.stringify({
      ...cart,
      lines: [{ ...cart.lines[0], item: { ...tea, optionGroupIds: undefined } }],
    }),
    JSON.stringify({ ...cart, version: 1 }),
  ])
    throwsIssue(() => restoreCart(raw, blank()), "damaged");
});

test("option summaries group each group's options and follow the viewer's language", () => {
  const snapshot = (
    group: string,
    groupIt: string | null,
    name: string,
    nameIt: string | null,
  ) => ({
    groupNameZh: group,
    groupNameIt: groupIt,
    groupNameEn: null,
    nameZh: name,
    nameIt,
    nameEn: null,
    priceDeltaCents: 0,
  });
  const options = [
    snapshot("杯型", "Formato", "大杯", "Grande"),
    snapshot("小料", "Topping", "珍珠", "Perle"),
    snapshot("小料", "Topping", "椰果", null),
  ];
  assert.equal(optionSummary(options, "zh"), "杯型：大杯 · 小料：珍珠、椰果");
  assert.equal(optionSummary(options, "zh", "it"), "Formato: Grande · Topping: Perle, 椰果");
  assert.equal(optionSummary([], "zh"), "");
  assert.equal(optionNames(options, "zh", "it"), "Grande · Perle · 椰果");
});

test("durable storage must succeed and read back exactly before an intent may be sent", () => {
  const cart = addItem(blank(), item);
  cart.pending = createIntent(cart, session, id);
  let value: string | null = null;
  const storage = {
    setItem: (_key: string, raw: string) => {
      value = raw;
    },
    getItem: () => value,
  };
  persistCart(storage, "key", cart);
  assert.deepEqual(restoreCart(value, blank()).pending, cart.pending);
  throwsIssue(
    () =>
      persistCart(
        {
          setItem: () => {
            throw new Error();
          },
          getItem: () => null,
        },
        "key",
        cart,
      ),
    "storage",
  );
  throwsIssue(
    () => persistCart({ setItem: () => {}, getItem: () => null }, "key", cart),
    "storage",
  );
});

test("unknown results never release the original intent merely because a lookup or manual retry fails", () => {
  assert.equal(submissionFailure(null, null, false), "unknown");
  assert.equal(submissionFailure(500, "INTERNAL_ERROR", false), "unknown");
  assert.equal(submissionFailure(400, "UNKNOWN_ERROR", false), "unknown");
  assert.equal(submissionFailure(404, "ORDER_NOT_FOUND", true), "unknown");
  assert.equal(submissionFailure(409, "MENU_CHANGED", true), "unknown");
  assert.equal(submissionFailure(400, "CSRF_VALIDATION_FAILED", true), "unknown");
  assert.equal(submissionFailure(409, "MENU_CHANGED", false), "editable");
  assert.equal(submissionFailure(401, "GUEST_AUTH_REQUIRED", false), "reauthenticate");
  assert.equal(submissionFailure(403, "GUEST_SESSION_MISMATCH", true), "reauthenticate");
  assert.equal(submissionFailure(409, "SESSION_CLOSED", true), "ended");
});

test("only a complete server order with consistent safe amounts may clear the saved intent", () => {
  const order: Order = {
    id,
    sessionId: session,
    status: "NEW",
    createdAt: "2026-10-22T12:00:00Z",
    defaultLanguage: "en",
    totalAmountCents: 1400,
    payableAmountCents: 1400,
    items: [
      {
        id,
        menuItemId: item.id,
        itemCode: "A1",
        nameZh: "炒饭",
        nameIt: null,
        nameEn: "Rice",
        allergenCodes: ["SOY"],
        unitPriceCents: 700,
        quantity: 2,
        remark: null,
        options: [],
        status: "NEW",
        readyAt: null,
        cancelledAt: null,
      },
    ],
  };
  assert.equal(confirmedOrder(order, session), order);
  const cancelled: Order = {
    ...order,
    status: "PROCESSED",
    payableAmountCents: 0,
    items: [{ ...order.items[0], status: "CANCELLED", cancelledAt: "2026-10-22T12:05:00Z" }],
  };
  assert.equal(confirmedOrder(cancelled, session), cancelled);
  const partial: Order = {
    ...order,
    totalAmountCents: 2800,
    items: [order.items[0], { ...cancelled.items[0], id: "00000000-0000-4000-8000-000000000009" }],
  };
  assert.equal(confirmedOrder(partial, session), partial);
  assert.throws(() => confirmedOrder({ ...partial, payableAmountCents: 2800 }, session));
  for (const broken of [
    { ...order, sessionId: id },
    { ...order, createdAt: "bad date" },
    { ...order, items: [{}] },
    { ...order, totalAmountCents: 1300 },
    { ...order, defaultLanguage: "fr" },
    { ...order, payableAmountCents: 700 },
    { ...order, status: "PROCESSED" },
    { ...order, items: [{ ...order.items[0], status: "READY", readyAt: null }] },
    { ...order, items: [{ ...order.items[0], options: undefined }] },
    {
      ...order,
      items: [{ ...order.items[0], options: [{ nameZh: "大杯", priceDeltaCents: -1 }] }],
    },
    { ...order, items: [{ ...order.items[0], options: [{ nameZh: " ", priceDeltaCents: 0 }] }] },
  ])
    assert.throws(() => confirmedOrder(broken as Order, session));
});

test("the accepting-orders switch restores as a GET-only recovery action", () => {
  assert.deepEqual(parsePendingAction('{"kind":"accepting","enabled":false}'), {
    kind: "accepting",
    enabled: false,
  });
  assert.equal(parsePendingAction('{"kind":"accepting","enabled":"false"}'), null);
});
