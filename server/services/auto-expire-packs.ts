import type { Account, Db } from "../db.ts";

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

export function removeAutoExpiredDeckFromAccount(db: Db, account: Account, deckId: string): Account | null {
  if (!isAutoExpireManagedDeck(deckId) || !accountHasDeck(account, deckId)) return account;
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
