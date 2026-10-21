import { messages } from "./messages";

export type CurrentAccount = {
  userId: string;
  username: string;
  role: "OWNER" | "STAFF";
  restaurantId: string;
  restaurantName: string;
  mustChangePassword: boolean;
};

type ErrorBody = {
  code?: string;
  message?: string;
  requestId?: string;
  errors?: Record<string, string[]>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter: number | null;

  constructor(status: number, body: ErrorBody, retryAfter: string | null) {
    super(body.message ?? messages.genericError);
    this.status = status;
    this.code = body.code ?? "UNKNOWN_ERROR";
    this.retryAfter = retryAfter ? Number(retryAfter) : null;
  }
}

type AuthFailure = "signed-out" | "password-required";
let onAuthFailure: (reason: AuthFailure) => Promise<void> = async () => {};

export function setAuthFailureHandler(handler: typeof onAuthFailure) {
  onAuthFailure = handler;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store" });
  if (!response.ok) {
    const body: ErrorBody = await response.json().catch(() => ({}));
    const error = new ApiError(response.status, body, response.headers.get("Retry-After"));
    // /me maps 401 to an anonymous identity; a wrong password on /login must not invalidate another account.
    if ((response.status === 401 && path !== "/api/auth/login" && path !== "/api/auth/me") ||
      error.code === "CREDENTIALS_CHANGED") {
      await onAuthFailure("signed-out");
    } else if (error.code === "PASSWORD_CHANGE_REQUIRED") {
      await onAuthFailure("password-required");
    }
    throw error;
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export async function refreshCsrf(): Promise<string> {
  const response = await request<{ token: string }>("/api/auth/csrf");
  return response.token;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  // Fetch for every mutation so other tabs changing identity cannot leave a cached anonymous token behind.
  const token = await refreshCsrf();
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": token },
    body: JSON.stringify(body),
  });
}

export async function getCurrentAccount(signal?: AbortSignal): Promise<CurrentAccount | null> {
  try {
    return await request<CurrentAccount>("/api/auth/me", { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export const login = (username: string, password: string) =>
  post<CurrentAccount>("/api/auth/login", { username, password });

export const changePassword = (currentPassword: string, newPassword: string) =>
  post<CurrentAccount>("/api/auth/change-password", { currentPassword, newPassword });

export async function logout() {
  try {
    await post<void>("/api/auth/logout", {});
  } catch (error) {
    // An expired credential already means the current browser is signed out.
    if (!(error instanceof ApiError && error.status === 401)) throw error;
  }
}

export function errorMessage(error: unknown, unknownResult: string = messages.connectionError): string {
  if (!(error instanceof ApiError) || error.status >= 500) return unknownResult;
  if (error.code === "CSRF_VALIDATION_FAILED") return messages.csrfExpired;
  return error.message;
}
