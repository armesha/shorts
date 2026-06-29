import type { FastifyInstance } from "fastify";
import type { Account, Db, Video } from "../db.ts";
import { SUPER_ADMIN_USERNAME, isSuperAdminUser } from "../auth.ts";
import { DECKS, deckLang, isPackDeckId } from "../../src/anecdotes/decks.ts";
import { libraryStats } from "../../src/anecdotes/library.ts";
import { getPack } from "../../src/packs/store.ts";
import { uid } from "../infra/auth-session.ts";
import type { RouteDeps } from "./deps.ts";
import {
  availablePackCardsForAccount,
  isLeastPostedRepeatPack,
  isPerAccountAutoExpirePack,
  packCardKey,
} from "../services/pack-gen.ts";
import { cleanupDrainedAutoExpireDecksForUser, isAutoExpiredSourceGroup } from "../services/auto-expire-packs.ts";
import {
  enqueue as genEnqueue,
  listStatuses as genListStatuses,
  queuedRemainingForOwnerDecks,
} from "../services/gen-queue.ts";
import { INFINITE_PACKS_FEATURE } from "../services/infinite-packs.ts";
import { accountDailyScheduleCap, googleKeyDailyScheduleCap } from "../infra/account-limits.ts";
import { cleanSuperAdminSourceDecks, isRemovedSuperAdminOpticalDeck } from "../services/super-admin-optical-decks.ts";

const BLOCK_LANGS = [
  { code: "ru", label: "RU" },
  { code: "ar", label: "AR" },
  { code: "en", label: "EN" },
  { code: "it", label: "IT" },
  { code: "es", label: "ES" },
  { code: "de", label: "DE" },
  { code: "fr", label: "FR" },
  { code: "pt", label: "PT" },
  { code: "hi", label: "HI" },
  { code: "id", label: "ID" },
] as const;

type BlockDef = {
  id: string;
  title: string;
  description: string;
  rules: string[];
  accountIds: number[];
  sourceGroups?: SourceGroupDef[];
};

type SourceGroupDef = {
  id: string;
  title: string;
  defaultWeight: number;
  section?: string;
  sources: Record<string, string[]>;
};

const JOKE_TEXT_DECK_BY_LANG: Record<string, string[]> = {
  ru: ["ru"],
  de: ["de"],
  it: ["it"],
  es: ["pack:chistes-es-public-domain"],
  fr: ["fr"],
  en: ["en"],
  pt: ["pt"],
  ar: ["ar"],
  hi: ["hi"],
  id: ["id"],
};

const JOKE_MEME_DECK_BY_LANG: Record<string, string[]> = {
  de: ["pack:new-memes-de-superadmin"],
  it: ["pack:new-memes-it-superadmin"],
  fr: ["pack:new-memes-fr-superadmin"],
  en: ["pack:new-memes-en-superadmin"],
  es: ["pack:new-memes-es-superadmin"],
  pt: ["pack:new-memes-pt-superadmin"],
};

const LIFEHACK_DECK_BY_LANG: Record<string, string[]> = {
  ru: ["tips"],
  ar: ["tips-ar"],
  en: ["tips-en"],
  it: ["tips-it"],
  de: ["tips-de"],
  es: ["tips-es"],
  fr: ["tips-fr"],
  pt: ["tips-pt"],
  hi: ["tips-hi"],
  id: ["tips-id"],
};

const QUOTE_VIDEO_DECK_BY_LANG: Record<string, string[]> = {
  ar: ["quote-video-ar"],
  ru: ["quote-video-ru"],
  en: ["quote-video-en"],
  it: ["quote-video-it"],
  es: ["quote-video-es"],
  de: ["quote-video-de"],
  fr: ["quote-video-fr"],
  pt: ["quote-video-pt"],
  hi: ["quote-video-hi"],
  id: ["quote-video-id"],
};

const QUOTE_STATIC_DECK_BY_LANG: Record<string, string[]> = {
  ar: ["quotes-ar"],
  ru: ["quotes-ru"],
  en: ["quotes-en"],
  it: ["quotes-it"],
  es: ["quotes-es"],
  de: ["quotes-de"],
  fr: ["quotes-fr"],
  pt: ["quotes-pt"],
  hi: ["quotes-hi"],
  id: ["quotes-id"],
};

const PSYCHOLOGY_DECK_BY_LANG: Record<string, string[]> = {
  ru: ["pack:psychology-ru-superadmin"],
  de: ["pack:psychology-de-superadmin"],
};

const STATIC_FACT_DECK_BY_LANG: Record<string, string[]> = {
  ru: ["pack:static-facts-ru-superadmin"],
  en: ["pack:static-facts-en-superadmin"],
  de: ["pack:static-facts-de-superadmin"],
  es: ["pack:static-facts-es-superadmin"],
};

const MOTIVATION_DECK_BY_LANG: Record<string, string[]> = {
  ru: ["pack:motivation-ru-superadmin"],
  en: ["pack:motivation-en-superadmin"],
  de: ["pack:motivation-de-superadmin"],
};

const SOVIET_POSTER_DECK_BY_LANG: Record<string, string[]> = {
  ru: ["pack:soviet-posters-ru"],
};

const FACT_VIDEO_DECK_BY_LANG: Record<string, string[]> = {
  en: ["fact-en"],
  es: ["fact-es"],
};

const RELIGION_ISLAM_DECK_BY_LANG: Record<string, string[]> = {
  ar: ["islamic"],
};

const RELIGION_ISLAM_QUOTE_DECK_BY_LANG: Record<string, string[]> = {
  ar: ["islamic-quotes-ar"],
};

const RELIGION_ISLAM_FACT_DECK_BY_LANG: Record<string, string[]> = {
  ar: ["islamic-facts-ar"],
};

const RELIGION_KJV_DECK_BY_LANG: Record<string, string[]> = {
  en: ["christian"],
};

const RELIGION_PRAYER_DECK_BY_LANG: Record<string, string[]> = {
  en: ["prayers-en"],
  de: ["prayers-de"],
};

const RELIGION_CHRISTIAN_QUOTE_DECK_BY_LANG: Record<string, string[]> = {
  en: ["christian-quotes-en"],
};

const RELIGION_CHRISTIAN_FACT_DECK_BY_LANG: Record<string, string[]> = {
  en: ["christian-facts-en"],
};

const ISLAM_SOURCE_GROUPS: SourceGroupDef[] = [
  {
    id: "islam",
    title: "Ислам",
    defaultWeight: 3,
    sources: RELIGION_ISLAM_DECK_BY_LANG,
  },
  {
    id: "islamic_quotes",
    title: "Исламские цитаты",
    defaultWeight: 1,
    sources: RELIGION_ISLAM_QUOTE_DECK_BY_LANG,
  },
  {
    id: "islamic_facts",
    title: "Факты об исламе",
    defaultWeight: 1,
    sources: RELIGION_ISLAM_FACT_DECK_BY_LANG,
  },
];

const CHRISTIANITY_SOURCE_GROUPS: SourceGroupDef[] = [
  {
    id: "kjv_bible",
    title: "Библия KJV",
    defaultWeight: 2,
    sources: RELIGION_KJV_DECK_BY_LANG,
  },
  {
    id: "christian_prayers",
    title: "Христианские молитвы",
    defaultWeight: 1,
    sources: RELIGION_PRAYER_DECK_BY_LANG,
  },
  {
    id: "christian_quotes",
    title: "Христианские цитаты",
    defaultWeight: 1,
    sources: RELIGION_CHRISTIAN_QUOTE_DECK_BY_LANG,
  },
  {
    id: "christian_facts",
    title: "Факты о христианстве",
    defaultWeight: 1,
    sources: RELIGION_CHRISTIAN_FACT_DECK_BY_LANG,
  },
];

const RUSSIAN_SOURCE_GROUPS: SourceGroupDef[] = [
  {
    id: "jokes",
    title: "Анекдоты",
    defaultWeight: 6,
    sources: { ru: ["ru"] },
  },
  {
    id: "lifehacks",
    title: "Лайфхаки",
    defaultWeight: 3,
    sources: { ru: ["tips"] },
  },
  {
    id: "static_facts",
    title: "Факты",
    defaultWeight: 2,
    sources: { ru: ["pack:static-facts-ru-superadmin"] },
  },
  {
    id: "video_quotes",
    title: "Видеоцитаты",
    defaultWeight: 2,
    sources: { ru: ["quote-video-ru"] },
  },
  {
    id: "static_quotes",
    title: "Цитаты",
    defaultWeight: 3,
    sources: { ru: ["quotes-ru"] },
  },
  {
    id: "psychology",
    title: "Психология",
    defaultWeight: 2,
    sources: { ru: ["pack:psychology-ru-superadmin"] },
  },
  {
    id: "motivation",
    title: "Мотивация",
    defaultWeight: 2,
    sources: { ru: ["pack:motivation-ru-superadmin"] },
  },
  {
    id: "soviet_posters",
    title: "Постеры",
    defaultWeight: 1,
    sources: SOVIET_POSTER_DECK_BY_LANG,
  },
];

const RELIGION_SOURCE_GROUPS: SourceGroupDef[] = [
  ...ISLAM_SOURCE_GROUPS.map((group) => ({ ...group, section: "Ислам" })),
  ...CHRISTIANITY_SOURCE_GROUPS.map((group) => ({ ...group, section: "Христианство" })),
];

