import test from "node:test";
import assert from "node:assert/strict";

import { isSuperAdminUser } from "../auth.ts";
import { openDb } from "../db.ts";
import { ensureSuperAdminBootstrap, SUPER_ADMIN_BOOTSTRAP_SETTING } from "./super-admin-bootstrap.ts";

test("super-admin bootstrap migrates only an existing admin bootstrap user", () => {
  const db = openDb(":memory:");
  const armen = db.createUser({ username: "armen", passHash: "x", role: "admin" });

  const result = ensureSuperAdminBootstrap(db);

  assert.equal(result.status, "bootstrapped");
  assert.equal(db.getUserById(armen.id)?.isSuperAdmin, true);
  assert.equal(isSuperAdminUser(db.getUserById(armen.id)), true);
  assert.equal(db.getSetting(SUPER_ADMIN_BOOTSTRAP_SETTING), "1");
});

test("super-admin bootstrap does not promote a normal user named armen", () => {
  const db = openDb(":memory:");
  const armen = db.createUser({ username: "armen", passHash: "x", role: "user" });

  const result = ensureSuperAdminBootstrap(db);

  assert.deepEqual(result, { status: "missing", reason: "bootstrap_user_not_admin", username: "armen" });
  assert.equal(db.getUserById(armen.id)?.role, "user");
  assert.equal(db.getUserById(armen.id)?.isSuperAdmin, false);
  assert.equal(isSuperAdminUser(db.getUserById(armen.id)), false);
  assert.equal(db.getSetting(SUPER_ADMIN_BOOTSTRAP_SETTING), "1");
});

test("super-admin bootstrap is one-shot after it has been applied", () => {
  const db = openDb(":memory:");
  db.setSetting(SUPER_ADMIN_BOOTSTRAP_SETTING, "1");
  const armen = db.createUser({ username: "armen", passHash: "x", role: "admin" });

  const result = ensureSuperAdminBootstrap(db);

  assert.deepEqual(result, { status: "missing", reason: "already_applied" });
  assert.equal(db.getUserById(armen.id)?.isSuperAdmin, false);
});
