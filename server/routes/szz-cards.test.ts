import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import Fastify from "fastify";
import { openDb } from "../db.ts";
import { getCookie, makeAuthSession, SESSION_COOKIE } from "../infra/auth-session.ts";
import { registerSzzRoutes } from "./szz.ts";

const NOW = 2_000_000_000_000;
const CATALOG_VERSION = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const SOURCE_HASH = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
const BASE_CARD_ID = "ticket-1-1::database::0";
const BULK_CARD_IDS = Array.from(
  { length: 1_001 },
  (_, index) => `ticket-1-1::bulk-${index}::0`,
);
const VALID_FLASHCARD_IDS = new Set([BASE_CARD_ID, ...BULK_CARD_IDS]);

function modeState(order: string[] = [], index = 0, mode = "learn") {
  return {
    order,
    index,
    currentCardId: index < order.length ? order[index] : null,
    revealed: false,
    seed: `${CATALOG_VERSION}:${NOW}:${mode}`,
    updatedAt: NOW,
  };
}

function flashcardState() {
  const cardId = BASE_CARD_ID;
  return {
    version: 1,
    catalogVersion: CATALOG_VERSION,
    activeMode: "learn",
    modes: {
      learn: modeState([cardId]),
      connections: modeState([], 0, "connections"),
      review: modeState([], 0, "review"),
      exam: modeState([], 0, "exam"),
    },
    cards: {
      [cardId]: {
        status: "learning",
        dueAt: NOW + 86_400_000,
        lastReviewedAt: NOW,
        reviewCount: 1,
        correctCount: 1,
        incorrectCount: 0,
        streak: 1,
        intervalDays: 1,
        ease: 2.5,
        sourceHash: SOURCE_HASH,
        questionNeedsReview: false,
        updatedAt: NOW,
      },
    },
    history: [
      { cardId, mode: "learn", result: "good", reviewedAt: NOW },
    ],
    updatedAt: NOW,
  };
}

test("szzcards page is private to the canonical armen session", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "szz-cards-page-"));
  const cardsHtmlPath = resolve(dir, "cards.html");
  writeFileSync(cardsHtmlPath, "<!doctype html><title>SZZ cards private</title>");

  const db = openDb(":memory:");
  const armen = db.createUser({ username: "armen", passHash: "x" });
  const other = db.createUser({ username: "other", passHash: "x" });
  db.createSession("armen-session", armen.id, new Date(Date.now() + 86_400_000).toISOString());
  db.createSession("other-session", other.id, new Date(Date.now() + 86_400_000).toISOString());
  const auth = makeAuthSession(db);
  const app = Fastify();
  registerSzzRoutes(app, {
    db,
    cardsHtmlPath,
    validSessionUser: auth.validSessionUser,
    validFlashcardIds: VALID_FLASHCARD_IDS,
  });

  const anonymous = await app.inject({ method: "GET", url: "/szzcards" });
  assert.equal(anonymous.statusCode, 401);
  assert.equal(anonymous.headers["cache-control"], "private, no-store, max-age=0");
  assert.equal(anonymous.headers.vary, "Cookie");

  const forbidden = await app.inject({
    method: "GET",
    url: "/szzcards",
    headers: { cookie: `${SESSION_COOKIE}=other-session` },
  });
  assert.equal(forbidden.statusCode, 403);
  assert.doesNotMatch(forbidden.body, /SZZ cards private/);

  for (const url of ["/szzcards", "/szzcards/"]) {
    const response = await app.inject({
      method: "GET",
      url,
      headers: { cookie: `${SESSION_COOKIE}=armen-session` },
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] ?? "", /^text\/html/);
    assert.equal(response.headers["cache-control"], "private, no-store, max-age=0");
    assert.equal(response.headers.pragma, "no-cache");
    assert.equal(response.headers.vary, "Cookie");
    assert.match(response.body, /SZZ cards private/);
  }

  await app.close();
  db.db.close();
  rmSync(dir, { recursive: true, force: true });
});

