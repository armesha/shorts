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
  es: ["pack:chistes-es-public-domain", "pack:chistes-es-long"],
  fr: ["fr"],
  en: ["en"],
  pt: ["pt"],
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

const JOKE_SOURCE_GROUPS: SourceGroupDef[] = [
  {
    id: "jokes",
    title: "Анекдоты",
    defaultWeight: 4,
    sources: JOKE_TEXT_DECK_BY_LANG,
  },
  {
    id: "memes",
    title: "Мемы",
    defaultWeight: 1,
    sources: JOKE_MEME_DECK_BY_LANG,
  },
];

const QUOTE_STATIC_DECK_BY_LANG: Record<string, string[]> = {
  ru: ["quotes-ru"],
  ar: ["quotes-ar"],
  en: ["quotes-en"],
  it: ["quotes-it"],
  es: ["quotes-es"],
  de: ["quotes-de"],
  fr: ["quotes-fr"],
  pt: ["quotes-pt"],
  hi: ["quotes-hi"],
  id: ["quotes-id"],
};

const QUOTE_VIDEO_DECK_BY_LANG: Record<string, string[]> = {
  ru: ["quote-video-ru"],
  en: ["quote-video-en"],
  es: ["quote-video-es"],
  de: ["quote-video-de"],
};

const QUOTE_SOURCE_GROUPS: SourceGroupDef[] = [
  {
    id: "static",
    title: "Статичные цитаты",
    defaultWeight: 4,
    sources: QUOTE_STATIC_DECK_BY_LANG,
  },
  ...(Object.keys(QUOTE_VIDEO_DECK_BY_LANG).length
    ? [
        {
          id: "video",
          title: "Видео-цитаты с озвучкой",
          defaultWeight: 1,
          sources: QUOTE_VIDEO_DECK_BY_LANG,
        },
      ]
    : []),
];

const BLOCK_DEFAULT_SOURCES: Record<string, Record<string, string[]>> = {
  jokes_memes: JOKE_TEXT_DECK_BY_LANG,
  lifehacks: {
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
  },
  riddles_illusions: {
    ru: ["visual-riddles", "illusions-ru", "illusions-3d"],
    ar: ["illusions-ar"],
    de: ["visual-riddles-de", "illusions-de", "illusions-3d-de"],
    en: ["visual-riddles-en", "illusions-en", "illusions-3d-en"],
    it: ["illusions-it"],
    es: ["illusions-es"],
    fr: ["illusions-fr"],
    pt: ["illusions-pt"],
    hi: ["illusions-hi"],
    id: ["illusions-id"],
  },
  religion: {
    ar: ["islamic"],
    en: ["christian"],
  },
  quotes: QUOTE_STATIC_DECK_BY_LANG,
  psychology: {
    de: ["psych"],
  },
  facts_space: {
    en: ["fact-en", "space"],
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
    accountIds: [7, 14, 15, 62, 64, 68, 70, 79],
    sourceGroups: JOKE_SOURCE_GROUPS,
  },
  {
    id: "lifehacks",
    title: "Лайфхаки",
    description: "Практические советы в локализациях.",
    rules: [
      "Это хороший кандидат для полной локализации RU/AR/EN/IT/ES/DE/PT/HI/ID на одном наборе идей.",
      "Шаблоны можно переиспользовать, но текст и бытовые реалии нужно локализовать под язык.",
      "Если появится озвучка, новые voiceover-паки собирать через edge-tts, не ElevenLabs.",
    ],
    accountIds: [16, 18],
  },
  {
    id: "riddles_illusions",
    title: "Загадки и иллюзии",
    description: "Визуальные загадки и оптические иллюзии.",
    rules: [
      "Один визуальный ассет можно локализовать через текстовые overlays, если права на исходник проверены.",
      "Для новых языков готовить отдельные titles/labels, а не смешивать языки внутри одного ролика.",
    ],
    accountIds: [52, 72, 78],
  },
  {
    id: "religion",
    title: "Религия",
    description: "Религиозные каналы в одном блоке; паки остаются разными по религии, языку и конфессии.",
    rules: [
      "Один блок управления, но исламские, KJV, православные и католические источники не смешиваются между каналами.",
      "Для каждого религиозного пака нужен отдельный source ledger и ручная проверка переводов/формулировок.",
      "Перед массовой публикацией проверять title/description/thumbnails на спорный, оскорбительный или политизированный контекст.",
      "Музыка/звук подбирается отдельно под религию; для исламских паков использовать немелодический фон или тишину.",
    ],
    accountIds: [23, 31],
  },
  {
    id: "quotes",
    title: "Цитаты",
    description: "Готовые видео-паки с цитатами.",
    rules: [
      "Цитаты расширять только через проверенные источники; для портретов нужен Wikimedia/аналогичный rights ledger.",
      "Запрещены AP/неясные фото, misattribution, экстремистские/насильственные цитаты и protected-class hate.",
      "Перед публикацией прогонять quote validator и ручной spot-check по авторам/портретам.",
    ],
    accountIds: [43, 65],
    sourceGroups: QUOTE_SOURCE_GROUPS,
  },
  {
    id: "psychology",
    title: "Психология",
    description: "Психологические карточки и связанные источники.",
    rules: [
      "Не давать медицинских диагнозов/обещаний лечения; формулировать как общие наблюдения и self-help.",
      "Локализации должны сохранять осторожный тон и избегать травматичных/опасных советов.",
    ],
    accountIds: [44],
  },
  {
    id: "facts_space",
    title: "Факты и космос",
    description: "Готовые факты и космические видео.",
    rules: [
      "Факты требуют проверяемого источника; для космических медиа проверять NASA/ESA/Commons license/provenance.",
      "Один факт-пак можно локализовать по языкам, но численные данные и названия нужно перепроверять.",
    ],
    accountIds: [38, 45],
  },
];

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
  return BLOCKS.find((block) => block.id === blockId)?.sourceGroups ?? [];
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

