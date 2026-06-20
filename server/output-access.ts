interface OutputOwner {
  userId: number;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const owners = new Map<string, OutputOwner>();
let cleanupTick = 0;

function normalizeRel(rel: string): string {
  return rel.replace(/^\/+/, "");
}

function cleanup(now = Date.now()): void {
  cleanupTick++;
  if (cleanupTick % 200 !== 0) return;
  for (const [rel, owner] of owners) {
    if (owner.expiresAt <= now) owners.delete(rel);
  }
}

export function rememberOutputOwner(
  rels: Array<string | null | undefined>,
  userId: number,
  ttlMs = DEFAULT_TTL_MS,
): void {
  const now = Date.now();
  cleanup(now);
  for (const rel of rels) {
    if (!rel) continue;
    owners.set(normalizeRel(rel), { userId, expiresAt: now + ttlMs });
  }
}

export function rememberedOutputOwner(rel: string, now = Date.now()): number | null {
  const owner = owners.get(normalizeRel(rel));
  if (!owner) return null;
  if (owner.expiresAt <= now) {
    owners.delete(normalizeRel(rel));
    return null;
  }
  return owner.userId;
}

export function clearOutputOwnersForTest(): void {
  owners.clear();
  cleanupTick = 0;
}
