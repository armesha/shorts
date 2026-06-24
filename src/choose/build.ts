// Сборщик деки «Что выберешь?» (id: choose).
// Скачивает реальные бесплатные фото с Pexels (лицензия Pexels: свободно для коммерции, без атрибуции,
// без апскейла — нативное разрешение) в data/choose/photos/, пишет data/choose/cards.json + index.json.
// Запуск: node --import tsx src/choose/build.ts
// Карточка в cards.json = { q, a:{label,desc,photoFile}, b:{label,desc,photoFile} } (вся карточка → JSON в `text`).
import { mkdirSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pexelsSearch } from "../memes/photos.ts";

const DECK_DIR = resolve(process.cwd(), "data/choose");
const PHOTOS_DIR = resolve(DECK_DIR, "photos");
const SOURCES = resolve(PHOTOS_DIR, "sources.jsonl");

interface SideIn { label: string; desc: string; query: string }
interface CardIn { q: string; a: SideIn; b: SideIn }
interface SideOut { label: string; desc: string; photoFile: string }
interface CardOut { q: string; a: SideOut; b: SideOut }

// 10 стартовых дилемм (RU) — классические «комментные» пары под реальные фото Pexels.
const CARDS: CardIn[] = [
  { q: "Кого бы ты завёл?", a: { label: "Кот", desc: "Независимый и чистоплотный, мурлычет на коленях. Гулять не просит.", query: "cute cat portrait" }, b: { label: "Собака", desc: "Преданный друг: встретит и защитит. Но нужны прогулки дважды в день.", query: "happy dog portrait" } },
  { q: "Где отдых мечты?", a: { label: "Море", desc: "Тёплый песок, волны и ничегонеделание под солнцем.", query: "tropical beach turquoise sea" }, b: { label: "Горы", desc: "Чистый воздух, тишина и виды, от которых захватывает дух.", query: "mountain peaks landscape" } },
  { q: "Какое время года твоё?", a: { label: "Лето", desc: "Длинные тёплые дни, море, фрукты и отпуск.", query: "summer sunny beach people" }, b: { label: "Зима", desc: "Снег, уют, горячее какао и Новый год.", query: "winter snow forest" } },
  { q: "Что выберешь по утрам?", a: { label: "Кофе", desc: "Бодрит с первого глотка, аромат на всю кухню.", query: "cup of coffee" }, b: { label: "Чай", desc: "Успокаивает и согревает, можно пить весь день.", query: "cup of tea" } },
  { q: "Что закажешь?", a: { label: "Пицца", desc: "Горячая, сырная, тянущаяся — классика на все времена.", query: "pizza closeup" }, b: { label: "Суши", desc: "Свежо, легко и красиво. Палочки в руки!", query: "sushi set" } },
  { q: "На чём отправишься в путешествие?", a: { label: "Самолёт", desc: "Быстро — и ты уже на другом конце света.", query: "airplane wing sky" }, b: { label: "Поезд", desc: "Медленнее, зато виды за окном и романтика дороги.", query: "train railway journey" } },
  { q: "Где бы ты жил?", a: { label: "Город", desc: "Огни, работа, всё рядом и жизнь кипит круглые сутки.", query: "city skyline night" }, b: { label: "Деревня", desc: "Тишина, свой дом и природа прямо за окном.", query: "countryside cottage nature" } },
  { q: "Что выберешь?", a: { label: "Золото", desc: "Тёплый блеск, проверенная веками ценность.", query: "gold bars" }, b: { label: "Бриллианты", desc: "Холодный огонь и редкость в каждой грани.", query: "diamond gemstone" } },
  { q: "Книга или фильм?", a: { label: "Книга", desc: "Свой мир в голове: детали, воображение и тишина.", query: "open book reading cozy" }, b: { label: "Фильм", desc: "Картинка, музыка и эмоции всего за пару часов.", query: "cinema popcorn movie screen" } },
  { q: "Ты за сладкое или солёное?", a: { label: "Сладкое", desc: "Десерты, шоколад и торт — праздник на языке.", query: "chocolate dessert cake" }, b: { label: "Солёное", desc: "Чипсы, сыр и снеки — солёный хруст без остановки.", query: "salty snacks chips" } },
];

async function fetchPhoto(query: string, outFile: string, cardKey: string): Promise<string> {
  const dest = resolve(PHOTOS_DIR, outFile);
  const cands = await pexelsSearch(query, { perPage: 12, orientation: "square" });
  if (!cands.length) throw new Error(`Pexels: пусто по запросу "${query}"`);
  for (const p of cands) {
    try {
      const r = await fetch(p.imageUrl);
      if (!r.ok) continue;
      writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      appendFileSync(
        SOURCES,
        JSON.stringify({ file: outFile, query, pexelsId: p.id, pageUrl: p.pageUrl, photographer: p.photographer, license: "Pexels License", cardKey }) + "\n",
      );
      return outFile;
    } catch {
      /* следующий кандидат */
    }
  }
  throw new Error(`Pexels: не удалось скачать фото по "${query}"`);
}

async function main(): Promise<void> {
  mkdirSync(PHOTOS_DIR, { recursive: true });
  const out: CardOut[] = [];
  for (let i = 0; i < CARDS.length; i++) {
    const c = CARDS[i];
    const n = String(i + 1).padStart(2, "0");
    const aFile = `choose-${n}-a.jpg`;
    const bFile = `choose-${n}-b.jpg`;
    process.stdout.write(`[${i + 1}/${CARDS.length}] ${c.a.label} / ${c.b.label} — фото…\n`);
    const force = process.argv.includes("--refetch");
    if (force || !existsSync(resolve(PHOTOS_DIR, aFile))) await fetchPhoto(c.a.query, aFile, `choose-${n}-a`);
    if (force || !existsSync(resolve(PHOTOS_DIR, bFile))) await fetchPhoto(c.b.query, bFile, `choose-${n}-b`);
    out.push({
      q: c.q,
      a: { label: c.a.label, desc: c.a.desc, photoFile: aFile },
      b: { label: c.b.label, desc: c.b.desc, photoFile: bFile },
    });
  }
  writeFileSync(resolve(DECK_DIR, "cards.json"), JSON.stringify(out, null, 2));
  writeFileSync(
    resolve(DECK_DIR, "index.json"),
    JSON.stringify({ total: out.length, packs: 1, packSize: 1000, range: [1, 1] }, null, 2),
  );
  process.stdout.write(`\nГотово: ${out.length} карточек → ${resolve(DECK_DIR, "cards.json")}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
