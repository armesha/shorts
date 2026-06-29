import type { Account, Db } from "../db.ts";
import { getPack } from "../../src/packs/store.ts";
import {
  availablePackCardsForAccount,
  isPerAccountAutoExpirePack,
} from "./pack-gen.ts";

type AutoExpireGroup = {
  blockId: string;
  groupId: string;
};

const AUTO_EXPIRE_GROUP_BY_DECK: Record<string, AutoExpireGroup> = {
  "pack:soviet-posters-ru": { blockId: "russian", groupId: "soviet_posters" },
};

const expiredGroupsSettingKey = (blockId: string): string => `superAdmin.channelBlock.${blockId}.expiredSourceGroups`;

function readExpiredSourceGroups(db: Db, blockId: string): Set<string> {
  const raw = db.getSetting(expiredGroupsSettingKey(blockId));
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map((value) => String(value || "").trim()).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function writeExpiredSourceGroups(db: Db, blockId: string, groups: Set<string>): void {
  db.setSetting(expiredGroupsSettingKey(blockId), JSON.stringify([...groups].sort()));
}

export function isAutoExpiredSourceGroup(db: Db, blockId: string, groupId: string): boolean {
  return readExpiredSourceGroups(db, blockId).has(groupId);
}

export function isAutoExpireManagedDeck(deckId: string): boolean {
  return !!AUTO_EXPIRE_GROUP_BY_DECK[deckId];
}

function accountHasDeck(account: Account, deckId: string): boolean {
  return (account.sourceDecks ?? []).includes(deckId);
}

function accountVideoCountForDeck(db: Db, accountId: number, deckId: string): number {
  const row = db.db
    .prepare("SELECT COUNT(*) AS n FROM videos WHERE account_id = ? AND deck = ?")
    .get(accountId, deckId) as { n?: number } | undefined;
  return Math.max(0, Number(row?.n) || 0);
}

export function autoExpireDeckAvailableForAccount(db: Db, account: Account, deckId: string): number | null {
  if (!isAutoExpireManagedDeck(deckId) || account.userId == null) return null;
  if (!deckId.startsWith("pack:")) return null;
  const pack = getPack(deckId.slice("pack:".length), account.userId, true);
  if (!pack || !isPerAccountAutoExpirePack(pack)) return null;
  return availablePackCardsForAccount(
    pack,
    account.id,
    db.usedAnecdoteKeys(account.userId),
    db.listVideos(account.id).filter((video) => video.deck === deckId),
  );
}

export function isAutoExpireDeckDrainedForAccount(db: Db, account: Account, deckId: string): boolean {
  const available = autoExpireDeckAvailableForAccount(db, account, deckId);
  if (available == null) return false;
  return available <= 0 && accountVideoCountForDeck(db, account.id, deckId) <= 0;
}

export function removeAutoExpiredDeckFromAccount(db: Db, account: Account, deckId: string): Account | null {
  if (!isAutoExpireManagedDeck(deckId) || !accountHasDeck(account, deckId)) return account;
  if (!isAutoExpireDeckDrainedForAccount(db, account, deckId)) return account;
  const sourceDecks = (account.sourceDecks ?? []).filter((source) => source !== deckId);
  const slotDecks = Object.fromEntries(
    Object.entries(account.slotDecks ?? {}).filter(([, source]) => source !== deckId),
  );
  const lang = sourceDecks.includes(account.lang) ? account.lang : sourceDecks[0] ?? account.lang;
  const updated = db.updateAccount(account.id, { sourceDecks, slotDecks, lang });

  const group = AUTO_EXPIRE_GROUP_BY_DECK[deckId];
  if (group && account.userId != null) {
    const anyStillUsesDeck = db
      .listAccountsByUser(account.userId)
      .some((candidate) => candidate.id !== account.id && accountHasDeck(candidate, deckId));
    if (!anyStillUsesDeck) {
      const expired = readExpiredSourceGroups(db, group.blockId);
      expired.add(group.groupId);
      writeExpiredSourceGroups(db, group.blockId, expired);
    }
  }

  return updated;
}

export function cleanupDrainedAutoExpireDecksForAccount(db: Db, account: Account): { account: Account; removedDecks: string[] } {
  let current = account;
  const removedDecks: string[] = [];
  for (const deckId of [...(current.sourceDecks ?? [])]) {
    if (!isAutoExpireDeckDrainedForAccount(db, current, deckId)) continue;
    const updated = removeAutoExpiredDeckFromAccount(db, current, deckId);
    if (!updated || updated.sourceDecks.includes(deckId)) continue;
    current = updated;
    removedDecks.push(deckId);
  }
  return { account: current, removedDecks };
}

export function cleanupDrainedAutoExpireDecksForUser(db: Db, userId: number): { accountId: number; channelName: string; removedDecks: string[] }[] {
  const results: { accountId: number; channelName: string; removedDecks: string[] }[] = [];
  for (const account of db.listAccountsByUser(userId)) {
    const { removedDecks } = cleanupDrainedAutoExpireDecksForAccount(db, account);
    if (removedDecks.length) {
      results.push({
        accountId: account.id,
        channelName: account.ytChannelTitle || account.channelName,
        removedDecks,
      });
    }
  }
  return results;
}