test("armen flashcard state synchronizes with revision CAS and leaves old SZZ state independent", async () => {
  const db = openDb(":memory:");
  const armen = db.createUser({ username: "armen", passHash: "x" });
  const other = db.createUser({ username: "other", passHash: "x" });
  const app = Fastify();
  app.addHook("onRequest", async (req) => {
    const header = req.headers["x-test-user-id"];
    if (header) (req as typeof req & { userId?: number }).userId = Number(header);
  });
  registerSzzRoutes(app, { db, validFlashcardIds: VALID_FLASHCARD_IDS });

  const anonymous = await app.inject({ method: "GET", url: "/api/szz/cards/state" });
  assert.equal(anonymous.statusCode, 401);

  for (const method of ["GET", "PUT"] as const) {
    const response = await app.inject({
      method,
      url: "/api/szz/cards/state",
      headers: { "x-test-user-id": String(other.id) },
      ...(method === "PUT" ? { payload: { expectedRevision: 0, state: flashcardState() } } : {}),
    });
    assert.equal(response.statusCode, 403);
  }

  const initial = await app.inject({
    method: "GET",
    url: "/api/szz/cards/state",
    headers: { "x-test-user-id": String(armen.id) },
  });
  assert.equal(initial.statusCode, 200);
  assert.equal(initial.headers["cache-control"], "private, no-store, max-age=0");
  assert.deepEqual(initial.json(), {
    userId: armen.id,
    revision: 0,
    state: null,
    updatedAt: null,
  });

  const state = flashcardState();
  const saved = await app.inject({
    method: "PUT",
    url: "/api/szz/cards/state",
    headers: { "x-test-user-id": String(armen.id) },
    payload: { expectedRevision: 0, state },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().saved, true);
  assert.equal(saved.json().revision, 1);
  assert.deepEqual(saved.json().state, state);

  const readBack = await app.inject({
    method: "GET",
    url: "/api/szz/cards/state",
    headers: { "x-test-user-id": String(armen.id) },
  });
  assert.equal(readBack.statusCode, 200);
  assert.equal(readBack.json().revision, 1);
  assert.deepEqual(readBack.json().state, state);

  const stale = await app.inject({
    method: "PUT",
    url: "/api/szz/cards/state",
    headers: { "x-test-user-id": String(armen.id) },
    payload: {
      expectedRevision: 0,
      state: { ...state, activeMode: "exam", updatedAt: NOW + 1 },
    },
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().saved, false);
  assert.equal(stale.json().revision, 1);
  assert.deepEqual(stale.json().state, state);

  const replacement = { ...state, activeMode: "exam", updatedAt: NOW + 2 };
  const secondSave = await app.inject({
    method: "PUT",
    url: "/api/szz/cards/state",
    headers: { "x-test-user-id": String(armen.id) },
    payload: { expectedRevision: 1, state: replacement },
  });
  assert.equal(secondSave.statusCode, 200);
  assert.equal(secondSave.json().revision, 2);
  assert.deepEqual(secondSave.json().state, replacement);

  const oldState = {
    version: 1,
    tickets: {},
    reviews: {},
    activityDates: {},
    ticketOrder: ["ticket-1-1"],
    updatedAt: NOW,
  };
  const oldSave = await app.inject({
    method: "PUT",
    url: "/api/szz/state",
    headers: { "x-test-user-id": String(other.id) },
    payload: { state: oldState },
  });
  assert.equal(oldSave.statusCode, 200);
  assert.equal(oldSave.json().saved, true);
  const oldRead = await app.inject({
    method: "GET",
    url: "/api/szz/state",
    headers: { "x-test-user-id": String(other.id) },
  });
  assert.equal(oldRead.statusCode, 200);
  assert.deepEqual(oldRead.json().state.ticketOrder, ["ticket-1-1"]);

  await app.close();
  db.db.close();
});

test("flashcard state API resolves the production session cookie before enforcing armen ownership", async () => {
  const db = openDb(":memory:");
  const armen = db.createUser({ username: "armen", passHash: "x" });
  const other = db.createUser({ username: "other", passHash: "x" });
  db.createSession("armen-api-session", armen.id, new Date(Date.now() + 86_400_000).toISOString());
  db.createSession("other-api-session", other.id, new Date(Date.now() + 86_400_000).toISOString());
  const auth = makeAuthSession(db);
  const app = Fastify();
  app.addHook("onRequest", async (req) => {
    const user = auth.validSessionUser(getCookie(req, SESSION_COOKIE));
    if (user) (req as typeof req & { userId?: number }).userId = user.id;
  });
  registerSzzRoutes(app, { db, validFlashcardIds: VALID_FLASHCARD_IDS });

  const forbidden = await app.inject({
    method: "GET",
    url: "/api/szz/cards/state",
    headers: { cookie: `${SESSION_COOKIE}=other-api-session` },
  });
  assert.equal(forbidden.statusCode, 403);

  const saved = await app.inject({
    method: "PUT",
    url: "/api/szz/cards/state",
    headers: { cookie: `${SESSION_COOKIE}=armen-api-session` },
    payload: { expectedRevision: 0, state: flashcardState() },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().revision, 1);

  const readBack = await app.inject({
    method: "GET",
    url: "/api/szz/cards/state",
    headers: { cookie: `${SESSION_COOKIE}=armen-api-session` },
  });
  assert.equal(readBack.statusCode, 200);
  assert.deepEqual(readBack.json().state, flashcardState());

  await app.close();
  db.db.close();
});

test("flashcard state rejects malformed, duplicated, prose-bearing, oversized, and over-limit data", async () => {
  const db = openDb(":memory:");
  const armen = db.createUser({ username: "armen", passHash: "x" });
  const app = Fastify();
  app.addHook("onRequest", async (req) => {
    (req as typeof req & { userId?: number }).userId = armen.id;
  });
  registerSzzRoutes(app, { db, validFlashcardIds: VALID_FLASHCARD_IDS });

  const request = (state: unknown) => app.inject({
    method: "PUT",
    url: "/api/szz/cards/state",
    payload: { expectedRevision: 0, state },
  });

  const duplicateOrder = flashcardState();
  duplicateOrder.modes.learn = modeState([
    "ticket-1-1::database::0",
    "ticket-1-1::database::0",
  ]);
  assert.equal((await request(duplicateOrder)).statusCode, 400);

  const mismatchedCurrent = flashcardState();
  mismatchedCurrent.modes.learn.currentCardId = "ticket-1-1::database::9";
  assert.equal((await request(mismatchedCurrent)).statusCode, 400);

  for (const forbiddenKey of ["question", "answer", "html", "sourceText"] as const) {
    const proseState = flashcardState() as ReturnType<typeof flashcardState> & Record<string, unknown>;
    (proseState.cards["ticket-1-1::database::0"] as Record<string, unknown>)[forbiddenKey] = "copied prose";
    assert.equal((await request(proseState)).statusCode, 400, forbiddenKey);
  }

  const proseCatalog = flashcardState();
  proseCatalog.catalogVersion = "copied-prose-marker";
  assert.equal((await request(proseCatalog)).statusCode, 400, "catalogVersion prose");

  const proseSeed = flashcardState();
  proseSeed.modes.learn.seed = "copied-prose-marker";
  assert.equal((await request(proseSeed)).statusCode, 400, "seed prose");

  const proseHash = flashcardState();
  proseHash.cards["ticket-1-1::database::0"].sourceHash = "copied-prose-marker";
  assert.equal((await request(proseHash)).statusCode, 400, "sourceHash prose");

  const proseCardId = flashcardState();
  proseCardId.modes.learn = modeState(["ticket-1-1::copied-answer-prose-marker::0"]);
  assert.equal((await request(proseCardId)).statusCode, 400, "cardId prose");

  const tooManyCards = flashcardState();
  tooManyCards.cards = Object.fromEntries(
    BULK_CARD_IDS.map((cardId) => [
      cardId,
      { status: "new", updatedAt: NOW },
    ]),
  ) as typeof tooManyCards.cards;
  assert.equal((await request(tooManyCards)).statusCode, 400);

  const unsafeTimestamp = flashcardState();
  unsafeTimestamp.updatedAt = Number.MAX_SAFE_INTEGER;
  assert.equal((await request(unsafeTimestamp)).statusCode, 400);

  const oversized = flashcardState() as ReturnType<typeof flashcardState> & Record<string, unknown>;
  oversized.catalogVersion = "x".repeat(257 * 1024);
  const oversizedResponse = await request(oversized);
  assert.equal(oversizedResponse.statusCode, 400);
  assert.deepEqual(oversizedResponse.json(), { error: "Состояние карточек превышает 256 КиБ" });

  await app.close();
  db.db.close();
});
