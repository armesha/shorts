import type { Db } from "../db.ts";

/** The two named administrators share content, while every other user stays isolated. */
export function sharedWorkspaceUserIds(db: Pick<Db, "getUserById" | "getUserByUsername">, userId: number): number[] {
  if (typeof db.getUserById !== "function" || typeof db.getUserByUsername !== "function") return [userId];
  const user = db.getUserById(userId);
  const name = user?.username?.trim().toLowerCase();
  if (user?.role !== "admin" || (name !== "armen" && name !== "stas")) return [userId];
  const peer = db.getUserByUsername(name === "armen" ? "stas" : "armen");
  return peer?.role === "admin" ? [userId, peer.id] : [userId];
}

export function sharesWorkspace(db: Pick<Db, "getUserById" | "getUserByUsername">, userId: number, ownerId: number | null | undefined): boolean {
  return ownerId != null && (ownerId === userId || sharedWorkspaceUserIds(db, userId).includes(ownerId));
}
