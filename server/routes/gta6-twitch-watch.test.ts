import assert from "node:assert/strict";
import test from "node:test";
import Fastify, { type FastifyRequest } from "fastify";
import { registerGta6TwitchWatch } from "./gta6-twitch-watch.ts";

test("Twitch watch queries only the three configured channels and reports each status", async () => {
  const app = Fastify();
  const requests: Array<{ url: string; method?: string; logins: string[] }> = [];
  app.addHook("onRequest", async (req) => {
    if (req.headers["x-test-user"] === "7") (req as FastifyRequest & { userId?: number }).userId = 7;
  });
  registerGta6TwitchWatch(app, async (url, options) => {
    const body = JSON.parse(String(options?.body)) as Array<{ variables: { login: string } }>;
    requests.push({ url: String(url), method: options?.method, logins: body.map(({ variables }) => variables.login) });
    return Response.json([
      { data: { user: { login: "jolygames", stream: { id: "123" } } } },
      { data: { user: { login: "mokrivskyi", stream: null } } },
      { errors: [{ message: "Query failed" }] },
    ]);
  });
  const url = "/api/gta6-live/twitch-watch";
  try {
    assert.equal((await app.inject({ url })).statusCode, 401);
    const response = await app.inject({ url, headers: { "x-test-user": "7" } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "private, no-store");
    assert.deepEqual(response.json(), { channels: [
      { login: "jolygames", label: "Шевцов", url: "https://www.twitch.tv/jolygames", status: "live" },
      { login: "mokrivskyi", label: "Мокривский", url: "https://www.twitch.tv/mokrivskyi", status: "offline" },
      { login: "steel", label: "Стилл", url: "https://www.twitch.tv/steel", status: "unknown" },
    ] });
    assert.deepEqual(requests, [{
      url: "https://gql.twitch.tv/gql", method: "POST", logins: ["jolygames", "mokrivskyi", "steel"],
    }]);
  } finally {
    await app.close();
  }
});
