import type { Order } from "./api.ts";
import { isUuid } from "../../lib/ids.ts";
import { isLanguage } from "../../lib/language.ts";

const text = (value: unknown) => value === null || typeof value === "string";

// A parsed but incomplete response is still unknown. Validate before discarding the durable intent.
export function confirmedOrder(value: Order, sessionId: string): Order {
  if (!value || !isUuid(value.id) || value.sessionId !== sessionId || !["NEW", "READY", "CANCELLED"].includes(value.status) ||
    !isLanguage(value.defaultLanguage) || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) ||
    !text(value.orderNote) || !Number.isSafeInteger(value.totalAmountCents) || value.totalAmountCents <= 0 ||
    !Array.isArray(value.items) || value.items.length === 0 || value.items.some(line => !line || !isUuid(line.id) ||
      (line.menuItemId !== null && !isUuid(line.menuItemId)) || !text(line.itemCode) || !text(line.remark) ||
      ![line.nameZh, line.nameIt, line.nameEn].every(text) || ![line.nameZh, line.nameIt, line.nameEn].some(n => typeof n === "string" && n.trim()) ||
      !Array.isArray(line.allergenCodes) || !line.allergenCodes.every(c => typeof c === "string") ||
      !Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents <= 0 || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20))
    throw new Error("Invalid order response");
  const total = value.items.reduce((sum, line) => sum + BigInt(line.unitPriceCents) * BigInt(line.quantity), 0n);
  if (total !== BigInt(value.totalAmountCents)) throw new Error("Invalid order total");
  return value;
}
