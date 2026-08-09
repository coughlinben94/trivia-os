# Design-Pipeline Hardening — Round 2 Review (Opus audit of fixes #1-10)

Written 2026-07-28. An Opus subagent did a deep, adversarial code review of every
commit from the fixes #1-10 batch — not a grep-level check that things exist,
but tracing logic by hand and live-testing `protect-json-stores.mjs` against
real Bash command strings. Findings below are theirs, confirmed by citation
(file/line, actual test output). Treat this as more authoritative than the
surface-level verification pass that preceded it — that pass confirmed things
were *wired in*, this pass confirms whether they *work*.

Bottom line: several of the ten fixes don't do what their commit messages and
the original plan doc claim. Two are the most consequential — read those
first.

## Confirmed solid, no action needed

- `tallyDefects()` extraction (`c2bf005`) — traced by hand, behavior-preserving.
- Dissent retention (`35f9584`) — `rootCause`/`_dissent` genuinely work as designed on both gates.
- The three doc-only fixes (A3 verbatim relay, A4 remainder, B7 closure) — clean, no dangling references.
- The sweep script — genuinely read-only, never deletes, never blocks.
- Gate-level crash containment (`catch` → `problems.push` → exit 2) — verified fail-closed.
- Legitimate screenshot workflows (`cp`/rename/`rm` in `.audit-shots/`) — confirmed not over-blocked by the new guard.

## Real bugs and gaps, prioritized

**1. CRITICAL — the correctness-critic major-defect override (fix A1) is unreachable under the critic's own instructions. The motivating incident is still not caught mechanically.**
`majorOverride` requires 2+ samples to agree on a `major` tag. But `trivia-os-design-critic.md` explicitly instructs: "if it's major, vote FAIL" — meaning a PASS-voting sample can never carry a `major` tag by design. With a 2-1 PASS vote, at most one sample (the dissenter) can name a major defect, so `agreedDefects` can never reach 2 and the override can never fire. Replaying the actual `logs` incident under the new code: samples 1+3 PASS with no majors (per instruction), sample 2 FAILs naming a major `box-tell` — result is still a PASS. What fix #1 actually delivered is better record-keeping (the dissent gets saved), not enforcement. The override is decorative as written.

**2. CRITICAL — a lone dissent on a correctness PASS is recorded in JSON but printed nowhere. The new worker reporting rule (fix A3) has nothing to relay.**
The single-sample-dissent case (`defectsSingleSample`) is only surfaced to stderr in the quality-gate branch. The correctness path writes it to the verdict file and prints nothing. `trivia-os-design-worker.md` now tells the worker to "state which slugs have non-blocking findings recorded" on a PASS — but for the exact case that motivated this fix, there is no stderr output to relay. Fix #4's reporting rule and fix #1's data live in different places and don't connect.

**3. HIGH — B2 (mtime forgery) is only half-fixed. The screenshot side still trusts scene-file mtime, and the new content-hash makes the remaining hole look more trustworthy than it is.**
The verdict now carries a `sceneFileHash`, which is a real improvement. But `freshShotsFor` still compares screenshot mtime against the *scene file's* mtime, and the scene `.html` itself is unprotected by the Bash guard. Confirmed live: `node -e "require('fs').utimesSync('concepts/scene.html',0,0)"` and `touch -d` both pass the guard. Attack: edit the scene, backdate its mtime, and every pre-edit screenshot reads as fresh. The hash mismatch forces a re-spawn of the critic panel — but the panel then judges the *old* render while the verdict gets stamped with the *new* content's hash. The verdict now looks cryptographically bound to evidence it was never actually shown.

**4. HIGH — `git` commands are completely unguarded and can revert or wipe the protected files.**
Both `concepts/design-cases.json` and `concepts/.design-attempt-counts.json` are git-tracked, and `Bash(git *)` is unrestricted. Confirmed live: `git checkout HEAD~3 -- concepts/design-cases.json` (rewinds any counter), `git clean -fdx concepts/` (wipes the untracked verdict directory and audit log outright), `git stash push -- concepts/design-cases.json`. None of these are inspected by `protect-json-stores.mjs`, which only watches `rm|mv|touch|sed -i|tee`-class verbs. This is the largest remaining hole in B1 — bigger than anything the guard currently covers.

**5. HIGH — `.claude/settings.local.json` still has an unscoped `"Bash(cd *)"`, undoing the settings.json narrowing from fix #5.**
The hardening replaced the unscoped `cd .../trivia-os && *` in `settings.json` with eight narrowed verb-specific entries. `settings.local.json` (a separate file, untouched by this work) still has `Bash(cd *)`, which matches any command starting with `cd`. The Bash guard hook still catches literal-path writes regardless, so this isn't fatal alone, but the settings-layer half of fix #5 is inert.

**6. HIGH — the guard's own pattern matching has multiple live bypasses beyond its documented limitations.**
Confirmed via direct hook testing, all ALLOW (should be BLOCK): `rm concepts/'design-cases.json'` (quote breaks the match), `rm concepts/*.json` and `rm concepts/design-case?.json` (globs), `rm -rf concepts` (no trailing slash), `cp`/`mv` into a bare directory destination, `truncate -s 0`, `ln -sf /dev/null`, `dd of=...`, and Python/node heredoc-to-stdin scripts (no `-e`/`-c` flag to trigger the eval-flag detector). Only the relative-path case is in the file's documented known-limitations. The glob and directory-destination cases are things an agent could hit by accident during ordinary cleanup, not just adversarially.

