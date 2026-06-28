import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import puppeteer from "puppeteer-core";
import { chromePath } from "../render.ts";
import { getDeck } from "../anecdotes/decks.ts";
import { deckCards, type PackItem } from "../anecdotes/library.ts";
import { renderAnecdote } from "../anecdotes/render.ts";
import { getPack } from "../packs/store.ts";
import { renderTemplateCard, type TemplateDoc } from "../template/render.ts";

const ROOT = process.cwd();
const args = new Map<string, string | boolean>();
for (const raw of process.argv.slice(2)) {
  const m = raw.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args.set(m[1], m[2] ?? true);
}

const USERNAME = String(args.get("user") || "armen");
const OUT_DIR = resolve(ROOT, String(args.get("out") || "temp/superadmin-current-contact"));
const LIMIT = Math.max(1, Number(args.get("limit") || 80));

interface AccountRow {
  id: number;
  channel_name: string;
  lang: string;
  source_decks: string;
}

interface RenderedSample {
  deckId: string;
  label: string;
  type: string;
  accounts: string[];
  image: string;
  note?: string;
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stableIndex(seed: string, size: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return Math.abs(h) % Math.max(1, size);
}

function activeDeckAccounts(): Map<string, string[]> {
  const db = new DatabaseSync(resolve(ROOT, "data/app.db"));
  try {
    const user = db.prepare("SELECT id FROM users WHERE username = ?").get(USERNAME) as { id: number } | undefined;
    if (!user) throw new Error(`User not found: ${USERNAME}`);
    const rows = db
      .prepare("SELECT id, channel_name, lang, source_decks FROM accounts WHERE user_id = ? ORDER BY lang, id")
      .all(user.id) as AccountRow[];
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const decks = JSON.parse(row.source_decks || "[]") as string[];
      for (const deckId of decks) {
        const list = map.get(deckId) || [];
        list.push(`${row.lang}:${row.channel_name || row.id}`);
        map.set(deckId, list);
      }
    }
    return map;
  } finally {
    db.close();
  }
}

function itemFor(deckId: string): PackItem | null {
  const items = deckCards(deckId);
  if (!items.length) return null;
  return items[stableIndex(deckId, items.length)] ?? items[0] ?? null;
}

function preFactAsset(deckId: string, item: PackItem): string | null {
  if (!item.videoFile) return null;
  const candidates = [
    resolve(ROOT, "assets/fact-videos", item.videoFile),
    resolve(ROOT, "assets/fact-videos", deckId, basename(item.videoFile)),
  ];
  return candidates.find((file) => existsSync(file)) || null;
}

async function renderPreFact(deckId: string, outPath: string): Promise<string> {
  const item = itemFor(deckId);
  const video = item ? preFactAsset(deckId, item) : null;
  if (video) {
    try {
      execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", "00:00:01", "-i", video, "-frames:v", "1", outPath], {
        cwd: ROOT,
        stdio: "ignore",
      });
      if (existsSync(outPath)) return "ffmpeg frame";
    } catch {
      /* fall through to placeholder */
    }
  }
  const deck = getDeck(deckId);
  await placeholder(outPath, deck.name, item?.title || deckId, "prebuilt video");
  return video ? "ffmpeg unavailable/failed" : "missing video asset";
}

