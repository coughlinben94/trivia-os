---
description: Morning follow-up pass on last night's Cowork-built round-journey prototype — real chrome-devtools screenshot/trace audit, then open a PR instead of leaving it on main
allowed-tools: Read, Edit, Grep, Bash(git *), Bash(gh *), Bash(node *), mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__performance_start_trace, mcp__chrome-devtools__performance_stop_trace, mcp__chrome-devtools__performance_analyze_insight, mcp__github__create_pull_request
disable-model-invocation: true
---

# /morning-review — human-triggered follow-up to the Cowork nightly run

**Why this command exists:** the nightly `trivia-os-storybook-agent` runs as a Cowork
scheduled task, which has no access to the chrome-devtools or github MCP servers
(those are only registered in this local Claude Code). So the unattended run
already completed `/audit`'s static checklist and pushed straight to `main` — that's
correct, documented, unattended behavior, not a failure. This command is the
deliberate second pass, run here where the real MCPs exist, standing in for
Ben's "daytime session" review from `AGENT-PROMPT.md`'s rule #2.

## Steps

1. **Find what was built last night.** Read `concepts/NIGHTLY-LOG.md`'s most recent
   entry to identify the prototype file, and `concepts/QUEUE.md` to confirm its
   current status (`built` expected; if `blocked`, stop here and read the log
   entry's explanation instead of proceeding — there's nothing to audit).

2. **Run the full `/audit`** against that file, including the parts the
   unattended run couldn't do: `take_screenshot` at each transition's key beat,
   a full `performance_start_trace`/`performance_stop_trace`/`performance_analyze_insight`
   pass, confirming compositor-only. Report the verdict plainly — do not soften
   a real finding because the file already shipped to `main`.

3. **If the audit passes:** since last night's `guarded-commit-push.sh` already
   pushed the file straight to `main` (the known, documented limitation), there is
   no unmerged branch to open a PR from. Instead: open a PR-style summary as a
   comment-quality writeup (screenshots + trace verdict) appended to
   `concepts/NIGHTLY-LOG.md` under today's date, OR, if Ben wants a real reviewable
   PR going forward, propose switching `guarded-commit-push.sh` itself to push to
   a `verify/<slug>` branch and open a draft PR via `create_pull_request` instead
   of pushing straight to `main` — flag this as a real infrastructure change to
   confirm with Ben, don't just make it silently.

4. **If the audit fails:** unlike the unattended nightly run, this command is
   always run interactively by Ben, watching live — that supervision is itself
   the review checkpoint the nightly agent doesn't have. So: attempt the fix
   directly, in this session, as normal visible edits (not silently). Then
   re-run `/audit` on the fixed file to confirm the fix actually holds — do not
   just assert it's fixed.
   - **If the re-audit passes:** commit and push the fix to `main` directly
     (`git commit`, `git push` — same guarded discipline as the nightly agent's
     scripts, scoped to `concepts/`). Report what broke and what changed.
   - **If it still fails after one fix attempt:** stop. Do not loop indefinitely
     guessing at fixes. Write the failure clearly (what broke, screenshot/trace
     evidence, what was tried) and let Ben decide: revert, patch further
     himself, or queue a `needs-revision` entry in `QUEUE.md` for the next
     nightly run to pick up (same revision path as `AGENT-PROMPT.md` Step 2).

Do not mark anything `approved` — that's a separate, show-readiness judgment call
Ben makes verbally after watching the piece run, not something a passing audit
implies. This command's job is to get the code itself correct and verified,
with Ben watching it happen — not to decide the piece is ready for a real show.
