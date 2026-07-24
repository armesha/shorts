import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type CircleConfig = Record<string, unknown>;

const DEFAULT_CONFIG: CircleConfig = {
  version: 1,
  templateId: "default",
  templateName: "Telegram-кружочки",
  video: {
    width: 1080,
    height: 1920,
    circleLeft: 130,
    circleTop: 300,
    circleDiameter: 820,
    engagement: {
      left: 90,
      top: 92,
      width: 900,
      labelFontSize: 30,
      puzzleFontSize: 68,
      lineGap: 14,
    },
    banner: {
      enabled: false,
      advertiserId: "",
      file: "",
      transparent: true,
      left: 90,
      top: 830,
      width: 900,
      height: 260,
      startSeconds: 0,
      repeatEverySeconds: 0,
    },
  },
};

export function circleProjectDir(): string {
  return resolve(process.cwd(), process.env.TG_CIRCLES_DIR?.trim() || "data/telegram-circles");
}

export function circleConfigFile(): string {
  return resolve(circleProjectDir(), "config.json");
}

export function ensureCircleWorkspace(): string {
  const root = circleProjectDir();
  for (const relative of ["banner", "downloads", "gameplay", "output", ".runtime"]) {
    mkdirSync(resolve(root, relative), { recursive: true });
  }
  const config = circleConfigFile();
  if (!existsSync(config)) {
    try {
      writeFileSync(config, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if (!existsSync(config)) throw error;
    }
  }
  return root;
}

export function readCircleConfig(): CircleConfig {
  ensureCircleWorkspace();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(circleConfigFile(), "utf8"));
  } catch {
    throw new Error("Конфигурация редактора Telegram-кружочков повреждена.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Конфигурация редактора Telegram-кружочков повреждена.");
  }
  return parsed as CircleConfig;
}

export async function writeCircleConfig(config: CircleConfig): Promise<void> {
  const file = circleConfigFile();
  const temporary = `${file}.${process.pid}.tmp`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}
