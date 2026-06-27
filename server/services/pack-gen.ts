// Генерация видео из кастомного пака В БИБЛИОТЕКУ КАНАЛА (когда язык канала = "pack:<id>").
// Тот же мост рендера (renderTemplateCard) + assembleStillVideo, что и в Студии (packs-routes),
// но карточка выбирается СЛУЧАЙНО среди НЕиспользованных этим юзером (как randomAnecdote у дек).
// «Использованность» — общий per-user механизм db (markAnecdoteUsed/usedAnecdoteKeys) по ключу карточки.
import type { Db } from "../db.ts";
import { loadBaseConfig } from "../config.ts";
import { deriveRules, type Pack, type CardValues } from "../../src/packs/store.ts";
import { renderTemplateCard, type TemplateDoc } from "../../src/template/render.ts";
import { resolveAudio, type AudioDeckHint } from "../../src/video.ts";
import { buildStillVideoFiles, cardReadable } from "../infra/media.ts";
import { anecdoteKey } from "../../src/anecdotes/library.ts";

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

function audioHintForPack(pack: Pack): AudioDeckHint | undefined {
  const haystack = `${pack.id} ${pack.name}`.toLowerCase();
  if (/(chistes|joke|jokes|witz|witze|barzellette|blague|piada|анекдот|шутк)/i.test(haystack)) return { audioProfile: "jokes" };
  return undefined;
}

function stableHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function seededPick<T>(items: T[], seed: string, keyOf: (item: T, index: number) => string): T | null {
  if (!items.length) return null;
  let best = items[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const score = stableHash(`${seed}|${keyOf(item, index)}`);
    if (score < bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

export interface PickedPackCard {
  idx: number;
  values: CardValues;
  tpl: Pack["templates"][number];
  key: string;
}

/** Случайная карточка пака, чей ключ НЕ в usedKeys. null — все использованы/пусто. */
export function pickUnusedPackCard(pack: Pack, usedKeys: ReadonlySet<string>, seed?: string): PickedPackCard | null {
  if (!pack.templates.length || !pack.cards.length) return null;
  const fresh = pack.cards
    .map((c, idx) => ({ idx, values: c.values, key: packCardKey(c.values) }))
    .filter((x) => !usedKeys.has(x.key));
  if (!fresh.length) return null;
  const pick = seed ? seededPick(fresh, `${pack.id}|${seed}`, (card) => card.key) : fresh[Math.floor(Math.random() * fresh.length)];
  if (!pick) return null;
  return { idx: pick.idx, values: pick.values, tpl: pack.templates[pick.idx % pack.templates.length], key: pick.key };
}

/** Fixed card for "infinite pack" mode: always the first card/template, regardless of used-history. */
export function pickFixedPackCard(pack: Pack): PickedPackCard | null {
  if (!pack.templates.length || !pack.cards.length) return null;
  const idx = 0;
  const values = pack.cards[idx].values;
  return { idx, values, tpl: pack.templates[idx % pack.templates.length], key: packCardKey(values) };
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
  const { db, accountId, pack, picked } = input; // userId: бронь карточки делает вызывающий (claimAnecdote)
  const { music, audioPath } = resolveAudio(input.music, audioHintForPack(pack), { packId: pack.id });
  const { imgRel, vidRel } = await buildStillVideoFiles({
    prefix: "pack",
    outputDir: OUTPUT_DIR,
    audioPath,
    // editor-exported pack templates carry id/x/y at runtime; PackTemplate type just doesn't declare them
    render: (imgAbs) => renderTemplateCard(picked.tpl as TemplateDoc, picked.values, imgAbs),
  });
  const { title, text } = cardReadable(picked.values, deriveRules(pack.templates[0]));
  const v = db.createVideo({
    accountId,
    title,
    text,
    bg: "",
    music,
    deck: `pack:${pack.id}`,
    videoRel: vidRel,
    imageRel: imgRel,
  });
  // NB: «использованность» карточки бронируется ВЫЗЫВАЮЩИМ ДО рендера (db.claimAnecdote), чтобы две
  // параллельные генерации не собрали одну карту дважды. Здесь не помечаем (иначе бронь была бы after-await).
  return v;
}
