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

// ---- Brute-force / session policy (env-overridable) ----
export const MAX_FAILED_ATTEMPTS = Math.max(1, Number(process.env.AUTH_MAX_ATTEMPTS ?? 10));
export const LOCK_MINUTES = Math.max(1, Number(process.env.AUTH_LOCK_MINUTES ?? 15));
export const SESSION_TTL_DAYS = Math.max(1, Number(process.env.SESSION_TTL_DAYS ?? 30));
