import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DECK_ID = "shortrobot1";
const INBOX_DIR = resolve(ROOT, "tmp/channel-103-rofls-inbox");
const ENDCARD_DIR = resolve(ROOT, "tmp/channel-103-rofls-with-endcard");
const TAGGED_DIR = resolve(ROOT, "tmp/channel-103-rofls-with-endcard-and-tag");
const ENDCARD_ASSIGNMENTS_FILE = resolve(ROOT, "tmp/shortrobot1-endcard-assignments.json");
const DATA_DIR = resolve(ROOT, "data", DECK_ID);
const ASSET_DIR = resolve(ROOT, "assets/fact-videos", DECK_ID);

if (!existsSync(INBOX_DIR)) throw new Error(`Inbox not found: ${relative(ROOT, INBOX_DIR)}`);
if (!existsSync(ENDCARD_DIR)) throw new Error(`Endcard output not found: ${relative(ROOT, ENDCARD_DIR)}`);
if (!existsSync(TAGGED_DIR)) throw new Error(`Tagged output not found: ${relative(ROOT, TAGGED_DIR)}`);
if (!existsSync(ENDCARD_ASSIGNMENTS_FILE)) {
  throw new Error(`Endcard assignments not found: ${relative(ROOT, ENDCARD_ASSIGNMENTS_FILE)}`);
}

const endcardAssignments = new Map(
  JSON.parse(readFileSync(ENDCARD_ASSIGNMENTS_FILE, "utf8")).items.map((item) => [item.outputFile, item.endcardFile]),
);

const inputs = readdirSync(INBOX_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    const dir = join(INBOX_DIR, entry.name);
    return readdirSync(dir)
      .filter((file) => file.endsWith(".mp4"))
      .map((file) => ({ sourceGroup: entry.name, mp4: join(dir, file) }));
  })
  .sort((a, b) => a.sourceGroup.localeCompare(b.sourceGroup) || basename(a.mp4).localeCompare(basename(b.mp4)));

if (!inputs.length) throw new Error(`No MP4 files found in ${relative(ROOT, INBOX_DIR)}`);

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(ASSET_DIR, { recursive: true });

const videos = [];
const items = [];
for (const [index, input] of inputs.entries()) {
  const infoPath = input.mp4.replace(/\.mp4$/i, ".info.json");
  if (!existsSync(infoPath)) throw new Error(`Missing metadata: ${relative(ROOT, infoPath)}`);
  const endcardMp4 = join(ENDCARD_DIR, basename(input.mp4));
  if (!existsSync(endcardMp4)) throw new Error(`Missing endcard video: ${relative(ROOT, endcardMp4)}`);
  const processedMp4 = join(TAGGED_DIR, basename(input.mp4));
  if (!existsSync(processedMp4)) throw new Error(`Missing tagged video: ${relative(ROOT, processedMp4)}`);
  const assignedEndcard = endcardAssignments.get(basename(input.mp4));
  if (!assignedEndcard) throw new Error(`Missing endcard assignment: ${basename(input.mp4)}`);
  const info = JSON.parse(readFileSync(infoPath, "utf8"));
  const sequence = String(index + 1).padStart(3, "0");
  const outputName = `${DECK_ID}-${sequence}.mp4`;
  copyFileSync(processedMp4, join(ASSET_DIR, outputName));

  const title = `${DECK_ID} — выпуск ${sequence}`;
  videos.push({
    file: `${DECK_ID}/${outputName}`,
    title,
    text: title,
  });
  items.push({
    file: `${DECK_ID}/${outputName}`,
    sourceGroup: input.sourceGroup,
    sourceFile: relative(ROOT, input.mp4),
    processedFile: relative(ROOT, endcardMp4),
    taggedFile: relative(ROOT, processedMp4),
    endcardVariant: basename(String(assignedEndcard)),
    sourceId: String(info.id ?? basename(input.mp4, ".mp4")),
    sourceUrl: String(info.webpage_url ?? info.original_url ?? ""),
    channel: String(info.channel ?? info.uploader ?? ""),
    channelUrl: String(info.channel_url ?? info.uploader_url ?? ""),
    originalTitle: String(info.title ?? ""),
    durationSeconds: Number(info.duration ?? 0),
    width: Number(info.width ?? 0),
    height: Number(info.height ?? 0),
  });
}

writeFileSync(join(DATA_DIR, "videos.json"), `${JSON.stringify(videos, null, 2)}\n`);
writeFileSync(join(DATA_DIR, "index.json"), `${JSON.stringify({ total: videos.length, packSize: videos.length, range: [1, videos.length] }, null, 2)}\n`);
writeFileSync(join(DATA_DIR, "sources.json"), `${JSON.stringify({
  deckId: DECK_ID,
  importedAt: "2026-08-10",
  sourceDirectory: relative(ROOT, INBOX_DIR),
  rights: {
    basis: "Owner permission",
    note: "The user confirmed on 2026-08-10 that the videos are theirs and permission is granted for use in this pack.",
  },
  itemCount: items.length,
  items,
}, null, 2)}\n`);

console.log(JSON.stringify({ deck: DECK_ID, videos: videos.length, dataDir: relative(ROOT, DATA_DIR), assetDir: relative(ROOT, ASSET_DIR) }));
