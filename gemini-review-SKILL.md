---
name: gemini-review
description: A standalone adversarial plan-review loop where Claude (builder) and Google Gemini CLI (read-only critic) tag-team an implementation plan before any code is written. Mirrors codex-review but swaps the critic model. Use when the user ALREADY has a plan and wants a Gemini-flavored cross-model stress-test — no requirements interview first. Claude drafts/loads the plan into PLAN.md; Gemini reviews it read-only and returns VERDICT:APPROVED or VERDICT:REVISE; Claude revises and resubmits to the SAME Gemini session until APPROVED or a MAX_ROUNDS cap. Human approves the converged plan before code. Use when the user says "/gemini-review", "gemini review my plan", "have Gemini review my plan", "second opinion from Gemini", or wants a different model's critique than Codex's (e.g. to catch what Codex missed, or when Codex is unavailable). NOT for reviewing already-written code and NOT for trivial changes.
---

# Gemini-Review — Adversarial Plan-Review Loop (Gemini CLI critic)

Two models, one plan, a bounded argument. **Claude is the builder and orchestrator. Gemini CLI is a read-only critic** that can read the repo and the plan but must not touch a single file. They communicate strictly through `PLAN.md` + a Gemini session that persists across rounds via `--resume`. The human enters at exactly two points: kickoff and final sign-off.

Same shape as `codex-review` — swap the critic model when you want Gemini's take instead of (or in addition to, via separate invocation) Codex's. Reach for it on auth, data models, concurrency, migrations, payments — anything expensive to get wrong. Skip it for obvious/cheap work.

## Prerequisites (verify once, fast — do NOT skip this)

- **Tier check first.** As of mid-2026, Google is retiring standalone Gemini CLI for unpaid-tier and Google One users in favor of Antigravity CLI. Before relying on this skill, confirm `gemini --version` still works and `gemini -p "say ok"` returns cleanly on Ben's actual account tier. If it's been migrated to Antigravity CLI, the command name and flags below will not apply as-is — stop and re-derive the equivalent flags rather than assuming compatibility.
- Gemini CLI installed and authenticated: `gemini --version`, then `gemini -p "say ok"` as a smoke test.
- Do NOT pin `-m` unless the user asks — let it use the account's default model (`auto` alias).
- **Read-only guarantee is UNVERIFIED — confirm before trusting the loop.** Unlike Codex CLI (which has an explicit `-s read-only` sandbox flag verified to block writes), Gemini CLI's `--approval-mode default` requires interactive confirmation for file-writing tool calls, and headless mode has no TTY to answer that prompt. It is NOT confirmed here whether an unanswered approval request in headless mode (a) silently denies the tool call (safe — desired behavior) or (b) hangs/errors out. **Before the first real review round, run a throwaway test**: point Gemini at a scratch repo, prompt it to modify a file, run headless, and confirm no file was touched. Do not assume safety from this doc alone — this is the single most important thing to verify, mirroring the hard-won read-only lesson from codex-review.
- Never pass `--approval-mode yolo` or `--approval-mode auto_edit` for this skill — those defeat the read-only guarantee outright. Stick to `--approval-mode default` (the default) and treat any confirmation prompt as a sign something is trying to write.

## Tunable variables (read from skill args, else default)

| Var | Default | Meaning |
|-----|---------|---------|
| `MAX_ROUNDS` | `5` | Hard cap on review rounds. The loop ALWAYS terminates at this. |
| `PLAN_FILE` | `PLAN.md` | Where the evolving plan lives (repo root). Reuse the same file if chaining with codex-review. |
| `LOG_FILE` | `PLAN-REVIEW-LOG-GEMINI.md` | Append-only transcript of the argument. Kept separate from Codex's log by default so both critiques are distinguishable; use the same log as codex-review only if you want one merged transcript. |

If the user invoked the skill with an argument like `rounds=3`, use that for `MAX_ROUNDS`. Echo the resolved values back before starting.

## Flow

### Step 0 — Kickoff (human gate #1)

The invocation itself is the kickoff. Confirm scope in one line: what is being planned. If the user gave no task, ask for it (one question). Then proceed — do NOT ask for approval round-by-round; that comes at the end.

### Step 1 — Claude plans

Do real planning: read the relevant code, think through the approach, surface decisions and tradeoffs. Then write the plan to `PLAN_FILE` (same structure as codex-review):

```markdown
# Plan: <task>
_Round 0 — initial draft by Claude_

## Goal
<one paragraph>

## Approach
<numbered steps, concrete>

## Key decisions & tradeoffs
<the contestable choices — name them explicitly so Gemini has something to bite>

## Risks / open questions
<what you're unsure about>

## Out of scope
<bounds>
```

Initialize `LOG_FILE`:
```markdown
# Plan Review Log (Gemini): <task>
Started <stamp the user's local time if known, else "session start">. MAX_ROUNDS=<n>.
```

Show the user the plan inline and say you're sending it to Gemini for adversarial review.

### Step 2 — The loop

Maintain `ROUND` (start 1) and `SESSION_ID` (empty until round 1 returns).

