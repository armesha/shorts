// User-facing deduped notification inbox + the self-cleaning error log + the key/value settings store.
// Method shorthand so upsertNotification→this.getNotificationByKey and markNotificationRead/Unread/
// resolveNotification→this.getNotification resolve on the merged store.
import type { DatabaseSync } from "node:sqlite";
import { rowToNotification, rowToError, type Row } from "./mappers.ts";
import type { NotificationItem, ErrorLogItem } from "./types.ts";

export function notifMethods(db: DatabaseSync) {
  return {
    getSetting(key: string): string | null {
      const r = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as Row | undefined;
      return r ? (r.value as string) : null;
    },
    setSetting(key: string, value: string): void {
      db.prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run(key, value);
    },
    // ---- User-facing notifications (deduped issue inbox) ----
    upsertNotification(n: {
      userId: number;
      accountId?: number | null;
      severity?: string;
      category?: string;
      title: string;
      message: string;
      solution?: string | null;
      actionUrl?: string | null;
      dedupeKey: string;
      source?: string | null;
      context?: string | null;
    }): NotificationItem {
      const severity = ["info", "warning", "error"].includes(n.severity ?? "") ? n.severity! : "info";
      db.prepare(
        `INSERT INTO notifications
          (user_id, account_id, severity, category, title, message, solution, action_url,
           dedupe_key, source, context, count, first_seen_at, last_seen_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,1,datetime('now'),datetime('now'),datetime('now'),datetime('now'))
         ON CONFLICT(user_id, dedupe_key) DO UPDATE SET
           account_id=excluded.account_id,
           severity=excluded.severity,
           category=excluded.category,
           title=excluded.title,
           message=excluded.message,
           solution=excluded.solution,
           action_url=excluded.action_url,
           source=excluded.source,
           context=excluded.context,
           count=notifications.count + 1,
           read_at=NULL,
           resolved_at=NULL,
           last_seen_at=datetime('now'),
           updated_at=datetime('now')`,
      ).run(
        n.userId,
        n.accountId ?? null,
        severity,
        String(n.category || "system").slice(0, 80),
        String(n.title).slice(0, 240),
        String(n.message).slice(0, 2000),
        n.solution ? String(n.solution).slice(0, 4000) : null,
        n.actionUrl ? String(n.actionUrl).slice(0, 1000) : null,
        String(n.dedupeKey).slice(0, 300),
        n.source ? String(n.source).slice(0, 80) : null,
        n.context ? String(n.context).slice(0, 500) : null,
      );
      return this.getNotificationByKey(n.userId, String(n.dedupeKey).slice(0, 300))!;
    },
    getNotification(id: number): NotificationItem | null {
      const r = db
        .prepare(
          `SELECT n.*, u.username, COALESCE(a.yt_channel_title, a.channel_name) AS account_name
           FROM notifications n
           LEFT JOIN users u ON u.id = n.user_id
           LEFT JOIN accounts a ON a.id = n.account_id
           WHERE n.id = ?`,
        )
        .get(id) as Row | undefined;
      return r ? rowToNotification(r) : null;
    },
    getNotificationByKey(userId: number, dedupeKey: string): NotificationItem | null {
      const r = db
        .prepare(
          `SELECT n.*, u.username, COALESCE(a.yt_channel_title, a.channel_name) AS account_name
           FROM notifications n
           LEFT JOIN users u ON u.id = n.user_id
           LEFT JOIN accounts a ON a.id = n.account_id
           WHERE n.user_id = ? AND n.dedupe_key = ?`,
        )
        .get(userId, dedupeKey) as Row | undefined;
      return r ? rowToNotification(r) : null;
    },
    listNotifications(opts: {
      userId?: number;
      includeResolved?: boolean;
      onlyResolved?: boolean;
      onlyUnread?: boolean;
      limit?: number;
      offset?: number;
    } = {}): NotificationItem[] {
      const where: string[] = [];
      const args: (string | number)[] = [];
      if (opts.userId != null) {
        where.push("n.user_id = ?");
        args.push(opts.userId);
      }
      if (opts.onlyResolved) where.push("n.resolved_at IS NOT NULL");
      else if (!opts.includeResolved) where.push("n.resolved_at IS NULL");
      if (opts.onlyUnread) where.push("n.read_at IS NULL");
      const limit = Math.min(200, Math.max(1, opts.limit ?? 100));
      const offset = Math.max(0, opts.offset ?? 0);
      const rows = db
        .prepare(
          `SELECT n.*, u.username, COALESCE(a.yt_channel_title, a.channel_name) AS account_name
           FROM notifications n
           LEFT JOIN users u ON u.id = n.user_id
           LEFT JOIN accounts a ON a.id = n.account_id
           ${where.length ? "WHERE " + where.join(" AND ") : ""}
           ORDER BY (n.resolved_at IS NULL) DESC, n.last_seen_at DESC, n.id DESC
           LIMIT ? OFFSET ?`,
        )
        .all(...args, limit, offset) as Row[];
      return rows.map(rowToNotification);
    },
    notificationCounts(userId?: number): { open: number; unread: number; total: number } {
      const where = userId != null ? "WHERE user_id = ?" : "";
      const args = userId != null ? [userId] : [];
      const r = db
        .prepare(
          `SELECT
            SUM(CASE WHEN resolved_at IS NULL THEN 1 ELSE 0 END) AS open,
            SUM(CASE WHEN resolved_at IS NULL AND read_at IS NULL THEN 1 ELSE 0 END) AS unread,
            COUNT(*) AS total
           FROM notifications ${where}`,
        )
        .get(...args) as Row;
      return {
        open: Number(r.open) || 0,
        unread: Number(r.unread) || 0,
        total: Number(r.total) || 0,
      };
    },
    markNotificationRead(id: number): NotificationItem | null {
      db.prepare(
        "UPDATE notifications SET read_at = COALESCE(read_at, datetime('now')), updated_at = datetime('now') WHERE id = ?",
      ).run(id);
      return this.getNotification(id);
    },
    markNotificationUnread(id: number): NotificationItem | null {
      db.prepare("UPDATE notifications SET read_at = NULL, updated_at = datetime('now') WHERE id = ?").run(id);
      return this.getNotification(id);
    },
    markAllNotificationsRead(userId?: number): number {
      const where = userId != null ? "WHERE user_id = ? AND resolved_at IS NULL" : "WHERE resolved_at IS NULL";
      const args = userId != null ? [userId] : [];
      const info = db
        .prepare(`UPDATE notifications SET read_at = COALESCE(read_at, datetime('now')), updated_at = datetime('now') ${where}`)
        .run(...args);
      return Number(info.changes) || 0;
    },
    resolveNotification(id: number): NotificationItem | null {
      db.prepare(
        "UPDATE notifications SET resolved_at = COALESCE(resolved_at, datetime('now')), read_at = COALESCE(read_at, datetime('now')), updated_at = datetime('now') WHERE id = ?",
      ).run(id);
      return this.getNotification(id);
    },
    deleteNotification(id: number): boolean {
      const info = db.prepare("DELETE FROM notifications WHERE id = ?").run(id);
      return (Number(info.changes) || 0) > 0;
    },
    // ---- Error log (self-cleaning: keeps last 7 days, capped at 1000 rows) ----
    addError(e: {
      source?: string;
      level?: string;
      message: string;
      detail?: string | null;
      context?: string | null;
      userId?: number | null;
    }): void {
      db.prepare(
        "INSERT INTO error_log (source, level, message, detail, context, user_id) VALUES (?,?,?,?,?,?)",
      ).run(
        e.source ?? "server",
        e.level ?? "error",
        String(e.message).slice(0, 2000),
        e.detail ? String(e.detail).slice(0, 8000) : null,
        e.context ? String(e.context).slice(0, 500) : null,
        e.userId ?? null,
      );
      db.prepare("DELETE FROM error_log WHERE created_at < datetime('now','-7 days')").run();
      db.prepare(
        "DELETE FROM error_log WHERE id NOT IN (SELECT id FROM error_log ORDER BY id DESC LIMIT 1000)",
      ).run();
    },
    listErrors(limit = 200): ErrorLogItem[] {
      const rows = db.prepare("SELECT * FROM error_log ORDER BY id DESC LIMIT 1000").all() as Row[];
      const groups = new Map<
        string,
        ErrorLogItem & { _contexts: Set<string>; _firstCreatedAt: string }
      >();
      for (const r of rows) {
        const key = [r.source, r.level, r.message].map((x) => String(x ?? "")).join("\u0000");
        let g = groups.get(key);
        if (!g) {
          g = { ...rowToError(r), count: 0, _contexts: new Set<string>(), _firstCreatedAt: r.created_at };
          groups.set(key, g);
        }
        g.count = (g.count ?? 0) + 1;
        g._firstCreatedAt = r.created_at;
        if (r.context) g._contexts.add(String(r.context));
      }
      return [...groups.values()].slice(0, Math.max(1, limit)).map((g) => {
        const contexts = [...g._contexts];
        const shown = contexts.slice(0, 8);
        const rest = contexts.length - shown.length;
        return {
          id: g.id,
          source: g.source,
          level: g.level,
          message: g.message,
          detail: g.detail,
          context: shown.length ? shown.join(", ") + (rest > 0 ? `, +${rest}` : "") : g.context,
          userId: g.userId,
          createdAt: g.createdAt,
          firstCreatedAt: g._firstCreatedAt,
          count: g.count,
        };
      });
    },
    errorCount(): number {
      const r = db.prepare("SELECT COUNT(*) AS n FROM error_log").get() as Row;
      return Number(r.n) || 0;
    },
    // Errors logged within the last N hours (for the server-health page's "ошибок за 24ч").
    recentErrorCount(hours = 24): number {
      const r = db
        .prepare("SELECT COUNT(*) AS n FROM error_log WHERE created_at >= datetime('now', ?)")
        .get(`-${Math.max(1, Math.floor(hours))} hours`) as Row;
      return Number(r.n) || 0;
    },
    clearErrors(): void {
      db.prepare("DELETE FROM error_log").run();
    },
  };
}
