import test from "node:test";
import assert from "node:assert/strict";
import { createYouTubeCookieBrowser, normalizeYouTubeCookies, studioChannelId, youtubeVideoId } from "./youtube-cookie-browser.ts";

const channel = `UC${"a".repeat(22)}`;
const cookies = [{ name: "LOGIN_INFO", value: "example", domain: ".youtube.com", secure: true }];

test("accepts only unexpired YouTube or Google cookies and a real Studio channel URL", () => {
  const parsed = normalizeYouTubeCookies([...cookies, { name: "bad", value: "x", domain: ".youtube.com.evil.test" },
    { name: "old", value: "x", domain: ".google.com", expires: 1 }], 100);
  assert.equal(parsed.length, 1);
  assert.equal(studioChannelId(`https://studio.youtube.com/channel/${channel}/videos`), channel);
  assert.equal(studioChannelId(`https://studio.youtube.com.evil.test/channel/${channel}`), null);
  assert.equal(studioChannelId("https://studio.youtube.com/"), null);
  assert.equal(youtubeVideoId("https://youtube.com/shorts/abcdefghijk"), "abcdefghijk");
  assert.equal(youtubeVideoId("https://youtu.be/abcdefghijk"), "abcdefghijk");
  assert.equal(youtubeVideoId("https://youtube.com.evil.test/shorts/abcdefghijk"), null);
  assert.throws(() => normalizeYouTubeCookies([{ name: "LOGIN_INFO", value: "x", domain: ".youtube.com", expires: 1 }], 100));
});

test("refuses upload when Studio opens a different channel", async () => {
  let closed = false, submitted = false;
  const page = { setDefaultTimeout() {}, goto: async () => {}, waitForURL: async () => {}, url: () => `https://studio.youtube.com/channel/${channel}` };
  const browser = { newContext: async () => ({ addCookies: async () => {}, newPage: async () => page }), close: async () => { closed = true; } };
  const service = createYouTubeCookieBrowser("browser", (async () => browser) as any);
  await assert.rejects(service.publish(normalizeYouTubeCookies(cookies), `UC${"b".repeat(22)}`, "video.mp4", "Title", "", () => { submitted = true; }), /другой канал/);
  assert.equal(submitted, false);
  assert.equal(closed, true);
});

test("marks submission before the final click and requires public channel confirmation", async () => {
  const events: string[] = [];
  let url = `https://studio.youtube.com/channel/${channel}`;
  let visible = false;
  const editor = {
    setDefaultTimeout() {}, url: () => url, waitForURL: async () => {},
    goto: async (target: string) => { if (target.includes("upload")) url = `https://studio.youtube.com/channel/${channel}/videos/upload`; },
    waitForFunction: async () => {},
    locator: (selector: string) => ({ first() { return this; }, setInputFiles: async () => {}, fill: async () => {},
      click: async () => { if (selector === "#done-button") events.push("click"); },
      getAttribute: async () => "https://youtu.be/abcdefghijk", waitFor: async () => {} }),
  };
  const visitor = { goto: async () => {}, evaluate: async () => visible };
  let contexts = 0;
  const browser = { newContext: async () => ++contexts % 2 ?
    { addCookies: async () => {}, newPage: async () => editor } : { newPage: async () => visitor, close: async () => {} },
    close: async () => {} };
  const service = createYouTubeCookieBrowser("browser", (async () => browser) as any);
  const submit = () => events.push("submitted");
  await assert.rejects(service.publish(normalizeYouTubeCookies(cookies), channel, "video.mp4", "Title", "", submit), /не подтверждена/);
  assert.deepEqual(events, ["submitted", "click"]);
  events.length = 0;
  url = `https://studio.youtube.com/channel/${channel}`;
  visible = true;
  assert.equal(await service.publish(normalizeYouTubeCookies(cookies), channel, "video.mp4", "Title", "", submit), "https://www.youtube.com/watch?v=abcdefghijk");
  assert.deepEqual(events, ["submitted", "click"]);
});
