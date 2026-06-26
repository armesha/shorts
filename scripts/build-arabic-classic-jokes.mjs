#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve(process.cwd(), "data/anecdotes-ar");
const PACK_SIZE = 300;
const TARGET = 120;
const MAX_CARDS_PER_BASE = 2;

const SOURCES = [
  {
    id: "al-bukhala-wikisource",
    page: "البخلاء",
    title: "البخلاء",
    author: "الجاحظ",
    authorDied: "868/869",
    sourceUrl: "https://ar.wikisource.org/wiki/%D8%A7%D9%84%D8%A8%D8%AE%D9%84%D8%A7%D8%A1",
    rights:
      "Original author is public-domain by age. Text extracted from Arabic Wikisource; keep attribution/source URL and CC BY-SA notice from Wikisource.",
  },
  {
    id: "al-tatfil-wikisource",
    page: "التطفيل وحكايات الطفيليين وأخبارهم ونوادر كلامهم وأشعارهم",
    title: "التطفيل وحكايات الطفيليين وأخبارهم ونوادر كلامهم وأشعارهم",
    author: "الخطيب البغدادي",
    authorDied: "1071",
    sourceUrl:
      "https://ar.wikisource.org/wiki/%D8%A7%D9%84%D8%AA%D8%B7%D9%81%D9%8A%D9%84_%D9%88%D8%AD%D9%83%D8%A7%D9%8A%D8%A7%D8%AA_%D8%A7%D9%84%D8%B7%D9%81%D9%8A%D9%84%D9%8A%D9%8A%D9%86_%D9%88%D8%A3%D8%AE%D8%A8%D8%A7%D8%B1%D9%87%D9%85_%D9%88%D9%86%D9%88%D8%A7%D8%AF%D8%B1_%D9%83%D9%84%D8%A7%D9%85%D9%87%D9%85_%D9%88%D8%A3%D8%B4%D8%B9%D8%A7%D8%B1%D9%87%D9%85",
    rights:
      "Original author is public-domain by age. Text extracted from Arabic Wikisource; keep attribution/source URL and CC BY-SA notice from Wikisource.",
  },
  {
    id: "al-iqd-al-farid-part-2-wikisource",
    page: "العقد الفريد/الجزء الثاني",
    pages: Array.from({ length: 31 }, (_, index) => `العقد الفريد/الجزء الثاني/${index + 1}`),
    title: "العقد الفريد - الجزء الثاني",
    author: "ابن عبد ربه",
    authorDied: "940",
    sourceUrl:
      "https://ar.wikisource.org/wiki/%D8%A7%D9%84%D8%B9%D9%82%D8%AF_%D8%A7%D9%84%D9%81%D8%B1%D9%8A%D8%AF/%D8%A7%D9%84%D8%AC%D8%B2%D8%A1_%D8%A7%D9%84%D8%AB%D8%A7%D9%86%D9%8A",
    rights:
      "Original author is public-domain by age. Text extracted from Arabic Wikisource subpages; keep attribution/source URLs and CC BY-SA notice from Wikisource.",
  },
  {
    id: "al-bayan-wa-al-tabyin-wikisource",
    page: "البيان والتبيين",
    title: "البيان والتبيين",
    author: "الجاحظ",
    authorDied: "868/869",
    sourceUrl: "https://ar.wikisource.org/wiki/%D8%A7%D9%84%D8%A8%D9%8A%D8%A7%D9%86_%D9%88%D8%A7%D9%84%D8%AA%D8%A8%D9%8A%D9%8A%D9%86",
    rights:
      "Original author is public-domain by age. Text extracted from Arabic Wikisource; keep attribution/source URL and CC BY-SA notice from Wikisource.",
  },
];

const DIACRITICS = /[\u064B-\u065F\u0670\u0640]/g;
const NAV_TERMS = [
  "ويكي مصدر",
  "المؤلف",
  "تنزيل بصيغه",
  "ملاحظات",
  "فهرس",
  "مصدر النص",
  "انتقل الي",
  "تصنيف",
  "مجلوبه",
  "هذه الصفحه",
  "wikisource",
  "newpp",
  "parsed",
  "صفحه:",
  "نسخه مطبوعه",
  "نزل نسخه",
  "كتب مصوره",
  "ويكي بيانات",
  "oldid",
  "http",
];

