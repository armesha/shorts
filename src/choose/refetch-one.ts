// Ручная VISION-починка одного фото деки choose: скачать кандидатов Pexels + собрать сетку для выбора,
// затем скопировать выбранного кандидата в data/choose/photos/<dest>.
//   dump:  node --import tsx src/choose/refetch-one.ts dump "<query>" <prefix>
//   pick:  node --import tsx src/choose/refetch-one.ts pick <prefix> <index> <destFile>
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pexelsSearch } from "../memes/photos.ts";

const SCRATCH = "/tmp/claude-1000/-home-davtian-Documents-shorts/5631f9d6-2d7c-4c5d-90ba-bc47c558902b/scratchpad/choose-cands";
const PHOTOS_DIR = resolve(process.cwd(), "data/choose/photos");

async function dump(query: string, prefix: string) {
  mkdirSync(SCRATCH, { recursive: true });
  const cands = await pexelsSearch(query, { perPage: 8, orientation: "square" });
  const files: string[] = [];
  for (let i = 0; i < cands.length; i++) {
    const r = await fetch(cands[i].imageUrl);
    if (!r.ok) continue;
    const f = resolve(SCRATCH, `${prefix}-${i}.jpg`);
    writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    files.push(f);
    console.log(`${i}: ${cands[i].alt || "(no alt)"} — ${cands[i].pageUrl}`);
  }
  // сетка 4x2 для визуального выбора (индексы идут слева-направо, сверху-вниз)
  const grid = resolve(SCRATCH, `${prefix}-grid.jpg`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-start_number", "0", "-i",
    resolve(SCRATCH, `${prefix}-%d.jpg`), "-vf", "scale=300:300,tile=4x2:margin=8:padding=6:color=white",
    "-frames:v", "1", grid]);
  console.log("grid:", grid);
}

function pick(prefix: string, index: string, destFile: string) {
  copyFileSync(resolve(SCRATCH, `${prefix}-${index}.jpg`), resolve(PHOTOS_DIR, destFile));
  console.log(`copied ${prefix}-${index}.jpg -> data/choose/photos/${destFile}`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "dump") dump(rest[0], rest[1]).catch((e) => { console.error(e); process.exit(1); });
else if (cmd === "pick") pick(rest[0], rest[1], rest[2]);
else { console.error("usage: dump <query> <prefix> | pick <prefix> <index> <destFile>"); process.exit(1); }
