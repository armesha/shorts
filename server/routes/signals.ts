import type { FastifyInstance } from "fastify";
import { writeAsatibotControlRequest } from "../services/asatibot-control.ts";
import {
  parseAsatibotSettingsRequest,
  readAsatibotSnapshot,
  unavailableAsatibotSnapshot,
  type AsatibotSettings,
  type AsatibotSnapshotResponse,
} from "../services/asatibot-snapshot.ts";
import type { RouteDeps } from "./deps.ts";

type SignalsRouteOptions = {
  readSnapshot?: () => Promise<AsatibotSnapshotResponse>;
  writeSettings?: (settings: AsatibotSettings) => Promise<boolean>;
};

export function registerSignalsRoutes(
  app: FastifyInstance,
  deps: Pick<RouteDeps, "auth" | "webOrigin">,
  options: SignalsRouteOptions = {},
) {
  const readSnapshot = options.readSnapshot ?? readAsatibotSnapshot;
  const writeSettings = options.writeSettings ?? writeAsatibotControlRequest;

  app.get("/api/signals", async (req, reply) => {
    reply.header("Cache-Control", "no-store, max-age=0");
    reply.header("Pragma", "no-cache");
    if (!deps.auth.requireAdmin(req, reply)) return;
    try {
      return await readSnapshot();
    } catch {
      // Never turn a local bot/read error into an error response that could leak details.
      return unavailableAsatibotSnapshot();
    }
  });

  app.put("/api/signals/settings", async (req, reply) => {
    reply.header("Cache-Control", "no-store, max-age=0");
    reply.header("Pragma", "no-cache");
    if (!deps.auth.requireSuperAdmin(req, reply)) return;
    if (req.headers.origin !== deps.webOrigin) {
      return reply.code(403).send({ error: "Недопустимый источник запроса" });
    }

    const settings = parseAsatibotSettingsRequest(req.body);
    if (!settings) return reply.code(400).send({ error: "Некорректные настройки сигналов" });
    try {
      if (!(await writeSettings(settings))) return reply.code(503).send({ accepted: false });
      // The bot applies the desired state asynchronously; this is deliberately not an "applied" claim.
      return reply.code(202).send({ accepted: true });
    } catch {
      return reply.code(503).send({ accepted: false });
    }
  });
}
