import { randomUUID } from "node:crypto";
import { basename, dirname, extname, resolve } from "node:path";
import { copyFile, mkdir, rm, stat, writeFile } from "node:fs/promises";
import {
  circleAdvertiserState,
  circleProjectDir,
  upsertCircleAdvertiser,
} from "../server/services/circle-advertisers.ts";
import { setActiveCircleTemplateAdvertiser } from "../server/services/circle-templates.ts";

function argument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || "") : fallback;
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const positionalSource = process.argv.slice(2).find((value) => !value.startsWith("--")) || "";
const sourceArg = argument("source", positionalSource);
const id = argument("id");
const name = argument("name", "Yuki · баннер");
const activate = process.argv.includes("--activate");
const transparent = !process.argv.includes("--chroma-key");
const fullFrameMode = process.argv.includes("--full-frame") ? "canvas" : "banner";

if (!sourceArg || !id) {
  fail(
    "Использование: npm run circle:banner:install -- --source <banner.mov> --id <id> "
      + "[--name <название>] [--activate] [--full-frame] [--chroma-key]",
  );
} else if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) {
  fail("ID баннера должен содержать только строчные латинские буквы, цифры, дефис и подчёркивание.");
} else {
  const source = resolve(process.cwd(), sourceArg);
  const sourceInfo = await stat(source).catch(() => null);
  if (!sourceInfo?.isFile()) {
    fail(`Файл баннера не найден: ${source}`);
  } else {
    const extension = extname(source).toLowerCase();
    if (![".mov", ".mp4", ".webm", ".mkv"].includes(extension)) {
      fail("Поддерживаются MOV, MP4, WebM и MKV.");
    } else {
      const root = circleProjectDir();
      const uploadDir = resolve(root, "banner", ".uploads");
      const temporary = resolve(uploadDir, `${id}-${randomUUID()}.upload`);
      await mkdir(uploadDir, { recursive: true });
      try {
        await copyFile(source, temporary);
        const advertiser = await upsertCircleAdvertiser(
          {
            id,
            name,
            brand: "Yuki",
            transparent,
            fullFrameMode,
          },
          { path: temporary, sourceName: basename(source) },
        );
        if (activate) await setActiveCircleTemplateAdvertiser(advertiser.id, true);

        const assetExtension = extname(advertiser.assetFile);
        const provenanceFile = resolve(
          root,
          "banner",
          `${advertiser.assetFile.slice(0, -assetExtension.length)}.provenance.json`,
        );
        await mkdir(dirname(provenanceFile), { recursive: true });
        await writeFile(
          provenanceFile,
          `${JSON.stringify({
            asset: basename(advertiser.assetFile),
            source: `Пользовательский файл ${basename(source)}`,
            usageBasis: "Пользователь предоставил файл и явно попросил использовать его как баннер Yuki для Telegram-кружков.",
            recordedAt: new Date().toISOString(),
          }, null, 2)}\n`,
          "utf8",
        );

        const state = circleAdvertiserState();
        console.log(JSON.stringify({
          installed: advertiser.id,
          assetFile: advertiser.assetFile,
          activeAdvertiserId: state.activeAdvertiserId,
          bannerEnabled: state.bannerEnabled,
          total: state.advertisers.length,
        }, null, 2));
      } finally {
        await rm(temporary, { force: true });
      }
    }
  }
}
