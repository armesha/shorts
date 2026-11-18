import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { uid } from "../infra/auth-session.ts";

const channels = [
  { login: "jolygames", label: "Шевцов" },
  { login: "mokrivskyi", label: "Мокривский" },
].map((channel) => ({ ...channel, url: `https://www.twitch.tv/${channel.login}` }));
const youtube = { login: "ijJXKz-1YnE", label: "Swich Games", url: "https://www.youtube.com/live/ijJXKz-1YnE" };

const metadata = z.object({
  data: z.object({ user: z.object({ login: z.string(), stream: z.object({ id: z.string() }).nullable() }) }),
});
type Status = "checking" | "live" | "offline" | "unknown";

export function registerGta6StreamWatch(app: FastifyInstance, request: typeof fetch = fetch) {
  const shutdown = new AbortController();
  let timer: ReturnType<typeof setInterval> | undefined;
  let statuses: Status[] = channels.map(() => "checking");
  let youtubeStatus: Status = "checking";
  const signal = () => AbortSignal.any([shutdown.signal, AbortSignal.timeout(8_000)]);

  async function refreshTwitch() {
    try {
      const response = await request("https://gql.twitch.tv/gql", {
        method: "POST",
        // Public Twitch web client ID. The request only reads channel metadata.
        headers: { "Client-ID": "ue6666qo983tsx6so1t0vnawi233wa", "Content-Type": "application/json" },
        body: JSON.stringify(channels.map(({ login }) => ({
          query: "query ($login: String!) { user(login: $login) { login stream { id } } }",
          variables: { login },
        }))),
        signal: signal(),
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

  async function refreshYouTube() {
    try {
      const url = `https://www.youtube.com/watch?v=${youtube.login}`;
      const response = await request(url, { signal: signal() });
      if (!response.ok) throw new Error(`YouTube HTTP ${response.status}`);
      const page = await response.text();
      const match = /\bytInitialPlayerResponse\s*=\s*(\{[^\r\n]*?\});\s*<\/script>/u.exec(page);
      if (!match?.[1]) throw new Error("Missing YouTube player metadata");
      const data = JSON.parse(match[1]) as {
        playabilityStatus?: { status?: string };
        videoDetails?: { videoId?: string; isLive?: boolean };
        microformat?: { playerMicroformatRenderer?: { liveBroadcastDetails?: { isLiveNow?: boolean } } };
      };
      const live = data.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.isLiveNow ?? data.videoDetails?.isLive;
      youtubeStatus = data.videoDetails?.videoId === youtube.login && data.playabilityStatus?.status === "OK"
        ? live === true ? "live" : "offline"
        : data.playabilityStatus?.status === "LIVE_STREAM_OFFLINE" ? "offline" : "unknown";
    } catch (error) {
      if (shutdown.signal.aborted) return;
      youtubeStatus = "unknown";
      app.log.warn({ err: error }, "Could not check YouTube stream status");
    }
  }

  const refresh = () => { void refreshTwitch(); void refreshYouTube(); };
  app.addHook("onReady", async () => {
    refresh();
    timer = setInterval(refresh, 60_000).unref();
  });
  app.addHook("onClose", async () => {
    clearInterval(timer);
    shutdown.abort();
  });

  app.get("/api/gta6-live/watch", async (req, reply) => {
    if (!uid(req)) return reply.code(401).send({ error: "Не авторизован" });
    reply.header("Cache-Control", "private, no-store");
    return { channels: [
      ...channels.map((channel, index) => ({ ...channel, platform: "twitch", status: statuses[index] })),
      { ...youtube, platform: "youtube", status: youtubeStatus },
    ] };
  });
}
