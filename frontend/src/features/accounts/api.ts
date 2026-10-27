import { ApiError, request, write } from "@/lib/api";
import type { RestaurantTheme } from "@/lib/theme";

export type CurrentAccount = {
  userId: string;
  username: string;
  role: "OWNER" | "STAFF";
  restaurantId: string;
  restaurantName: string;
  restaurantTheme: RestaurantTheme;
  mustChangePassword: boolean;
};

// Private query keys and tab storage are scoped to the signed-in account within its restaurant.
export type AccountScope = Pick<CurrentAccount, "restaurantId" | "userId">;

export async function getCurrentAccount(signal?: AbortSignal): Promise<CurrentAccount | null> {
  try {
    return await request<CurrentAccount>("/api/auth/me", { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export const login = (username: string, password: string) =>
  write<CurrentAccount>("/api/auth/login", "POST", { username, password });

export const changePassword = (currentPassword: string, newPassword: string) =>
  write<CurrentAccount>("/api/auth/change-password", "POST", { currentPassword, newPassword });

export async function logout() {
  try {
    await write<void>("/api/auth/logout", "POST", {});
  } catch (error) {
    // An expired credential already means the current browser is signed out.
    if (!(error instanceof ApiError && error.status === 401)) throw error;
  }
}
