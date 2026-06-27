import type { FastifyInstance } from "fastify";
import type { Account, Db, Video } from "../db.ts";
import { SUPER_ADMIN_USERNAME, isSuperAdminUser } from "../auth.ts";
import { DECKS, deckLang, isPackDeckId } from "../../src/anecdotes/decks.ts";
import { libraryStats } from "../../src/anecdotes/library.ts";
import { getPack } from "../../src/packs/store.ts";
import { uid } from "../infra/auth-session.ts";
import type { RouteDeps } from "./deps.ts";
import { packCardKey } from "../services/pack-gen.ts";
import {
  enqueue as genEnqueue,
  listStatuses as genListStatuses,
  queuedRemainingForOwnerDecks,
} from "../services/gen-queue.ts";
import { INFINITE_PACKS_FEATURE } from "../services/infinite-packs.ts";
import { USER_DAILY_SCHEDULE_CAP, accountDailyScheduleCap } from "../infra/account-limits.ts";

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
  ru: ["memes-ru"],
  de: ["memes-de"],
  it: ["memes-it"],
  fr: ["memes-fr"],
  en: ["memes-en"],
  es: ["memes-es"],
  pt: ["memes-pt"],
  hi: ["memes-hi"],
  id: ["memes-id"],
  ar: ["memes-ar"],
};

const FUNNY_QUOTE_DECK_BY_LANG: Record<string, string[]> = {
  ru: ["funny-quotes-ru"],
  de: ["funny-quotes-de"],
  it: ["funny-quotes-it"],
  fr: ["funny-quotes-fr"],
  en: ["funny-quotes-en"],
  es: ["funny-quotes-es"],
  pt: ["funny-quotes-pt"],
};

const RIDDLE_VISUAL_DECK_BY_LANG: Record<string, string[]> = {
  ru: ["visual-riddles"],
  de: ["visual-riddles-de"],
  en: ["visual-riddles-en"],
};

const JOKE_SOURCE_GROUPS: SourceGroupDef[] = [
  {
    id: "jokes",
    title: "Анекдоты",
    defaultWeight: 5,
    sources: JOKE_TEXT_DECK_BY_LANG,
  },
  {
    id: "memes",
    title: "Мемы",
    defaultWeight: 3,
    sources: JOKE_MEME_DECK_BY_LANG,
  },
  {
    id: "funny_quotes",
    title: "Смешные цитаты",
    defaultWeight: 1,
    sources: FUNNY_QUOTE_DECK_BY_LANG,
  },
  {
    id: "visual_riddles",
    title: "Вижу Ответ",
    defaultWeight: 1,
    sources: RIDDLE_VISUAL_DECK_BY_LANG,
  },
];

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

const RIDDLE_OPTICAL_DECK_BY_LANG: Record<string, string[]> = {
  ru: ["illusions-ru"],
  ar: ["illusions-ar"],
  de: ["illusions-de"],
  en: ["illusions-en"],
  it: ["illusions-it"],
  es: ["illusions-es"],
  fr: ["illusions-fr"],
  pt: ["illusions-pt"],
  hi: ["illusions-hi"],
  id: ["illusions-id"],
};

const RIDDLE_MIND_FLIP_DECK_BY_LANG: Record<string, string[]> = {
  ru: ["illusions-3d"],
  de: ["illusions-3d-de"],
  en: ["illusions-3d-en"],
};

const RIDDLE_SOURCE_GROUPS: SourceGroupDef[] = [
  {
    id: "visual_riddles",
    title: "Вижу ответ",
    defaultWeight: 1,
    sources: RIDDLE_VISUAL_DECK_BY_LANG,
  },
  {
    id: "optical_illusions",
    title: "Оптические иллюзии",
    defaultWeight: 1,
    sources: RIDDLE_OPTICAL_DECK_BY_LANG,
  },
  {
    id: "mind_flip",
    title: "Обмани свой мозг",
    defaultWeight: 1,
    sources: RIDDLE_MIND_FLIP_DECK_BY_LANG,
  },
  {
    id: "jokes",
    title: "Анекдоты",
    defaultWeight: 1,
    sources: JOKE_TEXT_DECK_BY_LANG,
  },
  {
    id: "memes",
    title: "Мемы",
    defaultWeight: 1,
    sources: JOKE_MEME_DECK_BY_LANG,
  },
];

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
  de: ["pack:психология-mgs-mqe2kfjv"],
};