const BLOCKED_TERMS = [
  "الله",
  "اللهم",
  "رب",
  "النبي",
  "رسول",
  "قران",
  "حديث",
  "صلاه",
  "مسجد",
  "دين",
  "كافر",
  "جنه",
  "نار",
  "حلال",
  "حرام",
  "مسلم",
  "اسلام",
  "نصراني",
  "يهود",
  "مجوس",
  "شيطان",
  "ابليس",
  "زكاه",
  "صدقه",
  "صحابه",
  "رضي الله",
  "صلي الله",
  "صليت",
  "سوره",
  "ايه",
  "عباده",
  "سجد",
  "سجود",
  "اغفر",
  "ذنب",
  "المعاد",
  "المومن",
  "خليفه",
  "خلافه",
  "سلطان",
  "ملك",
  "امير",
  "والي",
  "قاضي",
  "وزير",
  "حاكم",
  "شرطه",
  "سجن",
  "جيش",
  "حرب",
  "غاره",
  "سياسه",
  "دوله",
  "رييس",
  "قتل",
  "قتيل",
  "مات",
  "موت",
  "ضرب",
  "سيف",
  "دم",
  "جريح",
  "جرح",
  "طعن",
  "ثار",
  "حرق",
  "سرق",
  "لص",
  "سرقه",
  "عذاب",
  "قبر",
  "دفن",
  "جثه",
  "ماتم",
  "طلاق",
  "امرا",
  "نساء",
  "زوج",
  "زوجه",
  "جاريه",
  "غلام",
  "صبي",
  "طفل",
  "ولد",
  "اولاد",
  "ابنك",
  "ابنه",
  "ابني",
  "ابنها",
  "بنته",
  "عيال",
  "بنت",
  "فتاه",
  "عرس",
  "زفاف",
  "امك",
  "ابيك",
  "ابوك",
  "خمر",
  "نبيذ",
  "سكر",
  "قيان",
  "زنا",
  "عشق",
  "قبله",
  "فاحشه",
  "فراش",
  "اعمي",
  "اعرج",
  "اصم",
  "ابكم",
  "مجنون",
  "احمق",
  "حمقي",
  "مغفل",
  "زنجي",
  "حبشي",
  "اسود",
  "يهودي",
  "فارسي",
  "رومي",
  "روم",
  "هندي",
  "هند",
  "تركي",
  "ترك",
  "ديلم",
  "بربري",
  "عبد",
  "عبيد",
  "سفل",
  "لعنه",
  "قبح",
  "قذر",
  "غايط",
  "بول",
  "براز",
  "خرء",
  "خرا",
  "يخرا",
  "يخرء",
  "كلب",
  "خنزير",
  "حمار",
  "شتيمه",
  "لعن",
  "ويلك",
  "ويحك",
  "خراسان",
  "البصره",
  "البصرة",
  "الكوفه",
  "الكوفة",
  "العراق",
  "مرو",
];

const NON_CARD_TERMS = [
  "وسالت",
  "اكتب لك",
  "اكتب",
  "عله",
  "العقل",
  "الغباء",
  "الطبائع",
  "هذا الكتاب",
  "كتابي",
  "ازعم",
  "مذهب",
  "اذا مدحوا",
  "اذا قالوا",
  "وقالوا",
  "ومنه",
  "معناه",
  "يعنون",
  "تصغير",
  "بالفتح",
  "تصديق المثل",
  "الانصراف بحاجه",
  "مداراه الناس",
  "وللمزح",
  "العيوب",
  "الفتنه",
  "القتال",
  "الشاعر",
  "الشعر",
  "الحكمه",
  "الفصل",
  "الباب",
  "تعليق",
  "مقدمه",
  "وبعد",
  "اما بعد",
  "فان قايل",
  "قال الشيخ",
  "وقد كان",
  "وقد كانوا",
  "العلماء",
  "الافاضل",
  "المنقول",
  "الاسناد",
  "الدرس",
  "حمده وذمه",
  "الكراء",
  "الغله",
  "الخصال",
  "حجه عليكم",
  "خير الكلام",
  "اخبرنا",
  "حدثنا",
  "قرات",
  "انبانا",
  "رواه",
  "رحمه",
  "تعالي",
  "فصل",
  "باب",
];