const FACT_SOURCE_GROUPS: SourceGroupDef[] = [
  {
    id: "static_facts",
    title: "Статичные факты",
    defaultWeight: 2,
    sources: STATIC_FACT_DECK_BY_LANG,
  },
  {
    id: "fact_video",
    title: "Интересный факт",
    defaultWeight: 1,
    sources: FACT_VIDEO_DECK_BY_LANG,
  },
  {
    id: "lifehacks",
    title: "Лайфхаки",
    defaultWeight: 2,
    sources: LIFEHACK_DECK_BY_LANG,
  },
  {
    id: "jokes",
    title: "Анекдоты",
    defaultWeight: 2,
    sources: JOKE_TEXT_DECK_BY_LANG,
  },
  {
    id: "memes",
    title: "Мемы",
    defaultWeight: 2,
    sources: JOKE_MEME_DECK_BY_LANG,
  },
  {
    id: "video_quotes",
    title: "Видеоцитаты",
    defaultWeight: 1,
    sources: QUOTE_VIDEO_DECK_BY_LANG,
  },
  {
    id: "static_quotes",
    title: "Статичные цитаты",
    defaultWeight: 1,
    sources: QUOTE_STATIC_DECK_BY_LANG,
  },
  {
    id: "psychology",
    title: "Психология",
    defaultWeight: 2,
    sources: PSYCHOLOGY_DECK_BY_LANG,
  },
  {
    id: "motivation",
    title: "Мотивация",
    defaultWeight: 1,
    sources: MOTIVATION_DECK_BY_LANG,
  },
];

const BLOCK_DEFAULT_SOURCES: Record<string, Record<string, string[]>> = {
  islam: {
    ar: ["islamic", "islamic-quotes-ar", "islamic-facts-ar"],
  },
  christianity: {
    en: ["christian", "prayers-en", "christian-quotes-en", "christian-facts-en"],
    de: ["prayers-de"],
  },
  religion: {
    ar: ["islamic", "islamic-quotes-ar", "islamic-facts-ar"],
    en: ["christian", "prayers-en", "christian-quotes-en", "christian-facts-en"],
    de: ["prayers-de"],
  },
};

export const BLOCKS: BlockDef[] = [
  {
    id: "russian",
    title: "Русские",
    description: "Все русские нерелигиозные каналы в одной сетке источников.",
    rules: [
      "Русский блок использует один общий микс источников для всех русских каналов супер-админа.",
      "Все RU-каналы в блоке должны иметь одинаковый набор источников: юмор, факты, лайфхаки, цитаты, психология, мотивация и советские постеры.",
      "Legacy-пак Мемы (RU) не подключать к русскому блоку; русский блок пока работает без мемов.",
      "Советские постеры — RU-only архивный источник: не локализовать, не пополнять; он конечный и авто-удаляется из канала после исчерпания.",
      "Постеры брать только из проверенного public-domain набора; не добавлять антирелигиозную сатиру, сталинский культ, расовые стереотипы, тяжёлые военные изображения и спорные киноафиши.",
    ],
    accountIds: [7, 16, 52, 62, 81],
    sourceGroups: RUSSIAN_SOURCE_GROUPS,
  },
  {
    id: "religion",
    title: "Религия",
    description: "Исламские и христианские каналы в одном блоке, но с раздельными настройками микса.",
    rules: [
      "Исламские тексты и молитвенные формулировки не смешивать с христианскими источниками.",
      "Христианские KJV/молитвенные источники не смешивать с исламскими каналами.",
      "Для каждого религиозного пака нужен отдельный source ledger и ручная проверка переводов/формулировок.",
      "Перед массовой публикацией проверять title/description/thumbnails на спорный, оскорбительный или политизированный контекст.",
      "Музыка/звук подбирается отдельно под религию; для исламских паков использовать немелодический фон или тишину.",
      "В исламских религиозных паках не использовать человеческие лица/портреты: никаких изображений пророков, сподвижников, учёных или современных людей; вместо этого каллиграфия, мечети, орнаменты, книги, свет/текстуры.",
      "В христианских паках можно использовать только public-domain/clearly licensed религиозные artworks (иконы, фрески, картины, витражи) с source ledger; не выдавать artwork за реальный портрет библейского персонажа.",
      "Не использовать современные фото актёров/людей как Иисуса, апостолов, святых или пророков без явных прав и контекста.",
      "Не использовать религиозные тексты для нападок на защищённые группы, оправдания насилия, экстремизма или обещаний медицинских чудес.",
    ],
    accountIds: [23, 31],
    sourceGroups: RELIGION_SOURCE_GROUPS,
  },
  {
    id: "quotes",
    title: "Иностранные",
    description: "Все нерусские нерелигиозные каналы в одном общем миксе источников.",
    rules: [
      "Все нерусские нерелигиозные каналы супер-админа используют один общий микс источников.",
      "Факты требуют проверяемого источника; численные данные и названия нужно перепроверять.",
      "Мемы в этом блоке остаются отдельным источником микса, а не отдельным блоком.",
      "Оптические иллюзии, визуальные загадки и visual-riddles источники больше не подключать к armen-блокам.",
      "Лайфхаки локализовать на одном наборе идей, но бытовые реалии адаптировать под язык.",
      "Если появится озвучка для лайфхаков, новые voiceover-паки собирать через разрешённый TTS-профиль проекта с учётом текущих квот.",
      "Анекдоты не придумывать ИИ: брать только проверенные внешние/PD/licensed корпуса с источниками.",
      "Анекдоты внутри блока остаются отдельным источником микса; не смешивать бытовые советы и шутки внутри одной карточки.",
      "Legacy memes-* не подключать к armen-блокам; иностранные мемы брать только из новых pack:new-memes-<lang>-superadmin после проверки прав и оскорбительного контекста.",
      "Декоративные смеющиеся emoji/GIF разрешены, если они не перекрывают текст и не выглядят как плашка/водяной знак канала.",
      "Видео-цитаты и статичные цитаты держать отдельными источниками микса.",
      "Мотивационные карточки писать как оригинальные короткие правила без реальных атрибуций, гендерной токсичности, обещаний успеха или водяных знаков.",
      "Запрещены AP/неясные фото, misattribution, экстремистские/насильственные цитаты и protected-class hate.",
      "Не давать медицинских диагнозов/обещаний лечения; формулировать как общие наблюдения и self-help.",
      "Локализации должны сохранять осторожный тон и избегать травматичных/опасных советов.",
    ],
    accountIds: [14, 15, 18, 38, 43, 44, 45, 64, 65, 68, 70, 72, 78, 79, 82],
    sourceGroups: FACT_SOURCE_GROUPS,
  },
];

const BLOCK_ALIASES: Record<string, string> = {
  facts_space: "quotes",
  jokes_memes: "quotes",
  lifehacks: "quotes",
  psychology: "quotes",
  riddles_illusions: "quotes",
  islam: "religion",
  christianity: "religion",
};

export function canonicalBlockId(blockId: string): string {
  return BLOCK_ALIASES[blockId] ?? blockId;
}

function rawSourceWeightSettingKey(blockId: string): string {
  return `superAdmin.channelBlock.${blockId}.sourceWeights`;
}

function sourceWeightSettingKeysForBlock(blockId: string): { canonical: string; aliases: string[] } {
  const canonical = canonicalBlockId(blockId);
  return {
    canonical: rawSourceWeightSettingKey(canonical),
    aliases: Object.entries(BLOCK_ALIASES)
      .filter(([, target]) => target === canonical)
      .map(([alias]) => rawSourceWeightSettingKey(alias)),
  };
}

function findBlockDef(blockId: string): BlockDef | null {
  const canonical = canonicalBlockId(blockId);
  return BLOCKS.find((block) => block.id === canonical) ?? null;
}

function requireSuperAdmin(req: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }, deps: RouteDeps): boolean {
  if (deps.auth.isSuperAdminReq(req)) return true;
  reply.code(404).send({ error: "not found" });
  return false;
}

function armenId(db: Db): number | null {
  return db.getUserByUsername(SUPER_ADMIN_USERNAME)?.id ?? null;
}

function deckTitle(deckId: string, ownerId: number): { name: string; lang: string | null } {
  if (isPackDeckId(deckId)) {
    const pack = getPack(deckId.slice(5), ownerId, true);
    return { name: pack?.name ?? deckId.slice(5), lang: pack?.lang ?? null };
  }
  const deck = DECKS.find((d) => d.id === deckId);
  return { name: deck?.name ?? deckId, lang: deckLang(deckId) || null };
}

function videosByDeck(videos: Video[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const video of videos) out[video.deck] = (out[video.deck] ?? 0) + 1;
  return out;
}

function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

type BlockContext = {
  accounts: Account[];
  queuedByAccount: Map<number, number>;
  queuedByAccountDeck: Map<number, Record<string, number>>;
  availableCache: Map<string, number>;
  contentIndexReady: boolean;
};

function makeBlockContext(db: Db, accounts: Account[]): BlockContext {
  const ids = accounts.map((account) => account.id);
  const queuedByAccount = new Map<number, number>();
  const queuedByAccountDeck = new Map<number, Record<string, number>>();
  for (const id of ids) {
    queuedByAccount.set(id, 0);
    queuedByAccountDeck.set(id, {});
  }
  if (ids.length) {
    const ph = ids.map(() => "?").join(",");
    const rows = db.db
      .prepare(`SELECT account_id, deck, COUNT(*) AS n FROM videos WHERE account_id IN (${ph}) GROUP BY account_id, deck`)
      .all(...ids) as { account_id: number; deck: string; n: number }[];
    for (const row of rows) {
      const accountId = Number(row.account_id);
      const count = Number(row.n) || 0;
      queuedByAccount.set(accountId, (queuedByAccount.get(accountId) ?? 0) + count);
      const byDeck = queuedByAccountDeck.get(accountId) ?? {};
      byDeck[String(row.deck || "")] = count;
      queuedByAccountDeck.set(accountId, byDeck);
    }
  }
  let contentIndexReady = false;
  try {
    db.db.prepare("SELECT 1 FROM content_items LIMIT 1").get();
    contentIndexReady = true;
  } catch {
    contentIndexReady = false;
  }
  return { accounts, queuedByAccount, queuedByAccountDeck, availableCache: new Map(), contentIndexReady };
}

function builtinDeckTotal(db: Db, deckId: string): number {
  try {
    const row = db.db.prepare("SELECT total FROM content_decks WHERE deck_id = ?").get(deckId) as { total?: number } | undefined;
    if (row) return Number(row.total) || 0;
  } catch {
    /* fall back below */
  }
  return libraryStats(deckId, new Set()).total;
}

