# Trivia OS — Claude Code Instructions

## Superpowers (read first, every session)
Read `~/.agents/skills/using-superpowers/SKILL.md` at the start of every session. Non-negotiable.

Invoke these automatically:
- systematic-debugging → before any bug fix
- writing-plans → before any new feature
- verification-before-completion → before marking anything done
- dispatching-parallel-agents → for large multi-part tasks
- subagent-driven-development → for complex feature builds
- brainstorming → before entering plan mode

## Read These First
Before doing anything in this project — including answering questions — read in order:

1. `~/Projects/baynes-trivia/trivia-os/SKILL.md` (this repo's root) + `references/` — full project blueprint, architecture, schema, design system. Single source of truth. Follow its own "Read Order" section for display/theme/animation work.
2. `~/.agents/skills/emil-design-eng/SKILL.md` — animation/polish philosophy
3. `~/.agents/skills/baynes-design/SKILL.md` — Baynes brand identity

> ⚠️ Broken references (found in 2026-07-09 audit): `emilkowal-animations` and `design-review` were required reading here but no longer exist in `~/.agents/skills` — confirm with Ben where they went. Interim: use the `gsap-*` skill suite + `emil-design-eng` for animation; `design-audit` for review.

## Before Building Any Feature
- Run `systematic-debugging` if fixing a bug
- Run `writing-plans` if starting a new feature
- Run `verification-before-completion` before marking anything done — display-facing work requires live verification on a real `/display` window, not code reading

## Stack
React + Vite + Tailwind + Supabase + Framer Motion
Deploy: `git push` → Vercel auto-deploys `main` (webhook known-flaky — if no deploy in ~2 min, `vercel --prod` from repo root)
Repo: coughlinben94/trivia-os (public)
Local: `~/Projects/baynes-trivia/trivia-os`
Supabase: `qwtbgusqfoypvehnungr` (Baynes Trivia) — NEVER `dreggwinegtirxxanntv` (Business Suite)

## Key Rules
- Never use Socket.io, Express, or local file storage — Supabase is the only backend
- Fonts are theme-driven: slide/display text reads `theme.fonts.display` / `theme.fonts.body` (Boogaloo + DM Sans are the defaults, not hardcoded constants — per-show overrides must keep working)
- Concurrent sessions are the norm here: `git status` / `git stash list` first, stage by explicit filename, no unreviewed pushes to `main` — full rule list in memory `feedback_trivia_os_standing_rules`
- Clean build required before every deploy
