# Design-Gate Hardening — Round 2 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the real bugs and gaps found by an independent Opus adversarial review of the fixes #1-10 batch (`concepts/design-pipeline-hardening-review-round2.md`), confirmed by hand-tracing and live-testing before this plan was written. Two findings are critical and land first: the major-defect override is structurally unreachable for the exact scenario it was built to catch, and `git checkout`/`clean`/`stash`/`reset --hard` completely bypass the Bash guard and can revert or wipe the protected stores outright.

**Architecture:** Two changes to `.claude/hooks/design-done-gate.mjs` (override logic, dissent printing, array-guard), one substantial rewrite of `.claude/hooks/protect-json-stores.mjs` (git-verb detection, quote/glob/bare-directory/heredoc bypasses, scene-file mtime protection, fail-closed wrapping, self-protection — enough interconnected changes that the plan gives the full replacement file rather than a chain of surgical diffs), a small `.claude/settings.local.json` cleanup, and a fix to `concepts/tools/sweep-stale-design-entries.mjs` so it actually cross-checks the audit log instead of ignoring it. No changes to `concepts/campfire-sing-along-v1.html`.

**Independent verification performed before writing this plan** (all claims below were re-confirmed by hand-tracing the actual code and live-testing the actual guard — not taken from the review doc on faith):