function builtinDeckUsed(db: Db, ownerId: number, deckId: string): number {
  try {
    const row = db.db
      .prepare(
        `SELECT COUNT(DISTINCT ci.item_key) AS n
           FROM content_items ci
           JOIN user_used_anecdotes used ON used.key = ci.item_key AND used.user_id = ?
          WHERE ci.deck_id = ?`,
      )
      .get(ownerId, deckId) as { n?: number } | undefined;
    return Number(row?.n) || 0;
  } catch {
    return libraryStats(deckId, db.usedAnecdoteKeys(ownerId)).used;
  }
}

function availableForDecks(db: Db, deps: RouteDeps, ctx: BlockContext | undefined, ownerId: number, deckIds: string[]): number {
  const clean = [...new Set(deckIds.filter(Boolean))];
  if (!clean.length) return 0;
  const key = `${ownerId}|${clean.slice().sort().join("\u0001")}`;
  const cached = ctx?.availableCache.get(key);
  if (cached != null) return cached;
  try {
    const total = deps.deckAccess.availableUnusedForDecks(ownerId, clean);
    ctx?.availableCache.set(key, total);
    return total;
  } catch {
    /* fall back to local counters below */
  }

  let total = 0;
  try {
    const ownerIsSuperAdmin = isSuperAdminUser(db.getUserById(ownerId));
    const infinite = db.hasFeature(ownerId, INFINITE_PACKS_FEATURE);
    const usedKeys = infinite ? null : db.usedAnecdoteKeys(ownerId);
    for (const deckId of clean) {
      if (isPackDeckId(deckId)) {
        const pack = getPack(deckId.slice(5), ownerId, ownerIsSuperAdmin);
        if (!pack) continue;
        if (infinite) {
          total += pack.cards.length;
        } else {
          let used = 0;
          for (const card of pack.cards) if (usedKeys?.has(packCardKey(card.values))) used++;
          total += Math.max(0, pack.cards.length - used);
        }
      } else if (ctx?.contentIndexReady) {
        const deckTotal = builtinDeckTotal(db, deckId);
        total += infinite ? deckTotal : Math.max(0, deckTotal - builtinDeckUsed(db, ownerId, deckId));
      } else {
        total += deps.deckAccess.availableUnusedForDecks(ownerId, [deckId]);
      }
    }
  } catch {
    total = deps.deckAccess.availableUnusedForDecks(ownerId, clean);
  }
  ctx?.availableCache.set(key, total);
  return total;
}

function ownerIsSuperAdmin(db: Db, ownerId: number): boolean {
  const getUserById = (db as { getUserById?: (id: number) => unknown }).getUserById;
  const user = typeof getUserById === "function" ? getUserById.call(db, ownerId) : null;
  return isSuperAdminUser(user as { username?: string | null; role?: string | null } | null);
}

function packForDeck(db: Db, ownerId: number, deckId: string) {
  if (!isPackDeckId(deckId)) return null;
  return getPack(deckId.slice(5), ownerId, ownerIsSuperAdmin(db, ownerId));
}

function isRepeatPackDeck(db: Db, ownerId: number, deckId: string): boolean {
  const pack = packForDeck(db, ownerId, deckId);
  return !!pack && isLeastPostedRepeatPack(pack);
}

function isPerAccountAutoExpirePackDeck(db: Db, ownerId: number, deckId: string): boolean {
  const pack = packForDeck(db, ownerId, deckId);
  return !!pack && isPerAccountAutoExpirePack(pack);
}

function availableForDeckForAccount(
  db: Db,
  deps: RouteDeps,
  ctx: BlockContext | undefined,
  ownerId: number,
  accountId: number,
  deckId: string,
): number {
  const pack = packForDeck(db, ownerId, deckId);
  if (pack && isLeastPostedRepeatPack(pack)) {
    const total = pack.cards.length;
    const key = `${ownerId}|${accountId}|${deckId}|repeat`;
    ctx?.availableCache.set(key, total);
    return total;
  }
  if (pack && isPerAccountAutoExpirePack(pack)) {
    const key = `${ownerId}|${accountId}|${deckId}`;
    const cached = ctx?.availableCache.get(key);
    if (cached != null) return cached;
    const usedAnecdoteKeys = (db as unknown as { usedAnecdoteKeys?: (userId: number) => ReadonlySet<string> }).usedAnecdoteKeys;
    const usedKeys = typeof usedAnecdoteKeys === "function" ? usedAnecdoteKeys.call(db, ownerId) : new Set<string>();
    const total = availablePackCardsForAccount(
      pack,
      accountId,
      usedKeys,
      db.listVideos(accountId).filter((video) => video.deck === deckId),
    );
    ctx?.availableCache.set(key, total);
    return total;
  }
  return availableForDecks(db, deps, ctx, ownerId, [deckId]);
}

function availableForDecksForAccount(
  db: Db,
  deps: RouteDeps,
  ctx: BlockContext | undefined,
  ownerId: number,
  accountId: number,
  deckIds: string[],
): number {
  return unique(deckIds).reduce((sum, deckId) => sum + availableForDeckForAccount(db, deps, ctx, ownerId, accountId, deckId), 0);
}

function freeCardsForGenerationDeck(
  db: Db,
  deps: RouteDeps,
  ownerId: number,
  accountId: number,
  deckId: string,
): number {
  if (isRemovedSuperAdminOpticalDeck(deckId)) return 0;
  if (isRepeatPackDeck(db, ownerId, deckId)) return Number.MAX_SAFE_INTEGER;
  const perAccountAutoExpire = isPerAccountAutoExpirePackDeck(db, ownerId, deckId);
  if (!perAccountAutoExpire && db.hasFeature(ownerId, INFINITE_PACKS_FEATURE)) return Number.MAX_SAFE_INTEGER;
  const queued = perAccountAutoExpire
    ? (queuedRemainingForAccountDecks(accountId)[deckId] ?? 0)
    : queuedRemainingForOwnerDeck(ownerId, deckId);
  const available = perAccountAutoExpire
    ? availableForDeckForAccount(db, deps, undefined, ownerId, accountId, deckId)
    : deps.deckAccess.availableUnusedForDecks(ownerId, [deckId]);
  return Math.max(0, available - queued);
}

function sourceDecksForGeneration(db: Db, deps: RouteDeps, ownerId: number, account: Account, deckIds: string[]): string[] {
  return cleanSuperAdminSourceDecks(deckIds).filter((deckId) => freeCardsForGenerationDeck(db, deps, ownerId, account.id, deckId) > 0);
}

function sourceDecksForSchedule(
  db: Db,
  deps: RouteDeps,
  ownerId: number,
  account: Account,
  deckIds: string[],
  queuedByDeck?: Record<string, number>,
): string[] {
  const clean = cleanSuperAdminSourceDecks(deckIds);
  const queued = queuedByDeck ?? videosByDeck(db.listVideos(account.id));
  const usable = clean.filter((deckId) => Math.max(0, Number(queued[deckId] ?? 0)) > 0 || freeCardsForGenerationDeck(db, deps, ownerId, account.id, deckId) > 0);
  return usable.length ? usable : clean;
}

