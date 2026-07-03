export const BLOCKED_RUSSIAN_JOKE_BACKGROUNDS = new Set([
  "russian_apartment_hallway.jpg",
  "russian_banya.jpg",
  "russian_kitchen_table.jpg",
  "russian_train_compartment.jpg",
]);

const CUSTOM_JOKE_PACK_TEMPLATE_ALLOWLIST = new Map<string, ReadonlySet<number>>([
  ["chistes-es-public-domain", new Set([4])],
]);

export interface CustomPackTemplateMarker {
  packId: string;
  templateIndex: number;
}

export function isAllowedRussianJokeBackground(name?: string | null): boolean {
  return !!name && !BLOCKED_RUSSIAN_JOKE_BACKGROUNDS.has(name);
}

export function listAllowedRussianJokeBackgrounds(names: string[]): string[] {
  return names.filter(isAllowedRussianJokeBackground);
}

export function isAllowedCustomJokePackTemplate(packId: string, templateIndex: number): boolean {
  const allowed = CUSTOM_JOKE_PACK_TEMPLATE_ALLOWLIST.get(packId);
  if (!allowed) return true;
  return allowed.has(templateIndex);
}

export function allowedCustomJokePackTemplateIndexes(packId: string, templateCount: number): number[] {
  const count = Math.max(0, Math.floor(Number(templateCount) || 0));
  const out: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (isAllowedCustomJokePackTemplate(packId, index)) out.push(index);
  }
  return out;
}

export function resolveAllowedCustomJokePackTemplateIndex(
  packId: string,
  preferredIndex: number,
  templateCount: number,
): number {
  const count = Math.max(0, Math.floor(Number(templateCount) || 0));
  if (count <= 0) return 0;
  const preferred = ((Math.floor(Number(preferredIndex) || 0) % count) + count) % count;
  if (isAllowedCustomJokePackTemplate(packId, preferred)) return preferred;
  const allowed = allowedCustomJokePackTemplateIndexes(packId, count);
  return allowed.length ? allowed[preferred % allowed.length] : preferred;
}

export function customPackTemplateMarker(packId: string, templateIndex: number): string {
  return `pack-template:${packId}:${templateIndex}`;
}

export function parseCustomPackTemplateMarker(bg?: string | null): CustomPackTemplateMarker | null {
  const match = /^pack-template:([^:]+):(\d+)$/.exec(String(bg || ""));
  if (!match) return null;
  return { packId: match[1], templateIndex: Number(match[2]) };
}
