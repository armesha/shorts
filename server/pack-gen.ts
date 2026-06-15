// Генерация видео из кастомного пака В БИБЛИОТЕКУ КАНАЛА (когда язык канала = "pack:<id>").
// Тот же мост рендера (renderTemplateCard) + assembleStillVideo, что и в Студии (packs-routes),
// но карточка выбирается СЛУЧАЙНО среди НЕиспользованных этим юзером (как randomAnecdote у дек).
// «Использованность» — общий per-user механизм db (markAnecdoteUsed/usedAnecdoteKeys) по ключу карточки.
import { resolve } from "node:path";
import type { Db } from "./db.ts";
import { loadBaseConfig } from "./config.ts";
import { deriveRules, type Pack, type CardValues, type RoleRule } from "../src/packs/store.ts";
import { renderTemplateCard } from "../src/template/render.ts";
import { assembleStillVideo, listAudio, audioPathFor } from "../src/video.ts";
import { anecdoteKey } from "../src/anecdotes/library.ts";

const OUTPUT_DIR = loadBaseConfig().outputDir;

/** Стабильный per-user ключ «использованности» карточки пака (как anecdoteKey у текстовых дек). */
export function packCardKey(values: CardValues): string {
  const parts: string[] = [];
  for (const k of Object.keys(values).sort()) {
    const v = values[k];
    parts.push(Array.isArray(v) ? v.join(" ") : String(v ?? ""));
  }
  return packKeyOf(parts.join("  "));
}
// pack: префикс — чтобы ключ пак-карточки не пересекался с ключами текстовых анекдотов.
function packKeyOf(text: string): string {
  return "p" + anecdoteKey(text);
}

/** Заголовок + читаемый текст карточки (для имени видео и описания) — как в packs-routes. */
export function cardReadable(values: CardValues, rules: RoleRule[]): { title: string; text: string } {
  let title = "";
  const parts: string[] = [];
  for (const r of rules) {
    const v = values[r.role];
    if (v == null) continue;
    if (!r.list && typeof v === "string" && !title) title = v;
    parts.push(Array.isArray(v) ? v.map((x) => `• ${x}`).join("\n") : String(v));
  }
  return { title: (title || "Карточка").slice(0, 100), text: parts.join("\n\n") };
}

export interface PickedPackCard {
  idx: number;
  values: CardValues;
  tpl: Pack["templates"][number];
  key: string;
}

/** Случайная карточка пака, чей ключ НЕ в usedKeys. null — все использованы/пусто. */
export function pickUnusedPackCard(pack: Pack, usedKeys: ReadonlySet<string>): PickedPackCard | null {
  if (!pack.templates.length || !pack.cards.length) return null;
  const fresh = pack.cards
    .map((c, idx) => ({ idx, values: c.values, key: packCardKey(c.values) }))
    .filter((x) => !usedKeys.has(x.key));
  if (!fresh.length) return null;
  const pick = fresh[Math.floor(Math.random() * fresh.length)];
  return { idx: pick.idx, values: pick.values, tpl: pack.templates[pick.idx % pack.templates.length], key: pick.key };
}

/** Собрать ОДНО видео из заранее выбранной карточки пака в библиотеку канала + пометить использованной. */
export async function buildPackLibraryVideo(input: {
  db: Db;
  userId: number;
  accountId: number;
  pack: Pack;
  picked: PickedPackCard;
  music?: string;
}) {
  const { db, userId, accountId, pack, picked } = input;
  let music = input.music;
  let audioPath: string | null | undefined;
  if (music === "none") audioPath = null;
  else if (music) audioPath = audioPathFor(music);
  else {
    const t = listAudio();
    if (t.length) { music = t[Math.floor(Math.random() * t.length)]; audioPath = audioPathFor(music); }
    else { music = "none"; audioPath = null; }
  }
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const imgRel = `library/pack-${stamp}.png`;
  const vidRel = `library/pack-${stamp}.mp4`;
  await renderTemplateCard(picked.tpl, picked.values, resolve(process.cwd(), OUTPUT_DIR, imgRel));
  await assembleStillVideo(
    resolve(process.cwd(), OUTPUT_DIR, imgRel),
    resolve(process.cwd(), OUTPUT_DIR, vidRel),
    { durationSec: 6, audioPath },
  );
  const { title, text } = cardReadable(picked.values, deriveRules(pack.templates[0]));
  const v = db.createVideo({
    accountId,
    title,
    text,
    bg: "",
    music: music ?? "",
    deck: `pack:${pack.id}`,
    videoRel: vidRel,
    imageRel: imgRel,
  });
  db.markAnecdoteUsed(userId, picked.key); // не повторять эту карточку для этого юзера
  return v;
}
