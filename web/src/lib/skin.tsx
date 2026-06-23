// Optional visual "skin" on top of the classic dashboard look — ON by default for everyone (incl. the login screen).
//
// WHY this is separate from lib/design.ts: the design picker (atelier/harbor/berry/classic) only
// swaps DaisyUI colour tokens. The "СЕЧЕНИЕ" skin is a full editorial re-style (grain, hard borders,
// acid accent, big uppercase headings) layered via CSS scoped under html[data-skin="sechenie"].
// It is ON by default for everyone; anyone can turn it off (the choice persists per-browser) and the
// classic look is always one click back. Preference is per-browser (localStorage), exactly like the
// design picker — so there are NO backend changes and no server restart needed.
//
// The skin is applied by toggling document.documentElement.dataset.skin, purely from the per-browser
// preference (default ON) — independent of login, so the login/boot screens are skinned too. The
// CONTROL (toggle + Settings card) is the only login-gated part. main.tsx also applies it before React
// mounts (applySavedSkin) to avoid a classic→skin flash on first paint.
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

/** Apply the saved preference to <html> synchronously — call from main.tsx pre-mount to avoid FOUC. */
export function applySavedSkin() {
  applySkinAttr(getSavedSkinPref());
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
  // The skin CONTROL (header toggle + Settings section) is shown to logged-in users only.
  const canUseSkin = !!user;
  const [pref, setPref] = useState<boolean>(() => getSavedSkinPref());

  // The skin ITSELF is applied purely from the per-browser preference (default ON), independent of
  // login — so the LOGIN screen is skinned too. Someone who turned it off ("0") sees classic
  // everywhere, including login.
  const skinOn = pref;

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
