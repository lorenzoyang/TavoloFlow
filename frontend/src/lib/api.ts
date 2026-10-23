import { messages } from "./api-messages";
import type { BillSummary } from "@/features/billing/state";

type ErrorBody = {
  code?: string;
  message?: string;
  requestId?: string;
  errors?: Record<string, string[]>;
  changes?: { menuItemId: string; reason: string; currentUnitPriceCents: number | null; isAvailable: boolean | null }[];
  currentBill?: BillSummary;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter: number | null;
  readonly errors: Record<string, string[]>;
  readonly requestId?: string;
  readonly changes: NonNullable<ErrorBody["changes"]>;
  readonly currentBill?: BillSummary;

  constructor(status: number, body: ErrorBody, retryAfter: string | null) {
    super(body.message ?? messages.genericError);
    this.status = status;
    this.errors = body.errors ?? {};
    this.requestId = body.requestId;
    this.changes = body.changes ?? [];
    this.currentBill = body.currentBill;
    this.code = body.code ?? "UNKNOWN_ERROR";
    this.retryAfter = retryAfter ? Number(retryAfter) : null;
  }
}

type AuthFailure = "signed-out" | "password-required";
let onAuthFailure: (reason: AuthFailure) => Promise<void> = async () => {};

export function setAuthFailureHandler(handler: typeof onAuthFailure) {
  onAuthFailure = handler;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return sendRequest<T>(path, init, "store");
}

// Public browsing never sends store credentials or changes the signed-in staff identity.
export async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return sendRequest<T>(path, init, "public");
}

export async function guestRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return sendRequest<T>(path, init, "guest");
}

async function sendRequest<T>(path: string, init: RequestInit | undefined, identity: "store" | "public" | "guest"): Promise<T> {
  const storeIdentity = identity === "store";
  const response = await fetch(path, {
    ...init,
    credentials: identity === "public" ? "omit" : "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    const body: ErrorBody = await response.json().catch(() => ({}));
    const error = new ApiError(
      response.status,
      body,
      response.headers.get("Retry-After"),
    );
    // /me maps 401 to an anonymous identity; a wrong password on /login must not invalidate another account.
    if (
      storeIdentity && ((response.status === 401 &&
        path !== "/api/auth/login" &&
        path !== "/api/auth/me") ||
      error.code === "CREDENTIALS_CHANGED")
    ) {
      await onAuthFailure("signed-out");
    } else if (storeIdentity && error.code === "PASSWORD_CHANGE_REQUIRED") {
      await onAuthFailure("password-required");
    }
    throw error;
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}

export async function refreshCsrf(): Promise<string> {
  const response = await request<{ token: string }>("/api/auth/csrf");
  return response.token;
}

export async function write<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  // Fetch for every mutation so other tabs changing identity cannot leave a cached anonymous token behind.
  const { token } = await request<{ token: string }>("/api/auth/csrf", { signal });
  return request<T>(path, {
    method,
    headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": token },
    body: JSON.stringify(body),
    signal,
  });
}

export async function guestWrite<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
  const { token } = await guestRequest<{ token: string }>("/api/public/csrf", { signal });
  return guestRequest<T>(path, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": token },
    body: JSON.stringify(body),
  });
}

export function errorMessage(
  error: unknown,
  unknownResult: string = messages.connectionError,
): string {
  if (!(error instanceof ApiError) || error.status >= 500) return unknownResult;
  if (error.code === "CSRF_VALIDATION_FAILED") return messages.csrfExpired;
  return error.message;
}
