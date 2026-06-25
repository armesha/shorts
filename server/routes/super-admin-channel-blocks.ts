import type { FastifyInstance } from "fastify";
import type { Account, Db, Video } from "../db.ts";
import { SUPER_ADMIN_USERNAME } from "../auth.ts";
import { DECKS, deckLang, isPackDeckId } from "../../src/anecdotes/decks.ts";
import { getPack } from "../../src/packs/store.ts";
import { uid } from "../infra/auth-session.ts";
import type { RouteDeps } from "./deps.ts";
import {
  enqueue as genEnqueue,
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
};

const QUOTE_DECK_BY_LANG: Record<string, string[]> = {
  ru: ["quotes-ru"],
  ar: ["quotes-ar"],
  en: ["quotes-en"],
  it: ["quotes-it"],
  es: ["quotes-es"],
  de: ["quotes-de-1", "quotes-de-2", "quotes-de-3"],
  fr: ["quotes-fr"],
  pt: ["quotes-pt"],
  hi: ["quotes-hi"],
  id: ["quotes-id"],
};

const BLOCK_DEFAULT_SOURCES: Record<string, Record<string, string[]>> = {
  jokes_memes: {
    ru: ["ru", "memes-ru"],
    de: ["de", "memes-de"],
    it: ["it", "memes-it"],
    es: ["pack:chistes-es-public-domain", "pack:chistes-es-long"],
    fr: ["fr", "memes-fr"],
    en: ["memes-en"],
  },
  lifehacks: {
    ru: ["tips"],
    de: ["tips-de"],
    es: ["tips-es"],
  },
  riddles_illusions: {
    ru: ["visual-riddles", "illusions-ru", "illusions-3d"],
    de: ["visual-riddles-de", "illusions-de", "illusions-3d-de"],
    en: ["visual-riddles-en", "illusions-en", "illusions-3d-en"],
    it: ["illusions-it"],
    es: ["illusions-es"],
  },
  religion: {
    ar: ["islamic"],
    en: ["christian"],
  },
  quotes: QUOTE_DECK_BY_LANG,
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
    accountIds: [7, 14, 15, 62, 64, 68, 70],
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

function deckSummaries(input: {
  db: Db;
  deps: RouteDeps;
  ownerId: number;
  deckIds: string[];
  queuedByDeck: Record<string, number>;
}) {
  const { db, deps, ownerId, deckIds, queuedByDeck } = input;
  return deckIds.map((deckId) => {
    const title = deckTitle(deckId, ownerId);
    return {
      id: deckId,
      name: title.name,
      lang: title.lang,
      available: deps.deckAccess.availableUnusedForDecks(ownerId, [deckId]),
      queued: queuedByDeck[deckId] ?? 0,
      total: db.hasFeature(ownerId, INFINITE_PACKS_FEATURE) ? deps.deckAccess.availableUnusedForDecks(ownerId, [deckId]) : null,
    };
  });
}

function blockDefaultSources(blockId: string, lang: string): string[] {
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

function accountSummary(db: Db, deps: RouteDeps, account: Account) {
  const ownerId = account.userId ?? 0;
  const sourceDecks = deps.deckAccess.accountSourceDecks(account);
  const videos = db.listVideos(account.id);
  const queuedByDeck = videosByDeck(videos);
  return {
    id: account.id,
    userId: account.userId,
    channelName: account.channelName,
    theme: account.theme,
    channelLang: account.channelLang,
    enabled: account.enabled,
    connected: account.status === "connected",
    status: account.status,
    authError: account.authError,
    schedule: account.schedule,
    avatar: account.avatar,
    ytChannelId: account.ytChannelId,
    queued: videos.length,
    queuedByDeck,
    shortAvailable: deps.deckAccess.availableUnusedForDecks(ownerId, sourceDecks),
    sourceDecks: deckSummaries({ db, deps, ownerId, deckIds: sourceDecks, queuedByDeck }),
  };
}

type BlockAccountSummary = ReturnType<typeof accountSummary>;

function minOrZero(values: number[]): number {
  if (!values.length) return 0;
  return Math.min(...values);
}

function blockSyncMetrics(accounts: BlockAccountSummary[]) {
  const queued = minOrZero(accounts.map((account) => account.queued));
  const shortAvailable = minOrZero(accounts.map((account) => account.shortAvailable));
  const postsPerDay = minOrZero(accounts.map((account) => account.schedule.length));
  return {
    queued,
    shortAvailable,
    postsPerDay,
    runwayDays: postsPerDay > 0 ? queued / postsPerDay : null,
    totalQueued: accounts.reduce((sum, account) => sum + account.queued, 0),
    totalShortAvailable: accounts.reduce((sum, account) => sum + account.shortAvailable, 0),
    totalPostsPerDay: accounts.reduce((sum, account) => sum + account.schedule.length, 0),
  };
}

function buildPayload(db: Db, deps: RouteDeps) {
  const ownerId = armenId(db);
  if (ownerId == null) return { languages: BLOCK_LANGS, blocks: [], unassignedAccounts: [] };
  const accounts = db.listAccountsByUser(ownerId);
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
          return accountSummary(db, deps, account);
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
    .map((account) => accountSummary(db, deps, account));

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
    const count = Math.max(1, Math.floor(Number((req.body as { count?: unknown } | null)?.count) || 1));
    const only = requestedAccountIds(req.body);
    const accounts = blockAccounts(db, deps, blockId).filter((account) => !only || only.has(account.id));
    if (!accounts.length) return reply.code(404).send({ error: "Тематический блок не найден или пуст." });

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
      const job = genEnqueue(uid(req), account.id, total, ownerId, deckIds);
      jobs.push({ accountId: account.id, channelName: account.channelName, deckIds, jobId: job.id, total: job.total });
    }
    return { blockId, requestedPerChannel: count, jobs, skipped };
  });

  app.post("/api/super-admin/channel-blocks/:id/normalize", async (req, reply) => {
    if (!requireSuperAdmin(req, reply, deps)) return;
    const blockId = (req.params as { id: string }).id;
    const only = requestedAccountIds(req.body);
    const accounts = blockAccounts(db, deps, blockId).filter((account) => !only || only.has(account.id));
    if (!accounts.length) return reply.code(404).send({ error: "Тематический блок не найден или пуст." });

    const queuedByAccount = new Map(accounts.map((account) => [account.id, db.listVideos(account.id).length]));
    const targetQueued = Math.max(...queuedByAccount.values());
    const jobs: unknown[] = [];
    const skipped: unknown[] = [];
    for (const account of accounts) {
      const currentQueued = queuedByAccount.get(account.id) ?? 0;
      const missing = targetQueued - currentQueued;
      if (missing <= 0) {
        skipped.push({ accountId: account.id, channelName: account.channelName, reason: "already_at_target", currentQueued, targetQueued });
        continue;
      }
      const ownerId = account.userId ?? uid(req);
      const deckIds = deps.deckAccess.accountSourceDecks(account);
      if (!deckIds.length) {
        skipped.push({ accountId: account.id, channelName: account.channelName, reason: "no_sources", currentQueued, targetQueued });
        continue;
      }
      let total = missing;
      if (!db.hasFeature(ownerId, INFINITE_PACKS_FEATURE)) {
        const free = Math.max(
          0,
          deps.deckAccess.availableUnusedForDecks(ownerId, deckIds) - queuedRemainingForOwnerDecks(ownerId, deckIds),
        );
        if (free <= 0) {
          skipped.push({ accountId: account.id, channelName: account.channelName, reason: "no_free_cards", currentQueued, targetQueued });
          continue;
        }
        total = Math.min(total, free);
      }
      const job = genEnqueue(uid(req), account.id, total, ownerId, deckIds);
      jobs.push({
        accountId: account.id,
        channelName: account.channelName,
        deckIds,
        jobId: job.id,
        total: job.total,
        currentQueued,
        targetQueued,
      });
    }
    return { blockId, targetQueued, jobs, skipped };
  });

  app.post("/api/super-admin/channel-blocks/:id/schedule", async (req, reply) => {
    if (!requireSuperAdmin(req, reply, deps)) return;
    const blockId = (req.params as { id: string }).id;
    const perDay = Math.max(0, Math.floor(Number((req.body as { perDay?: unknown } | null)?.perDay) || 0));
    if (perDay > 20) return reply.code(400).send({ error: "Максимум 20 публикаций в сутки на канал." });
    const only = requestedAccountIds(req.body);
    const accounts = blockAccounts(db, deps, blockId).filter((account) => !only || only.has(account.id));
    if (!accounts.length) return reply.code(404).send({ error: "Тематический блок не найден или пуст." });

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
      const next = db.updateAccount(account.id, { schedule });
      if (next) updated.push({ accountId: next.id, channelName: next.channelName, schedule: next.schedule });
    }
    return { blockId, perDay, updated, skipped };
  });
}
