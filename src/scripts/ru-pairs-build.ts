// Собирает карточки-ПАРЫ из отобранных пулов и пишет в ДВА места:
//  • другу → data/packs/анекдоты-ру-впн-mqe5ovw1.json  (card.values.text = [A,B], дозапись к 10)
//  • моя дека → data/anecdotes/titled.json (+ pack-*.json + index.json), text = "A\n\n— — —\n\nB"
// Пары: внутри одной темы (жадный two-pointer под сумму длин), остатки добиваются кросс-темой.
//   node --import tsx src/scripts/ru-pairs-build.ts
import { readFileSync, writeFileSync, renameSync, copyFileSync, cpSync, readdirSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { anecdoteKey } from "../anecdotes/library.ts";

const DIR = resolve(process.cwd(), "corpora/ru-gen");
const PACK_FILE = resolve(process.cwd(), "data/packs/анекдоты-ру-впн-mqe5ovw1.json");
const DECK_DIR = resolve(process.cwd(), "data/anecdotes");

interface Joke { id: number; text: string; theme: string }
interface Pair { theme: string; a: string; b: string }

const TITLE: Record<string, string> = {
  семья: "Про семью", тёща: "Про тёщу", дети: "Про детей", школа: "Школьное",
  студенты: "Студенческое", работа: "Про работу", врачи: "У врача", армия: "Армейское",
  полиция: "Гаишник и Ко", застолье: "Про застолье", деньги: "Про деньги", животные: "Про зверьё",
  технологии: "Цифровая жизнь", спорт: "Про спорт", старость: "Про возраст", разное: "Анекдоты",
};
const titleFor = (theme: string) => TITLE[theme] ?? "Анекдоты";

// Жадный подбор пар по сумме длин в [minSum,maxSum]: сначала внутри темы, остатки — кросс-темой.
function pairPool(pool: Joke[], minSum: number, maxSum: number, exclude: Set<string>): Pair[] {
  const usable = pool.filter((j) => !exclude.has(anecdoteKey(j.text)));
  const byTheme = new Map<string, Joke[]>();
  for (const j of usable) (byTheme.get(j.theme) ?? byTheme.set(j.theme, []).get(j.theme)!).push(j);
  const pairs: Pair[] = [];
  const leftovers: Joke[] = [];
  const twoPointer = (arr: Joke[], theme: string, sink: Pair[], drop: Joke[]) => {
    arr.sort((x, y) => x.text.length - y.text.length);
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) {
      const s = arr[lo].text.length + arr[hi].text.length;
      if (s > maxSum) drop.push(arr[hi--]);
      else if (s < minSum) drop.push(arr[lo++]);
      else { sink.push({ theme, a: arr[lo++].text, b: arr[hi--].text }); }
    }
    if (lo === hi) drop.push(arr[lo]);
  };
  for (const [theme, arr] of byTheme) twoPointer(arr, theme, pairs, leftovers);
  // остатки всех тем — добираем кросс-темой (заголовок «Анекдоты»)
  const dropped: Joke[] = [];
  twoPointer(leftovers, "разное", pairs, dropped);
  return pairs;
}

function atomicWrite(file: string, data: string) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

// ---------------- ДРУГ ----------------
function buildFriend() {
  const pool = JSON.parse(readFileSync(resolve(DIR, "pool-friend.json"), "utf8")) as Joke[];
  const pack = JSON.parse(readFileSync(PACK_FILE, "utf8")) as {
    cards: { values: { title: string; text: string | string[] }; addedAt: string }[];
    [k: string]: unknown;
  };
  // дедуп против уже лежащих 10 карточек (их text = [A,B])
  const existing = new Set<string>();
  for (const c of pack.cards) {
    const t = c.values.text;
    for (const s of Array.isArray(t) ? t : [t]) existing.add(anecdoteKey(String(s)));
  }
  const pairs = pairPool(pool, 348, 450, existing); // сумма двух текстов = итоговая «длина» карточки
  const now = Date.now();
  const newCards = pairs.map((p, i) => ({
    values: { title: titleFor(p.theme), text: [p.a, p.b] },
    addedAt: new Date(now + i).toISOString(),
  }));
  copyFileSync(PACK_FILE, `${PACK_FILE}.bak`);
  pack.cards.push(...newCards);
  atomicWrite(PACK_FILE, JSON.stringify(pack, null, 2));
  const sums = pairs.map((p) => p.a.length + p.b.length).sort((x, y) => x - y);
  console.log(`ДРУГ: пул ${pool.length} → пар ${pairs.length}; всего карточек ${pack.cards.length} (было ${pack.cards.length - newCards.length})`);
  console.log(`  сумм длин: min=${sums[0]} med=${sums[sums.length >> 1]} max=${sums[sums.length - 1]}`);
}

// ---------------- МОЯ ДЕКА ----------------
const SEP = "\n\n— — —\n\n";
function buildMyDeck() {
  const pool = JSON.parse(readFileSync(resolve(DIR, "pool-mydeck.json"), "utf8")) as Joke[];
  const titledFile = resolve(DECK_DIR, "titled.json");
  const titled = JSON.parse(readFileSync(titledFile, "utf8")) as { id: number; pack: number; text: string; chars: number; title: string }[];
  const before = titled.length;
  // сумма двух текстов целимся так, чтобы итог с разделителем (+9) попал в ~350–455
  const pairs = pairPool(pool, 340, 443, new Set());
  const newItems = pairs.map((p) => {
    const text = p.a + SEP + p.b;
    return { id: 0, pack: 0, text, chars: text.length, title: titleFor(p.theme) };
  });
  const all = [...titled, ...newItems];
  const PACK = 100;
  all.forEach((it, i) => { it.id = i + 1; it.pack = Math.floor(i / PACK) + 1; });
  const packs = Math.max(1, Math.ceil(all.length / PACK));

  cpSync(DECK_DIR, `${DECK_DIR}.bak`, { recursive: true });
  atomicWrite(titledFile, JSON.stringify(all, null, 1));
  for (let p = 1; p <= packs; p++) {
    const slice = all.filter((it) => it.pack === p);
    atomicWrite(resolve(DECK_DIR, `pack-${String(p).padStart(3, "0")}.json`), JSON.stringify(slice, null, 1));
  }
  for (const f of readdirSync(DECK_DIR).filter((x) => /^pack-(\d+)\.json$/.test(x))) {
    if (Number(f.match(/^pack-(\d+)\.json$/)![1]) > packs) unlinkSync(resolve(DECK_DIR, f));
  }
  const lens = all.map((i) => i.chars).sort((a, b) => a - b);
  atomicWrite(resolve(DECK_DIR, "index.json"), JSON.stringify({ total: all.length, packs, packSize: PACK, range: [lens[0], lens[lens.length - 1]] }, null, 2));
  const ns = newItems.map((i) => i.chars).sort((a, b) => a - b);
  console.log(`МОЯ ДЕКА: пул ${pool.length} → пар ${pairs.length}; titled ${before} → ${all.length}; паков ${packs}`);
  console.log(`  длина новых: min=${ns[0]} med=${ns[ns.length >> 1]} max=${ns[ns.length - 1]}`);
}

buildFriend();
buildMyDeck();
console.log("=== done ===");
