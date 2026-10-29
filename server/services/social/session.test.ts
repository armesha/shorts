import { test } from "node:test";
import assert from "node:assert/strict";
import { createSocialBrowser, postedTikTokItemId } from "./browser.ts";

test("post receipts preserve large item IDs and reject ambiguous responses", () => {
  assert.equal(postedTikTokItemId('{"data":{"item_id":7000000000000000001}}'), "7000000000000000001");
  assert.equal(postedTikTokItemId('{"data":{"project":{"item_id":"7000000000000000001"}}}'), "7000000000000000001");
  assert.equal(postedTikTokItemId('{"item":{"id":"7000000000000000001"}}'), "7000000000000000001");
  assert.equal(postedTikTokItemId('{"items":[{"item_id":"7000000000000000001"},{"item_id":"7000000000000000002"}]}'), null);
  assert.equal(postedTikTokItemId('{"data":{"item_id":0}}'), null);
  assert.equal(postedTikTokItemId('{"data":{"project_id":"1"}}'), null);
});

test("TikTok verifies account info without the retired app-state login flag and preserves the full ID", async () => {
  const original = globalThis.fetch;
  let closed = false;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ message: "success", data: { username: "test", user_id_str: "7000000000000000001", user_id: 7000000000000000000 } }) }) as Response;
  const page = { setDefaultTimeout() {}, goto: async () => {}, waitForLoadState: async () => {}, url: () => "https://www.tiktok.com/", evaluate: async (fn: () => unknown) => fn() };
  const launch = async () => ({ newContext: async () => ({ addCookies: async () => {}, newPage: async () => page }), close: async () => { closed = true; } });
  try {
    const profile = await createSocialBrowser("test-browser", launch as any).verify("tiktok", []);
    assert.deepEqual(profile, { handle: "test", userId: "7000000000000000001" });
    assert.equal(closed, true);
  } finally { globalThis.fetch = original; }
});

test("optional Studio prompts are dismissed before editing and the submission callback precedes Post", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ message: "success", data: { username: "test", user_id_str: "7000000000000000001" } }) }) as Response;
  const events: string[] = [];
  let checks = true, tour = true;
  const button = (name: string): any => ({
    first() { return this; },
    last() { return this; }, waitFor: async () => {}, click: async () => {
      events.push(name);
      if (name === "Cancel") checks = false;
      if (name === "Got it") tour = false;
    },
  });
  const page = {
    setDefaultTimeout() {}, goto: async () => {}, waitForLoadState: async () => {}, url: () => "https://www.tiktok.com/", evaluate: async (fn: () => unknown) => fn(),
    waitForTimeout: async () => {}, waitForFunction: async () => {},
    getByText: (text: string) => ({ isVisible: async () => text.startsWith("Turn on") ? checks : tour }),
    getByRole: (_role: string, options: { name: string | RegExp }) => button(typeof options.name === "string" ? options.name : "Post"),
    locator: (selector: string) => ({ first: () => selector.includes("file") ? { setInputFiles: async () => { events.push("upload"); } } : { waitFor: async () => {}, fill: async () => { assert.equal(checks, false); assert.equal(tour, false); events.push("caption"); } } }),
    waitForResponse: async (predicate: (response: any) => Promise<boolean>) => {
      const response = { url: () => "https://www.tiktok.com/tiktok/web/project/post/", text: async () => '{"data":{"item_id":7000000000000000002}}', ok: () => true };
      assert.equal(await predicate(response), true); return response;
    },
  };
  const launch = async () => ({ newContext: async () => ({ addCookies: async () => {}, newPage: async () => page }), close: async () => {} });
  try {
    const url = await createSocialBrowser("test-browser", launch as any).publish("tiktok", [], { handle: "test", userId: "7000000000000000001" }, "/tmp/synthetic.mp4", "Test caption", () => { events.push("submitted"); });
    assert.equal(url, "https://www.tiktok.com/@test/video/7000000000000000002");
    assert.deepEqual(events, ["upload", "Cancel", "Got it", "caption", "submitted", "Post"]);
  } finally { globalThis.fetch = original; }
});
