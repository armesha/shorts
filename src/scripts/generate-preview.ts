import { resolve } from "node:path";
import { generateShort } from "../llm.ts";
import { renderToImage } from "../render.ts";

// Full pipeline proof: Claude Code (headless) -> validated JSON -> rendered 1080x1920 image.
const theme = process.argv[2] ?? "Psychologische Fakten";
const lang = process.argv[3] ?? "de";
const channel = process.argv[4] ?? "Liebe mein Leben";

console.log(`Generating with Claude Code headless: theme="${theme}" lang=${lang} ...`);
const t0 = Date.now();
const gen = await generateShort({ theme, lang, count: 6 });
console.log(`Generated in ${((Date.now() - t0) / 1000).toFixed(1)}s:\n`);
console.log(JSON.stringify(gen, null, 2));

const out = resolve(process.cwd(), "data/output/generated.png");
await renderToImage({ title: gen.title, facts: gen.facts, channel, lang }, out);
console.log("\nRendered ->", out);
