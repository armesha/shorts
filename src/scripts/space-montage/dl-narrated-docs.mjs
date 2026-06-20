// Merge ScienceCasts + narrated astronomy lists, drop talking-head/panel formats, download medium mp4 + srt.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const ROOT = "/home/davtian/Documents/shorts";
const DOC = `${ROOT}/temp/space-build/doc`;
fs.mkdirSync(DOC, { recursive: true });
const a = JSON.parse(fs.readFileSync("/tmp/sciencecasts.json", "utf8"));
const b = JSON.parse(fs.readFileSync("/tmp/narrated.json", "utf8"));
const seen = new Map();
for (const v of [...a, ...b]) if (!seen.has(v.nasa_id)) seen.set(v.nasa_id, v);
// drop pure talking-head / panel / broadcast / podcast formats (we want narration over footage)
const DROP = /we asked|science live|news conference|gravity assist|tom joyner|surprisingly stem|videofile|official broadcast|team reacts|b-roll|expedition|osiris-rex observes a black hole/i;
let list = [...seen.values()].filter((v) => !DROP.test(v.title));
console.log(`candidates after filter: ${list.length}`);
const safeId = (id) => id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40);
const enc = (u) => encodeURI(u.replace(/^http:/, "https:"));
function head200(u) { try { const o = execFileSync("curl", ["-sIL", "--max-time", "20", u], { encoding: "utf8" }); return /HTTP\/[\d.]+ 200/.test(o.split("\n").reverse().find((l) => /HTTP/.test(l)) || ""); } catch { return false; } }

const out = [];
async function dl(v) {
  const id = safeId(v.nasa_id);
  const med = v.mp4.replace(/~orig\.mp4/i, "~medium.mp4").replace(/~large\.mp4/i, "~medium.mp4");
  const url = (med !== v.mp4 && head200(med)) ? med : v.mp4;
  try {
    execFileSync("curl", ["-sS", "-L", "--max-time", "240", "-o", `${DOC}/${id}.mp4`, enc(url)], { stdio: "ignore" });
    execFileSync("curl", ["-sS", "-L", "--max-time", "60", "-o", `${DOC}/${id}.srt`, enc(v.srt)], { stdio: "ignore" });
  } catch { return; }
  const sz = fs.existsSync(`${DOC}/${id}.mp4`) ? fs.statSync(`${DOC}/${id}.mp4`).size : 0;
  if (sz < 200000) return;
  let dur = 0; try { dur = Math.round(parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", `${DOC}/${id}.mp4`]).toString().trim()) || 0); } catch {}
  out.push({ id, nasa_id: v.nasa_id, title: v.title, file: `${id}.mp4`, srt: `${id}.srt`, dur, mb: +(sz / 1048576).toFixed(0) });
  console.log(`OK ${id.padEnd(34)} ${dur}s ${out[out.length - 1].mb}MB`);
}
const CONC = 4, q = [...list]; let active = 0;
await new Promise((done) => { const tick = () => { if (!q.length && active === 0) return done(); while (active < CONC && q.length) { const v = q.shift(); active++; dl(v).finally(() => { active--; tick(); }); } }; tick(); });
fs.writeFileSync("/tmp/doc-sources.json", JSON.stringify(out, null, 2));
console.log(`\nDONE: ${out.length} narrated sources in temp/space-build/doc/`);
