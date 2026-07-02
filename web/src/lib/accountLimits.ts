// Frontend mirror of server/infra/account-limits.ts for UI hints only.
// The backend is authoritative.
export const MGS_LEGACY_USER_ID = 3;

export function isMgsLegacyUser(user: { id?: number | null; userId?: number | null; username?: string | null } | null | undefined): boolean {
  const id = user?.id ?? user?.userId;
  return Number(id) === MGS_LEGACY_USER_ID && String(user?.username ?? "").trim().toLowerCase() === "mgs";
}
