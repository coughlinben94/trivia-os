#!/usr/bin/env node
// .claude/hooks/plan-commit-gate.mjs
//
// The mechanical backstop for "the plan lived only in ephemeral session output and is now
// permanently gone" — what happened twice on this project, a year apart: the original 18-entry
// failure ledger (concepts/FAILURE-LEDGER.md's own opening note) and an 11-item work plan on
// 2026-08-10, both written in a Cowork session's temporary outputs folder, never committed,
// never recoverable.
//
// SCOPE, STATED HONESTLY (both real losses above were Cowork-outputs-only artifacts — this hook
// cannot see those, and does NOT claim to reproduce their exact shape): this hook can only see
// what happens inside the Claude Code session it is attached to. What it closes is the narrower,
// still-real case where a CC session itself (a) accumulates real unfinished multi-item work and
// writes zero trace of it anywhere the repo can recover, or (b) is handed a plan/prompt from
// elsewhere (pasted from Cowork) and never persists it before stopping. It does NOT reach a
// Cowork session that never pastes its plan into CC at all — nothing running inside this repo's
// hooks can. That gap is real and is not this hook's to close (see
// references/ring-world-continuity.md's "Known limits").
//
// v2 (2026-08-10, same day, after two independent blind reviews of v1 — both converged on the
// same disqualifying bug, verified by hand before fixing):
//   1. PLAN_PATH_RE matched ANY concepts/*.html file, including the actual product files
//      (world-07-ring.html etc.) that nearly every real ring-world session edits. That made the
//      hard block a near-total false negative for exactly the population it targets: touch the
//      product file at all (normal ring work) and the gate is satisfied without a single plan
//      ever being written. Reproduced live: 3 incomplete todos + one product-file edit → exit 0,
//      silent. Fixed: PLAN_PATH_RE now matches ONLY .md files (concepts/, references/,
//      docs/superpowers/plans/ — the actual sanctioned plan location this project's own
//      writing-plans skill mandate uses; confirmed real and active, 15 files, most recent
//      2026-08-06). concepts/*.html is never plan-shaped in this project; dropped entirely.
//   2. docs/superpowers/plans/ wasn't matched at all — the false-positive mirror of bug 1. A
//      session that DID follow this project's own mandated plan workflow and wrote its plan to
//      the sanctioned location still got hard-blocked. Now matched.
//   3. Bash-written plans (heredoc, tee, sed -i onto a matching path) were invisible — same class
//      of bug design-done-gate.mjs's own v2 changelog already documented and fixed once for a
//      different check. Added a minimal strong-signal Bash scan, one tier, no weak/mtime-based
//      tier (this hook doesn't need design-done-gate's full two-tier machinery — it only needs to
//      know a matching path was written this session, not to distinguish authored-from-rendered).
//   4. Unwired from SubagentStop. A subagent's own TodoWrite list is its internal task
//      breakdown for ONE delegated task, not a cross-session plan — this project's CLAUDE.md
//      mandates subagent-driven-development, so that path fires often, and forcing a subagent
//      to write a "plan" into concepts/ to escape a block risks junk-file pollution for a
//      cross-session-continuity problem subagents don't actually have. Stop-only now.
//   5. Wording fixes: "at session end" → the actual behavior is every Stop (this response
//      ending), not necessarily the last one in a session — the block message no longer implies
//      otherwise. The block message's "exact shape of two real, permanent losses" was inaccurate
//      (both real losses were Cowork-only, structurally invisible to this hook, per the scope
//      note above) — reworded to say what this hook actually guards against.
//   6. Calibration: v1 was run against 5 synthetic fixtures but no evidence was kept anywhere,
//      and a doc citing "the hook's own header" for that evidence found nothing there — an
//      unrendered claim stated as fact, the project's own named failure shape, reproduced inside
//      the artifact meant to prevent it. This header is now that evidence. Re-run 2026-08-10
//      after the v2 fixes, 8 cases, all correct:
//        A. 3+ incomplete todos, only a product .html edited            -> BLOCK (was the v1 bug: PASS)
//        B. 3+ incomplete todos, docs/superpowers/plans/*.md written    -> PASS (was the v1 bug: BLOCK)
//        C. 3+ incomplete todos, concepts/HANDOFF-*.md written, uncommitted -> WARN, exit 0
//        D. 3+ incomplete todos, zero matching writes                   -> BLOCK
//        E. no TodoWrite call this session                              -> silent exit 0
//        F. all todos completed                                        -> silent exit 0
//        G. stop_hook_active set                                        -> silent exit 0 (loop guard)
//        H. plan written via `Bash(cat > concepts/x.md <<'EOF' ... EOF)` only, no Edit/Write tool -> PASS
//      Raw stdin fixtures used for this run are inline in the test invocation, not saved as
//      files — this repo has no fixtures/ convention for hooks (unlike concepts/tools/, which
//      does for visual checks) and inventing one for an 8-case, one-file check is more apparatus
//      than the check warrants. The record here is the evidence: dated, case-by-case, honest
//      about what wasn't kept.
//
// Exit 0 = allow Stop. Exit 2 = block, forcing the agent to keep working.

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
// .md only — concepts/*.html is always a product/scene file in this project, never a plan.
const PLAN_PATH_RE = /(^|\/)concepts\/.*\.md$|(^|\/)references\/.*\.md$|(^|\/)docs\/superpowers\/plans\/.*\.md$/i;
const BASH_STRONG_RE = />>?\s*['"]?([\w./-]+\.md)|tee\s+(?:-a\s+)?['"]?([\w./-]+\.md)|sed\s+-i[^\n]*['"]?([\w./-]+\.md)/gi;
const MIN_INCOMPLETE_ITEMS = 3; // below this, "unfinished todo list" is noise, not a plan

