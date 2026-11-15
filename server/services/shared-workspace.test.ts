import assert from "node:assert/strict";
import test from "node:test";
import { openDb } from "../db.ts";
import { sharedWorkspaceUserIds, sharesWorkspace } from "./shared-workspace.ts";

test("shared workspace is limited to the two administrators", () => {
  const db = openDb(":memory:");
  try {
    const armen = db.createUser({ username: "armen", passHash: "test", role: "admin" });
    const stas = db.createUser({ username: "stas", passHash: "test", role: "admin" });
    const other = db.createUser({ username: "other", passHash: "test", role: "admin" });
    assert.deepEqual(sharedWorkspaceUserIds(db, armen.id), [armen.id, stas.id]);
    assert.deepEqual(sharedWorkspaceUserIds(db, stas.id), [stas.id, armen.id]);
    assert.equal(sharesWorkspace(db, stas.id, armen.id), true);
    assert.equal(sharesWorkspace(db, other.id, armen.id), false);
    assert.equal(sharesWorkspace(db, armen.id, other.id), false);
  } finally { db.db.close(); }
});