function deckSummaries(input: {
  db: Db;
  deps: RouteDeps;
  ctx?: BlockContext;
  blockId?: string;
  ownerId: number;
  accountId: number;
  deckIds: string[];
  queuedByDeck: Record<string, number>;
}) {
  const { db, deps, ctx, blockId, ownerId, accountId, deckIds, queuedByDeck } = input;
  return deckIds.map((deckId) => {
    const title = deckTitle(deckId, ownerId);
    const group = blockId && title.lang ? sourceGroupForDeck(blockId, title.lang, deckId) : null;
    const available = availableForDeckForAccount(db, deps, ctx, ownerId, accountId, deckId);
    return {
      id: deckId,
      name: title.name,
      lang: title.lang,
      groupId: group?.id ?? null,
      groupTitle: group?.title ?? null,
      available,
      queued: queuedByDeck[deckId] ?? 0,
      total: db.hasFeature(ownerId, INFINITE_PACKS_FEATURE) ? available : null,
    };
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function sourceGroupsForBlock(blockId: string): SourceGroupDef[] {
  return findBlockDef(blockId)?.sourceGroups ?? [];
}

function sourceGroupForDeck(blockId: string, lang: string, deckId: string): SourceGroupDef | null {
  for (const group of sourceGroupsForBlock(blockId)) {
    if ((group.sources[lang] ?? []).includes(deckId)) return group;
  }
  return null;
}

function blockDefaultSources(blockId: string, lang: string): string[] {
  if (lang === "ru" && canonicalBlockId(blockId) !== "russian") return [];
  const groups = sourceGroupsForBlock(blockId);
  if (groups.length) return cleanSuperAdminSourceDecks(groups.flatMap((group) => group.sources[lang] ?? []));
  return cleanSuperAdminSourceDecks(BLOCK_DEFAULT_SOURCES[blockId]?.[lang] ?? []);
}

export function blockDefaultSourcesForDb(db: Db, blockId: string, lang: string): string[] {
  if (lang === "ru" && canonicalBlockId(blockId) !== "russian") return [];
  const canonical = canonicalBlockId(blockId);
  const groups = sourceGroupsForBlock(canonical);
  if (groups.length)
    return cleanSuperAdminSourceDecks(
      groups
        .filter((group) => !isAutoExpiredSourceGroup(db, canonical, group.id))
        .flatMap((group) => group.sources[lang] ?? []),
    );
  return cleanSuperAdminSourceDecks(BLOCK_DEFAULT_SOURCES[canonical]?.[lang] ?? []);
}

function sameDeckSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const aa = [...a].sort();
  const bb = [...b].sort();
  return aa.every((value, index) => value === bb[index]);
}

function accountBelongsToBlock(deps: RouteDeps, block: BlockDef, account: Account): boolean {
  if (block.accountIds.includes(account.id)) return true;
  const defaults = blockDefaultSources(block.id, account.channelLang);
  if (!defaults.length) return false;
  return sameDeckSet(cleanSuperAdminSourceDecks(deps.deckAccess.accountSourceDecks(account)), defaults);
}

type BlockLangDef = (typeof BLOCK_LANGS)[number];

export function visibleLanguageDefsForAccounts(accounts: Array<Pick<Account, "channelLang" | "lang">>): BlockLangDef[] {
  const active = new Set(
    accounts
      .map((account) => String(account.channelLang || account.lang || "").trim())
      .filter(Boolean),
  );
  return BLOCK_LANGS.filter((lang) => active.has(lang.code));
}

type ScheduledDeckGapInput = {
  id: string;
  name: string;
  groupId?: string | null;
  groupTitle?: string | null;
  available: number;
};

export function sourceGapsForScheduledDecks(
  decks: ScheduledDeckGapInput[],
  scheduledByDeck: Record<string, number>,
  queuedByDeck: Record<string, number>,
) {
  return decks
    .map((deck) => {
      const postsPerDay = Number(scheduledByDeck[deck.id] ?? 0);
      if (postsPerDay <= 0) return null;
      const queued = Number(queuedByDeck[deck.id] ?? 0);
      const available = Number(deck.available ?? 0);
      const reason = queued <= 0 ? "empty_queue" : available <= 0 ? "no_free_cards" : null;
      if (!reason) return null;
      return {
        deckId: deck.id,
        deckName: deck.groupTitle || deck.name,
        groupId: deck.groupId,
        groupTitle: deck.groupTitle,
        queued,
        available,
        postsPerDay,
        reason,
      };
    })
    .filter((gap): gap is NonNullable<typeof gap> => Boolean(gap));
}

function accountSummary(db: Db, deps: RouteDeps, account: Account, ctx?: BlockContext, blockId?: string) {
  const ownerId = account.userId ?? 0;
  const sourceDecks = cleanSuperAdminSourceDecks(deps.deckAccess.accountSourceDecks(account));
  const queuedByDeck = ctx?.queuedByAccountDeck.get(account.id) ?? videosByDeck(db.listVideos(account.id));
  const decks = deckSummaries({ db, deps, ctx, blockId, ownerId, accountId: account.id, deckIds: sourceDecks, queuedByDeck });
  const availableByDeck = Object.fromEntries(decks.map((deck) => [deck.id, deck.available]));
  const queuedCoverage = effectiveCapacityForSchedule(account, sourceDecks, queuedByDeck, ctx?.queuedByAccount.get(account.id) ?? sumCounts(queuedByDeck));
  const availableCoverage = effectiveCapacityForSchedule(
    account,
    sourceDecks,
    availableByDeck,
    availableForDecksForAccount(db, deps, ctx, ownerId, account.id, sourceDecks),
  );
  const scheduledByDeck = Object.fromEntries(scheduledCountsByDeck(account, sourceDecks));
  const sourceGaps = sourceGapsForScheduledDecks(decks, scheduledByDeck, queuedByDeck);
  return {
    id: account.id,
    userId: account.userId,
    channelName: account.ytChannelTitle || account.channelName,
    theme: account.theme,
    channelLang: account.channelLang,
    enabled: account.enabled,
    connected: account.status === "connected",
    status: account.status,
    authError: account.authError,
    schedule: account.schedule,
    avatar: account.avatar,
    ytChannelId: account.ytChannelId,
    queued: ctx?.queuedByAccount.get(account.id) ?? db.listVideos(account.id).length,
    effectiveQueued: queuedCoverage.effective,
    effectiveRunwayDays: queuedCoverage.runwayDays,
    queuedByDeck,
    scheduledByDeck,
    sourceGaps,
    shortAvailable: availableCoverage.effective,
    rawShortAvailable: availableForDecksForAccount(db, deps, ctx, ownerId, account.id, sourceDecks),
    sourceDecks: decks,
  };
}

type BlockAccountSummary = ReturnType<typeof accountSummary>;

function minOrZero(values: number[]): number {
  if (!values.length) return 0;
  return Math.min(...values);
}

function blockSyncMetrics(accounts: BlockAccountSummary[]) {
  const queued = minOrZero(accounts.map((account) => account.effectiveQueued));
  const shortAvailable = minOrZero(accounts.map((account) => account.shortAvailable));
  const postsPerDay = minOrZero(accounts.map((account) => account.schedule.length));
  const runwayDaysValues = accounts
    .map((account) => account.effectiveRunwayDays)
    .filter((value): value is number => value != null && Number.isFinite(value));
  return {
    queued,
    shortAvailable,
    postsPerDay,
    runwayDays: runwayDaysValues.length ? Math.min(...runwayDaysValues) : postsPerDay > 0 ? queued / postsPerDay : null,
    totalQueued: accounts.reduce((sum, account) => sum + account.queued, 0),
    totalShortAvailable: accounts.reduce((sum, account) => sum + account.rawShortAvailable, 0),
    totalPostsPerDay: accounts.reduce((sum, account) => sum + account.schedule.length, 0),
  };
}

const sourceWeightSettingKey = (blockId: string): string => sourceWeightSettingKeysForBlock(blockId).canonical;

function sanitizeSourceWeights(block: BlockDef, raw: unknown): Record<string, number> {
  const groups = block.sourceGroups ?? [];
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, number> = {};
  for (const group of groups) {
    const n = Math.floor(Number(obj[group.id]));
    out[group.id] = Number.isFinite(n) ? Math.max(0, Math.min(20, n)) : group.defaultWeight;
  }
  return out;
}

function readSourceWeights(db: Db, block: BlockDef): Record<string, number> {
  if (!block.sourceGroups?.length) return {};
  const raw = db.getSetting(sourceWeightSettingKey(block.id));
  if (!raw) return sanitizeSourceWeights(block, {});
  try {
    return sanitizeSourceWeights(block, JSON.parse(raw));
  } catch {
    return sanitizeSourceWeights(block, {});
  }
}

export function normalizeSourceWeightSettings(db: Db): void {
  for (const block of BLOCKS.filter((candidate) => candidate.sourceGroups?.length)) {
    const keys = sourceWeightSettingKeysForBlock(block.id);
    const canonicalRaw = db.getSetting(keys.canonical);
    let raw: unknown = null;
    if (canonicalRaw) {
      try {
        raw = JSON.parse(canonicalRaw);
      } catch {
        raw = {};
      }
    }
    if (raw == null) {
      for (const key of keys.aliases) {
        const legacyRaw = db.getSetting(key);
        if (!legacyRaw) continue;
        try {
          raw = JSON.parse(legacyRaw);
        } catch {
          raw = {};
        }
        break;
      }
    }

    const hasAnySetting = canonicalRaw != null || keys.aliases.some((key) => db.getSetting(key) != null);
    if (hasAnySetting) {
      const normalized = sanitizeSourceWeights(block, raw ?? {});
      const serialized = JSON.stringify(normalized);
      if (serialized !== canonicalRaw) db.setSetting(keys.canonical, serialized);
    }
    for (const key of keys.aliases) {
      try {
        db.db.prepare("DELETE FROM settings WHERE key = ?").run(key);
      } catch {
        /* settings cleanup is best-effort */
      }
    }
  }
}

function resolveSourceWeights(db: Db, block: BlockDef, body: unknown, persist: boolean): Record<string, number> {
  if (!block.sourceGroups?.length) return {};
  const raw = (body as { sourceWeights?: unknown } | null)?.sourceWeights;
  if (raw == null) return readSourceWeights(db, block);
  const weights = sanitizeSourceWeights(block, raw);
  if (persist) db.setSetting(sourceWeightSettingKey(block.id), JSON.stringify(weights));
  return weights;
}

function requestedSourceWeights(db: Db, block: BlockDef, body: unknown): Record<string, number> {
  return resolveSourceWeights(db, block, body, true);
}

function previewSourceWeights(db: Db, block: BlockDef, body: unknown): Record<string, number> {
  return resolveSourceWeights(db, block, body, false);
}

function stableHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function seededUnit(seed: string): number {
  return stableHash(seed) / 0x100000000;
}

function shuffleWithSeed<T>(items: T[], seed?: string): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = seed ? Math.floor(seededUnit(`${seed}|shuffle|${i}`) * (i + 1)) : Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function sourceWeightsKey(weights: Record<string, number>): string {
  return Object.entries(weights)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
}

function sourceSequenceSeed(
  block: BlockDef,
  account: Account,
  sourceDecks: string[],
  weights: Record<string, number>,
  purpose: string,
): string {
  return [
    `block:${block.id}`,
    `account:${account.id}`,
    `lang:${account.channelLang || account.lang}`,
    `sources:${sourceDecks.join(",")}`,
    `weights:${sourceWeightsKey(weights)}`,
    purpose,
  ].join("|");
}

function publicSourceGroups(db: Db, block: BlockDef) {
  const weights = readSourceWeights(db, block);
  return (block.sourceGroups ?? [])
    .filter((group) => !isAutoExpiredSourceGroup(db, block.id, group.id))
    .map((group) => ({
      id: group.id,
      title: group.title,
      section: group.section ?? null,
      defaultWeight: group.defaultWeight,
      weight: weights[group.id] ?? group.defaultWeight,
    }));
}

function activeSourceGroups(block: BlockDef, account: Account, sourceDecks: string[], weights: Record<string, number>) {
  const groups = block.sourceGroups ?? [];
  if (!groups.length) return [];
  const selected = new Set(sourceDecks);
  return groups
    .map((group) => ({
      ...group,
      weight: Math.max(0, Math.floor(Number(weights[group.id] ?? group.defaultWeight) || 0)),
      deckIds: (group.sources[account.channelLang] ?? []).filter((deckId) => selected.has(deckId)),
    }))
    .filter((group) => group.weight > 0 && group.deckIds.length > 0);
}

function weightedDeckSlots(
  block: BlockDef,
  account: Account,
  sourceDecks: string[],
  weights: Record<string, number>,
  count: number,
  seed?: string,
): string[] {
  const rawActive = activeSourceGroups(block, account, sourceDecks, weights);
  const offset = rawActive.length ? (seed ? stableHash(`${seed}|group-offset`) : Math.abs(account.id)) % rawActive.length : 0;
  const active = offset ? [...rawActive.slice(offset), ...rawActive.slice(0, offset)] : rawActive;
  if (!active.length) return sourceDecks;
  const totalWeight = active.reduce((sum, group) => sum + group.weight, 0);
  const cursors = new Map(active.map((group) => [group.id, 0]));
  const sequence: string[] = [];
  for (let index = 0; index < count; index++) {
    let roll = (seed ? seededUnit(`${seed}|roll|${index}`) : Math.random()) * totalWeight;
    let group = active[active.length - 1];
    for (const candidate of active) {
      roll -= candidate.weight;
      if (roll < 0) {
        group = candidate;
        break;
      }
    }
    const cursor = cursors.get(group.id) ?? 0;
    sequence.push(group.deckIds[cursor % group.deckIds.length]);
    cursors.set(group.id, cursor + 1);
  }
  return sequence.length ? sequence : sourceDecks;
}

function weightedDeckSlotsBalanced(
  block: BlockDef,
  account: Account,
  sourceDecks: string[],
  weights: Record<string, number>,
  count: number,
  seed?: string,
): string[] {
  const rawActive = activeSourceGroups(block, account, sourceDecks, weights);
  const offset = rawActive.length ? (seed ? stableHash(`${seed}|group-offset`) : Math.abs(account.id)) % rawActive.length : 0;
  const active = offset ? [...rawActive.slice(offset), ...rawActive.slice(0, offset)] : rawActive;
  if (!active.length || count <= 0) return sourceDecks.slice(0, Math.max(0, count));
  const totalWeight = active.reduce((sum, group) => sum + group.weight, 0);
  const quotas = active.map((group) => {
    const exact = (count * group.weight) / totalWeight;
    return { group, exact, n: Math.floor(exact) };
  });
  let remaining = count - quotas.reduce((sum, q) => sum + q.n, 0);
  for (const quota of quotas.sort((a, b) => b.exact - b.n - (a.exact - a.n))) {
    if (remaining <= 0) break;
    quota.n += 1;
    remaining -= 1;
  }
  if (count >= active.length) {
    for (const quota of quotas) {
      if (quota.n > 0) continue;
      const donor = quotas
        .filter((candidate) => candidate.n > 1)
        .sort((a, b) => b.n - a.n)[0];
      if (!donor) break;
      donor.n -= 1;
      quota.n = 1;
    }
  }
  const cursors = new Map(active.map((group) => [group.id, 0]));
  const sequence: string[] = [];
  for (const { group, n } of quotas) {
    for (let index = 0; index < n; index++) {
      const cursor = cursors.get(group.id) ?? 0;
      sequence.push(group.deckIds[cursor % group.deckIds.length]);
      cursors.set(group.id, cursor + 1);
    }
  }
  return shuffleWithSeed(sequence, seed);
}

function activeSourceWeightTotal(block: BlockDef, account: Account, sourceDecks: string[], weights: Record<string, number>): number {
  return activeSourceGroups(block, account, sourceDecks, weights).reduce((sum, group) => sum + group.weight, 0);
}

function weightedDeckSequence(
  block: BlockDef,
  account: Account,
  sourceDecks: string[],
  weights: Record<string, number>,
  count?: number,
  seed?: string,
): string[] {
  const active = activeSourceGroups(block, account, sourceDecks, weights);
  if (!active.length) return sourceDecks;
  const totalWeight = active.reduce((sum, group) => sum + group.weight, 0);
  const cycles = Math.max(1, ...active.map((group) => group.deckIds.length));
  return weightedDeckSlots(block, account, sourceDecks, weights, Math.max(1, count ?? totalWeight * cycles), seed);
}

function slotDecksForSchedule(block: BlockDef, account: Account, schedule: string[], sourceDecks: string[], weights: Record<string, number>): Record<string, string> {
  if (!schedule.length) return {};
  const seed = sourceSequenceSeed(block, account, sourceDecks, weights, `schedule:${schedule.join(",")}`);
  const sequence = weightedDeckSlotsBalanced(block, account, sourceDecks, weights, schedule.length, seed);
  if (!sequence.length) return {};
  const out: Record<string, string> = {};
  [...schedule].sort().forEach((time, index) => {
    out[time] = sequence[index % sequence.length];
  });
  return out;
}

function scheduledDeckOrder(account: Account, sourceDecks: string[]): string[] {
  const sources = sourceDecks.length ? sourceDecks : [account.lang].filter(Boolean);
  if (!sources.length) return [];
  return (account.schedule ?? [])
    .map((time, index) => {
      const explicit = account.slotDecks?.[time];
      return explicit && sources.includes(explicit) ? explicit : sources[index % sources.length];
    })
    .filter(Boolean);
}

function scheduledCountsByDeck(account: Account, sourceDecks: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const deckId of sourceDecks.length ? sourceDecks : [account.lang].filter(Boolean)) counts.set(deckId, 0);
  for (const deckId of scheduledDeckOrder(account, sourceDecks)) counts.set(deckId, (counts.get(deckId) ?? 0) + 1);
  return counts;
}

function effectiveCapacityForSchedule(
  account: Account,
  sourceDecks: string[],
  countsByDeck: Record<string, number>,
  fallbackTotal: number,
): { effective: number; runwayDays: number | null } {
  const cleanSources = cleanSuperAdminSourceDecks(sourceDecks.length ? sourceDecks : [account.lang].filter(Boolean));
  const postsPerDay = scheduledDeckOrder(account, cleanSources).length;
  if (postsPerDay <= 0) return { effective: Math.max(0, Math.floor(fallbackTotal)), runwayDays: null };

  // The scheduler pins a slot to its configured deck first, then falls back to the other source decks
  // when that deck has no ready video. Runway should model the same behavior, otherwise one empty
  // source can make a channel look stopped even when other ready videos will still be posted.
  const sourceSet = new Set(cleanSources);
  const effective = Math.max(
    0,
    Math.floor(
      Object.entries(countsByDeck).reduce((sum, [deckId, count]) => (sourceSet.has(deckId) ? sum + Math.max(0, Number(count) || 0) : sum), 0),
    ),
  );
  const total = effective > 0 ? effective : Math.max(0, Math.floor(fallbackTotal));
  return { effective: total, runwayDays: total / postsPerDay };
}

function deckDeficitSequence(account: Account, sourceDecks: string[], queuedByDeck: Record<string, number>, targetRunwayDays: number): string[] {
  const scheduleOrder = scheduledDeckOrder(account, sourceDecks);
  if (!scheduleOrder.length || targetRunwayDays <= 0) return [];

  const counts = scheduledCountsByDeck(account, sourceDecks);
  const deficits = new Map<string, number>();
  for (const [deckId, postsPerDay] of counts) {
    if (postsPerDay <= 0) continue;
    const wanted = Math.ceil(targetRunwayDays * postsPerDay);
    const missing = wanted - Math.max(0, Number(queuedByDeck[deckId] ?? 0));
    if (missing > 0) deficits.set(deckId, missing);
  }
  if (!deficits.size) return [];

  const order = unique(scheduleOrder.filter((deckId) => deficits.has(deckId)));
  const out: string[] = [];
  while ([...deficits.values()].some((value) => value > 0)) {
    let progressed = false;
    for (const deckId of order) {
      const left = deficits.get(deckId) ?? 0;
      if (left <= 0) continue;
      out.push(deckId);
      deficits.set(deckId, left - 1);
      progressed = true;
    }
    if (!progressed) break;
  }
  return out;
}

function targetRunwayDeckSequence(account: Account, sourceDecks: string[], targetRunwayDays: number): string[] {
  const scheduleOrder = scheduledDeckOrder(account, sourceDecks);
  const perDay = scheduleOrder.length;
  if (perDay <= 0 || targetRunwayDays <= 0) return [];
  const total = Math.ceil(targetRunwayDays * perDay);
  // Runway means "how long the currently saved scheduler slots can keep posting".
  // Source weights drive newly generated batches and re-applied schedules, but top-up-to-days must
  // match the persisted slotDecks or a source scheduled twice per day can stay underfilled.
  const dailySequence = scheduleOrder;
  const day = dailySequence.filter((deckId) => sourceDecks.includes(deckId));
  if (!day.length) return [];
  const out: string[] = [];
  for (let index = 0; index < total; index++) out.push(day[index % day.length]);
  return out;
}

function deckDeficitFromTargetSequence(targetSequence: string[], countedByDeck: Record<string, number>): string[] {
  const targetByDeck = countDeckSequence(targetSequence);
  const deficits = new Map<string, number>();
  for (const [deckId, target] of Object.entries(targetByDeck)) {
    const missing = target - Math.max(0, Number(countedByDeck[deckId] ?? 0));
    if (missing > 0) deficits.set(deckId, missing);
  }
  if (!deficits.size) return [];

  const out: string[] = [];
  for (const deckId of targetSequence) {
    const left = deficits.get(deckId) ?? 0;
    if (left <= 0) continue;
    out.push(deckId);
    deficits.set(deckId, left - 1);
  }
  return out;
}

function maxDeckDeficitSequence(sequences: string[][]): string[] {
  const order: string[] = [];
  const maxByDeck = new Map<string, number>();
  for (const sequence of sequences) {
    const counts = countDeckSequence(sequence);
    for (const deckId of sequence) if (!order.includes(deckId)) order.push(deckId);
    for (const [deckId, count] of Object.entries(counts)) {
      maxByDeck.set(deckId, Math.max(maxByDeck.get(deckId) ?? 0, count));
    }
  }
  const out: string[] = [];
  while ([...maxByDeck.values()].some((count) => count > 0)) {
    let progressed = false;
    for (const deckId of order) {
      const left = maxByDeck.get(deckId) ?? 0;
      if (left <= 0) continue;
      out.push(deckId);
      maxByDeck.set(deckId, left - 1);
      progressed = true;
    }
    if (!progressed) break;
  }
  return out;
}

function weightedDeckDeficitSequence(
  block: BlockDef,
  account: Account,
  sourceDecks: string[],
  weights: Record<string, number>,
  queuedByDeck: Record<string, number>,
  targetQueued: number,
  seed?: string,
): string[] {
  if (targetQueued <= 0) return [];
  const targetSequence = weightedDeckSlotsBalanced(block, account, sourceDecks, weights, targetQueued, seed);
  const targetByDeck = countDeckSequence(targetSequence);
  const deficits = new Map<string, number>();
  for (const [deckId, target] of Object.entries(targetByDeck)) {
    const missing = target - Math.max(0, Number(queuedByDeck[deckId] ?? 0));
    if (missing > 0) deficits.set(deckId, missing);
  }
  if (!deficits.size) return [];

  const out: string[] = [];
  for (const deckId of targetSequence) {
    const left = deficits.get(deckId) ?? 0;
    if (left <= 0) continue;
    out.push(deckId);
    deficits.set(deckId, left - 1);
  }
  return out;
}

function capDeckSequenceByFreeCards(db: Db, deps: RouteDeps, ownerId: number, accountId: number, sequence: string[]): string[] {
  if (!sequence.length) return sequence;
  const freeByDeck = new Map<string, number>();
  for (const deckId of unique(sequence)) {
    freeByDeck.set(deckId, freeCardsForGenerationDeck(db, deps, ownerId, accountId, deckId));
  }
  const out: string[] = [];
  for (const deckId of sequence) {
    const left = freeByDeck.get(deckId) ?? 0;
    if (left <= 0) continue;
    out.push(deckId);
    freeByDeck.set(deckId, left - 1);
  }
  return out;
}

function countDeckSequence(sequence: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const deckId of sequence) counts[deckId] = (counts[deckId] ?? 0) + 1;
  return counts;
}

