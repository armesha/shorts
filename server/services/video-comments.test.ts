import assert from "node:assert/strict";
import test from "node:test";
import { automaticVideoCommentForDeck, SHORTROBOT_VIDEO_COMMENT } from "./video-comments.ts";

test("automatic upload comment is limited to shortrobot1", () => {
  assert.equal(automaticVideoCommentForDeck("shortrobot1"), SHORTROBOT_VIDEO_COMMENT);
  assert.equal(automaticVideoCommentForDeck("voiced-memes-ru"), null);
  assert.equal(automaticVideoCommentForDeck("manual"), null);
});