const STATIC_FACT_DECK_BY_LANG: Record<string, string[]> = {
  en: ["pack:static-facts-en-superadmin"],
  es: ["pack:static-facts-es-superadmin"],
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
    id: "mind_flip",
    title: "Обмани свой мозг",
    defaultWeight: 2,
    sources: RIDDLE_MIND_FLIP_DECK_BY_LANG,
  },
  {
    id: "optical_illusions",
    title: "Оптические иллюзии",
    defaultWeight: 1,
    sources: RIDDLE_OPTICAL_DECK_BY_LANG,
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
];

const BLOCK_DEFAULT_SOURCES: Record<string, Record<string, string[]>> = {
  jokes_memes: JOKE_TEXT_DECK_BY_LANG,
  riddles_illusions: {
    ru: ["visual-riddles", "illusions-ru", "illusions-3d", "ru", "memes-ru"],
    ar: ["illusions-ar", "ar", "memes-ar"],
    de: ["visual-riddles-de", "illusions-de", "illusions-3d-de", "de", "memes-de"],
    en: ["visual-riddles-en", "illusions-en", "illusions-3d-en", "en", "memes-en"],
    it: ["illusions-it", "it", "memes-it"],
    es: ["illusions-es", "pack:chistes-es-public-domain", "memes-es"],
    fr: ["illusions-fr", "fr", "memes-fr"],
    pt: ["illusions-pt", "pt", "memes-pt"],
    hi: ["illusions-hi", "hi", "memes-hi"],
    id: ["illusions-id", "id", "memes-id"],
  },
  islam: {
    ar: ["islamic", "islamic-quotes-ar", "islamic-facts-ar"],
  },
  christianity: {
    en: ["christian", "prayers-en", "christian-quotes-en", "christian-facts-en"],
    de: ["prayers-de"],
  },
};

