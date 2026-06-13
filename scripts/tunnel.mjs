// Free public tunnel via cloudflared (no account, no domain). Downloads the binary on first run
// into node_modules/.cache (gitignored), then exposes the local server and prints the public URL.
import { existsSync, mkdirSync, chmodSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { arch, platform } from "node:os";

const CACHE = resolve(process.cwd(), "node_modules/.cache/cloudflared");
const PORT = process.env.PORT ?? "8080";
const TARGET = `http://localhost:${PORT}`;

function asset() {
  const a = arch() === "arm64" ? "arm64" : "amd64";
  if (platform() === "linux") return { file: `cloudflared-linux-${a}`, bin: "cloudflared", tgz: false };
  if (platform() === "win32") return { file: "cloudflared-windows-amd64.exe", bin: "cloudflared.exe", tgz: false };
  if (platform() === "darwin") return { file: `cloudflared-darwin-${a}.tgz`, bin: "cloudflared", tgz: true };
  throw new Error("Платформа без авто-установки: " + platform() + " — поставь cloudflared вручную.");
}

async function ensureBin() {
  const { file, bin, tgz } = asset();
  const binPath = resolve(CACHE, bin);
  if (existsSync(binPath)) return binPath;
  mkdirSync(CACHE, { recursive: true });
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${file}`;
  console.log(`[tunnel] качаю cloudflared (${file})…`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Не удалось скачать cloudflared: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (tgz) {
    const dl = resolve(CACHE, file);
    writeFileSync(dl, buf);
    await new Promise((ok, no) =>
      spawn("tar", ["-xzf", dl, "-C", CACHE], { stdio: "inherit" }).on("exit", (c) =>
        c === 0 ? ok() : no(new Error("tar failed")),
      ),
    );
  } else {
    writeFileSync(binPath, buf); // direct binary → save under the expected name
  }
  chmodSync(binPath, 0o755);
  return binPath;
}

const bin = await ensureBin();
console.log(`[tunnel] поднимаю туннель на ${TARGET} …`);
const cf = spawn(bin, ["tunnel", "--url", TARGET, "--no-autoupdate"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let shown = false;
const scan = (d) => {
  const s = d.toString();
  process.stdout.write(s);
  const m = s.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !shown) {
    shown = true;
    const line = "═".repeat(58);
    console.log(`\n${line}\n  ПУБЛИЧНАЯ ССЫЛКА (кидай друзьям):\n  ${m[0]}\n${line}\n`);
  }
};
cf.stdout.on("data", scan);
cf.stderr.on("data", scan);
cf.on("exit", (c) => process.exit(c ?? 0));
process.on("SIGINT", () => cf.kill("SIGINT"));
process.on("SIGTERM", () => cf.kill("SIGTERM"));
