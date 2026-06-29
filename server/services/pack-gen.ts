// Генерация видео из кастомного пака В БИБЛИОТЕКУ КАНАЛА (когда язык канала = "pack:<id>").
// Тот же мост рендера (renderTemplateCard) + assembleStillVideo, что и в Студии (packs-routes),
// но карточка выбирается СЛУЧАЙНО среди НЕиспользованных этим юзером (как randomAnecdote у дек).
// «Использованность» — общий per-user механизм db (markAnecdoteUsed/usedAnecdoteKeys) по ключу карточки.
import type { Db, Video } from "../db.ts";
import { loadBaseConfig } from "../config.ts";
import { deriveRules, getPack, type Pack, type CardValues } from "../../src/packs/store.ts";
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
  if (/(motivation|motivaci|motivaц|мотивац|мотивация|motivier)/i.test(haystack)) return { audioProfile: "motivation" };
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

function stillMotionForPack(pack: Pack, picked: PickedPackCard): "slow-zoom" | "slow-drift-left" | "slow-drift-right" | undefined {
  const haystack = `${pack.id} ${pack.name}`.toLowerCase();
  if (!/(motivation|motivaci|motivaц|мотивац|мотивация|motivier)/i.test(haystack)) return undefined;
  const variants = ["slow-zoom", "slow-drift-left", "slow-drift-right"] as const;
  return variants[picked.idx % variants.length];
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

function repeatPackBg(key: string): string {
  return `repeat-pack:${key}`;
}

export function isLeastPostedRepeatPack(pack: Pack): boolean {
  return pack.repeatMode === "least_posted_per_account";
}

export function isPerAccountAutoExpirePack(pack: Pack): boolean {
  return pack.autoExpireMode === "per_account";
}

function perAccountPackPrefix(pack: Pack, accountId: number): string {
  return `pack:${pack.id}:account:${accountId}:`;
}

export function packCardClaimKey(pack: Pack, accountId: number, cardKey: string): string {
  return isPerAccountAutoExpirePack(pack) ? `${perAccountPackPrefix(pack, accountId)}${cardKey}` : cardKey;
}

export function usedPackCardKeysForAccount(pack: Pack, accountId: number, usedKeys: ReadonlySet<string>): Set<string> {
  if (!isPerAccountAutoExpirePack(pack)) return new Set(usedKeys);
  const prefix = perAccountPackPrefix(pack, accountId);
  const out = new Set<string>();
  for (const key of usedKeys) {
    if (key.startsWith(prefix)) out.add(key.slice(prefix.length));
  }
  return out;
}

export function packCardKeysFromLibraryVideos(pack: Pack, videos: Pick<Video, "bg" | "title" | "text">[]): Set<string> {
  return new Set(videos.map((video) => packCardKeyFromLibraryVideo(pack, video)).filter((key): key is string => !!key));
}

export function packCardKeyFromLibraryVideo(pack: Pack, video: Pick<Video, "bg" | "title" | "text">): string | null {
  const bg = String(video.bg || "");
  if (bg.startsWith("repeat-pack:")) return bg.slice("repeat-pack:".length);
  const rules = deriveRules(pack.templates[0]);
  const needle = `${video.title}\n${video.text}`;
  for (const card of pack.cards) {
    const readable = cardReadable(card.values, rules);
    if (`${readable.title}\n${readable.text}` === needle) return packCardKey(card.values);
  }
  return null;
}

export function usedPackCardKeysForAccountIncludingLibrary(
  pack: Pack,
  accountId: number,
  usedKeys: ReadonlySet<string>,
  videos: Pick<Video, "bg" | "title" | "text">[],
): Set<string> {
  const out = usedPackCardKeysForAccount(pack, accountId, usedKeys);
  for (const key of packCardKeysFromLibraryVideos(pack, videos)) out.add(key);
  return out;
}

export function availablePackCardsForAccount(
  pack: Pack,
  accountId: number,
  usedKeys: ReadonlySet<string>,
  videos: Pick<Video, "bg" | "title" | "text">[] = [],
): number {
  if (!pack.cards.length) return 0;
  const used = videos.length
    ? usedPackCardKeysForAccountIncludingLibrary(pack, accountId, usedKeys, videos)
    : usedPackCardKeysForAccount(pack, accountId, usedKeys);
  let n = 0;
  for (const card of pack.cards) {
    if (!used.has(packCardKey(card.values))) n += 1;
  }
  return n;
}

export function markPackLibraryVideoUsed(
  db: Db,
  ownerId: number,
  accountId: number,
  deckId: string,
  video: Pick<Video, "bg" | "title" | "text">,
  isSuperAdmin = false,
): boolean {
  if (!deckId.startsWith("pack:")) return false;
  const pack = getPack(deckId.slice("pack:".length), ownerId, isSuperAdmin);
  if (!pack) return false;
  const key = packCardKeyFromLibraryVideo(pack, video);
  if (!key) return false;
  db.markAnecdoteUsed(ownerId, isPerAccountAutoExpirePack(pack) ? packCardClaimKey(pack, accountId, key) : key);
  return true;
}

/**
 * Curated one-off packs can be repeatable without enabling the user's global infinite-pack mode.
 * Pick the card with the lowest rendered count for this account; ties are seeded so channels do not
 * collapse to the same first card.
 */
export function pickLeastPostedPackCard(db: Db, accountId: number, pack: Pack, seed?: string): PickedPackCard | null {
  if (!pack.templates.length || !pack.cards.length) return null;
  const rows = db.db
    .prepare("SELECT bg, COUNT(*) AS n FROM videos WHERE account_id = ? AND deck = ? GROUP BY bg")
    .all(accountId, `pack:${pack.id}`) as { bg?: string; n?: number }[];
  const counts = new Map(rows.map((row) => [String(row.bg || ""), Number(row.n) || 0]));
  const candidates = pack.cards.map((card, idx) => {
    const key = packCardKey(card.values);
    return { idx, values: card.values, key, count: counts.get(repeatPackBg(key)) ?? 0 };
  });
  const min = Math.min(...candidates.map((candidate) => candidate.count));
  const least = candidates.filter((candidate) => candidate.count === min);
  const picked = seed ? seededPick(least, `${pack.id}|least-posted|${seed}`, (card) => card.key) : least[0];
  if (!picked) return null;
  return { idx: picked.idx, values: picked.values, tpl: pack.templates[picked.idx % pack.templates.length], key: picked.key };
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
    stillMotion: stillMotionForPack(pack, picked),
  });
  const { title, text } = cardReadable(picked.values, deriveRules(pack.templates[0]));
  const v = db.createVideo({
    accountId,
    title,
    text,
    bg: isLeastPostedRepeatPack(pack) ? repeatPackBg(picked.key) : "",
    music,
    deck: `pack:${pack.id}`,
    videoRel: vidRel,
    imageRel: imgRel,
  });
  // NB: «использованность» карточки бронируется ВЫЗЫВАЮЩИМ ДО рендера (db.claimAnecdote), чтобы две
  // параллельные генерации не собрали одну карту дважды. Здесь не помечаем (иначе бронь была бы after-await).
  return v;
}