function queuedRemainingForOwnerDeck(ownerId: number, deckId: string): number {
  let total = 0;
  for (const job of genListStatuses()) {
    if (job.ownerUserId !== ownerId) continue;
    if (job.state !== "queued" && job.state !== "running") continue;
    const remaining = Math.max(0, job.total - job.done);
    if (remaining <= 0) continue;
    const decks = job.deckIds ?? [];
    if (!decks.length) {
      total += remaining;
      continue;
    }
    for (let index = job.done; index < job.total; index++) {
      if (decks[index % decks.length] === deckId) total++;
    }
  }
  return total;
}

function queuedRemainingForAccountDecks(accountId: number): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const job of genListStatuses()) {
    if (job.accountId !== accountId) continue;
    if (job.state !== "queued" && job.state !== "running") continue;
    const decks = job.deckIds ?? [];
    if (!decks.length) continue;
    for (let index = job.done; index < job.total; index++) {
      const deckId = decks[index % decks.length];
      counts[deckId] = (counts[deckId] ?? 0) + 1;
    }
  }
  return counts;
}

function mixedBlockForAccount(deps: RouteDeps, account: Account): BlockDef | null {
  return BLOCKS.find((block) => !!block.sourceGroups?.length && accountBelongsToBlock(deps, block, account)) ?? null;
}

