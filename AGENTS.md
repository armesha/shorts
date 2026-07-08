# shorts-factory agent rules

This file is the authoritative shared instruction file for Codex, Claude Code, and other coding agents.
Keep shared rules here. Do not duplicate them in `CLAUDE.md`; Claude Code imports this file from there.

## Communication

- Reply to the user in Russian only, even when code, logs, or docs are in another language.
- Use 24-hour time everywhere. Never introduce AM/PM in UI or user-facing text.
- For UI time inputs, do not use native `input[type="time"]` or `datetime-local`; use a validated text field in `HH:MM` format.
- Always pass an explicit `ru-RU` locale to `toLocaleString`, `toLocaleTimeString`, and `toLocaleDateString`; use `hour12: false` for times when relevant.
- At the end of implementation work, state whether a server restart is needed and whether it was already done.

## Safety boundaries

- Never read, print, grep, cat, commit, or expose secrets: `.env*`, tokens, `client_secret_*.json`, or `*.apps.googleusercontent.com.json`.
- The Google OAuth client secret is required at runtime, but agents must not inspect its contents.
- Work only in `/home/davtian/Documents/shorts` unless the user explicitly asks otherwise.
- Do not read-for-edit, edit, run, migrate, commit, or kill anything in `/home/davtian/Documents/casino`.
- Do not use broad process-kill commands such as `pkill -f`, `fuser -k`, or kill-by-name. Inspect exact PIDs first and touch only Shorts-owned processes.
- There may be parallel agents and dirty worktrees. Preserve unrelated changes, especially in files you did not touch.

## Runtime and live site

- User-facing site: `https://shareboard.live/`. Localhost and Vite are only agent verification surfaces; do not tell the user to check localhost.
- Visible Shorts changes must be verified against `shareboard.live` when feasible; localhost-only proof is not enough.
- Do not restart, stop, or kill shared long-lived Shorts processes unless the user explicitly asked or allowed it. If a backend change needs restart and permission is missing, say that clearly.
- Backend/runtime code changes under `server/**` or `src/**` need a backend restart before they are live. Frontend-only changes need `npm run web:build`; server restart is usually not needed unless deployed static assets must be refreshed by the current workflow.
- Standard production commands:
  - `npm run ops:check` - read-only live/worker/Armen checks, no restart.
  - `npm run server:restart` - safe restart of the production API and generation worker.
  - `npm run deploy:restart` - `web:build` plus safe server restart.
  - `npm run deploy:refresh` - `web:build`, safe restart, and public smoke check.
  - `npm run verify:live` - typecheck, tests, Armen checks, build, restart, worker status, public smoke.
- Do not start the production backend manually with `npm run server` or `node ... server/index.ts` on port `:8080`; it conflicts with `shorts.service`.
- If a temporary backend run is needed for diagnostics, use another port.
- Production app listens on `:8080` behind Caddy on `127.0.0.1:8090`; do not touch `cloudflared` unless the task is explicitly about tunneling.
- After restart, verify with service health, a single listener on `:8080`, local `/api/health`, and public smoke/health where applicable.

## Repo workflow

- Before changing code, inspect the current implementation and prefer existing patterns.
- Backend: Node + TypeScript + Fastify via `tsx`; SQLite uses `node:sqlite`, so ad hoc scripts need `node --import tsx --experimental-sqlite`.
- Frontend: Vite + React + TypeScript + Tailwind/DaisyUI, light theme.
- Architecture details live in `server/ARCHITECTURE.md`, `docs/STACK.md`, and `docs/REORG-PLAN.md`; check them before moving backend boundaries.
- Keep fixes narrow. Do not turn a small user-visible request into unrelated cleanup.
- Run focused checks appropriate to the risk: `npm run typecheck`, `npm test`, `npm run web:build`, specific node tests, or live smoke commands.
- Update `CHANGELOG.md` only for public user-facing app changes. Do not add admin-only/internal/docs-only changes to the public changelog.
- For completed feature/fix work, commit and push after validation unless the user explicitly asked not to. Stage only relevant files unless the user asks to commit all current work. Never commit secrets or generated/runtime data.

## Content, packs, and assets

- Before touching built-in decks, generated packs, template packs, anecdotes, jokes, memes, card templates, long videos, voiceover, or source media, read `docs/pack-generation.md`.
- For any LLM/subagent/workflow that generates, cleans, ranks, formats, localizes, or titles pack content, ask the user which model to use before running it. Local parsers, renderers, and validators can run without asking.
- Jokes and anecdotes must be source-backed. Do not invent joke/anecdote text with AI. Use public-domain/open-license sources with a `sources.json` or equivalent ledger.
- All visual and audio assets must be copyright-safe: Pexels license, CC0/Public Domain, compatible open license with evidence, or self-generated. Record source and license.
- Do not use copyrighted movie/game/anime frames, celebrity press/paparazzi/promotional photos, famous meme templates, paid stock, or unclear "found online" assets.
- For living or recent real people, use only neutral, verifiable facts and only images with explicit usable licensing.
- MGS packs/templates are separate client content. Do not use them as sources, donors, fallbacks, or active super-admin content unless the user explicitly asks for an MGS task.
- A new pack/deck must be made usable in the app in the same pass: integrated, renderable, visible in the relevant UI/API, verified, and documented in `docs/pack-generation.md`.
- For 1080x1920 Shorts/Reels/TikTok renders, keep important readable text out of the bottom UI area and away from the right action column; verify dense text with real rendered frames.
- For voiceover or music, follow the current rule in `docs/pack-generation.md` and never print or commit real API keys.

## Reusable workflow candidates

Keep `AGENTS.md` concise. Long procedures should move to skills or targeted reference docs instead of growing this file:

- Shorts live ops and restart verification.
- Source-backed pack/joke/meme sourcing.
- Armen channel blocks, schedules, and one-short-per-channel publish workflows.
- YouTube quota/upload-limit diagnosis.
- Creator/UI live QA.
