import assert from "node:assert/strict";
import test from "node:test";
import Fastify, { type FastifyRequest } from "fastify";
import { registerGta6StreamWatch } from "./gta6-stream-watch.ts";

test("the watcher checks only the configured Twitch channels and YouTube stream", async () => {
  const app = Fastify();
  const requests: Array<{ url: string; method?: string; logins: string[] }> = [];
  app.addHook("onRequest", async (req) => {
    if (req.headers["x-test-user"] === "7") (req as FastifyRequest & { userId?: number }).userId = 7;
  });
  registerGta6StreamWatch(app, async (url, options) => {
    const body = JSON.parse(String(options?.body ?? "[]")) as Array<{ variables: { login: string } }>;
    requests.push({ url: String(url), method: options?.method, logins: body.map(({ variables }) => variables.login) });
    if (String(url).includes("youtube.com")) return new Response(`<script>var ytInitialPlayerResponse = ${JSON.stringify({
      playabilityStatus: { status: "OK" }, videoDetails: { videoId: "ijJXKz-1YnE", isLive: true },
    })};</script>`);
    return Response.json([
      { data: { user: { login: "jolygames", stream: { id: "123" } } } },
      { data: { user: { login: "steel", stream: null } } },
    ]);
  });
  const url = "/api/gta6-live/watch";
  try {
    assert.equal((await app.inject({ url })).statusCode, 401);
    const response = await app.inject({ url, headers: { "x-test-user": "7" } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "private, no-store");
    assert.deepEqual(response.json(), { channels: [
      { login: "jolygames", label: "Шевцов", url: "https://www.twitch.tv/jolygames", platform: "twitch", status: "live" },
      { login: "steel", label: "Стилл", url: "https://www.twitch.tv/steel", platform: "twitch", status: "offline" },
      { login: "ijJXKz-1YnE", label: "Swich Games", url: "https://www.youtube.com/live/ijJXKz-1YnE", platform: "youtube", status: "live" },
    ] });
    assert.deepEqual(requests, [{
      url: "https://gql.twitch.tv/gql", method: "POST", logins: ["jolygames", "steel"],
    }, { url: "https://www.youtube.com/watch?v=ijJXKz-1YnE", method: undefined, logins: [] }]);
  } finally {
    await app.close();
  }
});