**The review prompt** sent to Gemini each round (adjust the task line):

> You are an adversarial reviewer for an implementation plan. Be skeptical and specific — your job is to find what breaks, not to be agreeable. Read the plan at `PLAN.md` (and any repo files you need; you must NOT modify any files — you are a read-only reviewer). Identify concrete flaws: security holes, race conditions, missing edge cases, schema conflicts, wrong assumptions, observability gaps, simpler alternatives. For each, give a one-line fix. Do NOT write, edit, or delete any file, and do NOT run destructive shell commands. End your reply with EXACTLY one line: `VERDICT: APPROVED` if the plan is sound enough to implement, or `VERDICT: REVISE` if it still has material problems.

**Round 1** (creates the session — capture the session ID from the `init` event):

```bash
gemini -p "$(cat REVIEW_PROMPT)" --approval-mode default --output-format stream-json \
  < /dev/null 2>/dev/null > /tmp/gemini-stream.jsonl
```

Parse the session ID from the `init` event line (`{"type":"init","sessionId":"...","model":"..."}` — confirm exact key names against the actual output the first time you run this, the schema above is inferred from docs, not hand-verified). That is `SESSION_ID`. Pull the critique text from the `message` events (assistant chunks) or the final `result` event, whichever carries the full text — inspect the actual JSONL once before scripting extraction blindly.

> **`< /dev/null` is mandatory**, same reasoning as codex-review: a non-interactive driver with no TTY can otherwise block forever if the CLI reads stdin waiting for EOF. Cheap insurance even if Gemini's CLI doesn't currently need it.
>
> **Timeout guard:** wrap every `gemini -p` call with a hard ceiling (`timeout: 600000` via Claude Code's Bash tool, or `timeout 600` / `gtimeout 600` in a plain shell). If it trips, treat it as a failed run — stop and tell the user rather than retrying blind.
>
> **Confirm success** by the presence of an `init` event and a non-empty response. If neither appears, the run failed (auth/tier/model) — stop and surface it, don't silently retry.

**Rounds 2..MAX** (resume the SAME session so Gemini remembers earlier critiques):

```bash
gemini -r "$SESSION_ID" -p "I revised the plan. Re-review PLAN.md. Same rules — read-only, no file writes. End with VERDICT: APPROVED or VERDICT: REVISE." \
  --approval-mode default --output-format stream-json \
  < /dev/null 2>/dev/null > /tmp/gemini-stream.jsonl
```

If `-r "$SESSION_ID"` proves unreliable in practice (e.g. session store lag), `-r "latest"` is the documented fallback — but only safe if no other Gemini session is running concurrently on this project during the loop. Prefer the explicit ID.

**Each round, after Gemini returns:**
1. Extract the critique text from `/tmp/gemini-stream.jsonl`. Append to `LOG_FILE`: `## Round <n> — Gemini` + the full critique.
2. Grep for the verdict token in the final text.
   - `VERDICT: APPROVED` → break the loop, go to Step 3 (converged).
   - `VERDICT: REVISE` → Claude reads the critique, decides **what's actually worth acting on** (Claude has final say — Gemini advises, it does not command). Revise `PLAN_FILE`. Append to `LOG_FILE`: `### Claude's response` + what you changed and what you rejected and why. Increment `ROUND`.
3. If `ROUND > MAX_ROUNDS` → break to Step 3 (deadlock).

### Step 3 — Resolution (human gate #2)

**If APPROVED:** Present to the user — the final `PLAN_FILE`, a 3-bullet summary of what the argument improved, and the round count. Ask whether to implement now and who builds it. **No code is written during the loop.**

**If MAX_ROUNDS hit without APPROVED (deadlock):** Do NOT pretend it converged. Surface the unresolved disagreements explicitly: list each point Gemini still flags and Claude's counter-position. Hand it to the human to break the tie.

## Hard rules

- Gemini must never be given `--approval-mode yolo` or `auto_edit` in this skill. If tempted to give it write access to move faster, stop — that's a different skill.
- The loop ALWAYS terminates at `MAX_ROUNDS`. No unbounded recursion.
- Claude is the final arbiter on every REVISE — incorporate good critiques, reject bad ones *with a reason logged*.
- Code only after human gate #2.
- `LOG_FILE` is the deliverable — keep it complete.

## What NOT to do

- Don't use this to review existing code.
- Don't skip the pre-flight read-only verification test — it is not confirmed safe from documentation alone, unlike Codex's `-s read-only` which was hand-verified.
- Don't assume `--output-format stream-json`'s exact JSON keys match this doc without checking real output once — Gemini CLI's docs describe the event types but this skill hasn't been run end-to-end yet.
- Don't let Gemini edit files. Read-only, always.

## Open items before first real use

1. Confirm Ben's account tier still runs `gemini` (vs. having moved to Antigravity CLI).
2. Run the read-only safety test described in Prerequisites.
3. Run one throwaway review round and check the actual `stream-json` event keys against what's assumed above; fix the parsing logic if they differ.
