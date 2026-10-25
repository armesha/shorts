import assert from "node:assert/strict";
import test from "node:test";
import { openDb } from "../db.ts";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";


const POSTERS_DECK = "pack:soviet-posters-ru";

test("per-account auto-expire source is removed only after its channel library is drained", async () => {
  const originalCwd = process.cwd();
  const fixtureDir = mkdtempSync(join(tmpdir(),"shorts-auto-expire-"));
  mkdirSync(join(fixtureDir,"data/packs"),{recursive:true});
  writeFileSync(join(fixtureDir,"data/packs/soviet-posters-ru.json"),JSON.stringify({id:"soviet-posters-ru",name:"Fixture",lang:"ru",owners:[1],createdBy:1,templates:[],cards:[{values:{text:"Fixture"},addedAt:"2026-01-01"}],createdAt:"2026-01-01",autoExpireMode:"per_account"}));
  process.chdir(fixtureDir);
  const {packCardClaimKey,packCardKey}=await import("./pack-gen.ts");
  const {getPack}=await import("../../src/packs/store.ts");
  const {cleanupDrainedAutoExpireDecksForAccount,isAutoExpireDeckDrainedForAccount,isAutoExpiredSourceGroup}=await import("./auto-expire-packs.ts");
  try {
  const db = openDb(":memory:");
  const account = db.createAccount({
    userId: 1,
    channelName: "RU",
    lang: "ru",
    channelLang: "ru",
    sourceDecks: ["ru", POSTERS_DECK],
    schedule: ["10:00", "20:00"],
    slotDecks: { "20:00": POSTERS_DECK },
  });
  const pack = getPack("soviet-posters-ru", 1, true);
  assert.ok(pack, "test fixture pack must exist");

  for (const card of pack.cards) {
    db.markAnecdoteUsed(1, packCardClaimKey(pack, account.id, packCardKey(card.values)));
  }

  const video = db.createVideo({
    accountId: account.id,
    title: "poster",
    text: "poster",
    bg: "",
    music: "",
    deck: POSTERS_DECK,
    videoRel: "poster.mp4",
    imageRel: null,
  });

  assert.equal(isAutoExpireDeckDrainedForAccount(db, account, POSTERS_DECK), false);
  assert.deepEqual(cleanupDrainedAutoExpireDecksForAccount(db, account).removedDecks, []);
  assert.ok(db.getAccount(account.id)?.sourceDecks.includes(POSTERS_DECK));

  db.deleteVideo(video.id);

  const removed = cleanupDrainedAutoExpireDecksForAccount(db, db.getAccount(account.id)!);
  assert.deepEqual(removed.removedDecks, [POSTERS_DECK]);
  const updated = db.getAccount(account.id)!;
  assert.ok(!updated.sourceDecks.includes(POSTERS_DECK));
  assert.ok(!Object.values(updated.slotDecks).includes(POSTERS_DECK));
  assert.equal(isAutoExpiredSourceGroup(db, "russian", "soviet_posters"), true);
  db.db.close();
  } finally {process.chdir(originalCwd);rmSync(fixtureDir,{recursive:true,force:true});}
});
