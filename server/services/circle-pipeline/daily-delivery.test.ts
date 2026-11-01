import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "../../db.ts";
import { createSocialService } from "../social/store.ts";
import type { SocialBrowser } from "../social/browser.ts";
import { CircleLibrary } from "./library.ts";
import { CircleSocialPublisher } from "./social-publisher.ts";
import { CircleYouTubePublisher } from "./youtube-publisher.ts";
import type { CirclePipelineService } from "./service.ts";

test("two daily circles are each sent once to all three platforms", async context => {
  const root = mkdtempSync(join(tmpdir(), "circle-daily-"));
  const db = openDb(":memory:");
  const morning = Date.parse("2026-11-01T22:00:00Z");
  const posting = Date.parse("2026-11-02T07:00:00Z");
  context.mock.timers.enable({ apis: ["Date"], now: morning });
  try {
    const owner = db.createUser({ username: "owner", passHash: "x", role: "admin" });
    const instagram = db.createAccount({ userId: owner.id, platform: "instagram", schedule: [] });
    const tiktok = db.createAccount({ userId: owner.id, platform: "tiktok", schedule: [] });
    const youtube = db.createAccount({ userId: owner.id, platform: "youtube", schedule: [] });
    const library = new CircleLibrary(join(root, "library"));
    for (let slot = 0; slot < 2; slot++) {
      const job = (await library.claim(owner.id, morning))!;
      assert.equal(job.slot, slot);
      await library.update(owner.id, job.id, "running");
      mkdirSync(library.directory(job), { recursive: true });
      writeFileSync(join(library.directory(job), "video.mp4"), `circle-${slot}`);
      writeFileSync(join(library.directory(job), "caption.json"), JSON.stringify({ title: `История номер ${slot}`, description: `Понятное описание номера ${slot}.` }));
      await library.update(owner.id, job.id, "ready", { messageId: 100 + slot });
    }
    const pipeline = { library, status: async () => ({ enabled: true, jobs: await library.list(owner.id) }) } as unknown as CirclePipelineService;
    const delivered = new Map<string, string>();
    const socialBrowser: SocialBrowser = {
      verify: async platform => ({ handle: `profile_${platform}`, userId: "123" }),
      publish: async (platform, _cookies, _profile, file, caption, onSubmit) => {
        const content = readFileSync(file, "utf8");
        assert.ok(caption.includes(`описание номера ${content.slice(-1)}`));
        delivered.set(platform, content); onSubmit();
        return platform === "instagram" ? "https://www.instagram.com/reel/example/" : "https://www.tiktok.com/@profile_tiktok/video/1234567890123456789";
      },
    };
    const social = createSocialService(db, join(root, "private"), root, socialBrowser);
    for (const [account, platform] of [[instagram, "instagram"], [tiktok, "tiktok"]] as const) {
      social.importForAccount(owner.id, account.id, [{ name: "sessionid", value: "synthetic", domain: `.${platform}.com` },
        ...(platform === "instagram" ? [{ name: "ds_user_id", value: "123", domain: ".instagram.com" }] : [])]);
      assert.equal((await social.verifyForAccount(owner.id, account.id)).status, "connected");
    }
    db.setSetting("circle.social-publishing.targets", JSON.stringify([
      { ownerId: owner.id, accountId: instagram.id, platform: "instagram", slot: 1 },
      { ownerId: owner.id, accountId: tiktok.id, platform: "tiktok", slot: 2 },
    ]));
    const socialPublisher = new CircleSocialPublisher(db, pipeline, social, root);
    const youtubePublisher = new CircleYouTubePublisher(db, pipeline, {
      verify: async () => ({ channelId: `UC${"a".repeat(22)}` }),
      publish: async (_cookies, _id, file, title, description, onSubmit) => {
        const content = readFileSync(file, "utf8");
        assert.ok(title.includes(`История номер ${content.slice(-1)}`)); assert.ok(description.includes(`описание номера ${content.slice(-1)}`));
        delivered.set("youtube", content); onSubmit(); return "https://www.youtube.com/watch?v=abcdefghijk";
      },
    }, join(root, "youtube-private"));
    youtubePublisher.importCookies(owner.id, youtube.id, [{ name: "LOGIN_INFO", value: "synthetic", domain: ".youtube.com", secure: true }]);
    assert.equal((await youtubePublisher.verify(owner.id, youtube.id)).status, "connected");
    youtubePublisher.configure(owner.id, youtube.id);
    await socialPublisher.tick(); await youtubePublisher.tick();
    assert.equal(delivered.size, 0);
    context.mock.timers.setTime(posting);
    await socialPublisher.tick(); await youtubePublisher.tick();
    await social.tick(); await social.tick();
    assert.deepEqual(Object.fromEntries(delivered), { youtube: "circle-0", instagram: "circle-0", tiktok: "circle-0" });
    assert.equal(db.db.prepare("SELECT count(*) AS n FROM social_jobs WHERE state='published'").get()!.n, 2);
    assert.equal(db.db.prepare("SELECT count(*) AS n FROM circle_youtube_publications_v2 WHERE state='published'").get()!.n, 1);
    await socialPublisher.tick(); await youtubePublisher.tick(); await social.tick();
    assert.equal(db.db.prepare("SELECT count(*) AS n FROM social_jobs").get()!.n, 2);
    assert.equal(db.db.prepare("SELECT count(*) AS n FROM circle_youtube_publications_v2").get()!.n, 1);
    context.mock.timers.setTime(Date.parse("2026-11-02T15:00:00Z"));
    await socialPublisher.tick(); await youtubePublisher.tick(); await social.tick(); await social.tick();
    assert.deepEqual(Object.fromEntries(delivered), { youtube: "circle-1", instagram: "circle-1", tiktok: "circle-1" });
    assert.equal(db.db.prepare("SELECT count(*) AS n FROM social_jobs WHERE state='published'").get()!.n, 4);
    assert.equal(db.db.prepare("SELECT count(*) AS n FROM circle_youtube_publications_v2 WHERE state='published'").get()!.n, 2);
    await socialPublisher.close(); await youtubePublisher.close();
  } finally { context.mock.timers.reset(); db.db.close(); rmSync(root, { recursive: true, force: true }); }
});
