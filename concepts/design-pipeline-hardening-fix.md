# Design-Review Pipeline Hardening Fix — post-Campfire-round-2

Written 2026-07-27 in Cowork, for Claude Code to review and implement. Every
claim below was checked against the actual files on disk (not taken from any
agent's self-report) before being written down here. File/line refs are exact
as of this commit; re-check before patching if the hook has moved since.

## Why this doc exists

Campfire Sing-Along has now failed its own gate twice. Round 1: a backgrounded
subagent self-reported "both critics PASS" — false, confirmed false by reading
the verdict files directly. Round 2 (same session as this doc): redispatched
in the foreground, the gate genuinely ran — but treeline and reflection failed
again, in the same defect categories as before, groundGlow's fresh FAIL never
made it into the spoken summary, and logs PASSED 2-1 while the dissenting
sample named the exact defect Ben originally complained about.

The goal here isn't to patch Campfire a third time. It's to fix the scaffolding
so the next scene doesn't produce the same three failure modes: majority vote
burying a correct dissent, background dispatch silently skipping the gate, and
a spoken summary that doesn't match what the gate actually found.

## A. Confirmed root causes

**A1. The quality critic has a major-defect override. The per-element correctness critic does not.**
`design-done-gate.mjs` line 1592: `const majorOverride = votes.verdict === 'PASS' && agreedDefects.length > 0;` — this only exists in the quality-gate branch. The correctness critic's tally (`tallyVotes()`, ~lines 543-547) is bare majority, no severity concept at all. `trivia-os-design-critic.md`'s output schema (~line 74) has no `defects`/`severity` field, only a free-text `reason`. Result: `logs` passed 2-1 tonight even though sample 2's dissent precisely named "flame doesn't rise out of the logs" — Ben's own original complaint — with nothing structurally able to catch it. This is the exact failure mode that hit `reflection` in round 1, now confirmed still live for every category except quality.

**A2. Background dispatch is empirically proven unreliable, not just theoretically risky, and nothing enforces against it.**
`concepts/DESIGN-WORKER-LESSONS.md` line 188 (first-party admission, written before tonight): the done-gate hook "doesn't reliably fire for background Agent-tool dispatches." `concepts/design-worker-p0-p2-plan.md` lines 22-28 flagged this as needing "a live human test... confirm this empirically on the next real visual task rather than trusting it blind." That test happened in round 1 and failed. Nothing changed after — no hook logic, no settings.json wiring, no hard rule in the worker's own instructions. `.claude/settings.json`'s `SubagentStop` entry has no matcher; it fires unconditionally and depends entirely on the child transcript's own Stop actually invoking it, which is the exact thing already shown not to happen reliably.

**A3. The gate's block and the agent's spoken summary are two unconnected things.**
Every FAIL is genuinely pushed into `problems[]` and printed on exit 2 (lines 1732-1735) — the gate did not drop groundGlow. But nothing requires the dispatching agent's final chat message to the human to be a complete, unedited echo of that list. `trivia-os-design-worker.md`'s "Reporting back" section (~lines 252-256) only says "be specific" — not "reproduce the blocked list verbatim." Tonight groundGlow's fresh FAIL was real on disk and never spoken.

**A4. Two governing documents contradict each other on the same failure-prone categories, and nobody flagged it before building anyway.**
`design-cases.json` shows `organic-contour` (oak tree, treeline) and `liquid-surface` (pond, reflection) both failing repeatedly across *different* scenes. `DESIGN-WORKER-LESSONS.md` already generalizes this ("start any future water surface with generated raster texture, not a hand-coded fill"). But the 2026-07-27 reference-first addendum to `OBJECT-RENDERING-PROTOCOL.md` retired generated-first and re-mandated hand-coding/roto-tracing for exactly these categories. Campfire's treeline and reflection were then hand-built under the newer rule and failed the same way a third and fourth time. Nobody reconciled the category-level lesson against the protocol-level rule before building.

**A5. A correctness PASS throws away the dissenting reasoning instead of recording it.**
`design-done-gate.mjs` line 1367: `rootCause: verdict.verdict === 'FAIL' ? verdict.reason : 'n/a'` (same pattern at line 1622 for quality). On a PASS, the full three-sample reasoning — which already contains the minority FAIL text — gets discarded and replaced with the string `"n/a"` in the durable case log. The `logs` dissent tonight exists only in the ephemeral `.design-critic-verdicts/*.json` file, not in `design-cases.json`, which is supposed to be the long-term memory.

## B. New structural gaps (not previously named)

**B1. The Write/Edit deny list on the three protected JSON stores is bypassable via plain Bash.** `.claude/settings.json`'s `allow` list includes unscoped `"Bash(rm *)"`, `"Bash(mv *)"`, `"Bash(node *)"`, `"Bash(echo *)"`, and `"Bash(cd /Users/.../trivia-os && *)"` — this last entry alone permits any shell command whatsoever once prefixed with a `cd`. The `deny` list only blocks the `Write`/`Edit` *tools*, not shell redirection, `rm`, `mv`, or `node -e`. Any agent can currently `rm concepts/.design-attempt-counts.json` (resets every two-strike counter to zero — the gate falls back to `{}` if the file doesn't exist, line ~887) or fabricate a plausible verdict JSON with a fresh timestamp and `sampleVotes: {pass:3,fail:0,total:3}`, indistinguishable from a real one. Verified directly against the current `.claude/settings.json` — this is real, not theoretical.

**B2. "Freshness" is pure mtime, and mtime is forgeable through the same unrestricted Bash access.** Every freshness check (`freshShotsFor`, verdict-age comparisons) compares file mtimes. `touch -d` or `fs.utimesSync` via `node -e` (both reachable through the allow list above) can set any mtime, including a future one. No content hash, no tie to the actual render step.