function readStdinJson() {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return {}; }
}
function sh(cmd) {
  try { return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' }); } catch (e) { return e.stdout || ''; }
}

// Same technique as design-done-gate.mjs's sessionTouchedFiles(): walk this session's own
// transcript JSONL, not git state — git state can't tell "this session" from "any session."
function scanTranscript(transcriptPath) {
  const result = { lastTodos: null, planPaths: new Set() };
  if (!transcriptPath || !existsSync(transcriptPath)) return result;
  let raw;
  try { raw = readFileSync(transcriptPath, 'utf8'); } catch { return result; }
  const addIfPlanPath = (p) => { if (typeof p === 'string' && PLAN_PATH_RE.test(p)) result.planPaths.add(p); };
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const blocks = entry?.message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const b of blocks) {
      if (b?.type !== 'tool_use') continue;
      if (b.name === 'TodoWrite' && Array.isArray(b.input?.todos)) {
        result.lastTodos = b.input.todos; // last one wins — TodoWrite always sends the full list
      }
      if (['Edit', 'Write', 'MultiEdit'].includes(b.name)) {
        addIfPlanPath(b.input?.file_path);
      }
      if (b.name === 'Bash' && typeof b.input?.command === 'string') {
        for (const m of b.input.command.matchAll(BASH_STRONG_RE)) addIfPlanPath(m[1] || m[2] || m[3]);
      }
    }
  }
  return result;
}

function main() {
  const payload = readStdinJson();
  if (payload.stop_hook_active) process.exit(0); // repeat pass on the same Stop — don't loop
  const { lastTodos, planPaths } = scanTranscript(payload.transcript_path);

  if (!lastTodos) process.exit(0); // no TodoWrite this session — nothing this hook can check

  const incomplete = lastTodos.filter(t => t?.status !== 'completed');
  if (incomplete.length < MIN_INCOMPLETE_ITEMS) process.exit(0);

  if (planPaths.size === 0) {
    console.error(
      `plan-commit-gate: BLOCKED — ${incomplete.length} unfinished to-do item(s) and this session ` +
      `has written no plan-shaped file (concepts/*.md, references/*.md, or ` +
      `docs/superpowers/plans/*.md) to carry them forward. If this work is genuinely done for now, ` +
      `write what's left into one of those locations before stopping — a new file, or appended to ` +
      `the live HANDOFF/plan doc. Deprioritized-but-not-forgotten still counts; the point is a ` +
      `written trace, not urgency.\n` +
      `Unfinished items:\n` +
      incomplete.map(t => `  - [${t.status}] ${t.content || t.activeForm || '(no text)'}`).join('\n')
    );
    process.exit(2);
  }

  const uncommitted = [...planPaths].filter(p => {
    const status = sh(`git status --porcelain -- ${JSON.stringify(p)}`).trim();
    return status.length > 0;
  });
  if (uncommitted.length > 0) {
    console.error(
      `plan-commit-gate: WARNING (not blocking) — ${incomplete.length} unfinished to-do item(s) and ` +
      `this session wrote a plan-shaped file that isn't committed yet: ${uncommitted.join(', ')}. ` +
      `It's on disk, which already narrows the failure mode this hook exists for, but commit it ` +
      `before you're done with this thread of work — ship.sh will refuse to ship with it dirty anyway.`
    );
  }
  process.exit(0);
}

main();
