import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const ROOT = process.cwd();
const SOURCE_DIRS = [
  resolve(ROOT, "assets/soviet-posters-pd"),
  resolve(ROOT, "local-assets/soviet-posters-pd"),
];
const sourceDir = SOURCE_DIRS.find((dir) => existsSync(resolve(dir, "sources.jsonl")));
if (!sourceDir) {
  throw new Error("Missing soviet poster source folder: assets/soviet-posters-pd or local-assets/soviet-posters-pd");
}

const outDir = resolve(ROOT, "assets/template-packs/soviet-posters");
const bgDir = resolve(outDir, "backgrounds");
const packFile = resolve(ROOT, "data/packs/soviet-posters-ru.json");
rmSync(bgDir, { recursive: true, force: true });
mkdirSync(bgDir, { recursive: true });
mkdirSync(resolve(ROOT, "data/packs"), { recursive: true });

const sources = readFileSync(resolve(sourceDir, "sources.jsonl"), "utf8")
  .trim()
  .split(/\n+/)
  .map((line) => JSON.parse(line));

function posterId(file) {
  return basename(file).replace(/\.[^.]+$/, "");
}

const UNSAFE_TITLE_RULES = [
  ["protected-class wording", /негр|negro/i],
  ["anti-religious/faith-targeted satire", /безбож|bezbozhnik|религ|relig|бог|церк|поп/i],
  ["violent or war propaganda", /смерт|death|доб(ь|и)|уб(е|и|ь)|kill|палач|винтов|войн|war|civil war|фронт|front|оборона|defen[cs]e|осажден/i],
  ["military/recruitment framing", /красн[а-яё\s-]*арм|красноарм|армии|army|оруж|границ|volunteer|записался|добровольц|петрограда не отдадим|пушки/i],
  ["WWII or fascism framing", /фаш|fasc/i],
  ["repression/security-service framing", /вчк|огпу|гпу|контррев|intervent|counter/i],
  ["enemy/dehumanizing framing", /враг|нечист|врангел|панск|паново|panu|цар[её]й|бояр|казак|cossack|империал|imperialism|кулак|kulak/i],
  ["ideological agitation", /революц|revolution|пролетар|коммуниз|коммунист|капитал|kapital|октябр|ленин|ильич|раздав/i],
  ["national/political propaganda", /пропаганд|propaganda|украинц|господин|pans/i],
];

const VISUAL_SAFE_POSTER_FILES = new Set([
  "images/soviet-010.jpg", // scientific organization of labor
  "images/soviet-013.jpg", // Dobrolet agriculture advert
  "images/soviet-017.jpg", // club/leisure/education
  "images/soviet-030.jpg", // chemistry/Dobrokhim advert
  "images/soviet-032.jpg", // Mosselprom advert
  "images/soviet-042.jpg", // factory kitchen / food service
  "images/soviet-044.jpg", // book exhibition
  "images/soviet-045.jpg", // productivity poster without protected-class/political target
  "images/soviet-050.jpg", // fable illustration
  "images/soviet-055.jpg", // books/reading
  "images/soviet-057.jpg", // Mosselprom advert
  "images/soviet-062.jpg", // protect books
  "images/soviet-067.jpg", // Mossukno advert
  "images/soviet-083.jpg", // cream soda advert
  "images/soviet-084.jpg", // absenteeism social poster
  "images/soviet-089.jpg", // pencil/pen advert
  "images/soviet-096.jpg", // art poster
  "images/soviet-097.jpg", // art to the masses
  "images/soviet-099.jpg", // park poster
  "images/soviet-100.jpg", // Siberian woman poster
  "images/soviet-106.jpg", // Moscow construction
]);

function unsafeReason(source) {
  if (!VISUAL_SAFE_POSTER_FILES.has(source.file)) return "not in visual-safe allowlist";
  const title = [
    source.title,
    source.wikimedia_category,
    source.source_page,
  ]
    .filter(Boolean)
    .join(" ");
  for (const [reason, pattern] of UNSAFE_TITLE_RULES) {
    if (pattern.test(title)) return reason;
  }
  return "";
}

function convertImage(src, out) {
  if (existsSync(out) && statSync(out).size > 0 && statSync(out).size <= 1_900_000) return;
  const vf = "scale=1000:1780:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0xf2ead7,setsar=1";
  for (const q of [5, 8, 12, 16]) {
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vf", vf, "-frames:v", "1", "-q:v", String(q), out], {
      stdio: "inherit",
    });
    if (statSync(out).size <= 1_900_000) return;
  }
  throw new Error(`Optimized poster is still too large for template renderer: ${out}`);
}

function hiddenKillbox(id, role, maxChars) {
  return {
    id,
    type: "killbox",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    rot: 0,
    role,
    padX: 0,
    padY: 0,
    align: "left",
    valign: "top",
    font: {
      family: "Inter",
      size: 1,
      weight: 400,
      color: "#00000000",
      lineHeight: 1,
    },
    fitMin: 1,
    fitMax: 1,
    maxChars,
    placeholder: role,
  };
}

const templates = [];
const cards = [];
const ledger = [];
const excluded = [];
let packIndex = 0;
for (const source of sources) {
  const reason = unsafeReason(source);
  if (reason) {
    excluded.push({ ...source, excluded_reason: reason });
    continue;
  }

  const id = posterId(source.file);
  const src = resolve(sourceDir, source.file);
  const rel = `assets/template-packs/soviet-posters/backgrounds/${id}.jpg`;
  const out = resolve(ROOT, rel);
  convertImage(src, out);
  packIndex += 1;

  templates.push({
    version: 1,
    name: `soviet-posters-ru-${String(packIndex).padStart(3, "0")}`,
    canvas: { w: 1080, h: 1920, bg: "#f2ead7" },
    elements: [
      {
        id: "poster",
        type: "image",
        x: 0,
        y: 0,
        w: 1080,
        h: 1920,
        rot: 0,
        src: rel,
        fit: "cover",
      },
      hiddenKillbox("title", "title", 220),
      hiddenKillbox("source", "source", 1200),
    ],
  });

  const title = String(source.title || "Советский плакат").trim();
  const year = source.year ? `, ${source.year}` : "";
  const artist = String(source.artist || "Неизвестный автор").replace(/\s+/g, " ").trim();
  cards.push({
    values: {
      title: `${title}${year}`,
      source: `${artist} · ${source.license || "Public domain"} · ${source.source_page || ""}`.trim(),
    },
    addedAt: "2026-06-28T00:00:00.000Z",
  });
  ledger.push({ ...source, optimized_file: rel });
}

const pack = {
  id: "soviet-posters-ru",
  owners: [1],
  createdBy: 1,
  name: "Советские постеры",
  lang: "ru",
  templates,
  cards,
  createdAt: "2026-06-28T00:00:00.000Z",
  grants: [],
  repeatMode: "least_posted_per_account",
  note:
    "RU-only curated public-domain Soviet poster pack. Do not localize, do not replenish automatically. Repeat mode picks the least rendered poster per channel.",
};

writeFileSync(resolve(outDir, "sources.json"), `${JSON.stringify(ledger, null, 2)}\n`);
writeFileSync(resolve(outDir, "excluded-sources.json"), `${JSON.stringify(excluded, null, 2)}\n`);
writeFileSync(packFile, `${JSON.stringify(pack, null, 2)}\n`);
console.log(JSON.stringify({ pack: packFile, cards: cards.length, templates: templates.length, excluded: excluded.length, assets: bgDir }, null, 2));
