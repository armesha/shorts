# server/ architecture

Layered Fastify backend (run via `tsx`, no build step). **Dependencies point downward —
routes → services → infra; never upward.**

- **`routes/`** — Fastify route modules only. Each exports a `registerXRoutes(app, db, deps?)`
  function that `index.ts` calls. HTTP in, HTTP out — no domain logic beyond request/response glue.
- **`services/`** — domain logic + external-API clients: YouTube (upload/OAuth/analytics + stats),
  Telegram (bot stats), platform/user/admin analytics, and pack/fact/video generation. No Fastify.
- **`infra/`** — cross-cutting primitives: `scheduler`, `shutdown`, `metrics`, `rate-limits`,
  `account-limits`, `output-access`, `media`.

**Stay at `server/` root** (entrypoint, data hub, and the files imported by the tsconfig-excluded
`src/scripts/*` tools — moving them would silently break those scripts, which typecheck can't catch):

- `index.ts` — the composition root: boot/migrations, plugins + static + SPA wiring, the global auth
  `onRequest` hook + `PUBLIC_API` allowlist, then the column of `register*()` calls, then `listen()`.
- `db.ts` — the SQLite data layer (`openDb()` factory; `type Db = ReturnType<typeof openDb>`).
- `config.ts`, `auth.ts`, `telegram.ts`.

Imports are **relative with explicit `.ts` extensions** (`allowImportingTsExtensions`); a file one
level deep reaches root as `../db.ts` and the repo's `src/` as `../../src/...`.
