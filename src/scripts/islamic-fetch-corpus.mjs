// Pre-download the FULL Islamic source corpus (exact Arabic) into local files, so the
// selection workflow reads from disk instead of hitting the internet per item.
// Sources: Quran = api.alquran.cloud (quran-uthmani), Hadith = fawazahmed0/hadith-api,
// Dua = hisnmuslim.com. Output (gitignored): local-assets/corpora/islamic/*.jsonl + pool.json (id→item map).
import { writeFileSync, mkdirSync } from "node:fs";

const REPO = "/home/davtian/Documents/shorts";
const OUT = `${REPO}/local-assets/corpora/islamic`;
mkdirSync(OUT, { recursive: true });

const toAr = (n) => String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);
const BASMALA = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
const clen = (s) => [...s].length;

async function getJson(url) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  throw new Error("fetch failed: " + url);
}
async function mapLimit(items, limit, fn) {
  const res = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (i < items.length) {
        const idx = i++;
        try { res[idx] = await fn(items[idx], idx); } catch { res[idx] = null; }
      }
    }),
  );
  return res;
}

const surahs = (await getJson("https://api.alquran.cloud/v1/surah")).data;
const sName = (n) => surahs[n - 1].name;
const sEn = (n) => surahs[n - 1].englishName;

function ayahItem(n, a, text, sec) {
  let t = text;
  if (a === 1 && n !== 1 && n !== 9 && t.startsWith(BASMALA)) t = t.slice(BASMALA.length).trim();
  return t ? { id: `${n}:${a}`, type: "ayah", arabic: t, ref_ar: `${sName(n)} ${toAr(a)}`, ref_en: `${sEn(n)} ${n}:${a}`, len: clen(t), sec } : null;
}

// ---- 1) per-ayah for whole surahs (Juz Amma 78..114 + memorized: Yasin, Rahman, Waqiah, Mulk) ----
const wholeSurahs = [...Array.from({ length: 114 - 78 + 1 }, (_, k) => 78 + k), 36, 55, 56, 67];
const quran = [];
await mapLimit(wholeSurahs, 6, async (n) => {
  const j = await getJson(`https://api.alquran.cloud/v1/surah/${n}/quran-uthmani`);
  const sec = n >= 78 ? "juzamma" : "memorized";
  for (const a of j.data.ayahs) {
    const it = ayahItem(n, a.numberInSurah, a.text, sec);
    if (it) quran.push(it);
  }
});

// ---- 2) Al-Kahf first 10 + last 9 (commonly memorized for protection) ----
await mapLimit([18], 1, async (n) => {
  const j = await getJson(`https://api.alquran.cloud/v1/surah/${n}/quran-uthmani`);
  for (const a of j.data.ayahs) {
    if ((a.numberInSurah >= 1 && a.numberInSurah <= 10) || (a.numberInSurah >= 102 && a.numberInSurah <= 110)) {
      const it = ayahItem(n, a.numberInSurah, a.text, "memorized");
      if (it) quran.push(it);
    }
  }
});

