import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, "data/audio-candidates/2026-07-06-cc0-review");
const TARGET_TOTAL = 100;
const PER_BUCKET = TARGET_TOTAL / 2;

const BUCKETS = {
  anekdoty: [
    "jazz loop",
    "swing instrumental",
    "blues loop",
    "lofi jazz",
    "brass loop",
    "bass groove",
    "dixieland",
    "bossa nova",
    "guitar jazz",
    "upbeat jazz",
    "comedy instrumental",
    "funny instrumental",
    "ukulele loop",
    "ragtime",
    "piano jazz",
    "happy music",
    "cartoon instrumental",
    "music loop",
  ],
  memes: [
    "upbeat loop",
    "funk loop",
    "groove loop",
    "chiptune loop",
    "lofi beat",
    "synth loop",
    "techno loop",
    "playful loop",
    "bass loop",
    "dance beat",
    "electronic loop",
    "quirky instrumental",
    "happy beat",
    "drum loop",
    "cartoon music",
    "background music",
  ],
};

const BAD_TITLE = /\b(vocal|voice|speech|spoken|sermon|podcast|interview|radio|news|lecture|quran|bible|prayer|horror|scary|scream|siren|alarm|explosion|gun|shot|nsfw|explicit|rap|song|sing|choir|acapella|a cappella)\b/i;
const GOOD_HINT = /\b(loop|instrumental|jazz|swing|funk|beat|groove|piano|ukulele|ragtime|comedy|funny|quirky|happy|electronic|drum|music)\b/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slug(input) {
  return String(input || "track")
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 64) || "track";
}

async function fetchJson(url) {
  const { stdout } = await exec("curl", ["-L", "--fail", "--silent", "--show-error", "--max-time", "30", String(url)]);
  return JSON.parse(stdout);
}

async function durationSec(file) {
  const { stdout } = await exec("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  return Number(stdout.trim()) || 0;
}

async function cutMp3(input, output, index, sourceDuration) {
  const length = 8 + (index % 5);
  const maxStart = Math.max(0, sourceDuration - length - 0.5);
  const start = maxStart > 0 ? ((index * 13.37) % maxStart) : 0;
  await exec("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    start.toFixed(2),
    "-i",
    input,
    "-t",
    String(length),
    "-vn",
    "-ac",
    "2",
    "-ar",
    "44100",
    "-af",
    "afade=t=in:st=0:d=0.12,afade=t=out:st=" + Math.max(0, length - 0.35).toFixed(2) + ":d=0.35,loudnorm=I=-23:TP=-2:LRA=11",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "160k",
    output,
  ], { timeout: 60_000 });
  return { start: Number(start.toFixed(2)), duration: length };
}