export function thematicBlockSlotDecksForAccount(
  db: Db,
  deps: RouteDeps,
  account: Account,
  schedule: string[],
  sourceDecks?: string[],
): Record<string, string> | null {
  const block = mixedBlockForAccount(deps, account);
  if (!block) return null;
  const rawDecks = sourceDecks?.length ? sourceDecks : deps.deckAccess.accountSourceDecks(account);
  const ownerId = account.userId ?? armenId(db) ?? 0;
  const decks = sourceDecksForSchedule(db, deps, ownerId, account, rawDecks);
  const weights = readSourceWeights(db, block);
  if (!activeSourceGroups(block, account, decks, weights).length) return null;
  return slotDecksForSchedule(block, account, schedule, decks, weights);
}

export function thematicBlockDeckSequenceForGeneration(
  db: Db,
  deps: RouteDeps,
  ownerId: number,
  account: Account,
  requestedDecks: string[],
  count: number,
): string[] | null {
  const block = mixedBlockForAccount(deps, account);
  if (!block || requestedDecks.length <= 1 || count <= 0) return null;
  const selectedSources = cleanSuperAdminSourceDecks(deps.deckAccess.accountSourceDecks(account));
  const cleanRequested = cleanSuperAdminSourceDecks(requestedDecks);
  const requestedSet = new Set(cleanRequested);
  const sourceDecks = selectedSources.filter((deckId) => requestedSet.has(deckId));
  if (sourceDecks.length <= 1 || !sameDeckSet(unique(sourceDecks), unique(cleanRequested))) return null;

  const generationDecks = sourceDecksForGeneration(db, deps, ownerId, account, sourceDecks);
  if (!generationDecks.length) return [];

  const weights = readSourceWeights(db, block);
  if (!activeSourceGroups(block, account, generationDecks, weights).length) return [];

  const queuedByDeck = videosByDeck(db.listVideos(account.id));
  const targetQueued = sumCounts(queuedByDeck) + count;
  const seed = sourceSequenceSeed(block, account, generationDecks, weights, `gen-queue:${targetQueued}:${count}`);
  let sequence = weightedDeckDeficitSequence(block, account, generationDecks, weights, queuedByDeck, targetQueued, seed);
  if (sequence.length < count)
    sequence = [
      ...sequence,
      ...weightedDeckSlots(block, account, generationDecks, weights, count - sequence.length, `${seed}|fallback`),
    ];
  sequence = sequence.slice(0, count);
  const capped = capDeckSequenceByFreeCards(db, deps, ownerId, account.id, sequence);
  return capped;
}

function buildPayload(db: Db, deps: RouteDeps) {
  const ownerId = armenId(db);
  if (ownerId == null) return { languages: [], blocks: [], unassignedAccounts: [] };
  normalizeSourceWeightSettings(db);
  cleanupDrainedAutoExpireDecksForUser(db, ownerId);
  const accounts = db.listAccountsByUser(ownerId);
  const languages = visibleLanguageDefsForAccounts(accounts);
  const ctx = makeBlockContext(db, accounts);
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const assigned = new Set<number>();
  const supportedLangs = new Set<string>(BLOCK_LANGS.map((lang) => lang.code));

  const blocks = BLOCKS.map((block) => {
    const blockAccounts = accounts.filter((account) => accountBelongsToBlock(deps, block, account));
    const blockAccountIds = new Set(blockAccounts.map((account) => account.id));
    const blockLangs = visibleLanguageDefsForAccounts(blockAccounts);
    const cells = blockLangs.map((lang) => {
      const cellAccounts = [...blockAccountIds]
        .map((id) => byId.get(id))
        .filter((account): account is Account => !!account && account.channelLang === lang.code)
        .map((account) => {
          assigned.add(account.id);
          return accountSummary(db, deps, account, ctx, block.id);
        });
      return {
        lang: lang.code,
        label: lang.label,
        accounts: cellAccounts,
        defaultSourceDecks: blockDefaultSourcesForDb(db, block.id, lang.code),
      };
    });
    const allAccounts = cells.flatMap((cell) => cell.accounts);
    const sync = blockSyncMetrics(allAccounts);
    return {
      id: block.id,
      title: block.title,
      description: block.description,
      rules: block.rules,
      sourceGroups: publicSourceGroups(db, block),
      cells,
      totalAccounts: allAccounts.length,
      queued: sync.queued,
      shortAvailable: sync.shortAvailable,
      postsPerDay: sync.postsPerDay,
      runwayDays: sync.runwayDays,
      totalQueued: sync.totalQueued,
      totalShortAvailable: sync.totalShortAvailable,
      totalPostsPerDay: sync.totalPostsPerDay,
    };
  });

  const configuredIds = new Set<number>();
  for (const block of BLOCKS) {
    for (const account of accounts) {
      if (accountBelongsToBlock(deps, block, account)) configuredIds.add(account.id);
    }
  }
  const unassignedAccounts = accounts
    .filter((account) => !assigned.has(account.id) || !supportedLangs.has(account.channelLang) || !configuredIds.has(account.id))
    .map((account) => accountSummary(db, deps, account, ctx));

  return { languages, blocks, unassignedAccounts };
}

function blockAccounts(db: Db, deps: RouteDeps, blockId: string): Account[] {
  const ownerId = armenId(db);
  if (ownerId == null) return [];
  const block = findBlockDef(blockId);
  if (!block) return [];
  const supportedLangs = new Set<string>(BLOCK_LANGS.map((lang) => lang.code));
  return db
    .listAccountsByUser(ownerId)
    .filter((account) => supportedLangs.has(account.channelLang) && accountBelongsToBlock(deps, block, account));
}

function requestedAccountIds(body: unknown): Set<number> | null {
  const ids = (body as { accountIds?: unknown } | null)?.accountIds;
  if (!Array.isArray(ids)) return null;
  return new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)));
}

type NormalizeShortage = {
  ownerId: number;
  accountId: number;
  channelName: string;
  deckId: string;
  deckName: string;
  missing: number;
  available: number;
  needed: number;
};

type NormalizeSkip = {
  accountId: number;
  channelName: string;
  reason: string;
  currentQueued?: number;
  targetQueued?: number;
  currentRunwayDays?: number;
  targetRunwayDays?: number;
  rawQueued?: number;
};

type NormalizePlannedJob = {
  accountId: number;
  channelName: string;
  ownerId: number;
  deckIds: string[];
  total: number;
  currentQueued: number;
  targetQueued: number;
  currentRunwayDays: number;
  targetRunwayDays: number;
  rawQueued: number;
};

type NormalizePlan = {
  blockId: string;
  targetQueued: number;
  targetRunwayDays: number;
  jobs: NormalizePlannedJob[];
  skipped: NormalizeSkip[];
  shortages: NormalizeShortage[];
};

