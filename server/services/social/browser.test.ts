import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSocialBrowser } from "./browser.ts";
import { normalizeSocialCookies } from "./cookies.ts";

test("browser adapters verify authenticated identity, upload caption and require publish confirmation", async () => {
  const dir = mkdtempSync(join(tmpdir(), "shorts-social-browser-"));
  const file = join(dir, "video.mp4");
  writeFileSync(file, "synthetic-video");
  let invalid = false;
  let posts = 0;
  const launch: typeof chromium.launch = async (options) => {
    const browser = await chromium.launch(options);
    const original = browser.newContext.bind(browser);
    browser.newContext = async (opts) => {
      const ctx = await original(opts);
      await ctx.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith("/api/v1/accounts/current_user/"))
          return route.fulfill({
            status: invalid ? 401 : 200,
            json: { user: { pk: "123", username: "sample" } },
          });
        if (url.pathname.includes("/configure_to_clips/")) {
          posts++;
          return route.fulfill({
            json: { status: "ok", media: { code: "sample-code" } },
          });
        }
        if (url.pathname.includes("/item/commit/")) {
          posts++;
          return route.fulfill({ json: { item_id: "123456789" } });
        }
        if (url.hostname === "www.instagram.com")
          return route.fulfill({
            contentType: "text/html",
            body: `<!doctype html><html><body><a href="#" aria-label="New post">Create</a><input type="file"><button id="next" onclick="if(window.nexted){document.getElementById('editor').hidden=false;this.remove()}else{window.nexted=true}">Next</button><div id="editor" hidden><div contenteditable="true" role="textbox"></div><button onclick="fetch('/api/v1/media/configure_to_clips/',{method:'POST'})">Share</button></div></body></html>`,
          });
        if (url.pathname === "/tiktokstudio/upload")
          return route.fulfill({
            contentType: "text/html",
            body: `<!doctype html><html><body><input type="file"><div contenteditable="true"></div><button onclick="fetch('/api/post/item/commit/',{method:'POST'})">Post</button></body></html>`,
          });
        if (url.hostname === "www.tiktok.com")
          return route.fulfill({
            contentType: "text/html",
            body: `<!doctype html><html><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{"__DEFAULT_SCOPE__":{"webapp.app-context":{"isLogin":true,"user":{"uid":"123","uniqueId":"sample"}}}}</script></body></html>`,
          });
        await route.abort();
      });
      return ctx;
    };
    return browser;
  };
  try {
    const adapter = createSocialBrowser("/usr/bin/google-chrome", launch);
    const instagram = normalizeSocialCookies(
      [
        { name: "sessionid", value: "synthetic" },
        { name: "ds_user_id", value: "123" },
      ],
      "instagram",
    );
    const tiktok = normalizeSocialCookies(
      [{ name: "sessionid", value: "synthetic" }],
      "tiktok",
    );
    assert.equal(
      (await adapter.verify("instagram", instagram)).handle,
      "sample",
    );
    let clicked = 0;
    const ig = await adapter.publish(
      "instagram",
      instagram,
      { handle: "sample", userId: "123" },
      file,
      "Test caption",
      () => clicked++,
    );
    assert.equal(ig, "https://www.instagram.com/reel/sample-code/");
    const tt = await adapter.publish(
      "tiktok",
      tiktok,
      { handle: "sample", userId: "123" },
      file,
      "Test caption",
      () => clicked++,
    );
    assert.equal(tt, "https://www.tiktok.com/@sample/video/123456789");
    assert.equal(posts, 2);
    assert.equal(clicked, 2);
    invalid = true;
    await assert.rejects(() => adapter.verify("instagram", instagram));
    invalid = false;
    await assert.rejects(() =>
      adapter.publish(
        "instagram",
        instagram,
        { handle: "other", userId: "456" },
        file,
        "caption",
        () => clicked++,
      ),
    );
    assert.equal(posts, 2);
    assert.equal(clicked, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