async function collectOpenverse(bucket, queries, limit) {
  const seen = new Set();
  const found = [];
  for (const q of queries) {
    for (let page = 1; page <= 10 && found.length < limit * 5; page += 1) {
      const url = new URL("https://api.openverse.org/v1/audio/");
      url.searchParams.set("q", q);
      url.searchParams.set("license", "cc0");
      url.searchParams.set("extension", "mp3");
      url.searchParams.set("page_size", "20");
      url.searchParams.set("page", String(page));
      const json = await fetchJson(url);
      await sleep(3200);
      for (const item of json.results || []) {
        const id = String(item.id || item.foreign_landing_url || item.url || "");
        const title = String(item.title || "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        if (item.license !== "cc0") continue;
        if (!String(item.url || "").startsWith("https://")) continue;
        if (BAD_TITLE.test(title)) continue;
        if (!GOOD_HINT.test(`${title} ${q} ${(item.tags || []).map((tag) => tag.name || tag).join(" ")}`)) continue;
        const durationMs = Number(item.duration || 0);
        if (durationMs && (durationMs < 7000 || durationMs > 10 * 60 * 1000)) continue;
        const filesize = Number(item.filesize || 0);
        if (filesize && filesize > 20_000_000) continue;
        found.push({
          bucket,
          provider: item.provider || item.source || "openverse",
          sourceSite: item.source || item.provider || "openverse",
          title,
          creator: item.creator || "",
          license: "CC0 1.0",
          licenseUrl: item.license_url || "https://creativecommons.org/publicdomain/zero/1.0/",
          sourceUrl: item.foreign_landing_url || item.detail_url || "",
          downloadUrl: item.url,
          query: q,
          sourceDurationMs: durationMs || null,
        });
        if (found.length >= limit * 2) break;
      }
    }
  }
  return found;
}

function openverseCandidate(item, bucket, q, seen) {
  const id = String(item.id || item.foreign_landing_url || item.url || "");
  const title = String(item.title || "");
  if (!id || seen.has(id)) return null;
  seen.add(id);
  if (item.license !== "cc0") return null;
  if (!String(item.url || "").startsWith("https://")) return null;
  if (BAD_TITLE.test(title)) return null;
  if (!GOOD_HINT.test(`${title} ${q} ${(item.tags || []).map((tag) => tag.name || tag).join(" ")}`)) return null;
  const durationMs = Number(item.duration || 0);
  if (durationMs && (durationMs < 7000 || durationMs > 10 * 60 * 1000)) return null;
  const filesize = Number(item.filesize || 0);
  if (filesize && filesize > 20_000_000) return null;
  return {
    bucket,
    provider: item.provider || item.source || "openverse",
    sourceSite: item.source || item.provider || "openverse",
    title,
    creator: item.creator || "",
    license: "CC0 1.0",
    licenseUrl: item.license_url || "https://creativecommons.org/publicdomain/zero/1.0/",
    sourceUrl: item.foreign_landing_url || item.detail_url || "",
    downloadUrl: item.url,
    query: q,
    sourceDurationMs: durationMs || null,
  };
}

async function prepareBucket(bucket, queries, limit, ledger) {
  const dir = resolve(OUT_DIR, bucket);
  await mkdir(dir, { recursive: true });
  let added = 0;
  const seen = new Set();
  const byCreator = new Map();
  for (const q of queries) {
    for (let page = 1; page <= 12 && added < limit; page += 1) {
      const url = new URL("https://api.openverse.org/v1/audio/");
      url.searchParams.set("q", q);
      url.searchParams.set("license", "cc0");
      url.searchParams.set("extension", "mp3");
      url.searchParams.set("page_size", "20");
      url.searchParams.set("page", String(page));
      const json = await fetchJson(url);
      await sleep(3200);
      for (const raw of json.results || []) {
        if (added >= limit) break;
        const item = openverseCandidate(raw, bucket, q, seen);
        if (!item) continue;
        const creatorKey = String(item.creator || item.sourceSite || "unknown").toLowerCase();
        if ((byCreator.get(creatorKey) || 0) >= 8) continue;
        const n = String(added + 1).padStart(3, "0");
        const outName = `${bucket}-cc0-candidate-${n}.mp3`;
        const out = resolve(dir, outName);
        try {
          const srcDur = item.sourceDurationMs ? item.sourceDurationMs / 1000 : 30;
          const cut = await cutMp3(item.downloadUrl, out, added + (bucket === "memes" ? 50 : 0), srcDur);
          const outDur = await durationSec(out);
          if (outDur < 7 || outDur > 13) continue;
          ledger.push({
            file: `${bucket}/${outName}`,
            bucket,
            status: "candidate-review-only",
            activePool: false,
            ...item,
            sourceDurationSec: Number(srcDur.toFixed(3)),
            cutFromSec: cut.start,
            durationSec: Number(outDur.toFixed(3)),
            note: "CC0 candidate for user listening approval; not used by generator until moved into assets/audio.",
          });
          byCreator.set(creatorKey, (byCreator.get(creatorKey) || 0) + 1);
          added += 1;
          console.log(`${bucket}: ${added}/${limit} ${item.title}`);
        } catch (error) {
          console.warn(`skip ${bucket} ${item.title}: ${error.message}`);
        }
      }
    }
  }
  if (added < limit) throw new Error(`Only prepared ${added}/${limit} for ${bucket}`);
}

function htmlEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  const ledger = [];

  for (const [bucket, queries] of Object.entries(BUCKETS)) {
    await prepareBucket(bucket, queries, PER_BUCKET, ledger);
  }

  await writeFile(resolve(OUT_DIR, "ledger.json"), JSON.stringify(ledger, null, 2) + "\n");
  const rows = ledger
    .map((item, index) => {
      const rel = item.file;
      return `<tr>
  <td>${index + 1}</td>
  <td>${htmlEscape(item.bucket)}</td>
  <td><audio controls preload="none" src="${htmlEscape(rel)}"></audio></td>
  <td>${htmlEscape(basename(rel))}</td>
  <td>${htmlEscape(item.title)}</td>
  <td>${htmlEscape(item.creator)}</td>
  <td><a href="${htmlEscape(item.sourceUrl)}">${htmlEscape(item.sourceSite)}</a></td>
  <td>${htmlEscape(item.license)}</td>
</tr>`;
    })
    .join("\n");
  await writeFile(
    resolve(OUT_DIR, "review.html"),
    `<!doctype html>
<html lang="ru">
<meta charset="utf-8">
<title>CC0 audio candidates review</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:24px;background:#f7f5ef;color:#151515}
table{border-collapse:collapse;width:100%;background:white}
td,th{border:1px solid #ddd;padding:8px;vertical-align:top}
th{position:sticky;top:0;background:#eee}
audio{width:220px}
.note{margin:0 0 16px;color:#444}
</style>
<h1>CC0 audio candidates review</h1>
<p class="note">These files are candidates only. They are outside assets/audio and are not used by generation until approved and moved.</p>
<table>
<thead><tr><th>#</th><th>bucket</th><th>listen</th><th>file</th><th>title</th><th>creator</th><th>source</th><th>license</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</html>
`,
  );

  const activeAnekdoty = Number((await exec("bash", ["-lc", "find assets/audio/anekdoty -maxdepth 1 -type f \\( -name '*.mp3' -o -name '*.m4a' -o -name '*.aac' -o -name '*.wav' -o -name '*.ogg' -o -name '*.opus' \\) | wc -l"])).stdout.trim());
  const activeMemes = Number((await exec("bash", ["-lc", "find assets/audio/memes -maxdepth 1 -type f \\( -name '*.mp3' -o -name '*.m4a' -o -name '*.aac' -o -name '*.wav' -o -name '*.ogg' -o -name '*.opus' \\) | wc -l"])).stdout.trim());
  await writeFile(
    resolve(OUT_DIR, "SUMMARY.md"),
    `# CC0 audio candidates

- Active anekdoty now: ${activeAnekdoty}
- Active memes now: ${activeMemes}
- Active combined now: ${activeAnekdoty + activeMemes}
- New candidates: ${ledger.length}
- If all approved, active combined after moving: ${activeAnekdoty + activeMemes + ledger.length}

Candidates are not in the active generator pool yet.
`,
  );

  console.log(JSON.stringify({ outDir: OUT_DIR, candidates: ledger.length, activeAnekdoty, activeMemes }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
