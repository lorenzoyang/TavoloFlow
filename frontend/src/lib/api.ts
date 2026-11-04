import { apiMessages, errorTranslations } from "./api-messages";
import type { Language } from "./language";

// The backend's ApiError envelope. Some codes add top-level members, such as BILL_CHANGED "currentBill".
type ErrorBody = {
  code?: string;
  message?: string;
  requestId?: string;
  errors?: Record<string, string[]> | null;
  [extension: string]: unknown;
};

// Writes whose result may be lost give up after this long; the caller then recovers by GET.
const REQUEST_TIMEOUT_MS = 15_000;

export function withTimeout(signal: AbortSignal): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter: number | null;
  readonly errors: Record<string, string[]>;
  readonly requestId?: string;
  readonly body: ErrorBody;

  constructor(status: number, body: ErrorBody, retryAfter: string | null) {
    super(body.message ?? apiMessages.zh.genericError);
    this.status = status;
    this.errors = body.errors ?? {};
    this.requestId = body.requestId;
    this.body = body;
    this.code = body.code ?? "UNKNOWN_ERROR";
    this.retryAfter = retryAfter ? Number(retryAfter) : null;
  }
}

type AuthFailure = "signed-out" | "password-required";
let onAuthFailure: (reason: AuthFailure) => Promise<void> = async () => {};
let onPlatformAuthFailure: () => Promise<void> = async () => {};

export function setPlatformAuthFailureHandler(handler: typeof onPlatformAuthFailure) {
  onPlatformAuthFailure = handler;
}

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

export async function platformRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return sendRequest<T>(path, init, "platform");
}

export async function platformWrite<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const { token } = await platformRequest<{ token: string }>("/api/platform/auth/csrf", { signal });
  return platformRequest<T>(path, {
    method,
    signal,
    headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": token },
    body: JSON.stringify(body),
  });
}

async function sendRequest<T>(
  path: string,
  init: RequestInit | undefined,
  identity: "store" | "public" | "guest" | "platform",
): Promise<T> {
  const storeIdentity = identity === "store";
  const response = await fetch(path, {
    ...init,
    credentials: identity === "public" ? "omit" : "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    const body: ErrorBody = await response.json().catch(() => ({}));
    const error = new ApiError(response.status, body, response.headers.get("Retry-After"));
    // /me maps 401 to an anonymous identity; a wrong password on /login must not invalidate another account.
    if (
      storeIdentity &&
      ((response.status === 401 && path !== "/api/auth/login" && path !== "/api/auth/me") ||
        error.code === "CREDENTIALS_CHANGED")
    ) {
      await onAuthFailure("signed-out");
    } else if (storeIdentity && error.code === "PASSWORD_CHANGE_REQUIRED") {
      await onAuthFailure("password-required");
    }
    if (
      identity === "platform" &&
      ((response.status === 401 &&
        path !== "/api/platform/auth/login" &&
        path !== "/api/platform/auth/me") ||
        error.code === "CREDENTIALS_CHANGED")
    ) {
      await onPlatformAuthFailure();
    }
    throw error;
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export async function write<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  // Fetch for every mutation so other tabs changing identity cannot leave a cached anonymous token behind.
  const { token } = await request<{ token: string }>("/api/auth/csrf", { signal });
  // A file (such as a dish photo) is sent as the raw request body; everything else as JSON.
  const file = body instanceof Blob;
  return request<T>(path, {
    method,
    headers: {
      "Content-Type": file ? body.type || "application/octet-stream" : "application/json",
      "X-CSRF-TOKEN": token,
    },
    body: file ? body : JSON.stringify(body),
    signal,
  });
}

export async function guestWrite<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
  const { token } = await guestRequest<{ token: string }>("/api/public/csrf", { signal });
  return guestRequest<T>(path, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": token },
    body: JSON.stringify(body),
  });
}

// Chinese pages show the server's message; Italian and English pages translate its code instead.
export function errorMessage(
  error: unknown,
  unknownResult?: string,
  language: Language = "zh",
): string {
  const messages = apiMessages[language];
  if (!(error instanceof ApiError) || error.status >= 500)
    return unknownResult ?? messages.connectionError;
  if (error.code === "CSRF_VALIDATION_FAILED") return messages.csrfExpired;
  if (language === "zh") return error.message;
  return errorTranslations[language][error.code] ?? messages.genericError;
}

// Field errors also arrive in Chinese; Italian and English pages only mark the fields to check.
export function fieldErrors(error: unknown, language: Language): Record<string, string[]> {
  if (!(error instanceof ApiError)) return {};
  if (language === "zh") return error.errors;
  return Object.fromEntries(
    Object.keys(error.errors).map((field) => [field, [apiMessages[language].invalidField]]),
  );
}
