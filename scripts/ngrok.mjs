// Stable public tunnel via ngrok (free static domain → the URL never changes; works for YouTube OAuth).
// Needs NGROK_AUTHTOKEN + NGROK_DOMAIN in .env. Downloads the ngrok binary on first run.
import { existsSync, mkdirSync, chmodSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { arch, platform } from "node:os";

try {
  process.loadEnvFile(resolve(process.cwd(), ".env"));
} catch {
  /* no .env — rely on the process environment */
}

const TOKEN = (process.env.NGROK_AUTHTOKEN ?? "").trim();
const DOMAIN = (process.env.NGROK_DOMAIN ?? "").trim().replace(/^https?:\/\//, "");
const PORT = process.env.PORT ?? "8080";
if (!TOKEN || !DOMAIN) {
  console.error(
    "[ngrok] Нужны NGROK_AUTHTOKEN и NGROK_DOMAIN в .env:\n" +
      "  1) ngrok.com → «Your Authtoken» → в NGROK_AUTHTOKEN\n" +
      "  2) ngrok dashboard → Domains → создать бесплатный домен → в NGROK_DOMAIN (без https://)",
  );
  process.exit(1);
}

const CACHE = resolve(process.cwd(), "node_modules/.cache/ngrok");
const isWin = platform() === "win32";
const binPath = resolve(CACHE, isWin ? "ngrok.exe" : "ngrok");

async function ensureBin() {
  if (existsSync(binPath)) return binPath;
  mkdirSync(CACHE, { recursive: true });
  const a = arch() === "arm64" ? "arm64" : "amd64";
  const os = platform() === "darwin" ? "darwin" : isWin ? "windows" : "linux";
  const ext = isWin ? "zip" : "tgz";
  const url = `https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-${os}-${a}.${ext}`;
  console.log(`[ngrok] качаю ngrok (${os}-${a})…`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`скачивание ngrok не удалось: HTTP ${res.status}`);
  const dl = resolve(CACHE, `ngrok.${ext}`);
  writeFileSync(dl, Buffer.from(await res.arrayBuffer()));
  const [cmd, ...args] = isWin
    ? ["powershell", "-NoProfile", "-Command", `Expand-Archive -Force '${dl}' '${CACHE}'`]
    : ["tar", "-xzf", dl, "-C", CACHE];
  await new Promise((ok, no) =>
    spawn(cmd, args, { stdio: "inherit" }).on("exit", (c) => (c === 0 ? ok() : no(new Error("extract failed")))),
  );
  if (!isWin) chmodSync(binPath, 0o755);
  return binPath;
}

const bin = await ensureBin();
console.log(`[ngrok] поднимаю стабильный туннель https://${DOMAIN} → localhost:${PORT}`);
const ng = spawn(bin, ["http", `--url=${DOMAIN}`, PORT, "--log=stdout", "--log-format=logfmt"], {
  env: { ...process.env, NGROK_AUTHTOKEN: TOKEN },
  stdio: ["ignore", "pipe", "pipe"],
});
let shown = false;
const scan = (d) => {
  const s = d.toString();
  process.stdout.write(s);
  if (!shown && /started tunnel|url=https/i.test(s)) {
    shown = true;
    const line = "═".repeat(58);
    console.log(`\n${line}\n  СТАБИЛЬНАЯ ССЫЛКА (не меняется — кидай друзьям):\n  https://${DOMAIN}\n${line}\n`);
  }
};
ng.stdout.on("data", scan);
ng.stderr.on("data", scan);
ng.on("exit", (c) => process.exit(c ?? 0));
process.on("SIGINT", () => ng.kill("SIGINT"));
process.on("SIGTERM", () => ng.kill("SIGTERM"));
