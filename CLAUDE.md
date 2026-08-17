## Superpowers (read first, every session)
Read ~/.claude/plugins/cache/superpowers-dev/superpowers/5.1.0/skills/using-superpowers/SKILL.md at the start of every session. Non-negotiable.

Invoke these automatically:
- systematic-debugging → before any bug fix
- writing-plans → before any new feature
- verification-before-completion → before marking anything done
- dispatching-parallel-agents → for large multi-part tasks
- subagent-driven-development → for complex feature builds
- brainstorming → before entering plan mode

# Trivia OS — Claude Code Instructions

## Read These First
Before doing anything in this project — including answering questions — read these skills in order:

1. `/Users/bencoughlin/Projects/baynes-trivia/trivia-os/SKILL.md` — full project blueprint, architecture, schema, design system, build order. This is the single source of truth.
2. `~/.agents/skills/emil-design-eng/SKILL.md` — animation philosophy + technical reference
3. `~/.agents/skills/baynes-design/SKILL.md` — Baynes brand identity

## Before Building Any Feature
- Run `systematic-debugging` skill if fixing a bug
- Run `writing-plans` skill if starting a new feature
- Run `verification-before-completion` skill before marking anything done
- Run `design-audit` skill after building any /display component

## Before Any Animation Code
Read emil-design-eng. No exceptions.

## Stack
React + Vite + Tailwind + Supabase + Framer Motion
Deployed to Vercel. Local dev: `vercel dev`
Repo: coughlinben94/trivia-os
Local: /Users/bencoughlin/Projects/baynes-trivia/trivia-os

## Skill Registration & the .agents Fork (2026-08-17)

- `~/.claude/skills/<name>` is the registration index the Skill tool actually reads. Each entry is a **directory symlink** into `~/.agents/skills/<name>` (proven pattern: `trivia-jukebox -> ../../.agents/skills/trivia-jukebox`).
- `trivia-questions` and `trivia-os` were missing that registration symlink until 2026-08-17 — a pre-existing gap, now fixed (`~/.claude/skills/trivia-questions` and `~/.claude/skills/trivia-os` added).
- The Skill tool's callable list can lag a filesystem change mid-session; a fresh session is the reliable way to pick up a new/changed registration.
- **Unresolved:** `~/.agents/skills/trivia-questions/{SKILL.md,references}` and `~/.agents/skills/trivia-os/{SKILL.md,references}` are currently real files, copied from this repo (`trivia-questions/` and repo root respectively) — not symlinked to it. They can drift out of sync again if the repo is edited without a manual re-copy (this is exactly how the two-way fork happened the first time: `.agents` froze on 2026-07-23 while the repo kept moving).
- **Next-session test (not yet tried):** instead of symlinking `SKILL.md`/`references` individually inside `.agents`, point `~/.agents/skills/trivia-questions` itself (the whole directory) at this repo's `trivia-questions/` dir, same for `trivia-os` at the repo root. That makes the full chain `.claude → .agents → repo`, all directory symlinks — the same shape `trivia-jukebox` already proves resolves, cleaner than symlinking two files individually. Verify with a real `Skill` tool call in a fresh session before trusting it; if it doesn't resolve, fall back to a small sync script instead.

## Key Rules
- Never use Socket.io, Express, or local file storage
- Supabase is the only backend
- Boogaloo + DM Sans are the only fonts
- Read SKILL.md Section 18 build order before starting any new step
- Clean build required before every deploy