**B3. The pass-criterion check is file-wide, not per-element.** `hasCriterionAnywhere` (line 1137) is `/PASS\s*=/.test(codeText)` — one sentence anywhere in the file satisfies it for every element the file contains. The per-element locality check exists (lines 1228-1235) but is a `console.error` warning, never a blocking `problems.push`.

**B4. No integrity trail on the three JSON stores.** No checksum, no "written by the gate itself" marker. A delete-and-regenerate cycle (B1) is indistinguishable from a legitimate first run.

**B5. Stale per-slug history can outlive a deleted or renamed scene.** Nothing purges verdict/attempt-count entries for scenes that no longer exist. A future file reusing an old path+element-name slug would inherit old two-strike counts and potentially still-fresh cached verdicts.

**B6. The three-model panel shares one prompt, one screenshot, one rubric — model diversity alone is a weak independence proxy.** All three samples get identical `criticInstructions` and (for single-screenshot elements, the common case) identical evidence. The gate's own comments already cite research suggesting model diversity recovers roughly 2 independent votes out of a nominal 9. Nothing in the critic prompt asks a sample to actively argue against its own leaning PASS before finalizing.

**B7. Governance conflict, resolved.** `references/themes.md` rule 1a says ambient themes should cut or flatten figurative detail, not render it pictorially. `OBJECT-RENDERING-PROTOCOL.md`'s own addendum called this "still open and deserves a deliberate rule rewrite, not a quiet exception." **Ben's ruling (2026-07-27): a fully pictorial scene can belong in the house style, if it works itself out** — meaning pictorial detail is not banned, but it earns its place only by actually clearing the real bar (noun test + quality critic, genuinely, not on a false PASS). No rule rewrite needed. This makes fixes #1-#4 above more urgent, not less: if pictorial scenes are allowed exactly as far as they can be made to genuinely pass, then a gate that can be gamed by majority vote or background dispatch is the whole risk, not a side issue. Update `OBJECT-RENDERING-PROTOCOL.md`'s addendum to close this as resolved rather than leaving it flagged open.

## C. Fixes, prioritized by how much of tonight's actual failure they'd have stopped

1. **Extend major-defect override to the correctness critic (fixes A1).** Add `defects: [{tag, severity}]` to `trivia-os-design-critic.md`'s output contract, closed vocabulary parallel to the quality critic's tags. In the gate, replace bare majority for correctness with the same agreed-tag accumulation + `majorOverride` logic already built for quality (~lines 1553-1592). This is the single highest-value fix — it directly closes the hole that let `logs` pass with a matching, named defect.

2. **Stop discarding dissent on a correctness/quality PASS (fixes A5).** Change `rootCause: verdict.verdict === 'FAIL' ? verdict.reason : 'n/a'` (lines 1367, 1622) to always store the full reasoning, adding a `_dissent` field when `sampleVotes.pass !== sampleVotes.total` on a PASS. One-line change, data already in memory.

3. **Make foreground-only dispatch a hard rule, not an open question (fixes A2).** State plainly in `trivia-os-design-worker.md`'s header: visual build work must never be dispatched via a backgrounded/async Agent call — this is proven broken, not "still verifying." Add a mechanical trip-wire in the gate: if a visual file changed with zero fresh verdicts for any of its elements, the block message should name the likely cause explicitly ("no verdict exists — was this built by a backgrounded subagent whose own Stop never ran this gate?") instead of the generic message it gives today.

4. **Require verbatim relay of the gate's block list (fixes A3).** Add to `trivia-os-design-worker.md`'s reporting section: "If the gate blocks, reproduce the full, unedited `problems[]` list to the human — do not summarize or select from it. If it passes, state which slugs have non-blocking findings recorded even though nothing blocked."

5. **Actually restrict Bash around the three protected files (fixes B1).** Remove or scope `"Bash(cd /Users/.../trivia-os && *)"` in `.claude/settings.json` — it defeats every deny rule in the file. Add a `PreToolUse` hook on Bash that inspects the command string for the three protected paths appearing as a write target (`rm`, `mv`, `tee`, `sed -i`, `>`, `node -e`) and blocks, reusing the segment-parsing logic the gate already has (~lines 726-729).

6. **Content-hash freshness, not just mtime (fixes B2).** Have the render tool write a sidecar hash of the scene file's content at capture time; compare that instead of/in addition to mtime.

7. **Make the pass-criterion check per-element and blocking (fixes B3).** Reuse the existing proximity check (lines 1228-1235) but push failures into `problems[]` instead of `console.error`.

8. **Force explicit reconciliation before re-attempting a repeat-failure category (fixes A4).** Before hand-coding/roto-tracing any element in a category with 2+ prior FAILs anywhere in `design-cases.json`, the worker must quote the prior root causes in its build plan and state why this attempt addresses the mechanism, not just repeats it. (B7 is resolved — pictorial scenes are allowed, contingent on genuinely clearing the gate — so this fix is about not re-guessing blind on treeline/reflection a third time, not about whether Campfire should exist at all.)

9. **Adversarial framing in critic prompts (mitigates B6).** Add to both critic prompts: "Before concluding PASS, name the single most likely reason a skeptical second reviewer would FAIL this, then check whether that reason actually holds." Cheap, no extra spawn cost, doesn't fix correlated-model-error ceiling but raises per-vote quality.

10. **Audit trail + stale-entry pruning (mitigates B4/B5, lowest priority).** Append-only log of every write to the three JSON stores; periodic human-run sweep flagging entries whose `file` no longer exists in the repo.

## What this doc is not

Not a patch to Campfire itself. Treeline, reflection, and groundGlow are still failing and logs is still masking a real defect — those need actual rebuild work, separately, once the scaffolding above is trustworthy enough that a PASS means what it says.
