import type { AuthUser } from "./api";

type RoleLike = Pick<AuthUser, "role"> | null | undefined;

export function isAdminRole(user: RoleLike): boolean {
  return user?.role === "admin";
}

export function isModerRole(user: RoleLike): boolean {
  return user?.role === "moder";
}

export function isAdminLike(user: RoleLike): boolean {
  return isAdminRole(user) || isModerRole(user);
}

export function isMainAdmin(user: Pick<AuthUser, "username" | "role" | "isSuperAdmin"> | null | undefined): boolean {
  return !!user && isAdminRole(user) && user.isSuperAdmin === true;
}

export function roleLabelKey(role: string | null | undefined): "common.admin" | "common.moder" | "common.user" {
  if (role === "admin") return "common.admin";
  if (role === "moder") return "common.moder";
  return "common.user";
}