export function planChannelBlockNormalize(input: {
  db: Db;
  deps: RouteDeps;
  block: BlockDef;
  blockId: string;
  accounts: Account[];
  sourceWeights: Record<string, number>;
  requestedTargetRunwayDays: number;
  fallbackOwnerId: number;
}): NormalizePlan {
  const { db, deps, block, blockId, accounts, sourceWeights, requestedTargetRunwayDays, fallbackOwnerId } = input;
  const queuedByAccountDeck = new Map<number, Record<string, number>>();
  const queuedTotals = new Map<number, number>();
  const coverageByAccount = new Map<number, { effective: number; runwayDays: number | null }>();
  for (const account of accounts) {
    const queuedByDeck = videosByDeck(db.listVideos(account.id));
    const sourceDecks = cleanSuperAdminSourceDecks(deps.deckAccess.accountSourceDecks(account));
    const total = sumCounts(queuedByDeck);
    queuedByAccountDeck.set(account.id, queuedByDeck);
    queuedTotals.set(account.id, total);
    coverageByAccount.set(account.id, effectiveCapacityForSchedule(account, sourceDecks, queuedByDeck, total));
  }

  const currentMaxRunwayDays = Math.max(
    0,
    ...accounts.map((account) => {
      const coverage = coverageByAccount.get(account.id);
      if (coverage?.runwayDays != null) return coverage.runwayDays;
      const perDay = scheduledDeckOrder(account, cleanSuperAdminSourceDecks(deps.deckAccess.accountSourceDecks(account))).length;
      return perDay > 0 ? (coverage?.effective ?? 0) / perDay : 0;
    }),
  );
  const targetRunwayDays =
    Number.isFinite(requestedTargetRunwayDays) && requestedTargetRunwayDays > 0
      ? Math.min(365, Math.max(1, requestedTargetRunwayDays))
      : currentMaxRunwayDays;
  const targetQueued = Math.max(
    0,
    ...accounts.map((account) =>
      Math.ceil(targetRunwayDays * scheduledDeckOrder(account, cleanSuperAdminSourceDecks(deps.deckAccess.accountSourceDecks(account))).length),
    ),
  );
  const jobs: NormalizePlannedJob[] = [];
  const skipped: NormalizeSkip[] = [];
  const shortages = new Map<string, NormalizeShortage>();
  const freeRemaining = new Map<string, number>();
  const reserveFree = (ownerId: number, deckId: string, needed: number, account: Account): number => {
    if (needed <= 0) return needed;
    if (isRepeatPackDeck(db, ownerId, deckId)) return needed;
    const perAccountAutoExpire = isPerAccountAutoExpirePackDeck(db, ownerId, deckId);
    if (!perAccountAutoExpire && db.hasFeature(ownerId, INFINITE_PACKS_FEATURE)) return needed;
    const key = perAccountAutoExpire ? `${ownerId}|${account.id}|${deckId}` : `${ownerId}|${deckId}`;
    if (!freeRemaining.has(key)) {
      const available = perAccountAutoExpire
        ? availableForDeckForAccount(db, deps, undefined, ownerId, account.id, deckId) - (queuedRemainingForAccountDecks(account.id)[deckId] ?? 0)
        : deps.deckAccess.availableUnusedForDecks(ownerId, [deckId]) - queuedRemainingForOwnerDeck(ownerId, deckId);
      freeRemaining.set(key, Math.max(0, available));
    }
    const available = freeRemaining.get(key) ?? 0;
    const taken = Math.min(needed, available);
    freeRemaining.set(key, available - taken);
    return taken;
  };
  const addChannelShortage = (ownerId: number, account: Account, missing: number, needed: number, available: number) => {
    if (missing <= 0) return;
    const deckId = "__block_sources";
    const shortageKey = `${ownerId}|${account.id}|${deckId}`;
    const cur = shortages.get(shortageKey);
    if (cur) {
      cur.missing += missing;
      cur.needed += needed;
      cur.available += available;
      return;
    }
    shortages.set(shortageKey, {
      ownerId,
      accountId: account.id,
      channelName: account.ytChannelTitle || account.channelName,
      deckId,
      deckName: "доступные источники",
      missing,
      available,
      needed,
    });
  };

  for (const account of accounts) {
    const deckIds = cleanSuperAdminSourceDecks(deps.deckAccess.accountSourceDecks(account));
    const perDay = scheduledDeckOrder(account, deckIds).length;
    const accountTargetQueued = Math.ceil(targetRunwayDays * perDay);
    const coverage = coverageByAccount.get(account.id);
    const currentQueued = coverage?.effective ?? 0;
    const currentRunwayDays = coverage?.runwayDays ?? (perDay > 0 ? currentQueued / perDay : 0);
    const ownerId = account.userId ?? fallbackOwnerId;
    if (!deckIds.length) {
      skipped.push({
        accountId: account.id,
        channelName: account.ytChannelTitle || account.channelName,
        reason: "no_sources",
        currentQueued,
        targetQueued: accountTargetQueued,
      });
      continue;
    }
    const queuedByDeck = queuedByAccountDeck.get(account.id) ?? {};
    const countedByDeck = { ...queuedByDeck };
    const inFlightByDeck = queuedRemainingForAccountDecks(account.id);
    for (const [deckId, count] of Object.entries(inFlightByDeck)) countedByDeck[deckId] = (countedByDeck[deckId] ?? 0) + count;
    const generationDeckIds = sourceDecksForGeneration(db, deps, ownerId, account, deckIds);
    if (!generationDeckIds.length) {
      skipped.push({
        accountId: account.id,
        channelName: account.ytChannelTitle || account.channelName,
        reason: "no_free_cards",
        currentQueued,
        targetQueued: accountTargetQueued,
      });
      continue;
    }
    const sequenceSeed = sourceSequenceSeed(
      block,
      account,
      generationDeckIds,
      sourceWeights,
      `normalize:${accountTargetQueued}:${targetRunwayDays}`,
    );
    const mixDeficit = activeSourceGroups(block, account, generationDeckIds, sourceWeights).length
      ? weightedDeckDeficitSequence(block, account, generationDeckIds, sourceWeights, countedByDeck, accountTargetQueued, sequenceSeed)
      : deckDeficitSequence(account, generationDeckIds, countedByDeck, targetRunwayDays);
    const readyDeficit = Math.max(0, accountTargetQueued - currentQueued);
    const slotDeficit = deckDeficitFromTargetSequence(targetRunwayDeckSequence(account, generationDeckIds, targetRunwayDays), countedByDeck);
    const combinedDeficit = maxDeckDeficitSequence([mixDeficit, slotDeficit]);
    const exactDeficit = readyDeficit > 0 ? combinedDeficit.slice(0, Math.max(readyDeficit, slotDeficit.length)) : combinedDeficit;
    const sourceDeficit = exactDeficit.length;
    if (readyDeficit <= 0 && sourceDeficit <= 0) {
      skipped.push({
        accountId: account.id,
        channelName: account.ytChannelTitle || account.channelName,
        reason: "already_at_target",
        currentQueued,
        targetQueued: accountTargetQueued,
        currentRunwayDays,
        targetRunwayDays,
      });
      continue;
    }
    if (readyDeficit > 0 && sourceDeficit <= 0) {
      skipped.push({
        accountId: account.id,
        channelName: account.ytChannelTitle || account.channelName,
        reason: "generation_in_progress",
        currentQueued,
        targetQueued: accountTargetQueued,
        currentRunwayDays,
        targetRunwayDays,
      });
      continue;
    }
    // exactDeficit is computed against READY + in-flight videos per deck, so a repeated click does not
    // stack a second full top-up while the first one is still rendering. If a preferred source has run
    // out of free cards, refill the remaining target from other available block sources instead of
    // treating that one source as a hard blocker.
    const missing = Math.max(readyDeficit, sourceDeficit);
    const jobDeckIds: string[] = [];
    const appendReservable = (deckIds: string[]): number => {
      let added = 0;
      for (const deckId of deckIds) {
        if (jobDeckIds.length >= missing) break;
        if (reserveFree(ownerId, deckId, 1, account) <= 0) continue;
        jobDeckIds.push(deckId);
        added += 1;
      }
      return added;
    };
    appendReservable(exactDeficit.slice(0, missing));
    let refillPass = 0;
    while (jobDeckIds.length < missing && refillPass < 20) {
      const deficit = missing - jobDeckIds.length;
      const refill = [
        ...weightedDeckSlots(block, account, generationDeckIds, sourceWeights, deficit + generationDeckIds.length, `${sequenceSeed}|redistribute|${refillPass}`),
        ...generationDeckIds,
      ];
      if (appendReservable(refill) <= 0) break;
      refillPass += 1;
    }
    const total = jobDeckIds.length;
    if (total <= 0) {
      skipped.push({
        accountId: account.id,
        channelName: account.ytChannelTitle || account.channelName,
        reason: "no_free_cards",
        currentQueued,
        targetQueued: accountTargetQueued,
      });
      continue;
    }
    addChannelShortage(ownerId, account, missing - total, missing, total);
    jobs.push({
      accountId: account.id,
      channelName: account.ytChannelTitle || account.channelName,
      ownerId,
      deckIds: jobDeckIds,
      total,
      currentQueued,
      targetQueued: accountTargetQueued,
      currentRunwayDays,
      targetRunwayDays,
      rawQueued: queuedTotals.get(account.id) ?? 0,
    });
  }

  return { blockId, targetQueued, targetRunwayDays, jobs, skipped, shortages: [...shortages.values()] };
}

