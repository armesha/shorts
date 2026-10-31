import { test } from "node:test";
import assert from "node:assert/strict";
import { isRetiredPage } from "./retired-pages.ts";

test("retired SZZ URLs cannot fall through to the application", () => {
  for (const path of ["/szz", "/szz/", "/szz/SZZ_DB.pdf", "/szz/tickets/example.pdf",
    "/szzbackup", "/szzbackup2/", "/szzbackup3", "/szzbackup4", "/szzcards", "/szzreport", "/tempszz.txt"]) {
    assert.equal(isRetiredPage(path), true, path);
  }
  assert.equal(isRetiredPage("/circles"), false);
});
