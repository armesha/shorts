// Per-user Google OAuth clients (uploaded client_secret.json; up to MAX_OAUTH_CLIENTS_PER_USER).
// The raw client_secret_json is SERVER-ONLY — list/meta helpers never expose it. Method shorthand so
// addOAuthClient→this.countOAuthClients / this.listOAuthClients resolve on the merged store.
import type { DatabaseSync } from "node:sqlite";
import { defaultClientLabel, type Row } from "./mappers.ts";
import type { Account, OAuthClientRow } from "./types.ts";

export function oauthMethods(db: DatabaseSync) {
  return {
    countOAuthClients(userId: number): number {
      const r = db.prepare("SELECT COUNT(*) AS n FROM oauth_clients WHERE user_id = ?").get(userId) as Row;
      return Number(r.n) || 0;
    },
    listOAuthClients(userId: number): OAuthClientRow[] {
      const rows = db.prepare("SELECT * FROM oauth_clients WHERE user_id = ? ORDER BY id").all(userId) as Row[];
      return rows.map((r) => ({
        id: Number(r.id),
        userId: Number(r.user_id),
        label: String(r.label ?? ""),
        clientId: String(r.client_id ?? ""),
        projectId: (r.project_id as string) ?? null,
        createdAt: String(r.created_at),
        channelCount:
          Number((db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE oauth_client_id = ?").get(r.id) as Row).n) || 0,
      }));
    },
    addOAuthClient(
      userId: number,
      input: { json: string; label?: string; clientId: string; projectId: string | null },
    ): OAuthClientRow {
      const label = (input.label && input.label.trim()) || defaultClientLabel(input.projectId, this.countOAuthClients(userId) + 1);
      const info = db
        .prepare("INSERT INTO oauth_clients (user_id, label, client_secret_json, client_id, project_id) VALUES (?,?,?,?,?)")
        .run(userId, label, input.json, input.clientId, input.projectId);
      const id = Number(info.lastInsertRowid);
      return this.listOAuthClients(userId).find((c) => c.id === id)!;
    },
    renameOAuthClient(userId: number, id: number, label: string): boolean {
      return db.prepare("UPDATE oauth_clients SET label = ? WHERE id = ? AND user_id = ?").run(label.trim(), id, userId).changes > 0;
    },
    /** Channels bound to a key (powers the "in use → can't delete" guard and UI counts). */
    accountsUsingOAuthClient(id: number): { id: number; channelName: string }[] {
      return (db.prepare("SELECT id, channel_name FROM accounts WHERE oauth_client_id = ?").all(id) as Row[]).map((r) => ({
        id: Number(r.id),
        channelName: String(r.channel_name),
      }));
    },
    deleteOAuthClient(userId: number, id: number): boolean {
      return db.prepare("DELETE FROM oauth_clients WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
    },
    /** Owner-scoped raw JSON (server-only) — used to confirm a chosen key belongs to the user. */
    getOAuthClientSecretForUser(userId: number, id: number): string | null {
      const r = db.prepare("SELECT client_secret_json FROM oauth_clients WHERE id = ? AND user_id = ?").get(id, userId) as Row | undefined;
      return (r?.client_secret_json as string) ?? null;
    },
    bindAccountOAuthClient(accountId: number, oauthClientId: number): void {
      db.prepare("UPDATE accounts SET oauth_client_id = ? WHERE id = ?").run(oauthClientId, accountId);
    },
    /**
     * Resolve the client_secret JSON a channel must use for OAuth refresh/upload. A BOUND channel uses
     * exactly its key (its refresh token's client_id must match); if that key was removed we return null
     * (caller → "reconnect") rather than silently using a different, mismatched key. A never-bound
     * (legacy) channel falls back to the owner's most-recent key.
     */
    oauthClientSecretForAccount(account: Account): string | null {
      if (account.oauthClientId != null) {
        const r = db.prepare("SELECT client_secret_json FROM oauth_clients WHERE id = ?").get(account.oauthClientId) as Row | undefined;
        return (r?.client_secret_json as string) ?? null;
      }
      // Unbound channel: a CONNECTED one must not guess a key — its refresh token is client_id-specific, so
      // returning the owner's newest key could upload under the wrong client_id. Force a reconnect instead.
      // Only a not-yet-connected channel may borrow the owner's newest key (it has no token to mismatch).
      if (account.userId != null && account.status !== "connected") {
        const r = db
          .prepare("SELECT client_secret_json FROM oauth_clients WHERE user_id = ? ORDER BY id DESC LIMIT 1")
          .get(account.userId) as Row | undefined;
        return (r?.client_secret_json as string) ?? null;
      }
      return null;
    },
  };
}
