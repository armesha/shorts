// Download ~100 free CC0 avatars (DiceBear) into assets/avatars/. Run: node src/scripts/download-avatars.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(process.cwd(), "assets/avatars");
mkdirSync(DIR, { recursive: true });
// CC0 (public-domain, no attribution) DiceBear styles — colorful & distinct for channel branding.
const STYLES = ["bottts", "shapes", "identicon", "rings", "glass", "thumbs", "fun-emoji"];
const N = 100;
const CONC = 6;

async function one(i) {
  const st = STYLES[(i - 1) % STYLES.length];
  const url = `https://api.dicebear.com/9.x/${st}/png?seed=ava${i}-${st}&size=256`;
  const name = `av-${String(i).padStart(3, "0")}.png`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      const ct = r.headers.get("content-type") || "";
      const buf = Buffer.from(await r.arrayBuffer());
      if (r.ok && ct.includes("png") && buf.length > 2000) {
        writeFileSync(resolve(DIR, name), buf);
        return { name, st, ok: true, size: buf.length };
      }
    } catch {}
    await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
  }
  return { name, st, ok: false };
}

const tasks = Array.from({ length: N }, (_, k) => k + 1);
const results = [];
for (let i = 0; i < tasks.length; i += CONC) {
  results.push(...(await Promise.all(tasks.slice(i, i + CONC).map(one))));
}
const okN = results.filter((r) => r.ok).length;
console.log(`avatars OK: ${okN}/${N} | failed: ${results.filter((r) => !r.ok).map((r) => r.name).join(",") || "none"}`);
