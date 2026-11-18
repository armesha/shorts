import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { circleAdvertiserSource, listCircleAdvertisers } from "./circle-advertisers.ts";

export const GTA6_BANNERS = ["shortrobot", "simka"] as const;
export const GTA6_BANNER_AREA = { left: 130, top: 1270, width: 820, height: 244 };
export type Gta6Banner = (typeof GTA6_BANNERS)[number];
export type Gta6LibraryClip = { id: string; title: string; createdAt: string; published: boolean };

export const GTA6_CLIP_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;

function isMissing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

export function gta6LibraryBanners(root: string) {
  const shortrobot = listCircleAdvertisers().find((banner) => banner.id === "shortrobot-banner");
  if (!shortrobot) throw new Error("Баннер Shortrobot не найден.");
  return {
    shortrobot: { item: shortrobot, file: circleAdvertiserSource(shortrobot.id) },
    simka: {
      item: { fullFrame: false, transparent: true },
      file: resolve(root, "banners", "simka-vpn-banner.mp4"),
    },
  };
}

export class Gta6Library {
  constructor(private readonly directory: string) {}

  async add(title: string, render: (banner: Gta6Banner, file: string) => Promise<void>) {
    const id = randomUUID();
    const temp = resolve(this.directory, `.pending-${id}`);
    await mkdir(temp, { recursive: true });
    try {
      for (const banner of GTA6_BANNERS) await render(banner, resolve(temp, `${banner}.mp4`));
      await writeFile(resolve(temp, "clip.json"), JSON.stringify({ title, createdAt: new Date().toISOString() }));
      await rename(temp, resolve(this.directory, id));
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }

  async list(): Promise<Gta6LibraryClip[]> {
    const entries = await readdir(this.directory, { withFileTypes: true }).catch((error) => {
      if (isMissing(error)) return [];
      throw error;
    });
    const clips = await Promise.all(entries.filter((entry) => entry.isDirectory() && GTA6_CLIP_ID.test(entry.name))
      .map(async ({ name: id }) => {
        const dir = resolve(this.directory, id);
        try {
          const meta = JSON.parse(await readFile(resolve(dir, "clip.json"), "utf8")) as Pick<Gta6LibraryClip, "title" | "createdAt">;
          const published = await access(resolve(dir, "published")).then(() => true, (error) => {
            if (isMissing(error)) return false;
            throw error;
          });
          return { id, ...meta, published };
        } catch (error) {
          if (isMissing(error)) return null;
          throw error;
        }
      }));
    return clips.filter((clip) => clip !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  file(id: string, banner: Gta6Banner) {
    return resolve(this.clipDir(id), `${banner}.mp4`);
  }

  async setPublished(id: string, published: boolean) {
    const marker = resolve(this.clipDir(id), "published");
    try {
      if (published) await writeFile(marker, "");
      else {
        await access(resolve(this.clipDir(id), "clip.json"));
        await rm(marker, { force: true });
      }
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  async remove(id: string) {
    const trash = resolve(this.directory, `.deleted-${id}`);
    try {
      await rename(this.clipDir(id), trash);
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
    await rm(trash, { recursive: true, force: true });
    return true;
  }

  private clipDir(id: string) {
    if (!GTA6_CLIP_ID.test(id)) throw new Error("Некорректный идентификатор ролика.");
    return resolve(this.directory, id);
  }
}
