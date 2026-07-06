import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../db.ts";
import { makeAuthSession } from "../infra/auth-session.ts";
import { makeRouteDeps } from "./deps.ts";

function routeDepsFor(db: ReturnType<typeof openDb>) {
  return makeRouteDeps({
    db,
    auth: makeAuthSession(db),
    deckAccess: {} as never,
    notifier: {} as never,
    buildLibraryVideo: (() => null) as never,
    statsRefreshHooks: {} as never,
    outputDir: "",
    redirectUri: "",
    webOrigin: "",
    accountCreds: () => null,
    listAvatarFiles: () => [],
  });
}

test("scope=all expands channels for admins, moderators, and super-admins in readonly views", () => {
  const db = openDb(":memory:");
  try {
    const user = db.createUser({ username: "viewer", passHash: "x", role: "user" });
    const admin = db.createUser({ username: "admin", passHash: "x", role: "admin" });
    const moder = db.createUser({ username: "moder", passHash: "x", role: "moder" });
    const superAdmin = db.createUser({ username: "owner", passHash: "x", role: "admin", isSuperAdmin: true });
    const own = db.createAccount({ userId: user.id, channelName: "Viewer channel", lang: "en", channelLang: "en" });
    const adminChannel = db.createAccount({ userId: admin.id, channelName: "Admin channel", lang: "de", channelLang: "de" });
    const moderChannel = db.createAccount({ userId: moder.id, channelName: "Moder channel", lang: "fr", channelLang: "fr" });
    const superChannel = db.createAccount({ userId: superAdmin.id, channelName: "Owner channel", lang: "ru", channelLang: "ru" });
    const deps = routeDepsFor(db);
    const ids = (rows: { id: number }[]) => rows.map((row) => row.id).sort((a, b) => a - b);

    assert.deepEqual(ids(deps.visibleAccounts({ userId: user.id }, "all", true)), [own.id]);
    assert.deepEqual(ids(deps.visibleAccounts({ userId: admin.id }, "all", true)), [own.id, adminChannel.id, moderChannel.id, superChannel.id]);
    assert.deepEqual(ids(deps.visibleAccounts({ userId: moder.id }, "all", true)), [own.id, adminChannel.id, moderChannel.id, superChannel.id]);
    assert.deepEqual(ids(deps.visibleAccounts({ userId: superAdmin.id }, "all", true)), [own.id, adminChannel.id, moderChannel.id, superChannel.id]);
    assert.deepEqual(ids(deps.visibleAccounts({ userId: moder.id }, "all")), [moderChannel.id]);
    assert.equal(deps.visibleAccount({ userId: user.id }, adminChannel.id, true), null);
    assert.equal(deps.visibleAccount({ userId: moder.id }, own.id, true)?.id, own.id);
    assert.equal(deps.visibleAccount({ userId: moder.id }, own.id), null);
    assert.equal(deps.visibleAccount({ userId: admin.id }, own.id, true)?.id, own.id);
  } finally {
    db.db.close();
  }
});
