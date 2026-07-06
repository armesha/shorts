// Authentication primitives: password hashing (scrypt, no deps), session tokens,
// and the brute-force lockout policy. Pure functions only — no DB, no Fastify here.
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

/** Hash a plaintext password → "scrypt$<saltHex>$<keyHex>". Never store plaintext. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES);
  const key = scryptSync(plain, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

/** Constant-time verify against a stored "scrypt$salt$key" string. */
export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (expected.length === 0) return false;
  const actual = scryptSync(plain, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** 256-bit opaque session token (stored server-side, set as an httpOnly cookie). */
export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

// ---- Admin / brute-force / session policy ----
// Bootstrap-only fallback for existing installs. Runtime permissions must use is_super_admin from users.
export const SUPER_ADMIN_USERNAME = "armen";
export type UserRole = "admin" | "moder" | "user";
export function normalizeUserRole(role: string | null | undefined): UserRole {
  return role === "admin" || role === "moder" ? role : "user";
}
export function isAdminRole(role: string | null | undefined): boolean {
  return normalizeUserRole(role) === "admin";
}
export function isModeratorRole(role: string | null | undefined): boolean {
  return normalizeUserRole(role) === "moder";
}
export function isAdminLikeRole(role: string | null | undefined): boolean {
  const normalized = normalizeUserRole(role);
  return normalized === "admin" || normalized === "moder";
}
export function isAdminLikeUser(user: { role?: string | null } | null | undefined): boolean {
  return isAdminLikeRole(user?.role);
}
export function isSuperAdminUser(
  user: { role?: string | null; isSuperAdmin?: boolean | number | null; is_super_admin?: boolean | number | null } | null | undefined,
): boolean {
  const flag = user?.isSuperAdmin ?? user?.is_super_admin ?? false;
  return isAdminRole(user?.role) && (flag === true || flag === 1);
}

export const MAX_FAILED_ATTEMPTS = Math.max(1, Number(process.env.AUTH_MAX_ATTEMPTS ?? 10));
const legacyLockMinutes = process.env.AUTH_LOCK_MINUTES ? Number(process.env.AUTH_LOCK_MINUTES) * 60 : undefined;
export const LOCK_SECONDS = Math.max(1, Number(process.env.AUTH_LOCK_SECONDS ?? legacyLockMinutes ?? 30));
export const SESSION_TTL_DAYS = Math.max(1, Number(process.env.SESSION_TTL_DAYS ?? 30));