const BLOCKS: BlockDef[] = [
  {
    id: "jokes_memes",
    title: "Анекдоты и мемы",
    description: "Юмористические паки: анекдоты + мемы по доступным языкам.",
    rules: [
      "Анекдоты не придумывать ИИ: брать только проверенные внешние/PD/licensed корпуса с источниками.",
      "Мемы публиковать массово только после проверки прав на шаблоны/фото и отсутствия оскорбительного контекста.",
      "Локализации считаются одним тематическим семейством, но unsafe-языки или отсутствующие мем-паки не подставляются автоматически.",
    ],
    accountIds: [7, 14, 15, 62, 64, 68, 70, 79, 82],
    sourceGroups: JOKE_SOURCE_GROUPS,
  },
  {
    id: "riddles_illusions",
    title: "Загадки и иллюзии",
    description: "Визуальные загадки и оптические иллюзии.",
    rules: [
      "Один визуальный ассет можно локализовать через текстовые overlays, если права на исходник проверены.",
      "Для новых языков готовить отдельные titles/labels, а не смешивать языки внутри одного ролика.",
      "Анекдоты и мемы в этом блоке остаются отдельными источниками с настраиваемым весом, чтобы не ломать основной визуальный микс.",
    ],
    accountIds: [52, 72, 78],
    sourceGroups: RIDDLE_SOURCE_GROUPS,
  },
  {
    id: "islam",
    title: "Ислам",
    description: "Исламские религиозные источники без смешивания с христианскими каналами.",
    rules: [
      "Исламские тексты и молитвенные формулировки не смешивать с христианскими источниками.",
      "Для каждого религиозного пака нужен отдельный source ledger и ручная проверка переводов/формулировок.",
      "Перед массовой публикацией проверять title/description/thumbnails на спорный, оскорбительный или политизированный контекст.",
      "Музыка/звук подбирается отдельно под религию; для исламских паков использовать немелодический фон или тишину.",
      "В исламских религиозных паках не использовать человеческие лица/портреты: никаких изображений пророков, сподвижников, учёных или современных людей; вместо этого каллиграфия, мечети, орнаменты, книги, свет/текстуры.",
      "Не использовать религиозные тексты для нападок на защищённые группы, оправдания насилия, экстремизма или обещаний медицинских чудес.",
    ],
    accountIds: [23],
    sourceGroups: ISLAM_SOURCE_GROUPS,
  },
  {
    id: "christianity",
    title: "Христианство",
    description: "Христианские источники отдельно от исламских каналов.",
    rules: [
      "Христианские KJV/молитвенные источники не смешивать с исламскими каналами.",
      "Для каждого религиозного пака нужен отдельный source ledger и ручная проверка переводов/формулировок.",
      "Перед массовой публикацией проверять title/description/thumbnails на спорный, оскорбительный или политизированный контекст.",
      "В христианских паках можно использовать только public-domain/clearly licensed религиозные artworks (иконы, фрески, картины, витражи) с source ledger; не выдавать artwork за реальный портрет библейского персонажа.",
      "Не использовать современные фото актёров/людей как Иисуса, апостолов, святых или пророков без явных прав и контекста.",
      "Не использовать религиозные тексты для нападок на защищённые группы, оправдания насилия, экстремизма или обещаний медицинских чудес.",
    ],
    accountIds: [31],
    sourceGroups: CHRISTIANITY_SOURCE_GROUPS,
  },
  {
    id: "quotes",
    title: "ФАКТЫ",
    description: "Факты, иллюзии, лайфхаки, анекдоты, видеоцитаты и психология в одном тематическом блоке.",
    rules: [
      "Факты требуют проверяемого источника; численные данные и названия нужно перепроверять.",
      "Иллюзии внутри блока подставлять только на языке канала; не смешивать RU-видео в EN/DE-каналах.",
      "Лайфхаки локализовать на одном наборе идей, но бытовые реалии адаптировать под язык.",
      "Если появится озвучка для лайфхаков, новые voiceover-паки собирать через разрешённый TTS-профиль проекта с учётом текущих квот.",
      "Анекдоты внутри блока остаются отдельным источником микса; не смешивать бытовые советы и шутки внутри одной карточки.",
      "Видео-цитаты и статичные цитаты держать отдельными источниками микса.",
      "Запрещены AP/неясные фото, misattribution, экстремистские/насильственные цитаты и protected-class hate.",
      "Не давать медицинских диагнозов/обещаний лечения; формулировать как общие наблюдения и self-help.",
      "Локализации должны сохранять осторожный тон и избегать травматичных/опасных советов.",
    ],
    accountIds: [16, 18, 38, 43, 44, 45, 65, 81],
    sourceGroups: FACT_SOURCE_GROUPS,
  },
];

const BLOCK_ALIASES: Record<string, string> = {
  facts_space: "quotes",
  lifehacks: "quotes",
};