function toMin(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function randomDayTimes(n: number, avoid: Set<number> = new Set()): string[] {
  if (n <= 0) return [];
  const interval = 1440 / n;
  const phase = Math.random() * interval;
  const jitter = Math.min(interval * 0.35, 20);
  const used = new Set<number>();
  const mins: number[] = [];
  for (let i = 0; i < n; i++) {
    let m = Math.round(phase + i * interval + (Math.random() * 2 - 1) * jitter);
    m = ((m % 1440) + 1440) % 1440;
    let guard = 0;
    while ((used.has(m) || avoid.has(m)) && guard++ < 180) m = (m + 1) % 1440;
    used.add(m);
    mins.push(m);
  }
  return mins
    .sort((a, b) => a - b)
    .map((m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
}

export function registerSuperAdminChannelBlockRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  app.get("/api/super-admin/channel-blocks", async (req, reply) => {
    if (!requireSuperAdmin(req, reply, deps)) return;
    return buildPayload(db, deps);
  });

  app.post("/api/super-admin/channel-blocks/:id/accounts", async (req, reply) => {
    if (!requireSuperAdmin(req, reply, deps)) return;
    const blockId = canonicalBlockId((req.params as { id: string }).id);
    const lang = String((req.body as { lang?: unknown } | null)?.lang || "").trim().toLowerCase();
    const ownerId = armenId(db);
    const block = findBlockDef(blockId);
    const langDef = BLOCK_LANGS.find((candidate) => candidate.code === lang);
    if (ownerId == null || !block) return reply.code(404).send({ error: "Тематический блок не найден." });
    if (!langDef) return reply.code(400).send({ error: "Этот язык не входит в сетку блока." });

    const sourceDecks = blockDefaultSourcesForDb(db, block.id, lang);
    if (!sourceDecks.length) {
      return reply.code(400).send({ error: "Для этого языка пока нет безопасно подготовленных паков блока." });
    }
    for (const deckId of sourceDecks) {
      const err = deps.deckAccess.validateAccountSourceDeck(req, deckId, lang);
      if (err) return reply.code(err.startsWith("Неизвестный") ? 400 : 403).send({ error: err });
    }

    const account = db.createAccount({
      userId: ownerId,
      channelName: `${block.title} ${langDef.label}`,
      theme: block.title,
      lang: sourceDecks[0],
      sourceDecks,
      channelLang: lang,
      schedule: [],
      avatar: null,
      avatarSource: "youtube",
      status: "needs_auth",
      enabled: true,
    });
    return accountSummary(db, deps, account);
  });

  app.post("/api/super-admin/channel-blocks/:id/generate", async (req, reply) => {
    if (!requireSuperAdmin(req, reply, deps)) return;
    const blockId = canonicalBlockId((req.params as { id: string }).id);
    const block = findBlockDef(blockId);
    const count = Math.max(1, Math.floor(Number((req.body as { count?: unknown } | null)?.count) || 1));
    const only = requestedAccountIds(req.body);
    const accounts = blockAccounts(db, deps, blockId).filter((account) => !only || only.has(account.id));
    if (!block || !accounts.length) return reply.code(404).send({ error: "Тематический блок не найден или пуст." });
    const sourceWeights = requestedSourceWeights(db, block, req.body);

    const jobs: unknown[] = [];
    const skipped: unknown[] = [];
    for (const account of accounts) {
      const ownerId = account.userId ?? uid(req);
      const deckIds = cleanSuperAdminSourceDecks(deps.deckAccess.accountSourceDecks(account));
      if (!deckIds.length) {
        skipped.push({ accountId: account.id, channelName: account.channelName, reason: "no_sources" });
        continue;
      }
      const generationDeckIds = sourceDecksForGeneration(db, deps, ownerId, account, deckIds);
      if (!generationDeckIds.length) {
        skipped.push({ accountId: account.id, channelName: account.channelName, reason: "no_free_cards" });
        continue;
      }
      let total = count;
      if (!db.hasFeature(ownerId, INFINITE_PACKS_FEATURE)) {
        const free = generationDeckIds.reduce((sum, deckId) => {
          const deckFree = freeCardsForGenerationDeck(db, deps, ownerId, account.id, deckId);
          if (deckFree >= Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
          return sum + deckFree;
        }, 0);
        if (free <= 0) {
          skipped.push({ accountId: account.id, channelName: account.channelName, reason: "no_free_cards" });
          continue;
        }
        total = Math.min(total, free);
      }
      const sequenceSeed = sourceSequenceSeed(
        block,
        account,
        generationDeckIds,
        sourceWeights,
        `manual-generate:${new Date().toISOString().slice(0, 13)}:${total}`,
      );
      const jobDeckIds = weightedDeckSequence(block, account, generationDeckIds, sourceWeights, total, sequenceSeed);
      const job = genEnqueue(uid(req), account.id, total, ownerId, jobDeckIds);
      jobs.push({ accountId: account.id, channelName: account.channelName, deckIds: jobDeckIds, jobId: job.id, total: job.total });
    }
    return { blockId, requestedPerChannel: count, jobs, skipped };
  });

  app.post("/api/super-admin/channel-blocks/:id/normalize", async (req, reply) => {
    if (!requireSuperAdmin(req, reply, deps)) return;
    const blockId = canonicalBlockId((req.params as { id: string }).id);
    const block = findBlockDef(blockId);
    const requestedTargetRunwayDays = Number((req.body as { targetRunwayDays?: unknown } | null)?.targetRunwayDays);
    const only = requestedAccountIds(req.body);
    const accounts = blockAccounts(db, deps, blockId).filter((account) => !only || only.has(account.id));
    if (!block || !accounts.length) return reply.code(404).send({ error: "Тематический блок не найден или пуст." });
    const sourceWeights = requestedSourceWeights(db, block, req.body);
    const requesterId = uid(req);
    const plan = planChannelBlockNormalize({
      db,
      deps,
      block,
      blockId,
      accounts,
      sourceWeights,
      requestedTargetRunwayDays,
      fallbackOwnerId: requesterId,
    });
    const jobs = plan.jobs.map((planned) => {
      const job = genEnqueue(requesterId, planned.accountId, planned.total, planned.ownerId, planned.deckIds);
      return {
        accountId: planned.accountId,
        channelName: planned.channelName,
        deckIds: planned.deckIds,
        jobId: job.id,
        total: job.total,
        currentQueued: planned.currentQueued,
        targetQueued: planned.targetQueued,
        currentRunwayDays: planned.currentRunwayDays,
        targetRunwayDays: planned.targetRunwayDays,
        rawQueued: planned.rawQueued,
      };
    });
    return { blockId, targetQueued: plan.targetQueued, targetRunwayDays: plan.targetRunwayDays, jobs, skipped: plan.skipped, shortages: plan.shortages };
  });

  app.post("/api/super-admin/channel-blocks/:id/normalize-preview", async (req, reply) => {
    if (!requireSuperAdmin(req, reply, deps)) return;
    const blockId = canonicalBlockId((req.params as { id: string }).id);
    const block = findBlockDef(blockId);
    const requestedTargetRunwayDays = Number((req.body as { targetRunwayDays?: unknown } | null)?.targetRunwayDays);
    const only = requestedAccountIds(req.body);
    const accounts = blockAccounts(db, deps, blockId).filter((account) => !only || only.has(account.id));
    if (!block || !accounts.length) return reply.code(404).send({ error: "Тематический блок не найден или пуст." });
    const sourceWeights = previewSourceWeights(db, block, req.body);
    const plan = planChannelBlockNormalize({
      db,
      deps,
      block,
      blockId,
      accounts,
      sourceWeights,
      requestedTargetRunwayDays,
      fallbackOwnerId: uid(req),
    });
    return { blockId, targetQueued: plan.targetQueued, targetRunwayDays: plan.targetRunwayDays, jobs: [], skipped: plan.skipped, shortages: plan.shortages };
  });

  app.post("/api/super-admin/channel-blocks/:id/schedule", async (req, reply) => {
    if (!requireSuperAdmin(req, reply, deps)) return;
    const blockId = canonicalBlockId((req.params as { id: string }).id);
    const block = findBlockDef(blockId);
    const perDay = Math.max(0, Math.floor(Number((req.body as { perDay?: unknown } | null)?.perDay) || 0));
    if (perDay > 20) return reply.code(400).send({ error: "Максимум 20 публикаций в сутки на канал." });
    const only = requestedAccountIds(req.body);
    const accounts = blockAccounts(db, deps, blockId).filter((account) => !only || only.has(account.id));
    if (!block || !accounts.length) return reply.code(404).send({ error: "Тематический блок не найден или пуст." });
    const sourceWeights = requestedSourceWeights(db, block, req.body);

    const taken = new Set<number>();
    const updated: unknown[] = [];
    const skipped: unknown[] = [];
    for (const account of accounts) {
      const ownerId = account.userId ?? armenId(db) ?? uid(req);
      const owner = db.getUserById(ownerId);
      const cap = accountDailyScheduleCap(owner?.role === "admin");
      if (perDay > cap) {
        skipped.push({ accountId: account.id, channelName: account.channelName, reason: "per_channel_limit", cap });
        continue;
      }
      if (account.oauthClientId != null) {
        const otherSlots = db.scheduleSlotsForKey(account.oauthClientId, account.id);
        const keyCap = googleKeyDailyScheduleCap(isSuperAdminUser(owner));
        if (otherSlots + perDay > keyCap) {
          skipped.push({
            accountId: account.id,
            channelName: account.channelName,
            reason: "google_key_limit",
            available: Math.max(0, keyCap - otherSlots),
          });
          continue;
        }
      }
      const schedule = randomDayTimes(perDay, taken);
      for (const time of schedule) taken.add(toMin(time));
      const sourceDecks = cleanSuperAdminSourceDecks(deps.deckAccess.accountSourceDecks(account));
      const queuedByDeck = videosByDeck(db.listVideos(account.id));
      const scheduleDecks = sourceDecksForSchedule(db, deps, ownerId, account, sourceDecks, queuedByDeck);
      const next = db.updateAccount(account.id, { schedule, slotDecks: slotDecksForSchedule(block, account, schedule, scheduleDecks, sourceWeights) });
      if (next) updated.push({ accountId: next.id, channelName: next.channelName, schedule: next.schedule });
    }
    return { blockId, perDay, updated, skipped };
  });

  app.post("/api/super-admin/channel-blocks/:id/source-weights", async (req, reply) => {
    if (!requireSuperAdmin(req, reply, deps)) return;
    const blockId = canonicalBlockId((req.params as { id: string }).id);
    const block = findBlockDef(blockId);
    if (!block || !block.sourceGroups?.length) return reply.code(404).send({ error: "Тематический блок не найден." });
    const sourceWeights = requestedSourceWeights(db, block, req.body);
    return { blockId, sourceGroups: publicSourceGroups(db, block), sourceWeights };
  });
}
