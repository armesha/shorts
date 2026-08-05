#!/usr/bin/env node

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { google } from "googleapis";

import { openDb } from "../server/db.ts";
import {
  MANUAL_VIDEO_DECK,
  getManualVideoAccountDefaults,
  setManualVideoAccountDefaults,
} from "../server/services/manual-videos.ts";
import { parseCreds, ytErrorReason } from "../server/services/youtube.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.slice(2).includes("--apply");
const DB_PATH = resolve(ROOT, process.env.DATABASE_PATH || "data/app.db");
const ACCOUNT_ID = 102;
const EXPECTED_OWNER = "mgs";
const EXPECTED_CHANNEL_ID = "UCMHG80_qNjxlWkXifdKPoRg";
const EXPECTED_CHANNEL_NAME = "toki der Ruhe";
const DESIRED_DEFAULTS = {
  title: "🧠 DIE GEHEIMNISSE DER PSYCHOLOGIE: WAS DU UNBEDINGT WISSEN MUSST! ✨",
  description: `Unser Unterbewusstsein und unsere Psyche steuern jeden Tag unsere Entscheidungen, unsere Beziehungen und unseren Erfolg. Oft handeln wir jedoch auf Autopilot, ohne die tiefen psychologischen Mechanismen dahinter zu verstehen. Wer lernt, das menschliche Verhalten zu lesen und mentale Zusammenhänge richtig zu deuten, bringt sein Mindset, seine emotionale Intelligenz und sein inneres Gleichgewicht in perfekte Balance. Erfahre in diesem Video die wichtigsten psychologischen Fakten und Regeln für deinen Alltag! 😲📜

Das bewusste Achten auf diese mentalen Muster schützt deine emotionale Gesundheit nachhaltig und hilft dir, stärkere Grenzen zu setzen. Achte auf dein Mindset heute — morgen wirst du dir selbst danken! 🌿✨

👇 Was denkst du über dieses Thema? Welcher Punkt aus dem Video hat dich am meisten zum Nachdenken gebracht? Schreib es uns unbedingt in die Kommentare!

(Hinweis: Diese Übersicht dient der allgemeinen psychologischen Aufklärung, mentalen Motivation und Persönlichkeitsentwicklung. Sie ersetzt keine professionelle Therapie oder psychologische Beratung.)

📌 Speichere dieses Video für später ab, um diesen praktischen mentalen Kompass immer griffbereit zu haben, und teile es mit deinen Liebsten, um wertvolle Aufklärung zu verbreiten!`,
  tags: [
    "PsychologieAlltag",
    "WahreLebensweisheiten",
    "MenschenLesen",
    "Persönlichkeitsentwicklung",
    "PsychologieFakten",
    "VerhaltenVerstehen",
    "MindsetDeutsch",
    "EmotionaleIntelligenz",
    "MentalHealth",
    "Unterbewusstsein",
    "Charakterzüge",
    "Nachdenken",
    "Erfolg",
    "Beziehungen",
    "ManipulationErkennen",
    "MotivationDeutsch",
    "Selbstliebe",
    "PsychologieTipps",
    "Psychologie",
    "Lebensweisheiten",
    "Selbstbewusstsein",
    "Achtsamkeit",
    "Kommunikation",
    "Gedanken",
    "Persönlichkeit",
    "Psychologie Deutschland",
    "Dunkle Psychologie",
    "Gaslighting erkennen",
    "NLP",
    "Lebensratgeber",
    "Selbstoptimierung",
  ],
  // Preserve the manual-upload fallback category; this task changes only title, description, and tags.
  categoryId: "23",
};

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizedTags(tags) {
  return [...new Set((Array.isArray(tags) ? tags : String(tags || "").split(","))
    .map((tag) => String(tag).trim().toLocaleLowerCase("de-DE"))
    .filter(Boolean))].sort();
}

