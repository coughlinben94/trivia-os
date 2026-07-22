---
description: Press-go entry point for the Storybook Agent — attended mode, run directly against the connected repo, no cron, no scratch checkout needed
allowed-tools: Read, Grep, Glob, Skill, Agent, Bash(*), Edit
disable-model-invocation: true
---

# /run — press go (Storybook Agent, attended mode)

**Context (2026-07-22): there is no nightly cron anymore.** The scheduled task
(`trivia-os-storybook-agent`) is disabled and stays that way — Ben's explicit call, not a
bug. This pipeline now only runs when Ben (or Claude, on Ben's behalf) triggers it, in a
live session with a human present. This command is that trigger — "press go."

## Why this skips the scratch-checkout dance

`AGENT-PROMPT.md`'s scratch-checkout architecture (`/preflight` step 1,
`nightly-checkout.sh`) exists solely because an *unattended* run has no human available
to approve the delete-permission prompt every `git commit` triggers in the connected
folder. That constraint doesn't apply here — you're running this because Ben asked you
to, right now, in a session where he's present. So:

- **Work directly in `~/Projects/baynes-trivia/trivia-os`** (the connected folder) — no
  scratch checkout, no credential-copying, no `$WORKDIR` indirection.
- If a git operation (or `visual-audit.mjs`'s screenshot writes) hits the connected
  folder's delete-permission wall (`EPERM`, `Operation not permitted` on a `.git/*.lock`
  or similar), call `mcp__cowork__allow_cowork_file_delete` yourself — this is exactly
  the attended context that tool is for. Don't fall back to the scratch-checkout path
  just because a delete prompt showed up; that's expected and fine to grant live.
- If Ben ever re-enables the cron, the unattended path (`AGENT-PROMPT.md` followed
  literally, scratch checkout and all) is still there, untouched, for that case. This
  command is the separate, simpler attended path — not a replacement for that one.

## Sequence

Run these in order, in this same session, without stopping for confirmation between
them unless something genuinely needs Ben's input (Stuck Protocol, below):

1. **Preflight-lite.** Run `.claude/commands/preflight.md`'s steps 2-7 (skip step 1,
   the scratch checkout) with CWD as the connected repo root: required-docs check,
   Recraft reachability, sanitizer self-test, existing-manifest validation, run-lock
   acquisition (`concepts/.nightly-lock`, same script, now local to the connected
   folder instead of a scratch dir), git baseline save, stale-entry recovery.
2. **Claim.** Run `.claude/commands/claim.md`'s Step 2 exactly as written — priority
   order from `AGENT-PROMPT.md` Step 2 (needs-revision first, then grilled, then
   self-invented). Commit the claim checkpoint immediately, same as always.
3. **Build or fix.** `AGENT-PROMPT.md` Steps 3-4 (sprite generation, the build itself)
   — these stay judgment calls, not mechanical steps, per `/ship`'s own note. If this is
   a `needs-revision` claim, this is where the ONE fix attempt (see the one-attempt rule
   in `QUEUE.md` and `/audit`) happens — read the revision notes, make the fix, don't
   loop past one attempt here.
4. **Audit.** Run `.claude/commands/audit.md` in full — checkpoint, static checklist,
   mandatory visual pass, one-attempt rule, single Fable second-opinion pass. This is
   the step that actually answers "is this good," not step 3.
5. **Ship.** Run `.claude/commands/ship.md` — update `QUEUE.md`/`manifest.js`/
   `NIGHTLY-LOG.md`, guarded commit + push directly to `origin/main` (this push reaches
   `origin/main` directly now — there's no separate scratch-to-connected sync step
   needed, since we never left the connected folder).
6. **Release the lock.** `./concepts/tools/lock-release.sh "$RUN_ID"` — always, every
   exit path, per `AGENT-PROMPT.md`'s Always-last step.

## Stuck Protocol

Same as `AGENT-PROMPT.md`'s Stuck Protocol — an unresolvable ambiguity, a preflight
failure, an audit finding that survives the one fix attempt with Fable also flagging it
unresolved: log it plainly in `NIGHTLY-LOG.md`, commit that, release the lock, stop. Ben
is present in this mode — if something is genuinely a judgment call only he can make,
it's fine (better, even) to just ask him directly instead of guessing or blocking
silently, since attended mode means he's right here. Use judgment about which: a quick
"is this the meteor debris parallel-invention thing I should build around, or wait for
your call?" is fine; don't ask him to babysit every routine decision the Steps already
cover.

## What this is not

This is not a lighter-weight audit or a permission to skip steps because a human is
watching. Every rule in `AGENT-PROMPT.md`, `QUEUE.md`'s status machine, and `/audit`'s
checklist still applies in full — attended mode changes *where* the work happens (the
connected folder, not a scratch checkout) and *who can grant a delete prompt*, not what
counts as done.
