// Optional visual "skin" on top of the classic dashboard look — available to EVERY logged-in user.
//
// WHY this is separate from lib/design.ts: the design picker (atelier/harbor/berry/classic) only
// swaps DaisyUI colour tokens. The "СЕЧЕНИЕ" skin is a full editorial re-style (grain, hard borders,
// acid accent, big uppercase headings) layered via CSS scoped under html[data-skin="sechenie"].
// It is ON by default for everyone; anyone can turn it off (the choice persists per-browser) and the
// classic look is always one click back. Preference is per-browser (localStorage), exactly like the
// design picker — so there are NO backend changes and no server restart needed.
//
// The skin is applied by toggling document.documentElement.dataset.skin. The provider is the single
// source of truth: it applies the attribute only for a logged-in user who opted in (skin drops on
// logout when user becomes null, and never shows on the pre-login screen).
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth";

export const SKIN_ID = "sechenie";
export const SKIN_STORAGE_KEY = "sf.skin";

export function getSavedSkinPref(): boolean {
  // ON by default for EVERYONE — only an explicit "0" (the user turned it off) disables it; that
  // choice then persists. A missing value (never toggled) or "1" both mean on.
  try {
    return localStorage.getItem(SKIN_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function saveSkinPref(on: boolean) {
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* storage may be unavailable */
  }
}

function applySkinAttr(on: boolean) {
  const el = document.documentElement;
  if (on) el.dataset.skin = SKIN_ID;
  else delete el.dataset.skin;
}

interface SkinState {
  /** Whether the СЕЧЕНИЕ skin is currently active (logged in + opted in). */
  skinOn: boolean;
  /** Whether the skin control should be shown (any logged-in user). */
  canUseSkin: boolean;
  /** Persist + apply the user's preference. */
  setSkinOn: (on: boolean) => void;
}

const SkinCtx = createContext<SkinState | null>(null);

export function useSkin(): SkinState {
  const ctx = useContext(SkinCtx);
  if (!ctx) throw new Error("useSkin must be used within <SkinProvider>");
  return ctx;
}

export function SkinProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Available to EVERY logged-in user (off by default); only gate is being logged in so the skin
  // never shows on the pre-login screen and drops on logout.
  const canUseSkin = !!user;
  const [pref, setPref] = useState<boolean>(() => getSavedSkinPref());

  // Effective state: any logged-in user who opted in gets the skin.
  const skinOn = canUseSkin && pref;

  useEffect(() => {
    applySkinAttr(skinOn);
    return () => applySkinAttr(false);
  }, [skinOn]);

  const setSkinOn = useCallback(
    (on: boolean) => {
      setPref(on);
      saveSkinPref(on);
    },
    [],
  );

  return <SkinCtx.Provider value={{ skinOn, canUseSkin, setSkinOn }}>{children}</SkinCtx.Provider>;
}
