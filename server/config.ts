import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Load .env if present (Node 22). Missing file is fine — real env vars still apply.
try {
  process.loadEnvFile(resolve(process.cwd(), ".env"));
} catch {
  /* no .env file; rely on process environment */
}

// Hardcoded default path to the Google OAuth client-secret JSON (fallback).
// The agent never reads this file's contents; only the OAuth layer does at runtime.
export const DEFAULT_CLIENT_SECRET_FILE =
  "/home/davtian/Documents/shorts/client_secret_735991879461-lcvblrn3co3hlrrqi1ljvik2ih68oarp.apps.googleusercontent.com.json";

export interface BaseConfig {
  port: number;
  chromePath: string;
  dbPath: string;
  outputDir: string;
}

/** Cross-platform Chrome/Edge detection: CHROME_PATH env > common per-OS install paths. */
function detectChrome(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const local = process.env.LOCALAPPDATA;
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          local ? local + "\\Google\\Chrome\\Application\\chrome.exe" : "",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/snap/bin/chromium",
          ];
  return candidates.find((p) => p && existsSync(p)) ?? candidates.find(Boolean) ?? "google-chrome";
}

export function loadBaseConfig(): BaseConfig {
  return {
    port: Number(process.env.PORT ?? 8080),
    chromePath: detectChrome(),
    dbPath: process.env.DATABASE_PATH ?? "data/app.db",
    outputDir: process.env.OUTPUT_DIR ?? "data/output",
  };
}

/** Resolve the client-secret path: stored DB setting > env override > hardcoded default. */
/** Find a client_secret*.json in the project root (a new machine just drops the file there). */
function autoDetectCreds(): string {
  try {
    const f = readdirSync(process.cwd()).find(
      (x) => /^client_secret.*\.json$/i.test(x) || /\.apps\.googleusercontent\.com\.json$/i.test(x),
    );
    return f ? resolve(process.cwd(), f) : "";
  } catch {
    return "";
  }
}

export function resolveClientSecretFile(stored?: string | null): string {
  const v =
    (stored && stored.trim()) ||
    process.env.GOOGLE_CLIENT_SECRET_FILE ||
    autoDetectCreds() ||
    DEFAULT_CLIENT_SECRET_FILE;
  return v.trim();
}

export function credsFileExists(path: string): boolean {
  return !!path && existsSync(path);
}