**7. MEDIUM — the guard fails open, not closed, if the hook process itself can't run.**
It's wired in `settings.json` as a relative path (`node .claude/hooks/protect-json-stores.mjs`), not an absolute/`$CLAUDE_PROJECT_DIR`-anchored one. A missing file, wrong cwd, or uncaught throw produces exit 1/127, which Claude Code treats as non-blocking — i.e., allow. Combined with finding on new risks below: nothing stops an agent from deleting the guard file itself.

**8. MEDIUM — malformed critic output crashes the whole gate run, not just one file's check.**
`tallyDefects` does `(s.defects || []).map(...)` — a non-array `defects` value (e.g. a critic emitting `"box-tell"` as a bare string instead of the specified array) throws out of the entire file loop into the top-level catch, replacing every remaining file's checks with a single stack trace and losing the in-flight verdict write. Fail-closed, but coarser than it needs to be. One-line fix available (`Array.isArray(s.defects) ? s.defects : []`).

**9. MEDIUM — the audit trail (fix #10) doesn't do the job its own comment claims, and nothing reads it.**
The gate's comment says the log exists so the sweep script "has something to cross-check against" — the sweep script never opens the log. It's write-only. It's also not tamper-evident (no hash chain, no sequence number), missing from `.gitignore`, and deletable via the glob/git-clean holes above — meaning a delete-and-regenerate attack still looks like a first run, which is exactly what B4 was supposed to catch.

**10. LOW — B3's per-element check is blocking now but has no escape hatch**, and the guard's own help text ("reads via cat/grep are unaffected") is wrong — `grep`, `echo`, and even a `git commit -m` containing words like `rm`/`mv` alongside a protected path all get blocked by the bare co-occurrence check.

## New risk this work introduced

**The guard doesn't protect itself, and nothing else does either.** `.claude/settings.json` and `.claude/hooks/**` are not in the deny list. Any agent with ordinary Write/Edit (blanket-allowed) can edit `settings.json` to remove the `PreToolUse` entry, or simply `rm .claude/hooks/protect-json-stores.mjs` — that path isn't matched by the guard's own protected-path regex. Combined with finding #7 (missing-file fails open), deleting the hook file silently disables the entire fix #5 with no error surfaced anywhere. This is the single new point of failure the hardening work itself created.

**Adversarial framing (fix #9) is unproven, not confirmed working.** It's well-phrased but appended to prompts that already had multiple "don't soften toward PASS" instructions, and the gate's own comments already cite research that no aggregation recovers correlated model error. There's no measurement showing it changes anything. Treat as hopeful, not verified.

## Where the plan docs oversell

- The commit message and doc both call fix #6 "immune to scene-file mtime manipulation" — true of the verdict, false of the screenshot the verdict is based on (finding #3).
- The original doc calls fix #1 "the single highest-value fix — it directly closes the hole that let `logs` pass." It does not (finding #1).
- The fixes-5-10 doc names one Bash-guard limitation (interpreter string-concatenation obfuscation) and implies that's the honest ceiling. It omits git, globs, quote-splitting, heredoc-to-stdin, and directory-destination `cp`/`mv` — none of which require obfuscation to hit.

## Recommended next actions, concrete

1. Fix the override logic itself: either drop the "no major on PASS" instruction and let the override arbitrate, or add a real single-dissent rule (any sample naming a major defect forces at minimum a loud, mandatory-relay stderr message, ideally a block). Apply the same decision to the pre-existing quality override, which likely has the identical dead-branch problem.
2. Print `defectsSingleSample` in the correctness path unconditionally, mirroring the quality branch, so the worker's new reporting rule has something real to relay.
3. Bind verdicts to evidence, not just code: hash each screenshot at capture time, store the hash in the verdict, and make `freshShotsFor` compare against that instead of scene-file mtime.
4. Add git verbs (`checkout|restore|clean|stash|rm|reset`) to the guard wherever they co-occur with `concepts/` — this is the biggest remaining hole, bigger than anything currently covered.
5. Close the cheap pattern gaps: strip quotes before matching, handle globs, treat directory-destination `cp`/`mv` as a hit, add `truncate|ln|dd`, detect heredoc-to-interpreter, and fix the "reads are unaffected" claim in the guard's own error text.
6. Protect the guard from itself: deny-list `.claude/**` for Write/Edit, add the hook/settings files to the guard's own protected-path list, anchor the hook invocation to an absolute path, and wrap the whole hook body in try/catch that exits 2 on any throw so it fails closed.
7. Delete the stray `"Bash(cd *)"` from `.claude/settings.local.json`.
8. Small robustness fixes: array-guard `tallyDefects`, merge-on-write for `writeCase` (the counts file already got this in an earlier pass, the case log didn't), add the audit log to `.gitignore`.
9. Either make the sweep script actually read and cross-check the audit log, or remove the claim that it does.
