// ElevenLabs key-limit probing for the admin «Лимиты» page: read each configured key's character
// usage + detect free-tier accounts barred from generating ("detected_unusual_activity"). Moved
// VERBATIM from index.ts. Pure (reads process.env + fetches ElevenLabs) — no db, no shared state.

export type ElevenLabsLimitKey = {
  index: number;
  keyHint: string;
  status: "ok" | "exhausted" | "invalid" | "rate_limited" | "error" | "blocked";
  httpStatus?: number;
  tier?: string | null;
  characterCount: number | null;
  characterLimit: number | null;
  remaining: number | null;
  usedPercent: number | null;
  resetAt: string | null;
  error?: string;
};

export function readElevenLabsKeys(): string[] {
  const raw = [
    process.env.ELEVENLABS_API_KEYS ?? "",
    process.env.ELEVENLABS_API_KEY ?? "",
    ...Object.entries(process.env)
      .filter(([name]) => /^ELEVENLABS_API_KEY_\d+$/.test(name))
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([, value]) => value ?? ""),
  ].join(",");
  return [...new Set(raw.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
}

export function secretHint(key: string, index: number): string {
  return `key #${index + 1} · ...${key.slice(-4)}`;
}

export function scrubElevenLabsError(value: unknown, key?: string): string {
  let msg = typeof value === "string" ? value : JSON.stringify(value ?? "");
  if (!msg || msg === "\"\"") return "ElevenLabs did not return an error body";
  if (key) msg = msg.split(key).join("[secret]");
  return msg.replace(/sk_[A-Za-z0-9_]+/g, "[secret]").slice(0, 240);
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// "Roger" — a premade voice; free-tier API may use it (Voice-Library voices are barred on free).
const ELEVENLABS_PROBE_VOICE = "CwhRBWXzGAHq8TQ4Fs17";

// A key can pass the subscription check yet be barred from generating: ElevenLabs
// flags free accounts for "unusual activity" (VPN / datacenter / shared-IP / multi-account)
// and disables Free-Tier generation, but the subscription endpoint still returns 200/ok.
// Detect it with an EMPTY-text TTS request — it bills 0 characters, yet a flagged account
// still returns 401 detected_unusual_activity before any generation. Returns a reason if
// barred, else null. Only an explicit unusual-activity signal flips the verdict (conservative).
export async function probeElevenLabsBlocked(key: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_PROBE_VOICE}`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ text: "", model_id: "eleven_multilingual_v2" }),
    });
    if (res.ok) return null;
    const body = (await res.json().catch(() => null)) as { detail?: { status?: string; message?: string } } | null;
    if (res.status === 401 && body?.detail?.status === "detected_unusual_activity") {
      return scrubElevenLabsError(body?.detail?.message ?? "Free Tier disabled (unusual activity)", key);
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchElevenLabsLimit(key: string, index: number): Promise<ElevenLabsLimitKey> {
  const baseRow = {
    index,
    keyHint: secretHint(key, index),
    characterCount: null,
    characterLimit: null,
    remaining: null,
    usedPercent: null,
    resetAt: null,
  };
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: {
        accept: "application/json",
        "xi-api-key": key,
      },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const status =
        res.status === 401 || res.status === 403
          ? "invalid"
          : res.status === 429
            ? "rate_limited"
            : "error";
      return {
        ...baseRow,
        status,
        httpStatus: res.status,
        error: scrubElevenLabsError(body, key),
      };
    }

    const obj = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const count = asNumber(obj.character_count);
    const limit = asNumber(obj.character_limit);
    const remaining = count != null && limit != null ? Math.max(0, limit - count) : null;
    const resetUnix = asNumber(obj.next_character_count_reset_unix);
    const resetAt = resetUnix ? new Date(resetUnix * 1000).toISOString() : null;
    const usedPercent = count != null && limit != null && limit > 0 ? Math.min(100, Math.round((count / limit) * 1000) / 10) : null;
    const row: ElevenLabsLimitKey = {
      ...baseRow,
      status: remaining === 0 && limit != null && limit > 0 ? "exhausted" : "ok",
      tier: typeof obj.tier === "string" ? obj.tier : null,
      characterCount: count,
      characterLimit: limit,
      remaining,
      usedPercent,
      resetAt,
    };
    // Subscription says "ok", but the account may still be barred from generating — probe it.
    if (row.status === "ok") {
      const blocked = await probeElevenLabsBlocked(key);
      if (blocked) {
        row.status = "blocked";
        row.error = blocked;
      }
    }
    return row;
  } catch (err) {
    return {
      ...baseRow,
      status: "error",
      error: scrubElevenLabsError((err as Error)?.message ?? err, key),
    };
  }
}
