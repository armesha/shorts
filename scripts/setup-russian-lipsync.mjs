import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const runtimeDir = resolve(root, "data/audio-lipsync/runtime");
const binDir = resolve(runtimeDir, "bin");
const micromamba = resolve(binDir, "micromamba");
const mambaRoot = resolve(runtimeDir, "mamba-root");
const envDir = resolve(runtimeDir, "env");
const mfa = resolve(envDir, "bin/mfa");
const mfaRoot = resolve(runtimeDir, "mfa-root");
const micromambaUrl = "https://github.com/mamba-org/micromamba-releases/releases/download/2.8.1-0/micromamba-linux-64";
const micromambaSha256 = "9689782d863c05a1bf5d2d371ba527104e7a4eb4310c1637d8653b751aed9c82";

if (process.platform !== "linux" || process.arch !== "x64") {
  throw new Error("Автоматическая установка MFA подготовлена для Linux x64.");
}

await mkdir(binDir, { recursive: true });
if (!existsSync(micromamba)) {
  process.stdout.write("[mfa] download micromamba\n");
  const response = await fetch(micromambaUrl);
  if (!response.ok) throw new Error(`Не удалось скачать micromamba: HTTP ${response.status}`);
  const binary = Buffer.from(await response.arrayBuffer());
  const checksum = createHash("sha256").update(binary).digest("hex");
  if (checksum !== micromambaSha256) throw new Error(`Неверная контрольная сумма micromamba: ${checksum}`);
  await writeFile(micromamba, binary);
  await chmod(micromamba, 0o755);
}

if (!existsSync(mfa)) {
  process.stdout.write("[mfa] install Montreal Forced Aligner 3.4.0\n");
  await run(
    micromamba,
    ["create", "-y", "-p", envDir, "-c", "conda-forge", "montreal-forced-aligner=3.4.0"],
    { MAMBA_ROOT_PREFIX: mambaRoot },
  );
}

const mfaEnv = {
  PATH: `${resolve(envDir, "bin")}:${process.env.PATH ?? ""}`,
  MFA_ROOT_DIR: mfaRoot,
};
await run(mfa, ["model", "download", "acoustic", "russian_mfa", "--version", "3.1.0"], mfaEnv);
await run(mfa, ["model", "download", "dictionary", "russian_mfa", "--version", "3.1.0"], mfaEnv);
await run(mfa, ["version"], mfaEnv);

const acoustic = resolve(mfaRoot, "pretrained_models/acoustic/russian_mfa.zip");
const dictionary = resolve(mfaRoot, "pretrained_models/dictionary/russian_mfa.dict");
if (!existsSync(acoustic) || !existsSync(dictionary)) throw new Error("Русские модели MFA не появились после установки.");
const dictionaryBytes = (await readFile(dictionary)).length;
await rm(mambaRoot, { recursive: true, force: true });
process.stdout.write(`[mfa] ready; dictionary=${dictionaryBytes} bytes\n`);

function run(command, args, extraEnv = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
    });
    child.once("error", rejectPromise);
    child.once("close", (code, signal) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} завершился с кодом ${code ?? signal ?? "unknown"}`));
    });
  });
}