async function placeholder(outPath: string, title: string, body: string, foot: string): Promise<void> {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:1080px;height:1920px;background:#eee8dc;font-family:Arial,sans-serif;color:#111}
    main{width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:90px;box-sizing:border-box}
    section{border:6px solid #111;background:#fffdf6;padding:70px;width:100%;min-height:760px;box-sizing:border-box}
    h1{font-size:74px;line-height:1.04;margin:0 0 44px}p{font-size:44px;line-height:1.25;margin:0 0 44px;color:#333}small{font-size:32px;color:#666}
  </style></head><body><main><section><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p><small>${escapeHtml(foot)}</small></section></main></body></html>`;
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    const buf = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1080, height: 1920 } });
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, buf);
    await page.close();
  } finally {
    await browser.close();
  }
}

async function renderBuiltin(deckId: string, outPath: string): Promise<string> {
  const deck = getDeck(deckId);
  if (deck.preFact) return renderPreFact(deckId, outPath);
  const item = itemFor(deckId);
  if (!item) {
    await placeholder(outPath, deck.name, "No deck cards", deckId);
    return "no cards";
  }
  const result = await renderAnecdote(
    {
      title: item.title || deck.name,
      text: item.text,
      channel: deck.name,
      deck: deckId,
      profession: item.profession,
    },
    outPath,
    item,
  );
  return `font ${result.fontPx}px`;
}

async function renderPack(deckId: string, outPath: string): Promise<string> {
  const id = deckId.slice("pack:".length);
  const pack = getPack(id, 1, true);
  if (!pack || !pack.cards.length || !pack.templates.length) {
    await placeholder(outPath, id, "Pack missing/cards empty", deckId);
    return "missing pack";
  }
  const cardIndex = stableIndex(id, pack.cards.length);
  const card = pack.cards[cardIndex] ?? pack.cards[0];
  const tpl = pack.templates[cardIndex % pack.templates.length] ?? pack.templates[0];
  await renderTemplateCard(tpl as TemplateDoc, card.values, outPath);
  return `${pack.cards.length} cards / ${pack.templates.length} templates`;
}

async function makeSheet(samples: RenderedSample[], outPath: string): Promise<void> {
  const cards = await Promise.all(
    samples.map(async (sample) => {
      const b64 = (await readFile(sample.image)).toString("base64");
      return `<article>
        <img src="data:image/png;base64,${b64}">
        <strong>${escapeHtml(sample.deckId)}</strong>
        <span>${escapeHtml(sample.label)} · ${escapeHtml(sample.type)}</span>
        <em>${escapeHtml(sample.note || "")}</em>
        <small>${escapeHtml(sample.accounts.slice(0, 4).join(" | "))}${sample.accounts.length > 4 ? " ..." : ""}</small>
      </article>`;
    }),
  );
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:24px;background:#eeeae0;font-family:Arial,sans-serif;color:#111}
    h1{margin:0 0 18px;font-size:30px}section{display:grid;grid-template-columns:repeat(5,1fr);gap:18px}
    article{background:#fff;border:1px solid #bdb7aa;padding:10px}
    img{display:block;width:100%;height:auto;background:#ddd}
    strong,span,em,small{display:block;font-size:12px;line-height:1.34;margin-top:5px;overflow-wrap:anywhere}
    strong{font-size:13px}em{color:#665}small{color:#555}
  </style></head><body><h1>Super-admin active source contact · ${escapeHtml(USERNAME)} · ${new Date().toISOString()}</h1><section>${cards.join("")}</section></body></html>`;
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1800, height: 1400, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    const buf = await page.screenshot({ type: "jpeg", quality: 88, fullPage: true });
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, buf);
    await page.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const active = [...activeDeckAccounts().entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, LIMIT);
  const samples: RenderedSample[] = [];
  for (const [deckId, accounts] of active) {
    const safe = deckId.replace(/[^a-z0-9а-яё_-]+/giu, "_");
    const image = resolve(OUT_DIR, `${safe}.png`);
    const type = deckId.startsWith("pack:") ? "pack" : getDeck(deckId).preFact ? "prebuilt-video" : "dynamic";
    const label = deckId.startsWith("pack:")
      ? getPack(deckId.slice("pack:".length), 1, true)?.name || deckId
      : getDeck(deckId).name;
    const note = deckId.startsWith("pack:") ? await renderPack(deckId, image) : await renderBuiltin(deckId, image);
    samples.push({ deckId, label, type, accounts, image, note });
    console.log(`${samples.length}/${active.length}\t${deckId}\t${note}`);
  }
  await makeSheet(samples, resolve(OUT_DIR, "contact.jpg"));
  await writeFile(resolve(OUT_DIR, "report.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), samples }, null, 2)}\n`);
  console.log(`sheet: ${resolve(OUT_DIR, "contact.jpg")}`);
  console.log(`report: ${resolve(OUT_DIR, "report.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
