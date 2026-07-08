// Session/cookie/impersonation helpers, factored out of index.ts VERBATIM (bodies unchanged; only
// the closed-over `db` / `COOKIE_SECURE` are now constructor inputs instead of module globals).
//
// IMPORTANT: the PUBLIC_API allowlist + the global `onRequest` auth gate body STAY in index.ts — this
// module only provides the cookie writers + session/impersonation lookups the routes need. index.ts
// builds ONE instance via makeAuthSession(db) and threads the pieces into each route module's `deps`.
import type { Db } from "../db.ts";
import { isAdminLikeUser, isAdminRole, isSuperAdminUser, SESSION_TTL_DAYS } from "../auth.ts";

export const SESSION_COOKIE = "sid";
export const ADMIN_SESSION_COOKIE = "admin_sid";
export const DAY_MS = 86_400_000;

// Secure cookie: ON by default whenever the app is served over HTTPS (PUBLIC_BASE_URL=https://…),
// which is the prod case (Cloudflare Tunnel). SESSION_COOKIE_SECURE=1/0 forces it on/off for edge cases.
export const COOKIE_SECURE =
  process.env.SESSION_COOKIE_SECURE === "1" ||
  (process.env.SESSION_COOKIE_SECURE !== "0" && (process.env.PUBLIC_BASE_URL ?? "").startsWith("https://"));

export function getCookie(req: { headers: { cookie?: string } }, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function sessionCookieHeader(token: string): string {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_TTL_DAYS * 86_400}`,
  ];
  if (COOKIE_SECURE) attrs.push("Secure");
  return attrs.join("; ");
}

export function adminSessionCookieHeader(token: string): string {
  const attrs = [
    `${ADMIN_SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_TTL_DAYS * 86_400}`,
  ];
  if (COOKIE_SECURE) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearSessionCookieHeader(): string {
  const attrs = [`${SESSION_COOKIE}=`, "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (COOKIE_SECURE) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearAdminSessionCookieHeader(): string {
  const attrs = [`${ADMIN_SESSION_COOKIE}=`, "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (COOKIE_SECURE) attrs.push("Secure");
  return attrs.join("; ");
}

export function setSessionCookie(reply: { header: (k: string, v: string) => unknown }, token: string) {
  reply.header("Set-Cookie", sessionCookieHeader(token));
}
export function clearSessionCookie(reply: { header: (k: string, v: string) => unknown }) {
  reply.header("Set-Cookie", clearSessionCookieHeader());
}

// uid of the authenticated request (guaranteed set by the hook for gated routes).
export const uid = (req: unknown): number => (req as { userId?: number }).userId as number;
export type Replyish = { code: (n: number) => { send: (b: unknown) => unknown } };

export type SessionUser = { id: number; username: string; role: string; isSuperAdmin: boolean };
type PublicUserInput = {
  id: number;
  username: string;
  role: string;
  isSuperAdmin?: boolean;
  passwordSet?: boolean;
  timezone?: string;
};

export interface AuthSession {
  validSessionUser: (token: string | null) => SessionUser | null;
  impersonatorUser: (req: unknown) => SessionUser | null;
  publicUser: (req: unknown, user: PublicUserInput, impersonator?: SessionUser | null) => {
    id: number;
    username: string;
    role: string;
    isSuperAdmin: boolean;
    timezone: string | undefined;
    passwordSet: boolean;
    impersonator: SessionUser | null;
  };
  requireAdmin: (req: unknown, reply: Replyish) => boolean;
  requireAdminLike: (req: unknown, reply: Replyish) => boolean;
  requireSuperAdmin: (req: unknown, reply: Replyish) => boolean;
  isAdminReq: (req: unknown) => boolean;
  isAdminLikeReq: (req: unknown) => boolean;
  isSuperAdminReq: (req: unknown) => boolean;
}

export function makeAuthSession(db: Db): AuthSession {
  function validSessionUser(token: string | null): SessionUser | null {
    const sess = token ? db.getSession(token) : null;
    if (!sess || new Date(sess.expiresAt).getTime() < Date.now()) {
      if (token) db.deleteSession(token);
      return null;
    }
    const u = db.getUserById(sess.userId);
    return u ? { id: u.id, username: u.username, role: u.role, isSuperAdmin: isSuperAdminUser(u) } : null;
  }

  function impersonatorUser(req: unknown): SessionUser | null {
    const currentId = (req as { userId?: number }).userId ?? null;
    const admin = validSessionUser(getCookie(req as { headers: { cookie?: string } }, ADMIN_SESSION_COOKIE));
    if (!admin || !isAdminRole(admin.role) || admin.id === currentId) return null;
    return admin;
  }

  function publicUser(req: unknown, user: PublicUserInput, impersonator = impersonatorUser(req)) {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin ?? isSuperAdminUser(user),
      timezone: user.timezone,
      passwordSet: user.passwordSet ?? true,
      impersonator,
    };
  }

  function requireAdmin(req: unknown, reply: Replyish): boolean {
    const u = db.getUserById(uid(req));
    if (!isAdminRole(u?.role)) {
      reply.code(403).send({ error: "Только для администратора" });
      return false;
    }
    return true;
  }

  function requireAdminLike(req: unknown, reply: Replyish): boolean {
    const u = db.getUserById(uid(req));
    if (!isAdminLikeUser(u)) {
      reply.code(403).send({ error: "Только для администратора или модератора" });
      return false;
    }
    return true;
  }

  function isAdminReq(req: unknown): boolean {
    return isAdminRole(db.getUserById(uid(req))?.role);
  }

  function isAdminLikeReq(req: unknown): boolean {
    return isAdminLikeUser(db.getUserById(uid(req)));
  }

  function requireSuperAdmin(req: unknown, reply: Replyish): boolean {
    const u = db.getUserById(uid(req));
    if (!isSuperAdminUser(u)) {
      reply.code(403).send({ error: "Только для главного администратора" });
      return false;
    }
    return true;
  }

  function isSuperAdminReq(req: unknown): boolean {
    return isSuperAdminUser(db.getUserById(uid(req)));
  }

  return {
    validSessionUser,
    impersonatorUser,
    publicUser,
    requireAdmin,
    requireAdminLike,
    requireSuperAdmin,
    isAdminReq,
    isAdminLikeReq,
    isSuperAdminReq,
  };
}
