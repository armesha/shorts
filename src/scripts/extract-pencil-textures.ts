import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

// Pencil's AI-generated textures are cached in Chromium's HTTP cache. Carve embedded
// JPEG/PNG/WebP blobs out of the cache files (they sit inside a cache wrapper).
const HOME = process.env.HOME!;
const DIRS = [join(HOME, ".config/Pencil")];
const OUT = "/tmp/pencil-extract";
mkdirSync(OUT, { recursive: true });

const JPG_SOI = Buffer.from([0xff, 0xd8, 0xff]);
const JPG_EOI = Buffer.from([0xff, 0xd9]);
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_END = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

let n = 0;
function carve(buf: Buffer) {
  // JPEG
  let i = 0;
  while ((i = buf.indexOf(JPG_SOI, i)) !== -1) {
    const end = buf.indexOf(JPG_EOI, i + 3);
    if (end !== -1 && end - i > 25_000) {
      writeFileSync(resolve(OUT, `img-${n++}.jpg`), buf.subarray(i, end + 2));
      i = end + 2;
    } else i += 3;
  }
  // PNG
  i = 0;
  while ((i = buf.indexOf(PNG_SIG, i)) !== -1) {
    const end = buf.indexOf(PNG_END, i + 8);
    if (end !== -1 && end - i > 25_000) {
      writeFileSync(resolve(OUT, `img-${n++}.png`), buf.subarray(i, end + 8));
      i = end + 8;
    } else i += 8;
  }
  // WebP (RIFF....WEBP, size is little-endian at offset 4)
  const RIFF = Buffer.from("RIFF");
  const WEBP = Buffer.from("WEBP");
  i = 0;
  while ((i = buf.indexOf(RIFF, i)) !== -1) {
    if (i + 12 <= buf.length && buf.subarray(i + 8, i + 12).equals(WEBP)) {
      const total = 8 + buf.readUInt32LE(i + 4);
      if (total > 25_000 && i + total <= buf.length) {
        writeFileSync(resolve(OUT, `img-${n++}.webp`), buf.subarray(i, i + total));
        i += total;
        continue;
      }
    }
    i += 4;
  }
}

function walk(dir: string) {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p);
    else if (st.size > 25_000) {
      try {
        carve(readFileSync(p));
      } catch {
        /* skip */
      }
    }
  }
}

for (const d of DIRS) walk(d);
console.log(`carved ${n} image candidates into ${OUT}`);
