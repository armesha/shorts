// Lightweight UI internationalization — no framework, just a dictionary + context.
//
// WHY this exists: every UI string used to be hardcoded Russian inline in JSX, so adding a second
// dashboard language was a full rewrite. This provider centralizes strings into per-language
// dictionaries (locales/ru.ts, locales/en.ts) and exposes a `t(key)` lookup.
//
// IMPORTANT: this is the UI (dashboard) language ONLY. It is completely separate from
// `account.lang`, which selects a channel's CONTENT deck (ru/de/pack:<id>/…). Do NOT conflate them.
//
// Default language is Russian (the project's primary UI). Adding a language later = add a
// locales/<code>.ts with the same keys and one entry in LANGS below.
import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";
import { ru } from "../locales/ru";
import { en } from "../locales/en";

export type Lang = "ru" | "en";

/** Selectable UI languages (code → native label shown in the switcher). */
export const LANGS: { code: Lang; label: string }[] = [
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
];

const DICTS: Record<Lang, Record<string, string>> = { ru, en };
const STORAGE_KEY = "uiLang";

type Dict = Record<string, string>;
type I18nValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate a key. Falls back to the Russian value, then the key itself. Supports `{var}` interpolation. */
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nCtx = createContext<I18nValue | null>(null);

function detectLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "ru" || saved === "en") return saved;
  return "ru";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18nValue>(() => {
    const dict: Dict = DICTS[lang] ?? ru;
    const t = (key: string, vars?: Record<string, string | number>) => {
      let s = dict[key] ?? ru[key] ?? key;
      if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
      return s;
    };
    return { lang, setLang: setLangState, t };
  }, [lang]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useT(): I18nValue {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error("useT must be used within <I18nProvider>");
  return ctx;
}