const sourceWeightSettingKey = (blockId: string): string => `superAdmin.channelBlock.${blockId}.sourceWeights`;

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

function requestedSourceWeights(db: Db, block: BlockDef, body: unknown): Record<string, number> {
  if (!block.sourceGroups?.length) return {};
  const raw = (body as { sourceWeights?: unknown } | null)?.sourceWeights;
  if (raw == null) return readSourceWeights(db, block);
  const weights = sanitizeSourceWeights(block, raw);
  db.setSetting(sourceWeightSettingKey(block.id), JSON.stringify(weights));
  return weights;
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

function weightedDeckSlots(block: BlockDef, account: Account, sourceDecks: string[], weights: Record<string, number>, count: number): string[] {
  const active = activeSourceGroups(block, account, sourceDecks, weights);
  if (!active.length) return sourceDecks;
  const totalWeight = active.reduce((sum, group) => sum + group.weight, 0);
  const scores = new Map(active.map((group) => [group.id, 0]));
  const cursors = new Map(active.map((group) => [group.id, 0]));
  const sequence: string[] = [];
  for (let index = 0; index < count; index++) {
    for (const group of active) scores.set(group.id, (scores.get(group.id) ?? 0) + group.weight);
    const group = active.reduce((best, candidate) =>
      (scores.get(candidate.id) ?? 0) > (scores.get(best.id) ?? 0) ? candidate : best,
    );
    scores.set(group.id, (scores.get(group.id) ?? 0) - totalWeight);
    const cursor = cursors.get(group.id) ?? 0;
    sequence.push(group.deckIds[cursor % group.deckIds.length]);
    cursors.set(group.id, cursor + 1);
  }
  return sequence.length ? sequence : sourceDecks;
}

function weightedDeckSequence(block: BlockDef, account: Account, sourceDecks: string[], weights: Record<string, number>): string[] {
  const active = activeSourceGroups(block, account, sourceDecks, weights);
  if (!active.length) return sourceDecks;
  const totalWeight = active.reduce((sum, group) => sum + group.weight, 0);
  const cycles = Math.max(1, ...active.map((group) => group.deckIds.length));
  return weightedDeckSlots(block, account, sourceDecks, weights, Math.max(1, totalWeight * cycles));
}

function slotDecksForSchedule(block: BlockDef, account: Account, schedule: string[], sourceDecks: string[], weights: Record<string, number>): Record<string, string> {
  if (!schedule.length) return {};
  const sequence = weightedDeckSlots(block, account, sourceDecks, weights, schedule.length);
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
  return { effective: Math.floor(safeDays * totalPerDay), runwayDays: safeDays };
}

function deckDeficitSequence(account: Account, sourceDecks: string[], queuedByDeck: Record<string, number>, targetQueued: number): string[] {
  const scheduleOrder = scheduledDeckOrder(account, sourceDecks);
  const perDay = scheduleOrder.length;
  if (perDay <= 0) return [];

  const counts = scheduledCountsByDeck(account, sourceDecks);
  const targetDays = targetQueued / perDay;
  const deficits = new Map<string, number>();
  for (const [deckId, postsPerDay] of counts) {
    if (postsPerDay <= 0) continue;
    const wanted = Math.ceil(targetDays * postsPerDay);
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
  const block = BLOCKS.find((candidate) => candidate.id === blockId);
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
    const blockId = (req.params as { id: string }).id;
    const lang = String((req.body as { lang?: unknown } | null)?.lang || "").trim().toLowerCase();
    const ownerId = armenId(db);
    const block = BLOCKS.find((candidate) => candidate.id === blockId);
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
    const blockId = (req.params as { id: string }).id;
    const block = BLOCKS.find((candidate) => candidate.id === blockId);
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
      const jobDeckIds = weightedDeckSequence(block, account, deckIds, sourceWeights);
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
      const job = genEnqueue(uid(req), account.id, total, ownerId, jobDeckIds);
      jobs.push({ accountId: account.id, channelName: account.channelName, deckIds: jobDeckIds, jobId: job.id, total: job.total });
    }
    return { blockId, requestedPerChannel: count, jobs, skipped };
  });

  app.post("/api/super-admin/channel-blocks/:id/normalize", async (req, reply) => {
    if (!requireSuperAdmin(req, reply, deps)) return;
    const blockId = (req.params as { id: string }).id;
    const block = BLOCKS.find((candidate) => candidate.id === blockId);
    const only = requestedAccountIds(req.body);
    const accounts = blockAccounts(db, deps, blockId).filter((account) => !only || only.has(account.id));
    if (!block || !accounts.length) return reply.code(404).send({ error: "Тематический блок не найден или пуст." });
    const sourceWeights = requestedSourceWeights(db, block, req.body);

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
    const targetRunwayDays = Math.max(
      0,
      ...accounts.map((account) => {
        const coverage = coverageByAccount.get(account.id);
        if (coverage?.runwayDays != null) return coverage.runwayDays;
        const perDay = scheduledDeckOrder(account, deps.deckAccess.accountSourceDecks(account)).length;
        return perDay > 0 ? (coverage?.effective ?? 0) / perDay : 0;
      }),
    );
    const targetQueued = Math.max(
      0,
      ...accounts.map((account) => Math.ceil(targetRunwayDays * scheduledDeckOrder(account, deps.deckAccess.accountSourceDecks(account)).length)),
    );
    const jobs: unknown[] = [];
    const skipped: unknown[] = [];
    for (const account of accounts) {
      const deckIds = deps.deckAccess.accountSourceDecks(account);
      const perDay = scheduledDeckOrder(account, deckIds).length;
      const accountTargetQueued = Math.ceil(targetRunwayDays * perDay);
      const coverage = coverageByAccount.get(account.id);
      const currentQueued = coverage?.effective ?? 0;
      const currentRunwayDays = coverage?.runwayDays ?? (perDay > 0 ? currentQueued / perDay : 0);
      const missing = accountTargetQueued - currentQueued;
      if (missing <= 0) {
        skipped.push({
          accountId: account.id,
          channelName: account.channelName,
          reason: "already_at_target",
          currentQueued,
          targetQueued: accountTargetQueued,
          currentRunwayDays,
          targetRunwayDays,
        });
        continue;
      }
      const ownerId = account.userId ?? uid(req);
      if (!deckIds.length) {
        skipped.push({ accountId: account.id, channelName: account.channelName, reason: "no_sources", currentQueued, targetQueued: accountTargetQueued });
        continue;
      }
      const queuedByDeck = queuedByAccountDeck.get(account.id) ?? {};
      const exactDeficit = deckDeficitSequence(account, deckIds, queuedByDeck, accountTargetQueued);
      const baseJobDeckIds = exactDeficit.length ? exactDeficit : weightedDeckSlots(block, account, deckIds, sourceWeights, missing);
      const jobDeckIds = capDeckSequenceByFreeCards(db, deps, ownerId, baseJobDeckIds);
      let total = jobDeckIds.length;
      if (!db.hasFeature(ownerId, INFINITE_PACKS_FEATURE)) {
        const free = Math.max(
          0,
          deps.deckAccess.availableUnusedForDecks(ownerId, deckIds) - queuedRemainingForOwnerDecks(ownerId, deckIds),
        );
        if (free <= 0) {
          skipped.push({ accountId: account.id, channelName: account.channelName, reason: "no_free_cards", currentQueued, targetQueued: accountTargetQueued });
          continue;
        }
        total = Math.min(total, free);
      }
      if (total <= 0) {
        skipped.push({
          accountId: account.id,
          channelName: account.channelName,
          reason: "no_free_cards",
          currentQueued,
          targetQueued: accountTargetQueued,
        });
        continue;
      }
      const job = genEnqueue(uid(req), account.id, total, ownerId, jobDeckIds);
      jobs.push({
        accountId: account.id,
        channelName: account.channelName,
        deckIds: jobDeckIds,
        jobId: job.id,
        total: job.total,
        currentQueued,
        targetQueued: accountTargetQueued,
        currentRunwayDays,
        targetRunwayDays,
        rawQueued: queuedTotals.get(account.id) ?? 0,
      });
    }
    return { blockId, targetQueued, targetRunwayDays, jobs, skipped };
  });

  app.post("/api/super-admin/channel-blocks/:id/schedule", async (req, reply) => {
    if (!requireSuperAdmin(req, reply, deps)) return;
    const blockId = (req.params as { id: string }).id;
    const block = BLOCKS.find((candidate) => candidate.id === blockId);
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
}
