// Делит LLM-отобранный пул (corpora/ru-gen/keep-*.json + cand-*.json) на ДВА непересекающихся
// набора: pool-friend.json (другу) и pool-mydeck.json (моя дека). Каждый агент парит свой набор —
// без гонок и дублей между каналами.
//   FRIEND_N=820 node --import tsx src/scripts/ru-partition.ts
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { anecdoteKey } from "../anecdotes/library.ts";

const DIR = resolve(process.cwd(), "corpora/ru-gen");
const FRIEND_N = Number(process.env.FRIEND_N ?? 820);

const candMap = new Map<number, string>();
for (const f of readdirSync(DIR).filter((x) => /^cand-\d+\.json$/.test(x))) {
  for (const it of JSON.parse(readFileSync(resolve(DIR, f), "utf8")) as { id: number; text: string }[])
    candMap.set(it.id, it.text);
}
const kept: { id: number; theme: string }[] = [];
for (const f of readdirSync(DIR).filter((x) => /^keep-\d+\.json$/.test(x))) {
  try {
    for (const it of JSON.parse(readFileSync(resolve(DIR, f), "utf8")) as { id: number; theme: string }[])
      if (it && typeof it.id === "number") kept.push({ id: it.id, theme: String(it.theme || "разное") });
  } catch { /* пропускаем битый keep-файл */ }
}

const seen = new Set<string>();
const pool: { id: number; text: string; theme: string; len: number }[] = [];
for (const k of kept) {
  const text = candMap.get(k.id);
  if (!text) continue;
  const key = anecdoteKey(text);
  if (seen.has(key)) continue;
  seen.add(key);
  pool.push({ id: k.id, text, theme: k.theme, len: text.length });
}

// детерминированная перетасовка (по хэшу текста)
function h(s: string): number { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) >>> 0; return x; }
pool.sort((a, b) => h(a.text) - h(b.text));

const friend = pool.slice(0, FRIEND_N);
const mydeck = pool.slice(FRIEND_N);
writeFileSync(resolve(DIR, "pool-friend.json"), JSON.stringify(friend, null, 1));
writeFileSync(resolve(DIR, "pool-mydeck.json"), JSON.stringify(mydeck, null, 1));

const byTheme = (arr: typeof pool) => {
  const m: Record<string, number> = {};
  for (const x of arr) m[x.theme] = (m[x.theme] || 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`).join(" ");
};
console.log(`pool total: ${pool.length} (kept ${kept.length}, dropped no-text/dup ${kept.length - pool.length})`);
console.log(`FRIEND set: ${friend.length} → pool-friend.json  | ~${Math.floor(friend.length / 2)} пар`);
console.log(`MYDECK set: ${mydeck.length} → pool-mydeck.json  | ~${Math.floor(mydeck.length / 2)} пар`);
console.log(`themes(friend): ${byTheme(friend)}`);
console.log(`themes(mydeck): ${byTheme(mydeck)}`);
