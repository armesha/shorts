/** Error carrying the HTTP status + the server's `{error}` message (for lockout/attempt UI). */
export class ApiError extends Error {
  status: number;
  /** Parsed JSON error body when present (e.g. per-card upload validation errors). */
  body?: unknown;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function handle<T>(r: Response, path: string): Promise<T> {
  if (r.ok) return (await r.json()) as T;
  let message = `${r.status} ${r.statusText}`;
  let body: unknown;
  try {
    body = await r.json();
    const data = body as { error?: string };
    if (data?.error) message = data.error;
  } catch {
    /* non-JSON error body — keep the status text */
  }
  // Session expired/invalid mid-use → let the app fall back to the login screen.
  if (r.status === 401 && !path.startsWith("/auth/")) {
    window.dispatchEvent(new CustomEvent("auth:unauthorized"));
  }
  const err = new ApiError(r.status, message);
  err.body = body;
  throw err;
}

export async function get<T>(path: string): Promise<T> {
  return handle<T>(await fetch(`/api${path}`, { credentials: "include" }), path);
}

export async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return handle<T>(r, path);
}

export async function sendBinary<T>(path: string, body: Blob): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/octet-stream" },
    body,
  });
  return handle<T>(r, path);
}
