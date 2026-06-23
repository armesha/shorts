import type { AuthUser } from "./api";

export function isMainAdmin(user: Pick<AuthUser, "username" | "role" | "isSuperAdmin"> | null | undefined): boolean {
  return user?.role === "admin" && user.username === "armen" && user.isSuperAdmin !== false;
}
