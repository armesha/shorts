// Качает woff2 шрифтов редактора локально → web/public/template-editor/fonts/ + fonts.css + fonts.json.
// Делает рендер/редактор офлайн-устойчивыми (не зависят от Google Fonts CDN).
// Запуск: node src/scripts/fetch-template-fonts.mjs
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve("web/public/template-editor/fonts");
const CSS_OUT = resolve("web/public/template-editor/fonts.css");
const MANIFEST_OUT = resolve("web/public/template-editor/fonts.json");
const KEEP = new Set(["latin", "latin-ext", "cyrillic", "cyrillic-ext"]); // EN + DE/FR/IT + RU
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149 Safari/537.36";
const CSS_URL =
  "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Bitter:wght@400;700&family=Caveat:wght@400;700&family=Comfortaa:wght@400;700&family=Cormorant+Garamond:wght@400;700&family=Dancing+Script:wght@400;700&family=EB+Garamond:wght@400;700&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&family=Kolker+Brush&family=Lato:wght@400;700&family=Libre+Baskerville:wght@400;700&family=Linden+Hill&family=Lobster&family=Lora:wght@400;700&family=Merriweather:wght@400;700&family=Montserrat:wght@400;500;600;700;800&family=Nunito:wght@400;500;600;700;800&family=Open+Sans:wght@400;700&family=Oswald:wght@400;700&family=Pacifico&family=Playfair+Display:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700;800&family=PT+Serif:wght@400;700&family=Raleway:wght@400;500;600;700;800&family=Roboto:wght@400;500;600;700;800&family=Roboto+Mono:wght@400;700&family=Source+Serif+4:wght@400;700&family=Work+Sans:wght@400;500;600;700;800&display=swap";

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const css = await fetch(CSS_URL, { headers: { "User-Agent": UA } }).then((r) => r.text());

  // распарсить блоки «/* subset */ @font-face { ... }»
  const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  const blocks = [];
  let m;
  while ((m = re.exec(css))) {
    const subset = m[1];
    if (!KEEP.has(subset)) continue;
    const body = m[2];
    const family = (body.match(/font-family:\s*'([^']+)'/) || [])[1];
    const weight = (body.match(/font-weight:\s*(\d+)/) || [])[1] || "400";
    const style = (body.match(/font-style:\s*(\w+)/) || [])[1] || "normal";
    const url = (body.match(/src:\s*url\(([^)]+)\)/) || [])[1];
    const range = (body.match(/unicode-range:\s*([^;]+);/) || [])[1];
    if (!family || !url) continue;
    blocks.push({ subset, family, weight, style, url, range });
  }
  console.log(`@font-face блоков (latin/cyrillic): ${blocks.length}`);

  // скачать (пул на 8), записать файлы
  const manifest = [];
  let done = 0;
  const POOL = 8;
  for (let i = 0; i < blocks.length; i += POOL) {
    await Promise.all(
      blocks.slice(i, i + POOL).map(async (b) => {
        const file = `${slug(b.family)}-${b.weight}-${b.style}-${b.subset}.woff2`;
        const dest = resolve(OUT_DIR, file);
        if (!existsSync(dest)) {
          const buf = Buffer.from(await fetch(b.url, { headers: { "User-Agent": UA } }).then((r) => r.arrayBuffer()));
          await writeFile(dest, buf);
        }
        b.file = file;
        manifest.push({ family: b.family, weight: +b.weight, style: b.style, subset: b.subset, file, range: b.range });
        done++;
      }),
    );
    process.stdout.write(`\r  скачано ${done}/${blocks.length}`);
  }
  process.stdout.write("\n");

  // fonts.css — локальные @font-face (относительные url + unicode-range)
  const cssOut = blocks
    .map(
      (b) =>
        `/* ${b.subset} */\n@font-face{font-family:'${b.family}';font-style:${b.style};font-weight:${b.weight};font-display:swap;src:url(fonts/${b.file}) format('woff2');unicode-range:${b.range};}`,
    )
    .join("\n");
  await writeFile(CSS_OUT, cssOut + "\n");
  await writeFile(MANIFEST_OUT, JSON.stringify(manifest, null, 0) + "\n");

  const fams = [...new Set(manifest.map((x) => x.family))].sort();
  console.log(`семейств: ${fams.length}, файлов: ${manifest.length}`);
  console.log(`→ ${CSS_OUT}\n→ ${MANIFEST_OUT}\n→ ${OUT_DIR}/`);
}
main();
