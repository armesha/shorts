import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { uid } from "../infra/auth-session.ts";

const channels = [
  { login: "jolygames", label: "Шевцов" },
  { login: "mokrivskyi", label: "Мокривский" },
  { login: "steel", label: "Стилл" },
].map((channel) => ({ ...channel, url: `https://www.twitch.tv/${channel.login}` }));

const metadata = z.object({
  data: z.object({ user: z.object({ login: z.string(), stream: z.object({ id: z.string() }).nullable() }) }),
});
type Status = "checking" | "live" | "offline" | "unknown";

export function registerGta6TwitchWatch(app: FastifyInstance, request: typeof fetch = fetch) {
  const shutdown = new AbortController();
  let timer: ReturnType<typeof setInterval> | undefined;
  let statuses: Status[] = channels.map(() => "checking");

  async function refresh() {
    try {
      const response = await request("https://gql.twitch.tv/gql", {
        method: "POST",
        // Public Twitch web client ID. The request only reads channel metadata.
        headers: { "Client-ID": "ue6666qo983tsx6so1t0vnawi233wa", "Content-Type": "application/json" },
        body: JSON.stringify(channels.map(({ login }) => ({
          query: "query ($login: String!) { user(login: $login) { login stream { id } } }",
          variables: { login },
        }))),
        signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(8_000)]),
      });
      if (!response.ok) throw new Error(`Twitch HTTP ${response.status}`);
      const results: unknown = await response.json();
      if (!Array.isArray(results)) throw new Error("Invalid Twitch response");
      statuses = channels.map(({ login }, index) => {
        const result = metadata.safeParse(results[index]);
        if (!result.success || result.data.data.user.login.toLowerCase() !== login) return "unknown";
        return result.data.data.user.stream ? "live" : "offline";
      });
    } catch (error) {
      if (shutdown.signal.aborted) return;
      statuses = channels.map(() => "unknown");
      app.log.warn({ err: error }, "Could not check Twitch stream status");
    }
  }

  app.addHook("onReady", async () => {
    void refresh();
    timer = setInterval(() => void refresh(), 60_000).unref();
  });
  app.addHook("onClose", async () => {
    clearInterval(timer);
    shutdown.abort();
  });

  app.get("/api/gta6-live/twitch-watch", async (req, reply) => {
    if (!uid(req)) return reply.code(401).send({ error: "Не авторизован" });
    reply.header("Cache-Control", "private, no-store");
    return { channels: channels.map((channel, index) => ({ ...channel, status: statuses[index] })) };
  });
}
