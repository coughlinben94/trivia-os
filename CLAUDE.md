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
2. `~/.agents/skills/emilkowal-animations/SKILL.md` — animation technical reference
3. `~/.agents/skills/emil-design-eng/SKILL.md` — animation philosophy
4. `~/.agents/skills/baynes-design/SKILL.md` — Baynes brand identity

## Before Building Any Feature
- Run `systematic-debugging` skill if fixing a bug
- Run `writing-plans` skill if starting a new feature
- Run `verification-before-completion` skill before marking anything done
- Run `design-review` skill after building any /display component

## Before Any Animation Code
Read both emilkowal-animations and emil-design-eng. No exceptions.

## Stack
React + Vite + Tailwind + Supabase + Framer Motion
Deployed to Vercel. Local dev: `vercel dev`
Repo: coughlinben94/trivia-os
Local: /Users/bencoughlin/Projects/baynes-trivia/trivia-os

## Key Rules
- Never use Socket.io, Express, or local file storage
- Supabase is the only backend
- Boogaloo + DM Sans are the only fonts
- Read SKILL.md Section 18 build order before starting any new step
- Clean build required before every deploy
