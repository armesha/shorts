import { isSuperAdminUser, SUPER_ADMIN_USERNAME } from "../auth.ts";
import type { Db, UserAuth } from "../db.ts";

export const SUPER_ADMIN_BOOTSTRAP_SETTING = "superAdmin.bootstrapApplied";

type BootstrapDb = Pick<
  Db,
  "getSetting" | "setSetting" | "getUserByUsername" | "listUsers" | "setUserSuperAdmin" | "updateUserRole"
>;

export type SuperAdminBootstrapResult =
  | { status: "existing"; user: UserAuth }
  | { status: "promoted_flagged"; user: UserAuth }
  | { status: "bootstrapped"; user: UserAuth }
  | {
      status: "missing";
      reason: "already_applied" | "bootstrap_user_not_found" | "bootstrap_user_not_admin" | "bootstrap_failed";
      username?: string;
    };

export function ensureSuperAdminBootstrap(db: BootstrapDb): SuperAdminBootstrapResult {
  const flagged = db.listUsers().find((user) => user.isSuperAdmin);
  if (flagged) {
    const user = flagged.role === "admin" ? flagged : db.updateUserRole(flagged.id, "admin") ?? flagged;
    if (db.getSetting(SUPER_ADMIN_BOOTSTRAP_SETTING) !== "1") db.setSetting(SUPER_ADMIN_BOOTSTRAP_SETTING, "1");
    return { status: flagged.role === "admin" ? "existing" : "promoted_flagged", user };
  }

  if (db.getSetting(SUPER_ADMIN_BOOTSTRAP_SETTING) === "1") {
    return { status: "missing", reason: "already_applied" };
  }

  const bootstrapUser = db.getUserByUsername(SUPER_ADMIN_USERNAME);
  if (!bootstrapUser) return { status: "missing", reason: "bootstrap_user_not_found", username: SUPER_ADMIN_USERNAME };
  if (bootstrapUser.role !== "admin") {
    db.setSetting(SUPER_ADMIN_BOOTSTRAP_SETTING, "1");
    return { status: "missing", reason: "bootstrap_user_not_admin", username: bootstrapUser.username };
  }

  const user = db.setUserSuperAdmin(bootstrapUser.id, true);
  if (!user || !isSuperAdminUser(user)) return { status: "missing", reason: "bootstrap_failed", username: bootstrapUser.username };
  db.setSetting(SUPER_ADMIN_BOOTSTRAP_SETTING, "1");
  return { status: "bootstrapped", user };
}
