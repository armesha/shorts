import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

function projectDir(): string {
  return resolve(process.cwd(), process.env.TG_CIRCLES_DIR?.trim() || "../tg circles");
}

export function telegramCircleTemplateName(): string {
  try {
    const config = JSON.parse(readFileSync(resolve(projectDir(), "config.json"), "utf8")) as { templateName?: unknown };
    const name = typeof config.templateName === "string" ? config.templateName.trim().slice(0, 80) : "";
    return name || "Telegram-кружочки";
  } catch {
    return "Telegram-кружочки";
  }
}

function run(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout = (stdout + chunk).slice(-20_000); });
    child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-20_000); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(stderr.split(/\r?\n/).filter(Boolean).slice(-12).join(" ") || `Генератор кружочков завершился с кодом ${code}`));
    });
  });
}

export async function generateTelegramCircleVideo(outputRoot: string, stamp: string): Promise<{
  videoRel: string;
  source: string;
  gameplayFile: string;
}> {
  const root = projectDir();
  const tsx = resolve(root, "node_modules/tsx/dist/cli.mjs");
  if (!existsSync(tsx)) throw new Error(`Не установлен проект Telegram-кружочков: ${root}`);
  const stdout = await run(process.execPath, [tsx, "src/render-telegram-cli.ts"], root);
  const line = stdout.split(/\r?\n/).reverse().find((value) => value.trim().startsWith("{"));
  if (!line) throw new Error("Генератор кружочков не вернул результат.");
  const result = JSON.parse(line) as { file?: string; source?: string; gameplayFile?: string };
  const sourceFile = result.file ? resolve(result.file) : "";
  if (!sourceFile || !existsSync(sourceFile)) throw new Error("Генератор кружочков завершился без итогового MP4.");

  const videoRel = `preview/telegram-circle-${stamp}.mp4`;
  const target = resolve(outputRoot, videoRel);
  await mkdir(dirname(target), { recursive: true });
  try {
    await copyFile(sourceFile, target);
  } finally {
    await rm(sourceFile, { force: true });
    await rm(`${sourceFile}.json`, { force: true });
  }
  return {
    videoRel,
    source: result.source || basename(sourceFile),
    gameplayFile: result.gameplayFile || "",
  };
}
