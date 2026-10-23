export type ManagedAccount = { id: string; username: string; role: "OWNER" | "STAFF"; isActive: boolean;
  mustChangePassword: boolean; credentialVersion: number };
export type Restaurant = { id: string; name: string; defaultLanguage: "zh" | "it" | "en"; timeZone: string;
  currencyCode: string; serviceStatus: "ACTIVE" | "SUSPENDED"; orderingEnabled: boolean; createdAt: string };
export type RestaurantDetail = { restaurant: Restaurant; accounts: ManagedAccount[] };
export type TemporaryCredential = { account: ManagedAccount; temporaryPassword: string };
export type PendingManagement = { kind: "create" | "status" | "active" | "reset"; restaurantId: string;
  userId?: string; expectedVersion?: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function managementKey(scope: "platform" | "store", identity: string) {
  return `tavoloflow:management:${scope}:${identity}`;
}
export function readPending(raw: string | null): PendingManagement | null {
  if (!raw) return null;
  const p = JSON.parse(raw) as Partial<PendingManagement>;
  if (!["create", "status", "active", "reset"].includes(p.kind ?? "") || !uuid.test(p.restaurantId ?? "") ||
    (p.userId !== undefined && !uuid.test(p.userId)) ||
    ((p.kind === "active" || p.kind === "reset") && (!p.userId || !Number.isSafeInteger(p.expectedVersion) || p.expectedVersion! < 1)))
    throw new Error("Invalid pending management action");
  // Explicit fields only: passwords and untrusted extra properties never survive parsing.
  return { kind: p.kind!, restaurantId: p.restaurantId!, userId: p.userId, expectedVersion: p.expectedVersion };
}
export function recoveryUrl(scope: "platform" | "store", p: PendingManagement) {
  return scope === "platform" ? `/api/platform/restaurants/${p.restaurantId}` : "/api/owner/staff";
}
export function accountRecoveryMessage(p: PendingManagement, account: ManagedAccount | undefined) {
  if (!account || account.id !== p.userId || p.expectedVersion === undefined) throw new Error("无法核对目标账号，请重新读取。");
  const change = account.credentialVersion > p.expectedVersion
    ? "账号凭据版本已变化；可能来自本次操作或其他管理员的修改。"
    : "账号凭据版本尚未变化，原请求仍可能到达。";
  return `${change}临时密码无法再次读取；如需重置，请核对最新状态后重新人工确认。`;
}
export function newRestaurantId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64; bytes[8] = (bytes[8]! & 63) | 128;
  const h = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