- **Confirmed CRITICAL #1 (override unreachable) is real.** Replayed the exact `logs` incident shape through the real `tallyVotes`/`tallyDefects`/`majorOverride` logic with instruction-compliant sample data (2 PASS samples with no major tags, since critics are told "if it's major, vote FAIL"; 1 FAIL sample naming a real major defect) — result: `votes: {pass:2,fail:1,total:3,verdict:'PASS'} agreedDefects:[] majorOverride:false FINAL VERDICT: PASS`. Confirmed the same dead-branch condition exists identically in the quality gate.
- **Confirmed CRITICAL #2 (git bypass) is real.** Ran `git checkout HEAD~3 -- concepts/design-cases.json`, `git clean -fdx concepts/`, `git stash push -- concepts/design-cases.json`, `git reset --hard HEAD~1`, and `git restore concepts/.design-attempt-counts.json` through the actual live guard — all five returned exit 0 (allowed). Confirmed zero git-related logic exists anywhere in `protect-json-stores.mjs`.
- **Confirmed finding #2 (lone dissent printed nowhere) is real** — `defectsSingleSample` is computed and stored in both verdict objects but has zero `console.error` call anywhere in the file, in either gate, on either verdict.
- **Confirmed finding #3 (screenshot freshness still pure scene-file mtime) is real** — `freshShotsFor` (unchanged since before this plan) compares screenshot mtime against `statSync(absFile).mtimeMs`, and scene `.html` files are not in either of the guard's two protected-path tiers.
- **Confirmed finding #5 (`settings.local.json` still has unscoped `Bash(cd *)`) is real** — read the file directly.
- **Confirmed finding #6's bypasses are MOSTLY real, but one specific sub-claim is stale.** Live-tested 10 attack shapes: quoted paths (both), globs (both), `rm -rf concepts` (bare root, no trailing slash), `truncate`, `ln -sf`, `dd of=`, heredoc-to-stdin (both interpreters) all returned exit 0 (bypass confirmed, 9 of 10). **`cp`/`mv` into a bare directory destination (`cp /tmp/fake.json concepts/.design-critic-verdicts`) already correctly blocks (exit 2)** — the round-1 word-boundary fix to `JSON_STORE_PATH_RE` already closed this specific sub-case. Noting this so the fix below doesn't waste effort re-solving an already-solved problem.
- **Confirmed finding #10's more serious half independently, beyond what the review doc states.** The review says the guard's "reads are unaffected" claim is inaccurate — that specific text is actually already correct (fixed in round 1). But probing the same underlying mechanism (bare co-occurrence, no distinction between real command words and quoted string arguments) found a live, more consequential bug the review doc didn't call out explicitly: `git commit -m "fix mv logic touching concepts/design-cases.json"` — an entirely ordinary, harmless commit — gets **blocked** (exit 2) by the current guard, because the word "mv" appears inside the quoted commit MESSAGE text alongside a mention of the protected path. This is a false positive on completely normal, required workflow (this project's own worker instructions mandate "commit before Stop"), not an adversarial scenario. Fixing the verb-detection to require the write-verb be the segment's actual first command word (not merely present anywhere in the text) closes both this false positive and, per the review, the analogous concern about over-blocking.
- **Confirmed the "new risk" (guard doesn't protect itself) is real** — `.claude/settings.json` and `.claude/hooks/**` are absent from both the `deny` list and the guard's own protected-path regexes.
- **Deliberately deviating from two of the review's literal recommendations, with reasoning:**
  1. *Screenshot-freshness fix.* The review's own recommended fix ("hash each screenshot at capture time, store the hash in the verdict") has the same flaw already identified and rejected for this exact problem in the prior round: the hash would be computed by an agent-controlled step, so an agent could compute the real hash without ever re-rendering, which is no stronger than mtime. The actual root cause is that scene `.html` files aren't covered by the guard's mtime-tamper protection (only `.audit-shots/` is) — extending that existing, already-correct mechanism to scene files closes the described attack at its root, consistent with how the equivalent screenshot-mtime problem was solved last round.
  2. *Guard self-protection.* The review's "New risk" section recommends deny-listing all of `.claude/**` for Write/Edit. That would also block the normal, visible, Ben-reviewed way this entire three-round hardening effort has been conducted — every fix in this plan and the prior two is a normal `Edit`-tool change, and the user's own message anticipates a further review round after this one. Deny-listing `.claude/**` would make that impossible without manual intervention for every future fix. The narrower, correct fix: extend the guard's own Bash-write-detection to cover `.claude/settings.json` and the hook files themselves (closing the *silent, Bash-based* disable path — `rm`ing the guard, or `sed -i`-stripping the `PreToolUse` entry) while leaving `Edit`/`Write` TOOL access to these files exactly as open as it is today, since that path is visible, reviewable, and how legitimate hardening work happens.
  3. *Guard invocation path.* Not changing `node .claude/hooks/protect-json-stores.mjs` to an absolute or `$CLAUDE_PROJECT_DIR`-anchored path — this project's other three hooks (`geometry-lint.mjs`, `design-done-gate.mjs` ×2) already use this exact relative-path convention and are established to work reliably; there's no confirmed evidence `$CLAUDE_PROJECT_DIR` is honored in this Claude Code version, and introducing an unverified anchoring mechanism carries its own risk. The fail-closed try/catch wrapper (still implemented below) addresses the more realistic failure mode (a bug inside the hook throwing) — a literally-deleted file is now also caught by the self-protection fix above, which is the more direct fix for that specific scenario.

## File Structure

- **Modify `.claude/hooks/design-done-gate.mjs`**:
  - `tallyDefects()` gains a `dissentMajors` return field and an array-guard on `s.defects`.
  - Both `majorOverride` computations (correctness + quality) gain a single-dissent-major condition.
  - Both gates print `defectsSingleSample` unconditionally (mirroring the existing `agreedMinor`/`minorFindings` "whatever the verdict" pattern).
- **Rewrite `.claude/hooks/protect-json-stores.mjs`**: full replacement — git-verb detection, first-word-anchored verb detection (fixes the git-commit-message false positive), quote-stripped path matching, glob detection, bare-`concepts`-root detection, heredoc-to-interpreter detection, scene-file mtime protection, self-protection paths, fail-closed try/catch wrapper.
- **Modify `.claude/settings.local.json`**: remove the stray unscoped `"Bash(cd *)"`.
- **Modify `concepts/tools/sweep-stale-design-entries.mjs`**: read and actually cross-check the audit log instead of ignoring it.
- **Modify `.gitignore`**: add `concepts/.design-gate-audit.log`.

---

## Task 1 (CRITICAL — top priority): Fix the major-defect override so it can actually fire

**Files:**
- Modify: `.claude/hooks/design-done-gate.mjs` (`tallyDefects()`, both `majorOverride` computations)

- [ ] **Step 1: Add `dissentMajors` to `tallyDefects()`'s return value**

Find the current function (search for `function tallyDefects(samples, tagSet) {`):

```js
function tallyDefects(samples, tagSet) {
  const tagCounts = {};   // tag -> total samples naming it
  const majorCounts = {}; // tag -> samples calling it major
  const offVocabulary = new Set();
  for (const s of samples) {
    const entries = (s.defects || [])
      .map(d => (typeof d === 'string'
        ? { tag: d, severity: 'major' }
        : { tag: d?.tag, severity: d?.severity === 'minor' ? 'minor' : 'major' }))
      .filter(d => d.tag);
    const majorHere = new Set(entries.filter(d => d.severity === 'major').map(d => d.tag));
    const tags = entries.map(d => d.tag);
    for (const t of new Set(tags)) {
      if (!tagSet.has(t)) { offVocabulary.add(t); continue; }
      tagCounts[t] = (tagCounts[t] || 0) + 1;
      if (majorHere.has(t)) majorCounts[t] = (majorCounts[t] || 0) + 1;
    }
  }
  const agreedAll = Object.keys(tagCounts).filter(t => t !== 'other' && tagCounts[t] >= 2).sort();
  const agreedDefects = agreedAll.filter(t => (majorCounts[t] || 0) >= 2);
  const agreedMinor = agreedAll.filter(t => (majorCounts[t] || 0) < 2);
  const defectsSingleSample = Object.keys(tagCounts).filter(t => t === 'other' || tagCounts[t] < 2).sort();
  return { agreedDefects, agreedMinor, defectsSingleSample, defectsOffVocabulary: [...offVocabulary].sort() };
}
```

Replace with (array-guards `s.defects` against non-array values per finding #8 — a critic emitting a bare string or object instead of an array must not throw and take down the whole file loop — and adds `dissentMajors`, the tags actually behind the fix):

```js
function tallyDefects(samples, tagSet) {
  const tagCounts = {};   // tag -> total samples naming it
  const majorCounts = {}; // tag -> samples calling it major
  const offVocabulary = new Set();
  const dissentMajorSet = new Set();
  for (const s of samples) {
    // Array-guard: a critic sample emitting a malformed `defects` value (a bare string, an object,
    // anything non-array) must not throw here — that would propagate out of the whole per-file loop
    // into the top-level crash handler, replacing every OTHER file's checks in this run with one
    // stack trace and losing whatever verdict write was in flight (fixes B8/finding #8). Fail toward
    // "no defects reported by this sample," not toward a crash.
    const rawDefects = Array.isArray(s.defects) ? s.defects : [];
    const entries = rawDefects
      .map(d => (typeof d === 'string'
        ? { tag: d, severity: 'major' }
        : { tag: d?.tag, severity: d?.severity === 'minor' ? 'minor' : 'major' }))
      .filter(d => d.tag);
    const majorHere = new Set(entries.filter(d => d.severity === 'major').map(d => d.tag));
    const tags = entries.map(d => d.tag);
    for (const t of new Set(tags)) {
      if (!tagSet.has(t)) { offVocabulary.add(t); continue; }
      tagCounts[t] = (tagCounts[t] || 0) + 1;
      if (majorHere.has(t)) majorCounts[t] = (majorCounts[t] || 0) + 1;
    }
    // A FAIL-voting sample naming a major, valid-vocabulary tag is real dissent signal, tracked
    // separately from the 2+-samples-agree tally above — see the majorOverride call sites for why
    // this exists and why the 2+-agreement version alone was structurally unable to fire.
    if (s.verdict === 'FAIL') {
      for (const t of majorHere) if (tagSet.has(t)) dissentMajorSet.add(t);
    }
  }
  const agreedAll = Object.keys(tagCounts).filter(t => t !== 'other' && tagCounts[t] >= 2).sort();
  const agreedDefects = agreedAll.filter(t => (majorCounts[t] || 0) >= 2);
  const agreedMinor = agreedAll.filter(t => (majorCounts[t] || 0) < 2);
  const defectsSingleSample = Object.keys(tagCounts).filter(t => t === 'other' || tagCounts[t] < 2).sort();
  return {
    agreedDefects, agreedMinor, defectsSingleSample,
    defectsOffVocabulary: [...offVocabulary].sort(),
    dissentMajors: [...dissentMajorSet].sort(),
  };
}
```

- [ ] **Step 2: Fix the correctness gate's override condition**

Find (search for `const majorOverride = votes.verdict === 'PASS' && agreedDefects.length > 0;` — there are two occurrences in the file; this step is for the FIRST one, inside the per-slug correctness loop, immediately preceded by `const { agreedDefects, agreedMinor, defectsSingleSample, defectsOffVocabulary } = tallyDefects(samples, CORRECTNESS_DEFECT_TAGS);`):

```js
      const { agreedDefects, agreedMinor, defectsSingleSample, defectsOffVocabulary } =
        tallyDefects(samples, CORRECTNESS_DEFECT_TAGS);
      // An agreed MAJOR defect outranks the tally — the same rule the quality gate already
      // enforces (see its own note above). Two independent samples both naming the same tag AND
      // both calling it major, while the vote still lands on PASS, is the panel contradicting
      // itself, and this gate is not allowed to round that in the permissive direction. This is
      // the exact hole that let `logs` PASS 2-1 tonight while sample 2's dissent named the precise
      // defect (no taper/no bark/hard cutoff at the flame boundary) that a `box-tell` +
      // `silhouette-mismatch` pair would have caught structurally instead of relying on the raw
      // vote.
      const majorOverride = votes.verdict === 'PASS' && agreedDefects.length > 0;
      if (majorOverride) {
        console.error(`design-done-gate: [${slug}] correctness vote was ${votes.pass}/${votes.total} ` +
          `PASS, but 2+ samples independently named the same MAJOR defect (${agreedDefects.join(', ')}). ` +
          `Recorded as FAIL — an agreed major defect outranks the tally.`);
      }
```

Replace with (destructures `dissentMajors` too, adds it to the override condition, and rewrites the comment to reflect what was actually found and fixed — this is the load-bearing fix for CRITICAL finding #1):

```js
      const { agreedDefects, agreedMinor, defectsSingleSample, defectsOffVocabulary, dissentMajors } =
        tallyDefects(samples, CORRECTNESS_DEFECT_TAGS);
      // TWO independent override conditions, not one — the 2+-samples-agree rule below was the
      // ENTIRE override at first, and confirmed-by-replay it was dead code for the exact scenario it
      // exists to catch: `trivia-os-design-critic.md` instructs "if it's major, vote FAIL," so in the
      // overwhelmingly common 2-1 PASS split, only the ONE dissenting (FAIL-voting) sample can ever
      // legitimately carry a major tag — the two PASS-voting samples never will, by that instruction's
      // own design. Requiring 2+ SAMPLES to independently agree on the same major tag therefore capped
      // the override at "all 3 flip to FAIL," which isn't an override at all, just unanimous FAIL.
      // Replaying the real `logs` incident (2 PASS with no majors, per instructions; 1 FAIL naming
      // `box-tell`+`silhouette-mismatch` as major) through the ORIGINAL condition confirmed this:
      // majorOverride was false, final verdict stayed PASS. A single confident, named, MAJOR-severity
      // dissent is real signal this gate is not allowed to silently outvote — the critic's own
      // instructions already say "major means this alone should sink the element" and warn against
      // marking something major casually, which is exactly why one such claim, even from a single
      // sample, is trustworthy enough to act on without requiring a second sample that structurally
      // cannot exist in the 2-1 case. The 2+-agreement condition is kept as a second OR-branch (not
      // removed) purely as defensive belt-and-suspenders for an unexpected 3-0-flip or imperfect
      // instruction-following case; it is not expected to be what actually fires in practice.
      const majorOverride = votes.verdict === 'PASS' && (agreedDefects.length > 0 || dissentMajors.length > 0);
      if (majorOverride) {
        console.error(`design-done-gate: [${slug}] correctness vote was ${votes.pass}/${votes.total} ` +
          `PASS, but ${agreedDefects.length > 0
            ? `2+ samples independently named the same MAJOR defect (${agreedDefects.join(', ')})`
            : `a dissenting (FAIL-voting) sample named a MAJOR defect (${dissentMajors.join(', ')})`}. ` +
          `Recorded as FAIL — a real major-severity dissent outranks the tally.`);
      }
```

- [ ] **Step 3: Apply the identical fix to the quality gate**

Find the second occurrence (search for `const { agreedDefects, agreedMinor, defectsSingleSample, defectsOffVocabulary } = tallyDefects(seeing, QUALITY_DEFECT_TAGS);` — inside the quality-gate branch):

```js
              const { agreedDefects, agreedMinor, defectsSingleSample, defectsOffVocabulary } =
                tallyDefects(seeing, QUALITY_DEFECT_TAGS);
              // An agreed MAJOR defect outranks the vote. Two independent
              // samples both naming the same tag AND both calling it major,
              // while the tally still lands on PASS, is the panel contradicting
              // itself — and this gate is not allowed to round that in the
              // permissive direction. (The reverse never happens: minor
              // findings cannot manufacture a FAIL.)
              const majorOverride = votes.verdict === 'PASS' && agreedDefects.length > 0;
              if (majorOverride) {
                console.error(`design-done-gate: [${file}] QUALITY vote was ` +
                  `${votes.pass}/${votes.total} PASS, but 2+ samples independently named the same MAJOR defect ` +
                  `(${agreedDefects.join(', ')}). Recorded as FAIL — an agreed major defect outranks the tally.`);
              }
```

Replace with (identical reasoning and structure — `trivia-os-design-quality-critic.md` has the same "if it is major, vote FAIL" instruction, so this gate has the identical dead branch):

```js
              const { agreedDefects, agreedMinor, defectsSingleSample, defectsOffVocabulary, dissentMajors } =
                tallyDefects(seeing, QUALITY_DEFECT_TAGS);
              // Same fix as the correctness gate, same underlying cause: `trivia-os-design-quality-
              // critic.md` also instructs "if it is major, vote FAIL," so this gate's 2+-samples-agree
              // condition was equally structurally unreachable for a 2-1 PASS split with one confident
              // dissenter. See the correctness gate's version of this comment for the full replay/proof.
              const majorOverride = votes.verdict === 'PASS' && (agreedDefects.length > 0 || dissentMajors.length > 0);
              if (majorOverride) {
                console.error(`design-done-gate: [${file}] QUALITY vote was ` +
                  `${votes.pass}/${votes.total} PASS, but ${agreedDefects.length > 0
                    ? `2+ samples independently named the same MAJOR defect (${agreedDefects.join(', ')})`
                    : `a dissenting (FAIL-voting) sample named a MAJOR defect (${dissentMajors.join(', ')})`}. ` +
                  `Recorded as FAIL — a real major-severity dissent outranks the tally.`);
              }
```

- [ ] **Step 4: Syntax-check**

```bash
node --check .claude/hooks/design-done-gate.mjs && echo "syntax OK"
```

- [ ] **Step 5: Verify — replay the real `logs` incident through the FIXED code and confirm it now correctly fails**

```bash
node -e "
function tallyVotes(samples){const p=samples.filter(s=>s.verdict==='PASS').length;const f=samples.length-p;return{pass:p,fail:f,total:samples.length,verdict:p>f?'PASS':'FAIL'};}
function tallyDefects(samples, tagSet) {
  const tagCounts = {}, majorCounts = {}, offVocabulary = new Set(), dissentMajorSet = new Set();
  for (const s of samples) {
    const rawDefects = Array.isArray(s.defects) ? s.defects : [];
    const entries = rawDefects.map(d => typeof d === 'string' ? {tag:d,severity:'major'} : {tag:d?.tag,severity:d?.severity==='minor'?'minor':'major'}).filter(d=>d.tag);
    const majorHere = new Set(entries.filter(d=>d.severity==='major').map(d=>d.tag));
    const tags = entries.map(d=>d.tag);
    for (const t of new Set(tags)) { if (!tagSet.has(t)) { offVocabulary.add(t); continue; } tagCounts[t]=(tagCounts[t]||0)+1; if (majorHere.has(t)) majorCounts[t]=(majorCounts[t]||0)+1; }
    if (s.verdict === 'FAIL') for (const t of majorHere) if (tagSet.has(t)) dissentMajorSet.add(t);
  }
  const agreedAll = Object.keys(tagCounts).filter(t=>t!=='other'&&tagCounts[t]>=2).sort();
  return { agreedDefects: agreedAll.filter(t=>(majorCounts[t]||0)>=2), dissentMajors: [...dissentMajorSet].sort() };
}
const tagSet = new Set(['silhouette-mismatch','box-tell','register-mismatch','other']);
// Realistic, instruction-compliant replay of the logs incident: PASS samples never carry major tags.
const samples = [
  { verdict: 'PASS', defects: [] },
  { verdict: 'FAIL', defects: [{tag:'box-tell', severity:'major'}, {tag:'silhouette-mismatch', severity:'major'}] },
  { verdict: 'PASS', defects: [] },
];
const votes = tallyVotes(samples);
const { agreedDefects, dissentMajors } = tallyDefects(samples, tagSet);
const majorOverride = votes.verdict === 'PASS' && (agreedDefects.length > 0 || dissentMajors.length > 0);
console.log('votes:', votes, 'agreedDefects:', agreedDefects, 'dissentMajors:', dissentMajors, 'majorOverride:', majorOverride, 'FINAL VERDICT:', majorOverride ? 'FAIL' : votes.verdict);
"
```

Expected: `votes: { pass: 2, fail: 1, total: 3, verdict: 'PASS' } agreedDefects: [] dissentMajors: [ 'box-tell', 'silhouette-mismatch' ] majorOverride: true FINAL VERDICT: FAIL` — this is the load-bearing check for this whole task: the exact incident that motivated fix #1 in the first place must now come out FAIL, not PASS.

Also verify the fix does NOT over-trigger — a genuinely clean 3-0 PASS with no dissent at all must stay PASS:

```bash
node -e "
function tallyVotes(samples){const p=samples.filter(s=>s.verdict==='PASS').length;const f=samples.length-p;return{pass:p,fail:f,total:samples.length,verdict:p>f?'PASS':'FAIL'};}
function tallyDefects(samples, tagSet) {
  const tagCounts = {}, majorCounts = {}, offVocabulary = new Set(), dissentMajorSet = new Set();
  for (const s of samples) {
    const rawDefects = Array.isArray(s.defects) ? s.defects : [];
    const entries = rawDefects.map(d => typeof d === 'string' ? {tag:d,severity:'major'} : {tag:d?.tag,severity:d?.severity==='minor'?'minor':'major'}).filter(d=>d.tag);
    const majorHere = new Set(entries.filter(d=>d.severity==='major').map(d=>d.tag));
    const tags = entries.map(d=>d.tag);
    for (const t of new Set(tags)) { if (!tagSet.has(t)) { offVocabulary.add(t); continue; } tagCounts[t]=(tagCounts[t]||0)+1; if (majorHere.has(t)) majorCounts[t]=(majorCounts[t]||0)+1; }
    if (s.verdict === 'FAIL') for (const t of majorHere) if (tagSet.has(t)) dissentMajorSet.add(t);
  }
  const agreedAll = Object.keys(tagCounts).filter(t=>t!=='other'&&tagCounts[t]>=2).sort();
  return { agreedDefects: agreedAll.filter(t=>(majorCounts[t]||0)>=2), dissentMajors: [...dissentMajorSet].sort() };
}
const tagSet = new Set(['silhouette-mismatch','box-tell','register-mismatch','other']);
const samples = [ { verdict: 'PASS', defects: [] }, { verdict: 'PASS', defects: [{tag:'box-tell',severity:'minor'}] }, { verdict: 'PASS', defects: [] } ];
const votes = tallyVotes(samples);
const { agreedDefects, dissentMajors } = tallyDefects(samples, tagSet);
const majorOverride = votes.verdict === 'PASS' && (agreedDefects.length > 0 || dissentMajors.length > 0);
console.log('clean 3-0 PASS with only a minor note: majorOverride:', majorOverride, '(expected false)');
"
```

Expected: `majorOverride: false (expected false)` — a genuinely clean PASS with no FAIL-voting dissenter and no major tags must not be disturbed by this fix.

- [ ] **Step 6: Commit**

```bash
git add .claude/hooks/design-done-gate.mjs
git commit -m "fix(design-gate): make the major-defect override actually reachable — single-dissent-major rule (fixes CRITICAL finding #1, both gates)"
```

---

## Task 2 (CRITICAL — second priority): Block destructive git verbs touching the protected stores

**Files:**
- Modify: `.claude/hooks/protect-json-stores.mjs` (this task lands its own narrow addition first; Task 5 below does the full rewrite this function ends up inside — implementing this as its own commit first, before Task 5's larger rewrite, keeps the two highest-priority fixes independently landable and reviewable, per the explicit priority instruction to land and verify the two criticals before the rest)

- [ ] **Step 1: Add git-verb detection**

Find the constants block (search for `const JSON_STORE_PATH_RE =`):

```js
const JSON_STORE_PATH_RE = /concepts\/\.design-attempt-counts\.json|concepts\/design-cases\.json|concepts\/\.design-critic-verdicts\b|concepts\/\.design-gate-audit\.log/;
const SHOTS_DIR_RE = /concepts\/\.audit-shots\//;
```

Add directly after it:

```js
// Destructive git verbs — CRITICAL finding #2 (round 2 review): git checkout/restore/stash/rm/clean
// touching a protected path, or git reset --hard at all, silently reverts or wipes the protected
// stores with zero relationship to protect-json-stores.mjs's write-verb detection above (none of
// those regexes look at git subcommands at all). Confirmed live: `git checkout HEAD~3 --
// concepts/design-cases.json`, `git clean -fdx concepts/`, `git stash push -- concepts/design-
// cases.json`, `git reset --hard HEAD~1`, and `git restore concepts/.design-attempt-counts.json` all
// returned exit 0 (allowed) before this fix. This was the single largest hole in the whole guard —
// bigger than anything the write-verb detection covered, since design-cases.json and
// .design-attempt-counts.json are both git-tracked and Bash(git *) is unrestricted.
const GIT_DESTRUCTIVE_RE = /^\s*git\s+(checkout|restore|stash|rm|clean|reset)\b/;
function segmentIsDestructiveGit(seg) {
  const m = GIT_DESTRUCTIVE_RE.exec(seg);
  if (!m) return false;
  const subcommand = m[1];
  const dequoted = seg.replace(/['"]/g, '');
  // `git clean` wipes untracked files by DIRECTORY scope, not by naming a specific file — it can
  // never be scoped to "does this segment mention the exact protected filename" the way rm/mv can,
  // because it doesn't need to. .design-critic-verdicts/ and .design-gate-audit.log are BOTH
  // untracked (design-cases.json and .design-attempt-counts.json are git-tracked, so `clean` doesn't
  // touch those two, but does touch the other two) — block any `git clean` outright rather than try
  // to prove a particular invocation is safe.
  if (subcommand === 'clean') return true;
  // `git reset --hard` discards ALL uncommitted changes repo-wide and never names a path at all —
  // there is nothing to co-occurrence-check against. This project's own global instructions already
  // say never run this without explicit request; enforcing that mechanically here is consistent, not
  // an extra restriction invented for this file.
  if (subcommand === 'reset') return /--hard\b/.test(seg);
  // checkout/restore/stash/rm: dangerous specifically when they name a protected path, or when they
  // target the whole tree (a bare "." or "-- ." with nothing more specific narrows "everything",
  // which trivially includes the protected paths).
  if (JSON_STORE_PATH_RE.test(dequoted)) return true;
  if (/(?:^|\s)(?:--\s+)?\.\s*$/.test(seg.trimEnd())) return true;
  return false;
}
```

- [ ] **Step 2: Wire the check into the main loop**

Find the main per-segment loop (search for `for (const seg of splitSegments(command)) {`):

```js
for (const seg of splitSegments(command)) {
  if (segmentTampersWithJsonStore(seg)) {
    console.error(`protect-json-stores: BLOCKED — this Bash segment writes (or could write) to a ` +
      ...
    process.exit(2);
  }
  if (segmentForgesShotMtime(seg)) {
    console.error(`protect-json-stores: BLOCKED — this Bash segment forges a screenshot's mtime instead ` +
      ...
    process.exit(2);
  }
}
process.exit(0);
```

Add a new check inside the loop, before or after the existing two (order doesn't matter — each is an independent, unconditional check):

```js
  if (segmentIsDestructiveGit(seg)) {
    console.error(`protect-json-stores: BLOCKED — this Bash segment is a destructive git operation ` +
      `touching a gate-protected path (or the whole tree): "${seg.trim()}". git checkout/restore/stash/rm ` +
      `naming one of the protected stores, any git clean (wipes untracked files by directory scope, ` +
      `including .design-critic-verdicts/ and .design-gate-audit.log), and git reset --hard (discards ` +
      `everything uncommitted repo-wide) are all blocked here. Reverting these files through git history ` +
      `is not a Bash-guard bypass — if you genuinely need to roll one back, stop and ask Ben.`);
    process.exit(2);
  }
```

- [ ] **Step 3: Syntax-check**

```bash
node --check .claude/hooks/protect-json-stores.mjs && echo "syntax OK"
```

- [ ] **Step 4: Verify — the exact 5 attacks from the review must now block, ordinary git usage must still pass**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
test_block() {
  local desc="$1" cmd="$2"
  echo "$cmd" | node -e "
    const cmd = require('fs').readFileSync(0,'utf8').trim();
    process.stdout.write(JSON.stringify({tool_name:'Bash', tool_input:{command: cmd}}));
  " | node .claude/hooks/protect-json-stores.mjs >/dev/null 2>&1
  echo "[$desc] exit=$? (expect 2)"
}
test_allow() {
  local desc="$1" cmd="$2"
  echo "$cmd" | node -e "
    const cmd = require('fs').readFileSync(0,'utf8').trim();
    process.stdout.write(JSON.stringify({tool_name:'Bash', tool_input:{command: cmd}}));
  " | node .claude/hooks/protect-json-stores.mjs >/dev/null 2>&1
  echo "[$desc] exit=$? (expect 0)"
}
test_block "git checkout HEAD~3 -- design-cases.json"  'git checkout HEAD~3 -- concepts/design-cases.json'
test_block "git clean -fdx concepts/"                  'git clean -fdx concepts/'
test_block "git stash push -- design-cases.json"       'git stash push -- concepts/design-cases.json'
test_block "git reset --hard HEAD~1"                   'git reset --hard HEAD~1'
test_block "git restore attempt-counts.json"           'git restore concepts/.design-attempt-counts.json'
test_block "git rm design-cases.json"                  'git rm concepts/design-cases.json'
test_block "git checkout . (whole tree)"                'git checkout .'
test_allow "git status"                                'git status'
test_allow "git add + commit unrelated file"            'git add concepts/campfire-sing-along-spec.md && git commit -m wip'
test_allow "git checkout main (branch, not a path)"     'git checkout main'
test_allow "git checkout -b new-branch"                 'git checkout -b new-branch'
test_allow "git stash pop (no path)"                    'git stash pop'
test_allow "git reset HEAD~1 (soft, no --hard)"         'git reset HEAD~1'
test_allow "git rm unrelated file"                      'git rm some-other-file.txt'
test_allow "git log / git diff / git show"              'git log --oneline -5'
```

Every `test_block` line must print `exit=2`; every `test_allow` line must print `exit=0`. Report the complete output.

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/protect-json-stores.mjs
git commit -m "feat(design-gate): block destructive git verbs (checkout/restore/stash/rm/clean/reset --hard) touching the protected stores (fixes CRITICAL finding #2)"
```

**Tasks 1 and 2 are the two explicitly-prioritized critical fixes. Both must be independently verified working (Steps 5 and 4 above, all expected outputs matching) before continuing to Task 3.**

---

## Task 3: Print lone dissent unconditionally in both gates (fixes finding #2)

**Files:**
- Modify: `.claude/hooks/design-done-gate.mjs`

- [ ] **Step 1: Print `defectsSingleSample` in the correctness path**

Find the correctness gate's existing minor-findings print (search for `if (agreedMinor.length) {` inside the correctness per-slug loop — it's right after the `defectsOffVocabulary` print block and right before `writeFileSync(verdictPath, ...)`):

```js
      if (agreedMinor.length) {
        console.error(`design-done-gate: [${slug}] correctness verdict ${parsed.verdict} with agreed ` +
          `MINOR findings (2+ samples, none blocking): ${agreedMinor.join(', ')}. Logged to ` +
          `design-cases.json.`);
      }
```

Add a new block directly after it (this is the fix for finding #2 — a single-sample dissent on an otherwise-PASSing element was previously recorded in the verdict JSON and case log but never printed anywhere, meaning fix A3's "relay non-blocking findings on a PASS" worker instruction had nothing real to relay for exactly the case that motivated it):

```js
      if (defectsSingleSample.length) {
        console.error(`design-done-gate: [${slug}] correctness verdict ${parsed.verdict} with a ` +
          `SINGLE-SAMPLE finding (only one of three samples named it — treat as a lead, not a confirmed ` +
          `finding): ${defectsSingleSample.join(', ')}. This is the exact shape a lone dissenting sample ` +
          `takes when the vote outvotes it without an agreed-major override firing — logged to ` +
          `design-cases.json; worth reading the full reason text before treating this element as settled.`);
      }
```

- [ ] **Step 2: Print `defectsSingleSample` in the quality path**

Find the quality gate's existing minor-findings print (search for `if (qVerdict?.minorFindings?.length) {`):

```js
          if (qVerdict?.minorFindings?.length) {
            console.error(`design-done-gate: [${file}] QUALITY verdict ${qVerdict.verdict} with agreed MINOR ` +
              `findings (2+ samples, none blocking): ${qVerdict.minorFindings.join(', ')}. Logged to ` +
              `design-cases.json. Worth fixing if it is cheap; worth watching if the same tag keeps recurring ` +
              `across scenes, which is the pattern this field exists to make countable.`);
          }
```

Add a new block directly after it:

```js
          if (qVerdict?.defectsSingleSample?.length) {
            console.error(`design-done-gate: [${file}] QUALITY verdict ${qVerdict.verdict} with a ` +
              `SINGLE-SAMPLE finding (only one of three samples named it): ${qVerdict.defectsSingleSample.join(', ')}. ` +
              `Previously this was only surfaced inline as part of a FAIL message — meaning a single dissent on ` +
              `an otherwise-PASSing scene was recorded but never printed anywhere. Logged to design-cases.json ` +
              `regardless of verdict now.`);
          }
```

Note: unlike the correctness fix in Step 1 (which fires for ANY `defectsSingleSample`, since that print didn't exist there at all before), this quality-side print is specifically for the PASS case that previously had nothing — the existing FAIL-path message (further down, inside the `problems.push` for a QUALITY FAIL) already includes `defectsSingleSample` inline via `qVerdict.defectsSingleSample?.length ? ...`. Having it print twice on a FAIL (once here, once in the FAIL message) is redundant but harmless — do not attempt to suppress it conditionally on verdict, since that reintroduces exactly the kind of "only checked one branch" bug this whole fix is closing.

- [ ] **Step 3: Syntax-check**

```bash
node --check .claude/hooks/design-done-gate.mjs && echo "syntax OK"
```

- [ ] **Step 4: Verify — hand-trace confirms the print fires for a PASS-with-lone-dissent case**

```bash
node -e "
// Simulates the correctness gate's print condition directly against realistic tallyDefects output
// for a PASS verdict where one sample dissented with a MINOR tag (not major — a major dissent would
// now trigger Task 1's override instead, which is a different, already-tested path).
const defectsSingleSample = ['box-tell']; // one sample named it, severity minor, didn't reach 2-sample agreement
const parsedVerdict = 'PASS';
if (defectsSingleSample.length) {
  console.log('WOULD PRINT:', \`design-done-gate: [slug] correctness verdict \${parsedVerdict} with a SINGLE-SAMPLE finding: \${defectsSingleSample.join(', ')}\`);
} else {
  console.log('WOULD NOT PRINT (this would be the bug — confirming it is NOT what happens)');
}
"
```

Expected: the "WOULD PRINT" line, confirming the logic path fires for a lone dissent.

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/design-done-gate.mjs
git commit -m "fix(design-gate): print lone dissent unconditionally in both gates, not just inside a FAIL message (fixes finding #2)"
```

---

## Task 4: Extend Bash-guard mtime-tamper protection to scene files (fixes finding #3)

**Files:**
- Modify: `.claude/hooks/protect-json-stores.mjs`

- [ ] **Step 1: Add scene-file protection to the existing mtime-tamper function**

Find (search for `const SHOTS_DIR_RE = /concepts\/\.audit-shots\//;`):

```js
const SHOTS_DIR_RE = /concepts\/\.audit-shots\//;
```

Replace with (adds a second protected pattern for scene `.html` files directly under `concepts/`):

```js
const SHOTS_DIR_RE = /concepts\/\.audit-shots\//;
// Finding #3 (round 2 review): the verdict now carries a content hash (see design-done-gate.mjs's
// sceneHash()), which correctly detects when a scene's CONTENT changed — but freshShotsFor() still
// compares screenshot mtime against the scene FILE's mtime, and until now nothing stopped that mtime
// from being forged the same way screenshot mtimes were before the prior round's fix. Confirmed live:
// `node -e "require('fs').utimesSync('concepts/scene.html',0,0)"` and `touch -d` both passed the guard.
// Attack: edit the scene for real (hash correctly goes stale, forcing a critic re-spawn), backdate its
// mtime, and every PRE-EDIT screenshot reads as fresh again — so the critic panel judges old pixels
// while the resulting verdict gets stamped with the NEW content's hash, looking bound to evidence it
// was never shown. Rather than build a second, agent-controlled hash-sidecar scheme for screenshots
// (which has the same forgeability problem the verdict hash avoided only because the GATE computes
// it, not an agent-invoked step), this closes the actual attack at its root: an agent simply cannot
// forge a scene file's mtime anymore, so editing it for real is the only way its mtime changes.
const SCENE_FILE_RE = /concepts\/[\w.-]+\.html\b/;
const EVIDENCE_MTIME_PATH_RE = new RegExp(`${SHOTS_DIR_RE.source}|${SCENE_FILE_RE.source}`);
```

- [ ] **Step 2: Update the mtime-tamper detection function to use the combined pattern**

Find (search for `function segmentForgesShotMtime(seg) {`):

```js
// Narrower mtime-forgery-only protection for the screenshots directory.
function segmentForgesShotMtime(seg) {
  if (/\btouch\b/.test(seg) && SHOTS_DIR_RE.test(seg)) return true;
  if (INTERPRETER_RE.test(seg) && EVAL_FLAG_RE.test(seg) && MTIME_TAMPER_HINT_RE.test(seg) && SHOTS_DIR_RE.test(seg)) return true;
  return false;
}
```

Replace with:

```js
// Narrower mtime-forgery-only protection — screenshots AND scene .html files. Neither of these is
// gate-owned (the worker legitimately writes/renames/copies screenshots, and legitimately edits scene
// files — that's the entire point of this repo's concepts/ build lab), so only mtime-forgery verbs are
// blocked here, not ordinary writes/renames/deletes.
function segmentForgesShotMtime(seg) {
  if (/\btouch\b/.test(seg) && EVIDENCE_MTIME_PATH_RE.test(seg)) return true;
  if (INTERPRETER_RE.test(seg) && EVAL_FLAG_RE.test(seg) && MTIME_TAMPER_HINT_RE.test(seg) && EVIDENCE_MTIME_PATH_RE.test(seg)) return true;
  return false;
}
```

- [ ] **Step 3: Syntax-check**

```bash
node --check .claude/hooks/protect-json-stores.mjs && echo "syntax OK"
```

- [ ] **Step 4: Verify**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
test_block() {
  local desc="$1" cmd="$2"
  echo "$cmd" | node -e "
    const cmd = require('fs').readFileSync(0,'utf8').trim();
    process.stdout.write(JSON.stringify({tool_name:'Bash', tool_input:{command: cmd}}));
  " | node .claude/hooks/protect-json-stores.mjs >/dev/null 2>&1
  echo "[$desc] exit=$? (expect 2)"
}
test_allow() {
  local desc="$1" cmd="$2"
  echo "$cmd" | node -e "
    const cmd = require('fs').readFileSync(0,'utf8').trim();
    process.stdout.write(JSON.stringify({tool_name:'Bash', tool_input:{command: cmd}}));
  " | node .claude/hooks/protect-json-stores.mjs >/dev/null 2>&1
  echo "[$desc] exit=$? (expect 0)"
}
test_block "touch -d on scene file"      'touch -d "2020-01-01" concepts/campfire-sing-along-v1.html'
test_block "utimesSync on scene file"    "node -e \"require('fs').utimesSync('concepts/scene.html', new Date(), new Date('2020-01-01'))\""
test_block "touch -d on shot (still works)" 'touch -d "2099-01-01" concepts/.audit-shots/foo.png'
test_allow "normal edit via sed to scene (not mtime forgery)" "sed -i 's/foo/bar/' concepts/scene.html"
test_allow "rm a scene file (legitimate cleanup)" 'rm concepts/old-scene.html'
test_allow "mv/rename a scene file"       'mv concepts/draft.html concepts/final.html'
```

Every `test_block` must print `exit=2`; every `test_allow` must print `exit=0` — confirming ordinary scene-file editing/cleanup remains completely unaffected and only mtime forgery is blocked.

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/protect-json-stores.mjs
git commit -m "feat(design-gate): extend mtime-tamper protection to scene .html files, closing the screenshot-freshness gap at its root (fixes finding #3)"
```

---

## Task 5: Fix the guard's pattern-matching bypasses (fixes finding #6, the git-commit-message false positive found during this review, and part of finding #10)

This is the largest remaining task — enough interconnected changes (quote-stripped path matching, first-word-anchored verb detection, glob detection, bare-directory detection, heredoc-to-interpreter detection, self-protection, fail-closed wrapping) that this step gives the **complete replacement file** rather than a chain of surgical diffs layered on top of Tasks 2 and 4's edits.

**Files:**
- Replace: `.claude/hooks/protect-json-stores.mjs` (full file — supersedes the incremental edits from Tasks 2 and 4, folding their logic in)

- [ ] **Step 1: Replace the entire file with this content**

```js
#!/usr/bin/env node
// .claude/hooks/protect-json-stores.mjs
//
// PreToolUse guard on Bash. Fixes B1 (and the screenshot half of B2) from
// concepts/design-pipeline-hardening-fix.md, plus the round-2 review findings in
// concepts/design-pipeline-hardening-review-round2.md: the Write/Edit deny list on the gate's
// protected stores only blocks the Write/Edit TOOLS — Bash was always wide open. This hook inspects
// the Bash command string itself, independent of what settings.json's allow list already granted, and
// blocks (exit 2) any write-shaped access to the paths below — regardless of how permissive the allow
// list is or ever becomes.
//
// THREE PROTECTION TIERS, because the path classes need genuinely different treatment:
//
//   JSON_STORE_PATHS — concepts/.design-attempt-counts.json, concepts/design-cases.json,
//   concepts/.design-critic-verdicts/, concepts/.design-gate-audit.log, PLUS (round 2) this hook file
//   and .claude/settings.json themselves. These are GATE-OWNED (or, for the last two, GUARD-OWNED):
//   only design-done-gate.mjs's own writeFileSync/appendFileSync calls may touch the first four; the
//   last two should only ever change via the Edit/Write TOOLS (the normal, visible, Ben-reviewed way
//   every round of this hardening work has actually happened), never via a Bash command silently
//   deleting or rewriting them. Every write verb is blocked here.
//
//   EVIDENCE_MTIME_PATHS — concepts/.audit-shots/ and concepts/*.html scene files. Neither is
//   gate-owned — the worker legitimately writes/renames/copies screenshots and legitimately edits
//   scene files constantly, so blocking every write verb here would break the intended workflow. What
//   must be blocked is narrower: forging an EXISTING file's mtime without a real edit/re-render —
//   touch/touch -d, or an eval-flag/heredoc interpreter call whose script mentions utimes/utimesSync.
//
//   DESTRUCTIVE_GIT — git checkout/restore/stash/rm naming a protected path, any git clean (wipes
//   untracked files by directory scope — .design-critic-verdicts/ and .design-gate-audit.log are both
//   untracked), and git reset --hard (discards everything uncommitted repo-wide, never names a path at
//   all). None of the write-verb detection above even looks at git subcommands — this was the single
//   largest hole the round-2 review found, confirmed live before this file was rewritten to close it.
//
// SEGMENT-PARSING splits on &&, ||, ;, |, and newlines, quote/backtick/$(...)-aware (see
// splitSegments) and now also HEREDOC-aware (round 2): a `python3 <<EOF ... EOF` script has no -c/-e
// flag at all, so the prior eval-flag detector never even looked at it, and an unguarded internal
// newline inside the heredoc BODY would otherwise fragment the interpreter word away from whatever the
// script actually does — the same shape of bug the quote/substitution tracking already fixed for
// quotes and $(...), just via a different shell construct.
//
// VERB DETECTION is anchored to each segment's FIRST command word (rm/mv/touch/tee/truncate/ln/dd/
// cp/install), not "does the verb appear anywhere in the segment text" (round 2 finding, found during
// this review, not in the original doc): the prior version blocked a completely ordinary
// `git commit -m "fix mv logic touching concepts/design-cases.json"` because the word "mv" appeared
// inside the quoted COMMIT MESSAGE alongside a mention of the path — a live false positive on required,
// ordinary workflow (this project's own worker instructions mandate committing before Stop), not an
// adversarial case. Segments are already split at every real (unquoted) pipe by splitSegments(), so
// the actual command a segment invokes is always its first word (sed -i is checked separately since
// its flag can trail the command name by an argument or two; redirection is a positional OPERATOR, not
// a command word, so it stays checked anywhere in the segment).
//
// PATH DETECTION runs against a QUOTE-STRIPPED copy of each segment (round 2 finding): a real bash
// command that quotes part of a path — `rm concepts/'design-cases.json'` — still resolves to the exact
// same literal path once the shell removes the quotes, but the OLD literal-substring match against the
// raw text missed it because of the embedded quote characters. Globs (`concepts/*.json`,
// `concepts/design-case?.json`) are checked separately against the RAW (not quote-stripped) segment,
// since a QUOTED glob character doesn't actually expand in real bash — quoting `'*.json'` makes rm look
// for a literal file named `*.json`, which is harmless, so quote-stripping before glob-detection would
// itself be a false-positive source.
//
// Exit 0 = allow. Exit 2 = block. (Exit-code semantics confirmed in
// concepts/design-worker-p0-p2-plan.md's research note #2: exit 1 is non-blocking, exit 2 blocks.)
// The ENTIRE body below is wrapped in a top-level try/catch that exits 2 on any uncaught error (round
// 2 finding: an unhandled exception previously fell through to Node's default uncaught-exception exit
// code, typically 1, which Claude Code treats as non-blocking — i.e. an internal bug in this file
// would have silently ALLOWED the very command it was trying to inspect). This does not, and cannot,
// cover the file being deleted outright before Node ever starts — that failure mode is why this
// hook file is now itself one of the protected JSON_STORE_PATHS above, closing the realistic version
// of that risk (a Bash rm/sed-i against this file) while leaving the normal Edit/Write-tool development
// path on this file completely open, since deny-listing .claude/** entirely would also block the
// normal, visible way every round of this hardening work has actually been done.
//
// KNOWN LIMITATIONS — this is a regex over command text, not a shell parser, and these gaps are
// accepted rather than fixed, for the reasons stated:
//
//   - Interpreter string-concatenation (e.g. building the target path as joined string fragments
//     passed to node -e / python3 -c instead of a literal) can evade the literal-substring path match.
//   - Bare shell-variable indirection, e.g. `f=concepts/design-cases.json; rm $f` — closing this
//     requires actual shell parsing / variable-expansion simulation, not regex matching.
//   - No cwd-awareness: bare or relative filenames that omit the literal `concepts/` prefix are
//     invisible to this hook (e.g. `rm design-cases.json` run from inside `concepts/`). Closing this
//     without new false positives would need real cwd-tracking.
//   - `cp`/`install` flags that take a SEPARATE value token (e.g. `cp -t DIR src`, `install -m 644 src
//     dest`) can misalign which token is checked as the destination. Rare in practice.
//   - splitSegments()'s $(...) nesting tracker is a plain depth counter: a literal unescaped `(`/`)`
//     inside a QUOTED string nested within a substitution can miscount depth.
//   - A cp/install/redirection DESTINATION deliberately wrapped in `$(...)` or backticks is invisible
//     to the destination capture regardless of an embedded separator — the capture's character class
//     stops at `$`/`(`/`)`. The whole-segment verbs (rm/mv/touch/sed-i/tee) don't share this gap.
//   - `sudo`/`env FOO=bar`-prefixed commands: the first-word verb anchor looks at the segment's actual
//     first word, so a verb invoked through a prefix command isn't recognized as the effective verb.
//     Neither `sudo` nor `env` is in this project's Bash allow-list as of this writing, so either would
//     need its own explicit permission grant first regardless.
//   - `git` operations other than the six destructive subcommands listed above (e.g. a malicious
//     rebase, or `git apply`/`git am` applying a patch that rewrites a protected file) are not
//     inspected — this hook targets the specific attacks confirmed live during the round-2 review, not
//     an exhaustive model of every way git can mutate a working tree.

import { readFileSync } from 'node:fs';

try {

function readStdinJson() {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return null; }
}

// Quote/backtick/$(...)/heredoc-aware segment split — NOT a regex split, on purpose. A naive split on
// ;/|/&&/||/newline tears apart any command whose OWN quoted argument, substitution, or heredoc body
// happens to contain one of those characters. This scanner tracks bash quoting/substitution/heredoc
// state and only treats ;/|/&&/||/newline as a real separator when outside all of them. This is a real
// tracker, not a full shell parser — documented gaps above.
function splitSegments(command) {
  const segments = [];
  let current = '';
  let inSingle = false, inDouble = false, inBacktick = false, substDepth = 0;
  let heredocDelim = null, heredocStrip = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (heredocDelim !== null) {
      // Inside a heredoc body: copy verbatim, watching only for the line that closes it. Bash applies
      // no separator/quote/substitution rules inside a heredoc body either (until final expansion,
      // which this hook does not attempt) — the whole point is the interpreter reading it as one
      // script, so the SAME segment must include it whole for the interpreter+path co-occurrence
      // check further down to see both the interpreter word and whatever the script mentions.
      let eol = command.indexOf('\n', i);
      if (eol === -1) eol = command.length;
      const line = command.slice(i, eol);
      const checkLine = heredocStrip ? line.replace(/^\t+/, '') : line;
      current += line;
      if (checkLine === heredocDelim) heredocDelim = null;
      if (eol < command.length) { current += '\n'; i = eol; } else { i = eol - 1; }
      continue;
    }
    if (inSingle) {
      current += ch;
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      current += ch;
      if (ch === '\\' && i + 1 < command.length) { current += command[++i]; continue; }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inBacktick) {
      current += ch;
      if (ch === '\\' && i + 1 < command.length) { current += command[++i]; continue; }
      if (ch === '`') inBacktick = false;
      continue;
    }
    if (substDepth > 0) {
      current += ch;
      if (ch === '(') substDepth++;
      else if (ch === ')') substDepth--;
      continue;
    }
    // Heredoc start: `<<[-]?WORD` / `<<[-]?'WORD'` / `<<[-]?"WORD"`, checked before quote/subst starts.
    if (ch === '<' && command[i + 1] === '<') {
      const m = /^<<(-)?\s*(?:'([A-Za-z0-9_]+)'|"([A-Za-z0-9_]+)"|([A-Za-z0-9_]+))/.exec(command.slice(i));
      if (m) {
        heredocDelim = m[2] || m[3] || m[4];
        heredocStrip = !!m[1];
        current += m[0];
        i += m[0].length - 1;
        continue;
      }
    }
    if (ch === "'") { inSingle = true; current += ch; continue; }
    if (ch === '"') { inDouble = true; current += ch; continue; }
    if (ch === '`') { inBacktick = true; current += ch; continue; }
    if (ch === '$' && command[i + 1] === '(') { substDepth = 1; current += ch + '('; i++; continue; }
    if (ch === '\\' && i + 1 < command.length) { current += ch + command[++i]; continue; }
    if (ch === '\n') { segments.push(current); current = ''; continue; }
    if (ch === ';') { segments.push(current); current = ''; continue; }
    if (ch === '|') {
      if (command[i + 1] === '|') { segments.push(current); current = ''; i++; continue; }
      segments.push(current); current = ''; continue;
    }
    if (ch === '&') {
      if (command[i + 1] === '&') { segments.push(current); current = ''; i++; continue; }
      current += ch; continue;
    }
    current += ch;
  }
  segments.push(current);
  return segments;
}

// ── Protected-path patterns ──
const JSON_STORE_PATH_RE = /concepts\/\.design-attempt-counts\.json|concepts\/design-cases\.json|concepts\/\.design-critic-verdicts\b|concepts\/\.design-gate-audit\.log|\.claude\/settings\.json|\.claude\/hooks\/protect-json-stores\.mjs|\.claude\/hooks\/design-done-gate\.mjs|\.claude\/hooks\/geometry-lint\.mjs/;
const SHOTS_DIR_RE = /concepts\/\.audit-shots\//;
const SCENE_FILE_RE = /concepts\/[\w.-]+\.html\b/;
const EVIDENCE_MTIME_PATH_RE = new RegExp(`${SHOTS_DIR_RE.source}|${SCENE_FILE_RE.source}`);
// A concepts/ path with an UNQUOTED glob character — checked against the raw (not quote-stripped)
// segment on purpose: a quoted glob doesn't expand in real bash (rm 'concepts/*.json' looks for a
// literal file named *.json, which is harmless), so quote-stripping before this specific check would
// itself manufacture false positives.
const CONCEPTS_GLOB_RE = /concepts\/[^\s'"]*[*?[][^\s'"]*/;
// `rm`/`rm -rf` targeting the bare `concepts` directory itself (no further path) deletes every
// protected store as a side effect without ever naming one — the specific-path regex above requires a
// specific filename/subdir and, correctly, does not match this.
const BARE_CONCEPTS_RE = /(?:^|\s)concepts\/?(?:\s|$)/;

const WHOLE_SEGMENT_WRITE_VERBS = new Set(['rm', 'mv', 'touch', 'tee', 'truncate', 'ln', 'dd']);
const ANCHORED_DEST_RE = /(?:\bcp\s+(?:-\S+\s+)*|\binstall\s+(?:-\S+\s+)*)\S+\s+([\w./-]+)/g;
const REDIRECT_DEST_RE = />>?\s*([\w./-]+)/g;
const INTERPRETER_RE = /\b(?:node|python3?|deno|bun|perl|ruby)\b/;
const EVAL_FLAG_RE = /(?:^|\s)(?:-e|--eval|-p|--print|-c)(?=[\s'"]|$)/;
const HEREDOC_MARKER_RE = /<</;
const MTIME_TAMPER_HINT_RE = /\butimes(?:Sync)?\b/;

function firstWord(seg) {
  const m = /^\s*(?:\.\/)?([\w.-]+)/.exec(seg);
  return m ? m[1] : '';
}

// Full write-protection for the gate/guard-owned stores.
function segmentTampersWithJsonStore(seg) {
  const dequoted = seg.replace(/['"]/g, '');
  const fw = firstWord(seg);

  if (WHOLE_SEGMENT_WRITE_VERBS.has(fw) && JSON_STORE_PATH_RE.test(dequoted)) return true;
  if (fw === 'sed' && /-i\b/.test(seg) && JSON_STORE_PATH_RE.test(dequoted)) return true;
  if (fw === 'cp' || fw === 'install') {
    for (const m of dequoted.matchAll(ANCHORED_DEST_RE)) {
      if (JSON_STORE_PATH_RE.test(m[1])) return true;
    }
  }
  // Redirection is a positional OPERATOR, not a command word — checked anywhere in the segment.
  for (const m of dequoted.matchAll(REDIRECT_DEST_RE)) {
    if (JSON_STORE_PATH_RE.test(m[1])) return true;
  }
  if (INTERPRETER_RE.test(seg) && EVAL_FLAG_RE.test(seg) && JSON_STORE_PATH_RE.test(dequoted)) return true;
  if (INTERPRETER_RE.test(seg) && HEREDOC_MARKER_RE.test(seg) && JSON_STORE_PATH_RE.test(dequoted)) return true;
  if (WHOLE_SEGMENT_WRITE_VERBS.has(fw) && CONCEPTS_GLOB_RE.test(seg)) return true;
  if (fw === 'rm' && BARE_CONCEPTS_RE.test(dequoted)) return true;
  return false;
}

// Narrower mtime-forgery-only protection — screenshots and scene .html files.
function segmentForgesShotMtime(seg) {
  if (/\btouch\b/.test(seg) && EVIDENCE_MTIME_PATH_RE.test(seg)) return true;
  if (INTERPRETER_RE.test(seg) && EVAL_FLAG_RE.test(seg) && MTIME_TAMPER_HINT_RE.test(seg) && EVIDENCE_MTIME_PATH_RE.test(seg)) return true;
  if (INTERPRETER_RE.test(seg) && HEREDOC_MARKER_RE.test(seg) && MTIME_TAMPER_HINT_RE.test(seg) && EVIDENCE_MTIME_PATH_RE.test(seg)) return true;
  return false;
}

const GIT_DESTRUCTIVE_RE = /^\s*git\s+(checkout|restore|stash|rm|clean|reset)\b/;
function segmentIsDestructiveGit(seg) {
  const m = GIT_DESTRUCTIVE_RE.exec(seg);
  if (!m) return false;
  const subcommand = m[1];
  const dequoted = seg.replace(/['"]/g, '');
  if (subcommand === 'clean') return true;
  if (subcommand === 'reset') return /--hard\b/.test(seg);
  if (JSON_STORE_PATH_RE.test(dequoted)) return true;
  if (/(?:^|\s)(?:--\s+)?\.\s*$/.test(seg.trimEnd())) return true;
  return false;
}

const payload = readStdinJson();
if (!payload) {
  console.error('protect-json-stores: could not read/parse the PreToolUse payload from stdin — blocking, not guessing.');
  process.exit(2);
}
if (payload.tool_name !== 'Bash') process.exit(0);

const command = payload.tool_input?.command;
if (typeof command !== 'string') process.exit(0);

for (const seg of splitSegments(command)) {
  if (segmentTampersWithJsonStore(seg)) {
    console.error(`protect-json-stores: BLOCKED — this Bash segment writes (or could write) to a ` +
      `gate/guard-owned store: "${seg.trim()}". concepts/.design-attempt-counts.json, ` +
      `concepts/design-cases.json, concepts/.design-critic-verdicts/, concepts/.design-gate-audit.log, ` +
      `.claude/settings.json, and the hook files themselves are written/changed ONLY through their ` +
      `normal path (the gate's own writes, or the Edit/Write tools for the hooks/settings) — no Bash ` +
      `command may touch them (rm, mv, cp/install as destination, tee, sed -i, redirection, touch, an ` +
      `inline eval or heredoc mentioning the path, or a glob/bare-directory reference are all blocked ` +
      `here). Reads via cat/grep are unaffected. An interpreter one-liner or heredoc script that merely ` +
      `MENTIONS one of these paths is blocked outright whether it reads or writes — this hook cannot ` +
      `safely tell the two apart from pattern-matching alone. If you need to change one of these files, ` +
      `stop and ask Ben (for the JSON stores) or use the Edit/Write tools directly (for the hooks/` +
      `settings) — do not route around this via Bash.`);
    process.exit(2);
  }
  if (segmentForgesShotMtime(seg)) {
    console.error(`protect-json-stores: BLOCKED — this Bash segment forges a screenshot's or scene ` +
      `file's mtime instead of re-rendering/re-editing for real: "${seg.trim()}". concepts/.audit-shots/ ` +
      `and concepts/*.html scene files are normally fully writable (copying/renaming a real capture, or ` +
      `editing a scene, is the documented workflow) — what is blocked specifically is touch/touch -d and ` +
      `an inline eval or heredoc using fs.utimesSync, which fake freshness without a real change. Edit ` +
      `or re-render for real instead.`);
    process.exit(2);
  }
  if (segmentIsDestructiveGit(seg)) {
    console.error(`protect-json-stores: BLOCKED — this Bash segment is a destructive git operation ` +
      `touching a gate-protected path (or the whole tree): "${seg.trim()}". git checkout/restore/stash/rm ` +
      `naming one of the protected stores, any git clean (wipes untracked files by directory scope, ` +
      `including .design-critic-verdicts/ and .design-gate-audit.log), and git reset --hard (discards ` +
      `everything uncommitted repo-wide) are all blocked here. If you genuinely need to roll one of ` +
      `these back through git history, stop and ask Ben.`);
    process.exit(2);
  }
}
process.exit(0);

} catch (e) {
  // Fail CLOSED, not open (round 2 finding #7): an uncaught exception anywhere above previously fell
  // through to Node's default uncaught-exception behavior — typically exit 1, which Claude Code
  // treats as non-blocking. A bug in this file would have silently ALLOWED the exact command it was
  // trying to inspect. Any error here is treated as "cannot prove this command is safe."
  console.error(`protect-json-stores: CRASHED (${e && e.stack ? e.stack : e}) — blocking rather than ` +
    `allowing an uninspected command through.`);
  process.exit(2);
}
```

- [ ] **Step 2: Syntax-check**

```bash
node --check .claude/hooks/protect-json-stores.mjs && echo "syntax OK"
```

- [ ] **Step 3: Verify — the FULL accumulated suite from all prior rounds, plus every new case from this task**

Run this complete script and report every line:

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
test_block() {
  local desc="$1" cmd="$2"
  echo "$cmd" | node -e "
    const cmd = require('fs').readFileSync(0,'utf8').trim();
    process.stdout.write(JSON.stringify({tool_name:'Bash', tool_input:{command: cmd}}));
  " | node .claude/hooks/protect-json-stores.mjs >/dev/null 2>&1
  local code=$?
  echo "[$desc] exit=$code $([ $code -eq 2 ] && echo PASS || echo FAIL)"
}
test_allow() {
  local desc="$1" cmd="$2"
  echo "$cmd" | node -e "
    const cmd = require('fs').readFileSync(0,'utf8').trim();
    process.stdout.write(JSON.stringify({tool_name:'Bash', tool_input:{command: cmd}}));
  " | node .claude/hooks/protect-json-stores.mjs >/dev/null 2>&1
  local code=$?
  echo "[$desc] exit=$code $([ $code -eq 0 ] && echo PASS || echo FAIL)"
}

echo "=== PRIOR-ROUND REGRESSION SUITE ==="
test_block "rm attempt-counts"       'rm concepts/.design-attempt-counts.json'
test_block "rm verdict dir"          'rm -rf concepts/.design-critic-verdicts'
test_block "redirect into cases"     'echo "{}" > concepts/design-cases.json'
test_block "tee into verdict"        'echo "{\"verdict\":\"PASS\"}" | tee concepts/.design-critic-verdicts/fake.json'
test_block "sed -i on counts"        "sed -i 's/2/0/' concepts/.design-attempt-counts.json"
test_block "mv counts away"          'mv concepts/.design-attempt-counts.json /tmp/stolen.json'
test_block "cp into cases"           'cp /tmp/fake.json concepts/design-cases.json'
test_block "node -e writing verdict" "node -e \"require('fs').writeFileSync('concepts/.design-critic-verdicts/fake.json','{}')\""
test_block "compound: cd then rm"    'cd /tmp && rm concepts/.design-attempt-counts.json'
test_block "cp with flag"            'cp -f /tmp/fake.json concepts/design-cases.json'
test_block "cp --force long flag"    'cp --force /tmp/fake.json concepts/design-cases.json'
test_block "python3 -c no space"     "python3 -c\"open('concepts/design-cases.json','w').write('{}')\""
test_block "sed -i multi-subst (embedded ;)" "sed -i 's/a/b/;s/c/d/' concepts/design-cases.json"
test_block "rm via \$(...) with embedded ;"  'rm $(true; echo concepts/.design-attempt-counts.json)'
test_block "rm via backtick with embedded ;" 'rm `true; echo concepts/design-cases.json`'
test_allow "cp shot into place"      'cp concepts/.audit-shots/bundle/shot.png concepts/.audit-shots/myshot.png'
test_allow "normal node render"      'node concepts/tools/visual-audit.mjs concepts/scene.html'
test_allow "git status"              'git status'
test_allow "cat cases (read)"        'cat concepts/design-cases.json'

echo "=== TASK 1/2/4 REGRESSION (this round's earlier tasks, must still hold after the full rewrite) ==="
test_block "git checkout HEAD~3 -- design-cases.json" 'git checkout HEAD~3 -- concepts/design-cases.json'
test_block "git clean -fdx concepts/"  'git clean -fdx concepts/'
test_block "git reset --hard"          'git reset --hard HEAD~1'
test_block "touch -d on scene file"    'touch -d "2020-01-01" concepts/campfire-sing-along-v1.html'
test_allow "git status again"          'git status'
test_allow "sed edit to scene (not mtime forgery)" "sed -i 's/foo/bar/' concepts/scene.html"

echo "=== TASK 5 NEW CASES ==="
test_block "quoted path single"       "rm concepts/'design-cases.json'"
test_block "quoted path double"       'rm concepts/"design-cases.json"'
test_block "glob star"                'rm concepts/*.json'
test_block "glob question"            'rm concepts/design-case?.json'
test_block "rm -rf bare concepts root" 'rm -rf concepts'
test_block "rm -rf bare concepts with trailing slash" 'rm -rf concepts/'
test_block "truncate"                 'truncate -s 0 concepts/design-cases.json'
test_block "ln -sf devnull"           'ln -sf /dev/null concepts/design-cases.json'
test_block "dd of="                   'dd if=/dev/null of=concepts/design-cases.json'
test_block "python heredoc to stdin"  $'python3 <<EOF\nopen("concepts/design-cases.json","w").write("{}")\nEOF'
test_block "node heredoc to stdin"    $'node <<EOF\nrequire("fs").writeFileSync("concepts/design-cases.json","{}")\nEOF'
test_block "rm settings.json"         'rm .claude/settings.json'
test_block "sed -i on guard file"     "sed -i 's/exit(2)/exit(0)/' .claude/hooks/protect-json-stores.mjs"

echo "=== FALSE-POSITIVE FIXES (must now ALLOW, previously incorrectly blocked) ==="
test_allow "git commit -m mentioning mv+path"  'git commit -m "fix mv logic touching concepts/design-cases.json"'
test_allow "echo mentioning rm+path in a message" 'git commit -m "removed rm-based cleanup for concepts/design-cases.json"'

echo "=== LEGITIMATE OPERATIONS STILL ALLOWED ==="
test_allow "cp with quoted glob (does not expand, harmless)" "rm concepts/'*.json'"
test_allow "rm a normal, unrelated file" 'rm concepts/some-scratch-file.txt'
test_allow "edit hooks via Edit tool is unaffected (not Bash, N/A here)" 'echo "N/A — Edit tool path not exercised by this hook"'
```

Every `test_block` line must say `PASS` (exit 2); every `test_allow` line must say `PASS` (exit 0). If ANY line says FAIL, do not proceed to Step 4 — fix the regex logic and re-run the ENTIRE script until every line passes.

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/protect-json-stores.mjs
git commit -m "fix(design-gate): fix guard pattern-matching bypasses — quotes, globs, bare-directory rm, heredocs, first-word-anchored verbs (fixes finding #6, the git-commit-message false positive, guard self-protection, and fail-closed crash handling)"
```

---

## Task 6: Remove the stray unscoped `Bash(cd *)` from `.claude/settings.local.json` (fixes finding #5)

**Files:**
- Modify: `.claude/settings.local.json`

- [ ] **Step 1: Remove the entry**

Read the current file first — its `permissions.allow` array should contain, among a handful of narrow, specific entries, the line `"Bash(cd *)"`. Remove ONLY that one line. Do not touch any other entry in this file (they're all narrow, specific, unrelated permission grants — a grep pattern, an awk one-liner, `open`, `claude update`, a specific `mkdir -p`, a specific `curl` URL — none of them need a cd-prefixed mirror the way `.claude/settings.json`'s broader verb classes did in an earlier round, since this file has no equivalent broad "always cd first" pattern).

- [ ] **Step 2: Verify valid JSON**

```bash
python3 -c "import json; json.load(open('.claude/settings.local.json')); print('valid JSON')"
```

- [ ] **Step 3: Confirm the entry is gone**

```bash
grep -c '"Bash(cd \*)"' .claude/settings.local.json; echo "(expect: grep found nothing, so this prints 0, and the command's own exit code is 1 for zero matches — both expected)"
```

- [ ] **Step 4: Commit**

```bash
git add .claude/settings.local.json
git commit -m "fix(design-gate): remove stray unscoped Bash(cd *) from settings.local.json, closing the settings-layer half of fix #5 (fixes finding #5)"
```

---

## Task 7: Make the sweep script actually cross-check the audit log (fixes finding #9)

**Files:**
- Modify: `concepts/tools/sweep-stale-design-entries.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: Add `.design-gate-audit.log` to `.gitignore`**

Find the existing entry for `concepts/.audit-shots/` (search for it) and add a new line near it:

```
concepts/.design-gate-audit.log
```

- [ ] **Step 2: Rewrite the sweep script to read and cross-check the audit log**

Read the current full content of `concepts/tools/sweep-stale-design-entries.mjs` first. Replace it entirely with:

```js
#!/usr/bin/env node
// concepts/tools/sweep-stale-design-entries.mjs
//
// Mitigates B5 from concepts/design-pipeline-hardening-fix.md: "stale per-slug history can outlive
// a deleted or renamed scene. Nothing purges verdict/attempt-count entries for scenes that no longer
// exist." This is a HUMAN-RUN, READ-ONLY report, not an automatic prune.
//
// Round-2 review (concepts/design-pipeline-hardening-review-round2.md, finding #9) found this script
// never actually read the audit trail added alongside it, despite the gate's own comment claiming the
// log exists "so the sweep script has something to cross-check against." Fixed here: for every
// verdict/case/counts entry, report whether at least one matching audit-log line exists. An entry with
// NO matching audit-log line is not automatically suspicious — the audit log was added partway through
// this project's history, so anything written before that point legitimately predates it — but an
// entry with no audit-log match AND a recent-looking timestamp is worth a human's attention, since it
// is the signature either of a genuine pre-audit-log record or of a write that happened outside the
// gate's normal path.
//
// Usage: node concepts/tools/sweep-stale-design-entries.mjs
// Exit code is always 0 — this never blocks anything, it only reports.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COUNTS_FILE = resolve(REPO_ROOT, 'concepts', '.design-attempt-counts.json');
const CASES_FILE = resolve(REPO_ROOT, 'concepts', 'design-cases.json');
const VERDICT_DIR = resolve(REPO_ROOT, 'concepts', '.design-critic-verdicts');
const AUDIT_LOG_FILE = resolve(REPO_ROOT, 'concepts', '.design-gate-audit.log');

const fileExists = (relPath) => relPath && existsSync(resolve(REPO_ROOT, relPath));

// Parse the audit log once. Each line is {timestamp, store, action, detail}. Build simple lookup sets
// keyed on the fields each store's writeCase()/verdict-write call actually logs, so "does an audit
// entry exist for this specific record" is a real (if approximate) match, not just "the log is
// non-empty."
function loadAuditEntries() {
  if (!existsSync(AUDIT_LOG_FILE)) return [];
  const lines = readFileSync(AUDIT_LOG_FILE, 'utf8').split('\n').filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch { /* malformed line — skip, don't crash the sweep */ }
  }
  return entries;
}

const auditEntries = loadAuditEntries();
const auditByFile = new Map(); // file -> array of matching audit entries
for (const e of auditEntries) {
  const f = e?.detail?.file;
  if (!f) continue;
  if (!auditByFile.has(f)) auditByFile.set(f, []);
  auditByFile.get(f).push(e);
}

console.log('# Stale design-gate entry sweep\n');
console.log(`Audit log: ${existsSync(AUDIT_LOG_FILE) ? `${auditEntries.length} entries read from ${AUDIT_LOG_FILE}` : `does not exist yet at ${AUDIT_LOG_FILE} (no writes have happened since it was added, or it predates this repo's checkout)`}\n`);

// .design-attempt-counts.json — keys carry `lastCheckedFile`.
if (existsSync(COUNTS_FILE)) {
  const counts = JSON.parse(readFileSync(COUNTS_FILE, 'utf8'));
  const entries = Object.entries(counts);
  const stale = entries.filter(([, v]) => v.lastCheckedFile && !fileExists(v.lastCheckedFile));
  console.log(`## ${COUNTS_FILE}`);
  console.log(`${entries.length} total entries, ${stale.length} reference a file that no longer exists:`);
  for (const [key, v] of stale) console.log(`  - "${key}" -> ${v.lastCheckedFile} (fails: ${v.fails ?? '?'})`);
  const noAudit = entries.filter(([, v]) => v.lastCheckedFile && fileExists(v.lastCheckedFile) && !(auditByFile.get(v.lastCheckedFile)?.length));
  if (noAudit.length) {
    console.log(`${noAudit.length} entries reference a file that DOES still exist but have NO matching audit-log entry ` +
      `(predates the audit log, or was written outside the gate's normal path — not automatically suspicious, worth a look):`);
    for (const [key, v] of noAudit) console.log(`  - "${key}" -> ${v.lastCheckedFile}`);
  }
  console.log('');
} else {
  console.log(`## ${COUNTS_FILE} — does not exist, nothing to sweep\n`);
}

// design-cases.json — records carry `file`.
if (existsSync(CASES_FILE)) {
  const cases = JSON.parse(readFileSync(CASES_FILE, 'utf8')).cases || [];
  const stale = cases.filter(c => c.file && !fileExists(c.file));
  console.log(`## ${CASES_FILE}`);
  console.log(`${cases.length} total cases, ${stale.length} reference a file that no longer exists:`);
  for (const c of stale) console.log(`  - "${c.noun}" (${c.date}, verdict ${c.verdict}) -> ${c.file}`);
  const noAudit = cases.filter(c => c.file && fileExists(c.file) && !(auditByFile.get(c.file)?.length));
  if (noAudit.length) {
    console.log(`${noAudit.length} cases reference a file that DOES still exist but have NO matching audit-log entry:`);
    for (const c of noAudit) console.log(`  - "${c.noun}" (${c.date}) -> ${c.file}`);
  }
  console.log('');
} else {
  console.log(`## ${CASES_FILE} — does not exist, nothing to sweep\n`);
}

// .design-critic-verdicts/*.json — each carries `checkedFile`.
if (existsSync(VERDICT_DIR)) {
  const files = readdirSync(VERDICT_DIR).filter(f => f.endsWith('.json'));
  const stale = [];
  const noAudit = [];
  for (const f of files) {
    try {
      const v = JSON.parse(readFileSync(resolve(VERDICT_DIR, f), 'utf8'));
      if (v.checkedFile && !fileExists(v.checkedFile)) stale.push({ f, checkedFile: v.checkedFile, verdict: v.verdict });
      else if (v.checkedFile && !(auditByFile.get(v.checkedFile)?.length)) noAudit.push({ f, checkedFile: v.checkedFile, verdict: v.verdict });
    } catch { /* unparseable verdict file — not this sweep's job to flag malformed JSON */ }
  }
  console.log(`## ${VERDICT_DIR}`);
  console.log(`${files.length} total verdict files, ${stale.length} reference a file that no longer exists:`);
  for (const s of stale) console.log(`  - ${s.f} (verdict ${s.verdict}) -> ${s.checkedFile}`);
  if (noAudit.length) {
    console.log(`${noAudit.length} verdict files reference a file that DOES still exist but have NO matching audit-log entry:`);
    for (const s of noAudit) console.log(`  - ${s.f} (verdict ${s.verdict}) -> ${s.checkedFile}`);
  }
  console.log('');
} else {
  console.log(`## ${VERDICT_DIR} — does not exist, nothing to sweep\n`);
}

console.log('Nothing above was deleted. Review and clean up by hand if the STALE entries are truly dead —');
console.log('a future scene reusing an old path+element-name slug would otherwise inherit these counts.');
console.log('The NO-AUDIT-LOG entries are informational, not necessarily a problem — see the note above.');
```

- [ ] **Step 3: Syntax-check**

```bash
node --check concepts/tools/sweep-stale-design-entries.mjs && echo "syntax OK"
```

- [ ] **Step 4: Verify — a fresh scratch repo with both a stale entry and a genuinely audit-logged entry**

```bash
rm -rf /tmp/gate-scratch-audit2 && mkdir -p /tmp/gate-scratch-audit2/concepts/tools /tmp/gate-scratch-audit2/concepts/.design-critic-verdicts
cd /tmp/gate-scratch-audit2
cp /Users/bencoughlin/Projects/baynes-trivia/trivia-os/concepts/tools/sweep-stale-design-entries.mjs concepts/tools/

# A stale entry (file doesn't exist)
cat > concepts/design-cases.json <<'EOF'
{"cases": [{"noun": "flame", "file": "concepts/ghost-scene.html", "verdict": "FAIL", "date": "2026-01-01"}]}
EOF

# A real file with NO audit-log entry (simulates pre-audit-log history)
cat > concepts/real-scene.html <<'EOF'
<div>real</div>
EOF
cat > concepts/.design-attempt-counts.json <<'EOF'
{"concepts_real-scene.html::dot": {"fails": 1, "lastCheckedFile": "concepts/real-scene.html"}}
EOF

node concepts/tools/sweep-stale-design-entries.mjs
echo "exit code: $?"

# Now add a genuine audit-log entry for real-scene.html and confirm the "no audit" line for it disappears
cat > concepts/.design-gate-audit.log <<'EOF'
{"timestamp":"2026-01-01T00:00:00.000Z","store":"design-attempt-counts.json","action":"write-counts","detail":{"file":"concepts/real-scene.html"}}
EOF
echo "--- after adding a matching audit entry ---"
node concepts/tools/sweep-stale-design-entries.mjs
```

Expected: first run reports the ghost-scene stale entry AND flags `concepts/real-scene.html`'s counts entry as having no audit-log match; second run (after adding a matching audit-log line) no longer flags `real-scene.html` in the no-audit section. Both runs exit 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
git add concepts/tools/sweep-stale-design-entries.mjs .gitignore
git commit -m "fix(design-gate): make the sweep script actually read and cross-check the audit log, add it to .gitignore (fixes finding #9)"
```

---

## Self-Review Notes

- **Spec coverage:** CRITICAL #1 (Task 1), CRITICAL #2 (Task 2), finding #2 (Task 3), finding #3 (Task 4), finding #6 + the git-commit-message false positive + guard self-protection + fail-closed crash handling (Task 5), finding #5 (Task 6), finding #9 (Task 7). Finding #7's invocation-path suggestion and the review's literal "deny-list .claude/**" suggestion are both deliberately NOT implemented, with reasoning given at the top of this doc. Finding #4 (`agreedMinor`/`minorFindings` array-guard analog) is covered by Task 1's `tallyDefects` array-guard, which covers `s.defects` for both `agreedMinor` and `agreedDefects`/`dissentMajors` computation paths identically. Finding #8 (adversarial framing unproven) has no code fix — it's an epistemic note about fix #9 from the prior round, not a bug; nothing in this plan claims otherwise.
- **Placeholder scan:** no TBD/TODO, no "add appropriate handling" — every code block is literal text to write, every verification step has concrete expected output.
- **Type/name consistency:** `dissentMajors` is destructured identically at both `tallyDefects()` call sites (correctness and quality); `segmentTampersWithJsonStore`/`segmentForgesShotMtime`/`segmentIsDestructiveGit` are all defined once in Task 5's full-file replacement and used identically to their Task 2/4 incremental versions (Task 5 supersedes those edits with the same function names and equivalent-or-stronger logic, so no signature drift between tasks).
- **Task-ordering note:** Tasks 2 and 4 make small, independently-verifiable additions to `protect-json-stores.mjs`; Task 5 replaces the WHOLE file, which will include (in equivalent-or-improved form) everything Tasks 2 and 4 added. This is deliberate — it lets the two CRITICAL fixes (Tasks 1 and 2) land and be verified on their own, small, easy-to-review diffs first, exactly as instructed, before the much larger Task 5 rewrite happens. When implementing Task 5, confirm its full-file content preserves Task 2's git-detection and Task 4's scene-mtime logic correctly (it does, by construction, but the implementer should diff Task 5's output against Tasks 2+4's incremental state to confirm no regression before treating Task 5 as a clean superseding replacement).