// ---- 3) famous single ayahs from the rest of the Quran ----
const FAMOUS = [
  "2:45","2:153","2:155","2:156","2:186","2:201","2:255","2:256","2:257","2:261","2:286",
  "3:8","3:18","3:26","3:27","3:31","3:92","3:103","3:133","3:134","3:139","3:159","3:173","3:185","3:190","3:191","3:200",
  "4:36","4:59","4:69","4:103","4:135",
  "5:2","5:8","5:32","6:73","6:103","6:162","6:163",
  "7:23","7:55","7:56","7:180","7:205",
  "8:2","8:46","9:40","9:51","9:128","9:129",
  "10:57","10:62","11:88","11:114","12:87","12:101",
  "13:11","13:28","14:7","14:40","16:90","16:97","16:125","16:128",
  "17:23","17:24","17:32","17:36","17:80","17:110",
  "18:23","18:24","18:28","18:29",
  "19:96","20:25","20:26","20:27","20:28","20:114","20:124","20:132",
  "21:87","21:88","21:107","22:77","22:78","23:1","23:2","23:115",
  "24:35","25:63","25:70","25:74","26:80","26:83","26:89","27:19","27:62",
  "28:24","28:77","28:88","29:45","29:57","29:69","30:21","30:60",
  "31:13","31:14","31:17","31:18","31:19","32:16","33:21","33:35","33:40","33:41","33:56","33:70","33:71",
  "35:5","35:28","35:29","37:180","37:181","37:182","38:26","39:9","39:53","39:73",
  "40:44","40:60","41:30","41:33","41:34","41:35","42:20","42:23","42:30",
  "46:15","47:7","47:19","48:1","48:29","49:10","49:11","49:12","49:13",
  "50:16","51:56","53:39","53:40","53:41","53:42","57:4","57:20","57:23",
  "58:11","59:10","59:18","59:19","59:21","59:22","59:23","59:24",
  "60:8","61:2","61:3","61:4","61:10","61:11","62:10","63:9",
  "64:11","64:16","65:2","65:3","65:7","66:6","66:8","68:4",
  "70:19","70:20","70:21","70:22","70:23","71:10","71:11","71:12","72:18","73:8","73:20","74:38","76:7","76:8","76:9",
];
const famous = (
  await mapLimit(FAMOUS, 8, async (ref) => {
    const [s, a] = ref.split(":").map(Number);
    const j = await getJson(`https://api.alquran.cloud/v1/ayah/${ref}/quran-uthmani`);
    return ayahItem(s, a, j.data.text, "famous");
  })
).filter(Boolean);

// ---- 4) Hadith: An-Nawawi 40 + Hadith Qudsi (whole editions) ----
const hadith = [];
for (const [ed, label] of [["ara-nawawi", "الأربعون النووية"], ["ara-qudsi", "الأحاديث القدسية"]]) {
  try {
    const j = await getJson(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/${ed}.json`);
    for (const h of j.hadiths || []) {
      const t = (h.text || "").trim();
      if (t) hadith.push({ id: `${ed}:${h.hadithnumber}`, type: "hadith", arabic: t, ref_ar: `${label} ${toAr(h.hadithnumber)}`, ref_en: `${ed} ${h.hadithnumber}`, len: clen(t), sec: "hadith" });
    }
  } catch (e) { console.log("hadith edition failed", ed, e.message); }
}

// ---- 5) Dua: Hisnul Muslim, all categories ----
const dua = [];
const list = await getJson("https://www.hisnmuslim.com/api/ar/husn_ar.json");
const cats = list[Object.keys(list)[0]];
await mapLimit(cats, 6, async (cat) => {
  const j = await getJson(`https://www.hisnmuslim.com/api/ar/${cat.ID}.json`);
  const arr = j[Object.keys(j)[0]] || [];
  arr.forEach((it, idx) => {
    const t = (it.ARABIC_TEXT || "").trim();
    if (t) dua.push({ id: `hisn:${cat.ID}:${idx}`, type: "dua", arabic: t, ref_ar: cat.TITLE, ref_en: `Hisn al-Muslim: ${cat.TITLE}`, len: clen(t), sec: "dua" });
  });
});

// ---- write ----
const writeJsonl = (name, arr) => writeFileSync(`${OUT}/${name}.jsonl`, arr.map((x) => JSON.stringify(x)).join("\n") + "\n");
writeJsonl("quran", quran);
writeJsonl("quran-famous", famous);
writeJsonl("hadith", hadith);
writeJsonl("dua", dua);
const all = [...quran, ...famous, ...hadith, ...dua];
const map = {};
for (const x of all) map[x.id] = x;
writeFileSync(`${OUT}/pool.json`, JSON.stringify(map));

const band = all.filter((x) => x.len >= 30 && x.len <= 700).length;
console.log(`quran=${quran.length} famous=${famous.length} hadith=${hadith.length} dua=${dua.length} TOTAL=${all.length}`);
console.log(`in 30..700 chars band: ${band}`);
