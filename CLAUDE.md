@AGENTS.md

# Claude Code

Shared project rules live in `AGENTS.md`. Do not duplicate them here; update `AGENTS.md` when a rule should apply to all agents.

## Claude-specific rules

- Claude Code reads this file automatically; the `@AGENTS.md` import above keeps Claude aligned with Codex and other agents.
- Keep `.claude/` runtime files local unless the user explicitly asks to change them.
- Do not relax `.claude/settings.json` deny rules; they are the Claude-side backstop for secret safety.
- When project scripts intentionally call Claude headless (`claude -p`), still follow the shared model-selection rule from `AGENTS.md` before running content workflows.
