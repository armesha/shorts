import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const downloader =
  process.env.VIDEO_CUTTING_YTDLP ||
  (existsSync(".venv-cutting/bin/yt-dlp")
    ? resolve(".venv-cutting/bin/yt-dlp")
    : "yt-dlp");
const checks = [
  ["downloader", downloader, ["--version"]],
  ["encoder", process.env.VIDEO_CUTTING_FFMPEG || "ffmpeg", ["-version"]],
  ["probe", process.env.VIDEO_CUTTING_FFPROBE || "ffprobe", ["-version"]],
  [
    "local session",
    process.env.VIDEO_CUTTING_CODEX || "codex",
    ["login", "status"],
  ],
  ["JavaScript runtime", "node", ["--version"]],
];
let failed = false;
for (const [label, bin, args] of checks) {
  const result = spawnSync(bin, args, { encoding: "utf8", timeout: 15_000 });
  const ok = result.status === 0;
  console.log(`${label}: ${ok ? "ready" : "unavailable"}`);
  if (!ok) failed = true;
}
process.exitCode = failed ? 1 : 0;
