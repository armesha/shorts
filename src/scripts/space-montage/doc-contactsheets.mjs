import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
const ROOT = "/home/davtian/Documents/shorts";
const DOC = `${ROOT}/temp/space-build/doc`;
const CS = "/tmp/doc-cs"; const SRTD = "/tmp/doc-srt";
fs.rmSync(CS, { recursive: true, force: true }); fs.rmSync(SRTD, { recursive: true, force: true });
fs.mkdirSync(CS, { recursive: true }); fs.mkdirSync(SRTD, { recursive: true });
const srcs = JSON.parse(fs.readFileSync("/tmp/doc-sources.json", "utf8"));
const ffprobeDur = (f) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", f]).toString().trim()) || 0;
function srtTime(t) { const m = t.match(/(\d+):(\d+):(\d+)[,.](\d+)/); return m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) : 0; }
function srtSummary(file) {
  const txt = fs.readFileSync(file, "utf8").replace(/\r/g, ""); const lines = [];
  for (const blk of txt.split(/\n\n+/)) {
    const ls = blk.split("\n").filter(Boolean); const ti = ls.findIndex((l) => l.includes("-->")); if (ti < 0) continue;
    const start = Math.round(srtTime(ls[ti].split("-->")[0]));
    const text = ls.slice(ti + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (text) lines.push(`[${start}s] ${text}`);
  }
  return lines.join("\n");
}
for (const s of srcs) {
  const f = `${DOC}/${s.file}`; if (!fs.existsSync(f)) continue;
  const dur = ffprobeDur(f);
  // frames every ~12s, labeled with timecode
  const tmp = `/tmp/_cells_${s.id}`; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  let k = 0;
  for (let t = 4; t < dur - 2; t += 12) {
    spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", f, "-frames:v", "1", "-vf",
      `scale=238:134:force_original_aspect_ratio=decrease,pad=240:135:(ow-iw)/2:(oh-ih)/2,drawtext=text='${Math.round(t)}s':x=4:y=3:fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.8`,
      `${tmp}/${String(k).padStart(3, "0")}.jpg`]);
    k++;
  }
  const cols = 6;
  spawnSync("ffmpeg", ["-v", "error", "-y", "-pattern_type", "glob", "-i", `${tmp}/*.jpg`, "-filter_complex", `tile=${cols}x${Math.ceil(k / cols)}:margin=4:padding=4:color=black`, "-frames:v", "1", `${CS}/${s.id}.jpg`]);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.writeFileSync(`${SRTD}/${s.id}.txt`, srtSummary(`${DOC}/${s.srt}`));
}
console.log(`contact sheets: ${fs.readdirSync(CS).length}, srt summaries: ${fs.readdirSync(SRTD).length}`);
