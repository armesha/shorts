const BASE_URL = process.env.CREATOR_SMOKE_BASE_URL || "http://127.0.0.1:8091";

async function check(path, expectText) {
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`${url} returned ${res.status}: ${text.slice(0, 200)}`);
    if (expectText && !text.includes(expectText)) throw new Error(`${url} did not include ${JSON.stringify(expectText)}`);
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

await check("/api/creator/health", '"ok":true');
await check("/creator", "<!doctype html>");
console.log(`[creator-smoke] ok: ${BASE_URL}`);
