// Split the downloaded corpus into per-agent slice files + emit a manifest (printed as JSON
// on the first stdout line) to pass as Workflow `args`. Each workflow agent reads ONE slice file.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const OUT = "/home/davtian/Documents/shorts/local-assets/corpora/islamic";
const SL = `${OUT}/slices`;
mkdirSync(SL, { recursive: true });
mkdirSync(`${OUT}/sel`, { recursive: true });

const read = (f) => readFileSync(`${OUT}/${f}`, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const quran = read("quran.jsonl");
const famous = read("quran-famous.jsonl");
const hadith = read("hadith.jsonl");
const dua = read("dua.jsonl");

const manifest = [];
function emit(label, section, items, target) {
  const slim = items.map((x) => ({ id: x.id, type: x.type, ref_en: x.ref_en, ref_ar: x.ref_ar, len: x.len, arabic: x.arabic }));
  writeFileSync(`${SL}/${label}.jsonl`, slim.map((x) => JSON.stringify(x)).join("\n") + "\n");
  manifest.push({ label, section, file: `local-assets/corpora/islamic/slices/${label}.jsonl`, count: items.length, target });
}
const chunk = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };

const sections = [
  { name: "quran", items: quran, size: 125, rate: 0.27 },
  { name: "famous", items: famous, size: 100, rate: 0.46 },
  { name: "hadith", items: hadith, size: 42, rate: 0.9 }, // splits into nawawi(42) + qudsi(40)
  { name: "dua", items: dua, size: 67, rate: 0.42 },
];
for (const s of sections) {
  chunk(s.items, s.size).forEach((c, i) => {
    const target = Math.min(c.length, Math.max(1, Math.round(c.length * s.rate)));
    emit(`${s.name}_${i + 1}`, s.name, c, target);
  });
}

writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
console.log(JSON.stringify(manifest));
console.error(`slices=${manifest.length} targetSum=${manifest.reduce((a, b) => a + b.target, 0)}`);