function canonicalBlockId(blockId: string): string {
  return BLOCK_ALIASES[blockId] ?? blockId;
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

function deckSummaries(input: {
  db: Db;
  deps: RouteDeps;
  ctx?: BlockContext;
  blockId?: string;
  ownerId: number;
  deckIds: string[];
  queuedByDeck: Record<string, number>;
}) {
  const { db, deps, ctx, blockId, ownerId, deckIds, queuedByDeck } = input;
  return deckIds.map((deckId) => {
    const title = deckTitle(deckId, ownerId);
    const group = blockId && title.lang ? sourceGroupForDeck(blockId, title.lang, deckId) : null;
    const available = availableForDecks(db, deps, ctx, ownerId, [deckId]);
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
  const groups = sourceGroupsForBlock(blockId);
  if (groups.length) return unique(groups.flatMap((group) => group.sources[lang] ?? []));
  return BLOCK_DEFAULT_SOURCES[blockId]?.[lang] ?? [];
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
  return sameDeckSet(deps.deckAccess.accountSourceDecks(account), defaults);
}

function accountSummary(db: Db, deps: RouteDeps, account: Account, ctx?: BlockContext, blockId?: string) {
  const ownerId = account.userId ?? 0;
  const sourceDecks = deps.deckAccess.accountSourceDecks(account);
  const queuedByDeck = ctx?.queuedByAccountDeck.get(account.id) ?? videosByDeck(db.listVideos(account.id));
  const decks = deckSummaries({ db, deps, ctx, blockId, ownerId, deckIds: sourceDecks, queuedByDeck });
  const availableByDeck = Object.fromEntries(decks.map((deck) => [deck.id, deck.available]));
  const queuedCoverage = effectiveCapacityForSchedule(account, sourceDecks, queuedByDeck, ctx?.queuedByAccount.get(account.id) ?? sumCounts(queuedByDeck));
  const availableCoverage = effectiveCapacityForSchedule(account, sourceDecks, availableByDeck, availableForDecks(db, deps, ctx, ownerId, sourceDecks));
  const scheduledByDeck = Object.fromEntries(scheduledCountsByDeck(account, sourceDecks));
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
    shortAvailable: availableCoverage.effective,
    rawShortAvailable: availableForDecks(db, deps, ctx, ownerId, sourceDecks),
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

const sourceWeightSettingKey = (blockId: string): string => `superAdmin.channelBlock.${canonicalBlockId(blockId)}.sourceWeights`;

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
  return (block.sourceGroups ?? []).map((group) => ({
    id: group.id,
    title: group.title,
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
  const scheduled = [...scheduledCountsByDeck(account, sourceDecks)].filter(([, perDay]) => perDay > 0);
  const totalPerDay = scheduled.reduce((sum, [, perDay]) => sum + perDay, 0);
  if (totalPerDay <= 0) return { effective: Math.max(0, Math.floor(fallbackTotal)), runwayDays: null };
  const days = Math.min(...scheduled.map(([deckId, perDay]) => Math.max(0, Number(countsByDeck[deckId] ?? 0)) / perDay));
  const safeDays = Number.isFinite(days) ? days : 0;
  const effective = Math.floor(safeDays * totalPerDay);
  return { effective: Math.min(effective, Math.max(0, Math.floor(fallbackTotal))), runwayDays: safeDays };
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

function capDeckSequenceByFreeCards(db: Db, deps: RouteDeps, ownerId: number, sequence: string[]): string[] {
  if (!sequence.length || db.hasFeature(ownerId, INFINITE_PACKS_FEATURE)) return sequence;
  const freeByDeck = new Map<string, number>();
  for (const deckId of unique(sequence)) {
    freeByDeck.set(
      deckId,
      Math.max(0, deps.deckAccess.availableUnusedForDecks(ownerId, [deckId]) - queuedRemainingForOwnerDeck(ownerId, deckId)),
    );
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
  const decks = sourceDecks?.length ? sourceDecks : deps.deckAccess.accountSourceDecks(account);
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
  const selectedSources = deps.deckAccess.accountSourceDecks(account);
  const requestedSet = new Set(requestedDecks);
  const sourceDecks = selectedSources.filter((deckId) => requestedSet.has(deckId));
  if (sourceDecks.length <= 1 || !sameDeckSet(unique(sourceDecks), unique(requestedDecks))) return null;

  const weights = readSourceWeights(db, block);
  if (!activeSourceGroups(block, account, sourceDecks, weights).length) return null;

  const queuedByDeck = videosByDeck(db.listVideos(account.id));
  const targetQueued = sumCounts(queuedByDeck) + count;
  const seed = sourceSequenceSeed(block, account, sourceDecks, weights, `gen-queue:${targetQueued}:${count}`);
  let sequence = weightedDeckDeficitSequence(block, account, sourceDecks, weights, queuedByDeck, targetQueued, seed);
  if (sequence.length < count)
    sequence = [
      ...sequence,
      ...weightedDeckSlots(block, account, sourceDecks, weights, count - sequence.length, `${seed}|fallback`),
    ];
  sequence = sequence.slice(0, count);
  const capped = capDeckSequenceByFreeCards(db, deps, ownerId, sequence);
  return capped;
}

function buildPayload(db: Db, deps: RouteDeps) {
  const ownerId = armenId(db);
  if (ownerId == null) return { languages: BLOCK_LANGS, blocks: [], unassignedAccounts: [] };
  const accounts = db.listAccountsByUser(ownerId);
  const ctx = makeBlockContext(db, accounts);
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const assigned = new Set<number>();
  const supportedLangs = new Set<string>(BLOCK_LANGS.map((lang) => lang.code));

  const blocks = BLOCKS.map((block) => {
    const blockAccountIds = new Set(
      accounts
        .filter((account) => accountBelongsToBlock(deps, block, account))
        .map((account) => account.id),
    );
    const cells = BLOCK_LANGS.map((lang) => {
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
        defaultSourceDecks: blockDefaultSources(block.id, lang.code),
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

  return { languages: BLOCK_LANGS, blocks, unassignedAccounts };
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

function planChannelBlockNormalize(input: {
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
    const sourceDecks = deps.deckAccess.accountSourceDecks(account);
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
      const perDay = scheduledDeckOrder(account, deps.deckAccess.accountSourceDecks(account)).length;
      return perDay > 0 ? (coverage?.effective ?? 0) / perDay : 0;
    }),
  );
  const targetRunwayDays =
    Number.isFinite(requestedTargetRunwayDays) && requestedTargetRunwayDays > 0
      ? Math.min(365, Math.max(1, requestedTargetRunwayDays))
      : currentMaxRunwayDays;
  const targetQueued = Math.max(
    0,
    ...accounts.map((account) => Math.ceil(targetRunwayDays * scheduledDeckOrder(account, deps.deckAccess.accountSourceDecks(account)).length)),
  );
  const jobs: NormalizePlannedJob[] = [];
  const skipped: NormalizeSkip[] = [];
  const shortages = new Map<string, NormalizeShortage>();
  const freeRemaining = new Map<string, number>();
  const takeFree = (ownerId: number, deckId: string, deckName: string, needed: number, account: Account): number => {
    if (needed <= 0 || db.hasFeature(ownerId, INFINITE_PACKS_FEATURE)) return needed;
    const key = `${ownerId}|${deckId}`;
    if (!freeRemaining.has(key)) {
      freeRemaining.set(
        key,
        Math.max(0, deps.deckAccess.availableUnusedForDecks(ownerId, [deckId]) - queuedRemainingForOwnerDeck(ownerId, deckId)),
      );
    }
    const available = freeRemaining.get(key) ?? 0;
    const taken = Math.min(needed, available);
    freeRemaining.set(key, available - taken);
    const missing = needed - taken;
    if (missing > 0) {
      const shortageKey = `${key}|${account.id}`;
      const cur = shortages.get(shortageKey);
      if (cur) {
        cur.missing += missing;
        cur.needed += needed;
        cur.available = Math.max(0, cur.available - taken);
      } else {
        shortages.set(shortageKey, {
          ownerId,
          accountId: account.id,
          channelName: account.ytChannelTitle || account.channelName,
          deckId,
          deckName,
          missing,
          available,
          needed,
        });
      }
    }
    return taken;
  };

  for (const account of accounts) {
    const deckIds = deps.deckAccess.accountSourceDecks(account);
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
    const sequenceSeed = sourceSequenceSeed(
      block,
      account,
      deckIds,
      sourceWeights,
      `normalize:${accountTargetQueued}:${targetRunwayDays}`,
    );
    const targetSequence = targetRunwayDeckSequence(account, deckIds, targetRunwayDays);
    const exactDeficit =
      targetSequence.length > 0
        ? deckDeficitFromTargetSequence(targetSequence, countedByDeck)
        : activeSourceGroups(block, account, deckIds, sourceWeights).length
          ? weightedDeckDeficitSequence(block, account, deckIds, sourceWeights, countedByDeck, accountTargetQueued, sequenceSeed)
          : deckDeficitSequence(account, deckIds, countedByDeck, targetRunwayDays);
    const missing = exactDeficit.length;
    const readyDeficit = accountTargetQueued - currentQueued;
    if (missing <= 0) {
      skipped.push({
        accountId: account.id,
        channelName: account.ytChannelTitle || account.channelName,
        reason: readyDeficit > 0 ? "generation_in_progress" : "already_at_target",
        currentQueued,
        targetQueued: accountTargetQueued,
        currentRunwayDays,
        targetRunwayDays,
      });
      continue;
    }
    // exactDeficit is computed against READY + in-flight videos per deck, so a repeated click does not
    // stack a second full top-up while the first one is still rendering.
    const baseJobDeckIds = (
      exactDeficit.length ? exactDeficit : weightedDeckSlots(block, account, deckIds, sourceWeights, missing, `${sequenceSeed}|fallback`)
    ).slice(0, missing);
    const requestedByDeck = countDeckSequence(baseJobDeckIds);
    const allowedByDeck = new Map<string, number>();
    for (const [deckId, needed] of Object.entries(requestedByDeck)) {
      const deckName = deckTitle(deckId, ownerId).name;
      allowedByDeck.set(deckId, takeFree(ownerId, deckId, deckName, needed, account));
    }
    const jobDeckIds = baseJobDeckIds.filter((deckId) => {
      const left = allowedByDeck.get(deckId) ?? 0;
      if (left <= 0) return false;
      allowedByDeck.set(deckId, left - 1);
      return true;
    });
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

    const sourceDecks = blockDefaultSources(block.id, lang);
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
      const deckIds = deps.deckAccess.accountSourceDecks(account);
      if (!deckIds.length) {
        skipped.push({ accountId: account.id, channelName: account.channelName, reason: "no_sources" });
        continue;
      }
      let total = count;
      if (!db.hasFeature(ownerId, INFINITE_PACKS_FEATURE)) {
        const free = Math.max(
          0,
          deps.deckAccess.availableUnusedForDecks(ownerId, deckIds) - queuedRemainingForOwnerDecks(ownerId, deckIds),
        );
        if (free <= 0) {
          skipped.push({ accountId: account.id, channelName: account.channelName, reason: "no_free_cards" });
          continue;
        }
        total = Math.min(total, free);
      }
      const sequenceSeed = sourceSequenceSeed(
        block,
        account,
        deckIds,
        sourceWeights,
        `manual-generate:${new Date().toISOString().slice(0, 13)}:${total}`,
      );
      const jobDeckIds = weightedDeckSequence(block, account, deckIds, sourceWeights, total, sequenceSeed);
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
        if (otherSlots + perDay > USER_DAILY_SCHEDULE_CAP) {
          skipped.push({
            accountId: account.id,
            channelName: account.channelName,
            reason: "google_key_limit",
            available: Math.max(0, USER_DAILY_SCHEDULE_CAP - otherSlots),
          });
          continue;
        }
      }
      const schedule = randomDayTimes(perDay, taken);
      for (const time of schedule) taken.add(toMin(time));
      const sourceDecks = deps.deckAccess.accountSourceDecks(account);
      const next = db.updateAccount(account.id, { schedule, slotDecks: slotDecksForSchedule(block, account, schedule, sourceDecks, sourceWeights) });
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
