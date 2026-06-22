// Admin-only visual "skin" on top of the classic dashboard look.
//
// WHY this is separate from lib/design.ts: the design picker (atelier/harbor/berry/classic) only
// swaps DaisyUI colour tokens. The "СЕЧЕНИЕ" skin is a full editorial re-style (grain, hard borders,
// acid accent, big uppercase headings) layered OVER the .admin-shell wrapper via CSS scoped under
// html[data-skin="sechenie"]. It is gated to admins and OFF by default; the classic look is always
// reachable. Preference is per-browser (localStorage), exactly like the design picker — so there are
// NO backend changes and no server restart needed.
//
// The skin is applied by toggling document.documentElement.dataset.skin. The provider is the single
// source of truth: it ONLY applies the attribute when the current user is an admin AND opted in, so a
// non-admin can never end up skinned (even mid-impersonation the role flips to "user" → skin drops).
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth";

export const SKIN_ID = "sechenie";
export const SKIN_STORAGE_KEY = "sf.skin";

export function getSavedSkinPref(): boolean {
  try {
    return localStorage.getItem(SKIN_STORAGE_KEY) === "1";
  } catch {
    return false;
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
  /** Whether the СЕЧЕНИЕ skin is currently active (admin + opted in). */
  skinOn: boolean;
  /** Whether the current user is even allowed to use the skin (admin only). */
  canUseSkin: boolean;
  /** Persist + apply the admin's preference. No-op for non-admins. */
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
  const canUseSkin = user?.role === "admin";
  const [pref, setPref] = useState<boolean>(() => getSavedSkinPref());

  // Effective state: only admins who opted in get the skin.
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
