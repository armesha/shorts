export type DesignId = "atelier" | "harbor" | "berry" | "classic";

export interface DesignOption {
  id: DesignId;
  labelKey: string;
  descKey: string;
}

export const DESIGN_STORAGE_KEY = "sf.design";

export const DESIGNS: DesignOption[] = [
  { id: "atelier", labelKey: "settings.designAtelier", descKey: "settings.designAtelierDesc" },
  { id: "harbor", labelKey: "settings.designHarbor", descKey: "settings.designHarborDesc" },
  { id: "berry", labelKey: "settings.designBerry", descKey: "settings.designBerryDesc" },
  { id: "classic", labelKey: "settings.designClassic", descKey: "settings.designClassicDesc" },
];

export const DEFAULT_DESIGN: DesignId = "atelier";

export function normalizeDesign(value: string | null | undefined): DesignId {
  return DESIGNS.some((d) => d.id === value) ? (value as DesignId) : DEFAULT_DESIGN;
}

export function getSavedDesign(): DesignId {
  try {
    return normalizeDesign(localStorage.getItem(DESIGN_STORAGE_KEY));
  } catch {
    return DEFAULT_DESIGN;
  }
}

export function applyDesign(design: DesignId) {
  document.documentElement.dataset.design = normalizeDesign(design);
}

export function saveDesign(design: DesignId) {
  const normalized = normalizeDesign(design);
  try {
    localStorage.setItem(DESIGN_STORAGE_KEY, normalized);
  } catch {
    /* storage may be unavailable */
  }
  applyDesign(normalized);
}