const TITLE_WORDS = [
  "طرفة تراثية",
  "من نوادر الطعام",
  "حيلة طريفة",
  "جواب سريع",
  "موقف بخيل",
  "نادرة قصيرة",
  "ضحكة قديمة",
];

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function normalizeArabic(text) {
  return text
    .replace(DIACRITICS, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase();
}

function containsAny(normalized, terms) {
  return terms.some((term) => normalized.includes(term));
}

function decodeHtml(html) {
  return html
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<sup[\s\S]*?<\/sup>/gi, " ")
    .replace(/<table[\s\S]*?<\/table>/gi, " ")
    .replace(/<h[1-6][^>]*>/gi, "\n\n# ")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/p>|<br\s*\/?\s*>|<\/li>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;|&rlm;|&lrm;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[\u200e\u200f\u200b]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchWikisourceText(page) {
  const url = new URL("https://ar.wikisource.org/w/api.php");
  for (const [key, value] of Object.entries({
    action: "parse",
    format: "json",
    origin: "*",
    page,
    prop: "text",
  })) {
    url.searchParams.set(key, value);
  }
  for (let attempt = 1; attempt <= 10; attempt++) {
    const res = await fetch(url, {
      headers: { "user-agent": "shareboard-arabic-jokes-builder/1.0" },
      signal: AbortSignal.timeout(25_000),
    });
    if (res.ok) {
      const json = await res.json();
      return decodeHtml(json.parse?.text?.["*"] ?? "");
    }
    if (![429, 500, 502, 503, 504].includes(res.status) || attempt === 10) {
      throw new Error(`Wikisource ${page}: ${res.status}`);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : (res.status === 429 ? 8_000 : 1_500) * attempt);
  }
  throw new Error(`Wikisource ${page}: exhausted retries`);
}

const LEADING_CHAIN =
  /^(?:(?:اخبرنا|أخبرنا|حدثنا|حدثني|قرأت|قرات|سمعت|عن|أنبأنا|انبانا|وحدث|قال الشيخ|أخبرني|اخبرني)[^.!؟؛:،]{0,260}(?:قال|قلت|فقال)[:،]?\s*)+/;

function sanitizeExcerpt(raw) {
  let text = raw
    .replace(/[«»“”]/g, '"')
    .replace(/[—–]/g, "-")
    .replace(/[()\[\]{}]/g, " ")
    .replace(/[٠-٩0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  text = text.replace(LEADING_CHAIN, "");
  // Neutralize regional labels used as the old source's punchline target.
  text = text.replace(/(?:و?ال)?(?:خراساني|مروزي|عراقي|بصري|كوفي|مدني|شامي|فارسي|رومي)\b/g, "الرجل");
  text = text.replace(/(?:اهل|أهل)\s+(?:خراسان|البصرة|البصره|الكوفة|الكوفه|العراق|مرو)/g, "بعض الناس");
  text = text.replace(/\b(?:ابو|أبو)\s+[\u0600-\u06ff]+(?:\s+بن\s+[\u0600-\u06ff]+){0,2}/g, "رجل");
  return text
    .replace(/\s+([,.;:!؟،؛])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[-"'،؛:. ]+|[-"'،؛:. ]+$/g, "")
    .trim();
}

function basePieces(text) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const base = [];
  let current = "";
  for (const line of lines) {
    if (line.startsWith("# ") || line.length < 8) {
      if (current) base.push(current);
      current = "";
      continue;
    }
    const next = `${current} ${line}`.trim();
    if (next.length > 760) {
      if (current) base.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) base.push(current);
  return base.map(sanitizeExcerpt);
}

function candidateWindows(piece) {
  const sentences = piece.match(/[^.!؟؛]+[.!؟؛]+/g) ?? [];
  const out = [];
  for (let i = 0; i < sentences.length; i++) {
    let current = "";
    for (let j = i; j < Math.min(sentences.length, i + 6); j++) {
      const next = `${current} ${sentences[j]}`.trim();
      if (next.length > 620) break;
      current = next;
      if (current.length >= 150) out.push(current);
    }
  }
  if (piece.length >= 150 && piece.length <= 620) out.push(piece);
  return out;
}

function scoreCard(text) {
  const normalized = normalizeArabic(text);
  let score = 0;
  score += (normalized.match(/\b(?:قال|قلت|فقال|يقول|سال|فقلت|فكان|فزعم)\b/g) ?? []).length * 2;
  score += (normalized.match(/[؟!"]/g) ?? []).length * 2;
  if (/\b(?:طعام|مايده|خبز|لحم|قدر|رغيف|الخوان|الطبخ|الدسم|ضيف|وليمه|اكل|ياكل|التمر|الفاكهه|باقل|مقلي|مرق|جبن|شحم)\b/.test(normalized)) {
    score += 4;
  }
  if (/[؟!]/.test(normalized)) score += 3;
  if (normalized.length < 300) score += 2;
  return score;
}

function isSafeCard(text) {
  const normalized = normalizeArabic(text);
  const arabicChars = normalized.match(/[\u0600-\u06ff]/g)?.length ?? 0;
  const words = normalized.split(/\s+/).length;
  if (normalized.length < 150 || normalized.length > 620) return false;
  if (words < 24 || words > 115) return false;
  if (arabicChars / normalized.length < 0.65) return false;
  if (containsAny(normalized, NAV_TERMS)) return false;
  if (containsAny(normalized, BLOCKED_TERMS)) return false;
  if (containsAny(normalized, NON_CARD_TERMS)) return false;
  if (!/(?:قال|قلت|فقال|سال|فقلت|؟|!|")/.test(normalized)) return false;
  if ((normalized.match(/"/g) ?? []).length % 2 !== 0) return false;
  if (/[A-Za-z]{3,}/.test(normalized)) return false;
  if (scoreCard(text) < 7) return false;
  return true;
}

function tooSimilar(a, b) {
  const first = stableKey(a);
  const second = stableKey(b);
  if (first.includes(second) || second.includes(first)) return true;
  const firstWords = new Set(first.split(/\s+/).filter((word) => word.length > 2));
  const secondWords = new Set(second.split(/\s+/).filter((word) => word.length > 2));
  if (firstWords.size === 0 || secondWords.size === 0) return true;
  let shared = 0;
  for (const word of firstWords) {
    if (secondWords.has(word)) shared++;
  }
  return shared / Math.min(firstWords.size, secondWords.size) > 0.65;
}

function stableKey(text) {
  return normalizeArabic(text)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .slice(0, 180);
}

function stableScore(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function titleFor(index) {
  return `${TITLE_WORDS[index % TITLE_WORDS.length]} ${String(index + 1).padStart(2, "0")}`;
}

function pagesForSource(source) {
  return Array.isArray(source.pages) && source.pages.length ? source.pages : [source.page];
}

function pageUrl(page) {
  return `https://ar.wikisource.org/wiki/${encodeURIComponent(page).replace(/%2F/g, "/")}`;
}

const sourceCounts = [];
const cards = [];
for (const source of SOURCES) {
  const sourcePages = pagesForSource(source);
  let baseCount = 0;
  let selected = 0;
  for (const [pageIndex, page] of sourcePages.entries()) {
    console.log(`fetch ${source.id} ${pageIndex + 1}/${sourcePages.length}: ${page}`);
    const bases = basePieces(await fetchWikisourceText(page));
    baseCount += bases.length;
    for (const [baseIndex, base] of bases.entries()) {
      const candidates = candidateWindows(base)
        .filter(isSafeCard)
        .map((text) => ({
          text,
          source,
          sourcePage: page,
          sourceUrl: page === source.page ? source.sourceUrl : pageUrl(page),
          baseIndex,
          score: scoreCard(text),
        }))
        .sort((a, b) => b.score - a.score || a.text.length - b.text.length || stableScore(a.text) - stableScore(b.text));
      const chosen = [];
      for (const candidate of candidates) {
        if (chosen.some((existing) => tooSimilar(existing.text, candidate.text))) continue;
        cards.push(candidate);
        chosen.push(candidate);
        selected++;
        if (chosen.length >= MAX_CARDS_PER_BASE) break;
      }
    }
    await sleep(1_500);
  }
  sourceCounts.push({ id: source.id, title: source.title, pages: sourcePages.length, bases: baseCount, selected });
}

const seen = new Set();
const deduped = [];
for (const card of cards.sort((a, b) => b.score - a.score || stableScore(a.text) - stableScore(b.text))) {
  const key = stableKey(card.text);
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(card);
}

const selected = deduped.slice(0, TARGET);
const titled = selected.map((card, index) => ({
  id: index + 1,
  pack: Math.floor(index / PACK_SIZE) + 1,
  text: card.text,
  chars: card.text.length,
  title: titleFor(index),
  sourceId: card.source.id,
  sourcePage: card.sourcePage,
  sourceUrl: card.sourceUrl,
  curation: {
    baseIndex: card.baseIndex,
    score: card.score,
    edits: "mechanical cleanup; source chains removed; regional/named-group labels neutralized before safety filtering",
  },
}));

if (titled.length < 70) {
  throw new Error(`Only ${titled.length} safe Arabic cards selected; refusing to publish a too-thin deck.`);
}

mkdirSync(OUT_DIR, { recursive: true });
for (let i = 0; i < Math.ceil(titled.length / PACK_SIZE); i++) {
  const rows = titled.slice(i * PACK_SIZE, (i + 1) * PACK_SIZE);
  writeFileSync(resolve(OUT_DIR, `pack-${String(i + 1).padStart(3, "0")}.json`), `${JSON.stringify(rows, null, 2)}\n`);
}
writeFileSync(resolve(OUT_DIR, "titled.json"), `${JSON.stringify(titled, null, 2)}\n`);
writeFileSync(
  resolve(OUT_DIR, "index.json"),
  `${JSON.stringify(
    {
      total: titled.length,
      packs: Math.ceil(titled.length / PACK_SIZE),
      packSize: PACK_SIZE,
      target: TARGET,
      range: [
        titled.reduce((min, item) => Math.min(min, item.chars), Number.POSITIVE_INFINITY),
        titled.reduce((max, item) => Math.max(max, item.chars), 0),
      ],
      safety: {
        filters:
          "Arabic Wikisource source ledger + religion/politics/violence/adult/protected-class/regional-stereotype blocklists + card length/readability checks.",
        normalization:
          "Diacritics, source chains, old scan markers, and named-group/regional labels are mechanically removed or neutralized before selection.",
      },
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  resolve(OUT_DIR, "sources.json"),
  `${JSON.stringify(
    {
      licenseNote:
        "Underlying works are public-domain by author age. Text was extracted from Arabic Wikisource; keep source URLs and Wikisource CC BY-SA attribution/share-alike notice when publishing outside this app.",
      generatedAt: new Date().toISOString(),
      sourceCounts,
      sources: SOURCES,
      blockedPolicy:
        "Rejected religion, politics/authority, violence/crime, adult/family/sexist setups, alcohol, protected-class or nationality/ethnicity/regional stereotypes, coarse insults, OCR/navigation noise, and non-card commentary.",
    },
    null,
    2,
  )}\n`,
);

console.log(`Arabic classic humor deck ready: ${titled.length} cards`);
console.log(JSON.stringify({ sourceCounts, selected: titled.length }, null, 2));