function sameTags(left, right) {
  const a = normalizedTags(left);
  const b = normalizedTags(right);
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

function sameDefaults(left, right) {
  return Boolean(
    left &&
      left.title === right.title &&
      left.description === right.description &&
      sameTags(left.tags, right.tags) &&
      left.categoryId === right.categoryId,
  );
}

function snippetMatches(snippet, defaults) {
  return (
    String(snippet?.title || "") === defaults.title &&
    String(snippet?.description || "") === defaults.description &&
    sameTags(snippet?.tags, defaults.tags)
  );
}

function youtubeTagsLength(tags) {
  return tags.reduce((total, tag, index) => total + tag.length + (tag.includes(" ") ? 2 : 0) + (index ? 1 : 0), 0);
}

if ([...DESIRED_DEFAULTS.title].length > 100) throw new Error("title exceeds YouTube's 100-character limit");
if ([...DESIRED_DEFAULTS.description].length > 4500) throw new Error("description exceeds the saved-default limit");
if (youtubeTagsLength(DESIRED_DEFAULTS.tags) > 500) throw new Error("tags exceed YouTube's 500-character limit");

const db = openDb(DB_PATH);
try {
  const target = db.db
    .prepare(
      `SELECT a.id, a.channel_name, a.yt_channel_id, u.username AS owner_username
         FROM accounts a
         JOIN users u ON u.id = a.user_id
        WHERE a.id = ?`,
    )
    .get(ACCOUNT_ID);
  if (!target) throw new Error(`account ${ACCOUNT_ID} not found`);
  if (String(target.owner_username).toLowerCase() !== EXPECTED_OWNER) {
    throw new Error(`account ${ACCOUNT_ID} is no longer owned by ${EXPECTED_OWNER}`);
  }
  if (String(target.channel_name) !== EXPECTED_CHANNEL_NAME || String(target.yt_channel_id || "") !== EXPECTED_CHANNEL_ID) {
    throw new Error(`account ${ACCOUNT_ID} is no longer the expected MGS psychology channel`);
  }

  const account = db.getAccount(ACCOUNT_ID);
  const savedDefaults = getManualVideoAccountDefaults(db, ACCOUNT_ID);
  if (!account) throw new Error("MGS psychology account is unavailable");
  const refreshToken = db.getRefreshToken(ACCOUNT_ID);
  const clientJson = db.oauthClientSecretForAccount(account);
  if (!refreshToken || !clientJson) throw new Error("MGS psychology YouTube credentials are unavailable");

  const queueRows = db.db
    .prepare("SELECT id, title, text, tags FROM videos WHERE account_id = ? AND deck = ? ORDER BY id")
    .all(ACCOUNT_ID, MANUAL_VIDEO_DECK);
  const historyRows = db.db
    .prepare(
      `SELECT id, youtube_id, title, description, tags
         FROM history
        WHERE account_id = ?
          AND deck = ?
          AND status = 'published'
          AND youtube_id IS NOT NULL
          AND TRIM(youtube_id) != ''
        ORDER BY id`,
    )
    .all(ACCOUNT_ID, MANUAL_VIDEO_DECK);

  const queueNeedsUpdate = queueRows.filter(
    (row) => row.title !== DESIRED_DEFAULTS.title || row.text !== DESIRED_DEFAULTS.description || !sameTags(row.tags, DESIRED_DEFAULTS.tags),
  );
  const historyNeedsUpdate = historyRows.filter(
    (row) => row.title !== DESIRED_DEFAULTS.title || row.description !== DESIRED_DEFAULTS.description || !sameTags(row.tags, DESIRED_DEFAULTS.tags),
  );

  const creds = parseCreds(clientJson);
  const oauth = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    process.env.GOOGLE_OAUTH_REDIRECT || "http://localhost:8080/api/youtube/callback",
  );
  oauth.setCredentials({ refresh_token: refreshToken });
  const youtube = google.youtube({ version: "v3", auth: oauth });
  const youtubeIds = historyRows.map((row) => String(row.youtube_id));
  const liveItems = [];
  for (let offset = 0; offset < youtubeIds.length; offset += 50) {
    const response = await youtube.videos.list({ part: ["snippet"], id: youtubeIds.slice(offset, offset + 50) });
    liveItems.push(...(response.data.items || []));
  }
  const liveById = new Map(liveItems.map((item) => [String(item.id), item]));
  const missingOnYouTube = youtubeIds.filter((id) => !liveById.has(id));
  const liveNeedsUpdate = liveItems.filter((item) => !snippetMatches(item.snippet, DESIRED_DEFAULTS));

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        owner: EXPECTED_OWNER,
        accountId: ACCOUNT_ID,
        channel: EXPECTED_CHANNEL_NAME,
        savedDefaultsMatch: sameDefaults(savedDefaults, DESIRED_DEFAULTS),
        queue: { total: queueRows.length, needsUpdate: queueNeedsUpdate.length },
        history: { total: historyRows.length, needsUpdate: historyNeedsUpdate.length },
        youtube: { found: liveItems.length, needsUpdate: liveNeedsUpdate.length, missing: missingOnYouTube.length },
        metadata: {
          title: DESIRED_DEFAULTS.title,
          descriptionLength: [...DESIRED_DEFAULTS.description].length,
          tags: DESIRED_DEFAULTS.tags.length,
          youtubeTagsLength: youtubeTagsLength(DESIRED_DEFAULTS.tags),
          categoryId: DESIRED_DEFAULTS.categoryId,
        },
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    console.log("Dry-run only. Re-run with --apply to enforce the MGS psychology metadata.");
  } else {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
    const backupPath = resolve(ROOT, `data/app.db.bak-${stamp}-before-mgs-102-manual-metadata`);
    if (existsSync(backupPath)) throw new Error(`database backup already exists: ${backupPath}`);
    db.db.exec(`VACUUM INTO ${sqlString(backupPath)}`);

    db.db.exec("BEGIN IMMEDIATE");
    try {
      setManualVideoAccountDefaults(db, ACCOUNT_ID, DESIRED_DEFAULTS);
      db.db
        .prepare("UPDATE videos SET title = ?, text = ?, tags = ? WHERE account_id = ? AND deck = ?")
        .run(DESIRED_DEFAULTS.title, DESIRED_DEFAULTS.description, DESIRED_DEFAULTS.tags.join(","), ACCOUNT_ID, MANUAL_VIDEO_DECK);
      db.db
        .prepare("UPDATE history SET title = ?, description = ?, tags = ? WHERE account_id = ? AND deck = ?")
        .run(DESIRED_DEFAULTS.title, DESIRED_DEFAULTS.description, DESIRED_DEFAULTS.tags.join(","), ACCOUNT_ID, MANUAL_VIDEO_DECK);
      db.db.exec("COMMIT");
    } catch (error) {
      db.db.exec("ROLLBACK");
      throw error;
    }

    const updated = [];
    const failed = [];
    for (const item of liveNeedsUpdate) {
      const youtubeId = String(item.id);
      try {
        await youtube.videos.update({
          part: ["snippet"],
          requestBody: {
            id: youtubeId,
            snippet: {
              title: DESIRED_DEFAULTS.title,
              description: DESIRED_DEFAULTS.description,
              tags: DESIRED_DEFAULTS.tags,
              categoryId: item.snippet?.categoryId || DESIRED_DEFAULTS.categoryId,
              defaultLanguage: item.snippet?.defaultLanguage || undefined,
              defaultAudioLanguage: item.snippet?.defaultAudioLanguage || undefined,
            },
          },
        });
        updated.push(youtubeId);
      } catch (error) {
        failed.push({ youtubeId, reason: ytErrorReason(error) });
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: failed.length === 0 && missingOnYouTube.length === 0,
          backupPath,
          defaultsSaved: true,
          queueEnforced: queueRows.length,
          historyEnforced: historyRows.length,
          youtubeUpdated: updated.length,
          youtubeMissing: missingOnYouTube,
          failed,
        },
        null,
        2,
      ),
    );
    if (failed.length || missingOnYouTube.length) process.exitCode = 1;
  }
} finally {
  db.db.close();
}
