import { resolve } from "node:path";
import { loadBaseConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { gracefulShutdown } from "./infra/shutdown.ts";
import { createNarezkaApp, narezkaPort } from "./narezka-app.ts";

const base = loadBaseConfig();
const db = openDb(base.dbPath);
const app = createNarezkaApp({
  db,
  root: resolve(process.cwd(), "data/stream-highlights"),
  secure: process.env.NAREZKA_SECURE !== "0",
  logger: true,
});
const port = narezkaPort();

app
  .listen({ port, host: "127.0.0.1" })
  .then(() => {
    app.log.info(`[narezka] http://127.0.0.1:${port}`);
    let shuttingDown = false;
    const onSignal = async (sig: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      app.log.info(`[narezka] received ${sig}`);
      try {
        await gracefulShutdown({
          log: (message) => app.log.info(`[narezka] ${message}`),
          stopScheduler: () => {},
          drainQueue: () => {},
          activeCounts: () => ({ render: 0, upload: 0 }),
          closeServer: () => app.close(),
          closeDb: () => {
            try { db.db.close(); } catch { /* already closed */ }
          },
        });
      } catch (error) {
        app.log.error(error, "[narezka] shutdown error");
      }
      process.exit(0);
    };
    process.on("SIGTERM", () => void onSignal("SIGTERM"));
    process.on("SIGINT", () => void onSignal("SIGINT"));
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
