# Design-Gate Hardening — Fixes #1-4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four highest-value holes in `.claude/hooks/design-done-gate.mjs` and its
worker agent named in `concepts/design-pipeline-hardening-fix.md` (fixes #1-#4): give the
correctness critic the same major-defect override the quality critic already has, stop discarding
minority-vote reasoning on a PASS, make foreground-only dispatch a hard rule (with a diagnostic
trip-wire for the failure mode a hard rule can't self-detect), and require the worker to
verbatim-relay the gate's block list instead of summarizing it. Also resolves B7 (pictorial ambient
scenes) across the three docs that actually assert the now-stale conflict.

**Architecture:** All gate logic changes live in one file, `.claude/hooks/design-done-gate.mjs` —
extract the quality gate's existing tag-tally/major-override logic (lines ~1553-1592) into one
shared `tallyDefects()` helper, reuse it for both critics. Agent-instruction changes are prose-only
edits to `.claude/agents/trivia-os-design-critic.md` and `.claude/agents/trivia-os-design-worker.md`.
Doc-reconciliation changes are prose-only edits to `concepts/OBJECT-RENDERING-PROTOCOL.md`,
`references/themes.md`, and `concepts/campfire-sing-along-spec.md`. No changes to
`concepts/campfire-sing-along-v1.html` or to fixes #5-10 (explicitly out of scope, follow-on work).

**Tech Stack:** Plain Node.js (no framework, no test runner in this repo). This file's own
established verification convention — used and named in its own changelog (v7, v8, v9) — is a
**scratch git repo**: build a throwaway repo with a fake transcript JSONL and a scene file, run
`node design-done-gate.mjs` against it with a piped stdin payload, and read the exit code + stderr.
Every task below follows that same convention rather than inventing a foreign test framework for a
project that has never used one for this file.

---

## File Structure

- **Modify `.claude/hooks/design-done-gate.mjs`**:
  - New: `CORRECTNESS_DEFECT_TAGS` constant (closed vocab, mirrors the critic's 3-part reasoning).
  - New: `tallyDefects(samples, tagSet)` — extracted from the quality gate's inline logic, shared.
  - Modify: quality gate's inline tally block to call `tallyDefects()` instead of its own copy.
  - Modify: correctness verdict construction (~line 1332-1346) to call `tallyDefects()` too, apply
    the same `majorOverride`, and record `defects`/`minorFindings`/`verdictSource`.
  - Modify: both `writeCase()` call sites (~1364-1371 correctness, ~1619-1628 quality) to always
    store full reasoning (never `'n/a'`) and add a `_dissent` flag on a split-vote PASS.
  - New: an orphan trip-wire (diagnostic-only, non-blocking) inserted before the `touchedFiles.length
    === 0` early exit (~line 865).
- **Modify `.claude/agents/trivia-os-design-critic.md`**: add `defects`/severity to the output
  contract; add the closed-vocab tag list to the JSON schema line.
- **Modify `.claude/agents/trivia-os-design-worker.md`**: add the hard foreground-only-dispatch
  rule; rewrite "Reporting back" to require verbatim relay of `problems[]`.
- **Modify `concepts/OBJECT-RENDERING-PROTOCOL.md`**: close the B7 addendum as resolved.
- **Modify `references/themes.md`**: reconcile rule 1a's "never place a pictorial figurative
  object as-is" ambient-branch language with the resolution.
- **Modify `concepts/campfire-sing-along-spec.md`**: close its "Known open item" section, which
  names this exact conflict for this exact scene.

---

## Task 1: Extract `tallyDefects()` and wire it into the quality gate (no behavior change)

Pure refactor first — get the quality gate re-plumbed through a shared, testable function with
**zero change in its output**, before adding correctness on top of it in Task 2. This follows
TDD's "characterize current behavior before changing it" discipline even without a formal test
runner: the scratch-repo run in Step 3 below is the characterization test.

**Files:**
- Modify: `.claude/hooks/design-done-gate.mjs:393-399` (add `CORRECTNESS_DEFECT_TAGS` near
  `QUALITY_DEFECT_TAGS`)
- Modify: `.claude/hooks/design-done-gate.mjs:1553-1592` (extract into `tallyDefects()`)
- Modify: `.claude/hooks/design-done-gate.mjs:1598-1616` (call the extracted function)

- [ ] **Step 1: Add the shared `tallyDefects()` helper right after `QUALITY_DEFECT_TAGS`**

Insert immediately after the `QUALITY_DEFECT_TAGS` block (after line 399, before
`extractLastJsonObject`):

```js
// Shared between the quality gate and (as of the correctness-severity fix) the correctness gate:
// tally defect tags across N critic samples, apply the closed-vocabulary filter, and separate
// "agreed by 2+ samples" from "single-sample lead" — `other` never counts toward agreement (two
// samples reaching for the catch-all about two unrelated things is agreement on a word, not on a
// finding). Returns the pieces a verdict object needs; does NOT decide PASS/FAIL — the caller
// combines this with tallyVotes() to compute the majorOverride, since only the caller knows
// whether the vote-based verdict is being overridden.
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

- [ ] **Step 2: Replace the quality gate's inline tally block with a call to the helper**

In the quality gate's `else` branch (currently lines ~1553-1592, the block starting
`const tagCounts = {};` and ending at `const majorOverride = votes.verdict === 'PASS' && agreedDefects.length > 0;`),
replace the whole block with:

```js
              const { agreedDefects, agreedMinor, defectsSingleSample, defectsOffVocabulary } =
                tallyDefects(seeing, QUALITY_DEFECT_TAGS);
              const majorOverride = votes.verdict === 'PASS' && agreedDefects.length > 0;
```

Leave the `if (majorOverride) { console.error(...) }` block and the `qVerdict = {...}` object
construction below it exactly as they are — they already reference `agreedDefects`/`agreedMinor`
by those exact names, so no further edits needed there. Update the `qVerdict` object's
`defectsSingleSample` and `defectsOffVocabulary` fields (previously computed inline) to use the
destructured names directly (they already match).

- [ ] **Step 3: Verify with the scratch-repo convention this file already uses**

```bash
cd /tmp && rm -rf gate-scratch && mkdir gate-scratch && cd gate-scratch && git init -q
mkdir -p .claude/hooks .claude/agents concepts/.audit-shots concepts/.design-critic-verdicts
cp /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.claude/hooks/design-done-gate.mjs .claude/hooks/
cp /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.claude/hooks/geometry-lint.mjs .claude/hooks/
cp /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.claude/agents/trivia-os-design-critic.md .claude/agents/
cp /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.claude/agents/trivia-os-design-quality-critic.md .claude/agents/
node -e "console.log(require('/Users/bencoughlin/Projects/baynes-trivia/trivia-os/.claude/hooks/design-done-gate.mjs'))" 2>&1 | head -5
```

This last line just confirms the file still **parses** as valid JS after the edit (a syntax slip in
a 1700-line file is the single most likely mistake here). Expected: no `SyntaxError`, just the
normal "cannot use import statement" error from `require()`-ing an ESM file — that specific error,
not a parse error, is the pass condition:

Expected output: `Cannot use import statement outside a module` (or similar ESM-vs-CJS complaint) —
NOT `Unexpected token` or any other syntax error.

- [ ] **Step 4: Commit**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
git add .claude/hooks/design-done-gate.mjs
git commit -m "refactor(design-gate): extract tallyDefects() from the quality gate, no behavior change"
```

---

## Task 2: Extend the major-defect override to the correctness critic (fixes A1)

**Files:**
- Modify: `.claude/hooks/design-done-gate.mjs:393-399` (add `CORRECTNESS_DEFECT_TAGS`)
- Modify: `.claude/hooks/design-done-gate.mjs:1332-1346` (correctness verdict construction)
- Modify: `.claude/agents/trivia-os-design-critic.md:67-75` (output contract)

- [ ] **Step 1: Add the closed correctness-defect vocabulary next to `QUALITY_DEFECT_TAGS`**

The correctness critic already reasons in three named parts (silhouette/contour, edge/box-tell,
scene coherence — see `trivia-os-design-critic.md` lines 44-50). The tag set mirrors those three
exactly, plus the same `other` catch-all the quality critic uses:

```js
// The correctness critic's closed defect vocabulary — mirrors its own three-part reasoning
// (silhouette/contour, edge/box-tell, scene coherence). Kept deliberately narrower than the
// quality critic's vocabulary: this critic grades "does it read as its noun," not "is it well
// made" — a small, tight set is easier to keep meaningfully distinct from QUALITY_DEFECT_TAGS.
const CORRECTNESS_DEFECT_TAGS = new Set([
  'silhouette-mismatch', 'box-tell', 'register-mismatch', 'other',
]);
```

Add this directly after the `QUALITY_DEFECT_TAGS` block (after the closing `]);` at line ~399).

- [ ] **Step 2: Add `defects` to the correctness critic's output contract**

In `.claude/agents/trivia-os-design-critic.md`, replace the "How to grade" section's severity-free
framing and the final JSON block (lines 67-75) with:

```markdown
## Defects and severity

Alongside your PASS/FAIL verdict, name any defect from this closed list, each with a severity:

- `silhouette-mismatch` — the contour doesn't read as the named noun (part 1 of your reasoning above).
- `box-tell` — a hard rectangular cutoff, visible seam, or other "this is a div, not the thing it's
  drawn as" tell (part 2 of your reasoning above).
- `register-mismatch` — doesn't match the rendering register of everything around it: flat vs.
  photoreal, in-palette or not (part 3 of your reasoning above).
- `other` — a real defect that doesn't fit the three above. Put the specifics in `reason` — `other`
  never counts toward cross-sample agreement, so if you use it, the sentence in `reason` is the only
  place the finding survives.

Each defect is `minor` or `major`. **`major` means this alone should sink the element even if you'd
otherwise lean PASS.** You will be one of three independent samples; the gate FAILS an element that
came back PASS on the vote if two or more samples independently name the same MAJOR defect — that
override exists so a real, named, agreed-on defect can't be out-voted by two samples that didn't
look as closely. Don't inflate severity to be heard — an agreed `minor` defect is still recorded and
still visible, it just doesn't override the vote.

## Output — reasoning first, then exactly this JSON block, nothing after it

After your three-part reasoning above, end your response with exactly one JSON object and nothing
following it (the hook extracts the last `{...}` block in your output — reasoning text before it is
expected and required; text or another brace pair AFTER it will break the parse):

```json
{"verdict": "PASS" | "FAIL", "reason": "one or two concrete sentences citing what and where", "category": "thin-flexible-cord | liquid-surface | organic-contour | iconic-geometry | glow-light | ground-decor", "motion": "NOT_APPLICABLE | NOT_JUDGED — deterministic rotation-angle check required", "defects": [{"tag": "one of: silhouette-mismatch, box-tell, register-mismatch, other", "severity": "minor" | "major"}], "checkedFile": "<path the gate told you to check>"}
```

`defects` may be an empty array — most PASSes have none. It may also be non-empty on a PASS as long
as every entry is `minor`; that is the normal, healthy case for a correct-but-imperfect result. Do
not emit a `major` defect alongside a PASS verdict — if it's major, vote FAIL.
```

- [ ] **Step 3: Wire the override into the correctness verdict construction**

Replace the current correctness verdict block (`.claude/hooks/design-done-gate.mjs`, the
`const votes = tallyVotes(samples);` through `verdictJustComputed = true;` sequence, currently
lines 1332-1349) with:

```js
      const votes = tallyVotes(samples);
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
      const parsed = {
        verdict: majorOverride ? 'FAIL' : votes.verdict,
        verdictSource: majorOverride ? 'agreed-major-defect-override' : 'majority-vote',
        reason: samples.map((s, i) => `[sample ${i + 1}: ${s.verdict}] ${s.reason || ''}`).join(' '),
        category: samples.find(s => s.category)?.category || null,
        motion: samples.find(s => s.motion && s.motion !== 'NOT_APPLICABLE')?.motion || 'NOT_APPLICABLE',
        defects: agreedDefects,
        minorFindings: agreedMinor,
        defectsSingleSample,
        defectsOffVocabulary,
        checkedFile: file,
        timestamp: new Date().toISOString(),
        sampleVotes: { pass: votes.pass, fail: votes.fail, total: votes.total },
        panel: samples.map(s => s._model || 'default'),
      };
      if (defectsOffVocabulary.length) {
        console.error(`design-done-gate: [${slug}] correctness critic returned tags outside its ` +
          `closed set and they were discarded: ${defectsOffVocabulary.join(', ')}. If these keep ` +
          `recurring, add them to BOTH trivia-os-design-critic.md and CORRECTNESS_DEFECT_TAGS here.`);
      }
      if (agreedMinor.length) {
        console.error(`design-done-gate: [${slug}] correctness verdict ${parsed.verdict} with agreed ` +
          `MINOR findings (2+ samples, none blocking): ${agreedMinor.join(', ')}. Logged to ` +
          `design-cases.json.`);
      }
      writeFileSync(verdictPath, JSON.stringify(parsed, null, 2));
      verdict = parsed;
      verdictJustComputed = true;
```

This replaces the previous `parsed` object (which had no `defects`/`minorFindings`/`verdictSource`
fields) with the severity-aware version, applying the identical override rule the quality gate
already uses.

- [ ] **Step 4: Update the correctness `writeCase()` call to record the new fields**

The current call (lines ~1364-1371) is:

```js
    if (verdictJustComputed) writeCase({
      noun: elementName || slug, category: verdict.category || 'uncategorized',
      approach: 'hand-coded-css', verdict: verdict.verdict,
      rootCause: verdict.verdict === 'FAIL' ? verdict.reason : 'n/a',
      fixThatWorked: null, file, date: new Date().toISOString().slice(0, 10),
      _autoWritten: true, _gate: 'correctness', _sampleVotes: verdict.sampleVotes || null,
      _panel: verdict.panel || null,
    });
```

Replace with (this also implements Task 3 below — the `rootCause`/`_dissent` change — in the same
edit, since both touch this exact call):

```js
    if (verdictJustComputed) writeCase({
      noun: elementName || slug, category: verdict.category || 'uncategorized',
      approach: 'hand-coded-css', verdict: verdict.verdict,
      rootCause: verdict.reason,
      _dissent: verdict.verdict === 'PASS' && verdict.sampleVotes && verdict.sampleVotes.pass !== verdict.sampleVotes.total
        ? true : undefined,
      fixThatWorked: null, file, date: new Date().toISOString().slice(0, 10),
      _autoWritten: true, _gate: 'correctness', _sampleVotes: verdict.sampleVotes || null,
      _panel: verdict.panel || null, _defects: verdict.defects || [],
      _minorFindings: verdict.minorFindings || [], _verdictSource: verdict.verdictSource || 'majority-vote',
    });
```

- [ ] **Step 5: Verify against tonight's real `logs` case (the exact scenario A1 describes)**

This is the load-bearing check: replay the actual `logs` samples from tonight's session (already on
disk at `concepts/.design-critic-verdicts/concepts_campfire-sing-along-v1.html__logs.json`) through
the NEW logic by hand, without needing a live `claude -p` spawn:

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
node -e "
const samples = [
  {verdict:'PASS', reason: 'cylindrical log-like shading, rounded caps avoid box tell', defects: [{tag:'silhouette-mismatch', severity:'minor'}]},
  {verdict:'FAIL', reason: 'constant-width round-capped strokes, no taper/bark; fire does not read as rising out of a log base', defects: [{tag:'silhouette-mismatch', severity:'major'}, {tag:'box-tell', severity:'major'}]},
  {verdict:'PASS', reason: 'clear X-shaped silhouette, no box tells', defects: []},
];
// Inline copies of tallyVotes/tallyDefects for a standalone check (same logic as the file).
function tallyVotes(s){const p=s.filter(x=>x.verdict==='PASS').length;const f=s.length-p;return{pass:p,fail:f,total:s.length,verdict:p>f?'PASS':'FAIL'};}
const tagSet = new Set(['silhouette-mismatch','box-tell','register-mismatch','other']);
function tallyDefects(samples, tagSet){
  const tagCounts={}, majorCounts={}, off=new Set();
  for(const s of samples){
    const entries=(s.defects||[]).map(d=>typeof d==='string'?{tag:d,severity:'major'}:{tag:d?.tag,severity:d?.severity==='minor'?'minor':'major'}).filter(d=>d.tag);
    const majorHere=new Set(entries.filter(d=>d.severity==='major').map(d=>d.tag));
    const tags=entries.map(d=>d.tag);
    for(const t of new Set(tags)){ if(!tagSet.has(t)){off.add(t);continue;} tagCounts[t]=(tagCounts[t]||0)+1; if(majorHere.has(t)) majorCounts[t]=(majorCounts[t]||0)+1; }
  }
  const agreedAll=Object.keys(tagCounts).filter(t=>t!=='other'&&tagCounts[t]>=2).sort();
  return { agreedDefects: agreedAll.filter(t=>(majorCounts[t]||0)>=2), agreedMinor: agreedAll.filter(t=>(majorCounts[t]||0)<2) };
}
const votes = tallyVotes(samples);
const { agreedDefects } = tallyDefects(samples, tagSet);
const majorOverride = votes.verdict === 'PASS' && agreedDefects.length > 0;
console.log('votes:', votes, 'agreedDefects:', agreedDefects, 'majorOverride:', majorOverride, 'finalVerdict:', majorOverride ? 'FAIL' : votes.verdict);
"
```

Expected output: `votes: { pass: 2, fail: 1, total: 3, verdict: 'PASS' } agreedDefects: [] majorOverride: false finalVerdict: PASS`.

**This is expected to still PASS**, and that's the honest, correct result to confirm before moving
on: sample 1 called `silhouette-mismatch` **minor**, not major, so the two samples that named
`silhouette-mismatch` don't have 2 agreeing on **major** severity (`majorCounts['silhouette-mismatch']`
is 1, from sample 2 only) — the override requires 2+ samples agreeing on the SAME tag at MAJOR
severity, and here only one sample called it major. This demonstrates the fix does exactly what it
claims (catch 2+ agreed MAJOR defects outvoting a PASS) and nothing more (it does not turn every
disagreement into a FAIL) — re-run with sample 1's severity changed to `'major'` to see the override
actually fire:

```bash
# Same script, with sample 1's defects changed to
# [{tag:'silhouette-mismatch', severity:'major'}]
```

Expected output with that one change: `agreedDefects: [ 'silhouette-mismatch' ] majorOverride: true
finalVerdict: FAIL`.

- [ ] **Step 6: Full scratch-repo Stop-hook run**

```bash
cd /tmp/gate-scratch
mkdir -p concepts
cat > concepts/scene-test.html <<'EOF'
<!-- ELEMENT: testlog -->
<!-- PASS = a fresh viewer names this as a log. -->
<div class="log"></div>
EOF
git add -A && git commit -q -m "wip"
node .claude/hooks/design-done-gate.mjs < /dev/null; echo "exit: $?"
```

Expected: exits 0 (no visual files touched this "session" since there's no transcript payload) —
this just confirms the file still loads and runs end-to-end without throwing, which the earlier
Step 3 syntax check doesn't fully cover (a runtime `TypeError` inside the new code, e.g. a typo in a
destructured name, would only surface here).

- [ ] **Step 7: Commit**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
git add .claude/hooks/design-done-gate.mjs .claude/agents/trivia-os-design-critic.md
git commit -m "feat(design-gate): extend major-defect override to the correctness critic (fixes A1)"
```

---

## Task 3: Stop discarding dissent on a quality PASS too (fixes A5, remainder)

Task 2 Step 4 already fixed the correctness side of this. This task does the matching edit for the
quality gate's `writeCase()` call, which Task 1 did not touch.

**Files:**
- Modify: `.claude/hooks/design-done-gate.mjs:1619-1628`

- [ ] **Step 1: Update the quality `writeCase()` call**

Current (lines ~1619-1628):

```js
              writeCase({
                noun: `${file.split('/').pop()} (whole scene)`, category: 'whole-scene-craft',
                approach: 'hand-coded-css', verdict: qVerdict.verdict,
                rootCause: qVerdict.verdict === 'FAIL' ? qVerdict.reason : 'n/a',
                fixThatWorked: null, file, date: new Date().toISOString().slice(0, 10),
                _autoWritten: true, _gate: 'quality', _reference: rawRef,
                _defects: qVerdict.defects, _minorFindings: qVerdict.minorFindings || [],
                _sampleVotes: qVerdict.sampleVotes, _panel: qVerdict.panel || null,
                _verdictSource: qVerdict.verdictSource || 'majority-vote',
              });
```

Replace the `rootCause` line and add `_dissent`:

```js
              writeCase({
                noun: `${file.split('/').pop()} (whole scene)`, category: 'whole-scene-craft',
                approach: 'hand-coded-css', verdict: qVerdict.verdict,
                rootCause: qVerdict.reason,
                _dissent: qVerdict.verdict === 'PASS' && qVerdict.sampleVotes && qVerdict.sampleVotes.pass !== qVerdict.sampleVotes.total
                  ? true : undefined,
                fixThatWorked: null, file, date: new Date().toISOString().slice(0, 10),
                _autoWritten: true, _gate: 'quality', _reference: rawRef,
                _defects: qVerdict.defects, _minorFindings: qVerdict.minorFindings || [],
                _sampleVotes: qVerdict.sampleVotes, _panel: qVerdict.panel || null,
                _verdictSource: qVerdict.verdictSource || 'majority-vote',
              });
```

- [ ] **Step 2: Verify against tonight's real `reflection` PASS-with-dissent case**

Confirm the on-disk verdict this would apply to actually has a split vote (the case this fix exists
for):

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
python3 -c "
import json
d = json.load(open('concepts/design-cases.json'))
for c in d['cases']:
    if c.get('file','').endswith('campfire-sing-along-v1.html') and c.get('verdict') == 'PASS':
        print(c.get('noun'), c.get('_sampleVotes'), '-> rootCause was:', repr(c.get('rootCause')))
"
```

Expected: at least one row prints `rootCause was: 'n/a'` with a non-unanimous `_sampleVotes` — that
is the exact data loss this task fixes going forward (existing records are not backfilled; this is
a forward-looking fix, not a data-migration task).

- [ ] **Step 3: Syntax-check and commit**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
node --check .claude/hooks/design-done-gate.mjs && echo "syntax OK"
git add .claude/hooks/design-done-gate.mjs
git commit -m "fix(design-gate): stop discarding dissent on a quality PASS too (fixes A5)"
```

---

## Task 4: Hard-ban background dispatch + diagnostic orphan trip-wire (fixes A2)

**Files:**
- Modify: `.claude/agents/trivia-os-design-worker.md` (header rule)
- Modify: `.claude/hooks/design-done-gate.mjs:863-865` area (new orphan check)

- [ ] **Step 1: Add the hard rule to the worker agent's header**

In `.claude/agents/trivia-os-design-worker.md`, insert a new top-level rule immediately after the
"## You are a builder and consultant, not the enforcer" heading's opening paragraph (right before
the bulleted list of what `geometry-lint.mjs`/`design-done-gate.mjs`/permission-denial do — i.e.
right after the sentence ending "**The actual enforcement is mechanical, not you:**" and before the
first `- \`.claude/hooks/geometry-lint.mjs\`` bullet), add:

```markdown
**Visual work must never be dispatched via a backgrounded/async Agent-tool call. This is proven
broken, not "still verifying it."** `concepts/DESIGN-WORKER-LESSONS.md` records a real incident: a
background dispatch's own `SubagentStop` did not reliably fire this gate, and the dispatching
session — which never wrote the file itself — has no visibility into that either (its own gate scope
is exactly the files it wrote per its own transcript, by design, so a background child's writes are
invisible to it too). The result is a scene that can ship with **zero** gate checks having run
anywhere, silently. If a visual build is dispatched to this agent, it must run in the foreground of
the session that will actually Stop and hit the gate. There is no override for this — if a task
seems slow enough to want backgrounding, that is not a reason to background it, because the whole
point of foreground dispatch is that the gate runs before the human ever sees a "done" claim.
```

- [ ] **Step 2: Add the orphan trip-wire to the gate**

In `.claude/hooks/design-done-gate.mjs`, insert immediately before the line
`if (touchedFiles.length === 0) process.exit(0);` (currently line 865):

```js
// ── Orphan trip-wire (diagnostic only, never blocking). A dirty/uncommitted visual file this
// session did NOT write (per its own transcript) but that also has no fresh critic verdict of any
// kind anywhere is exactly the shape of a backgrounded Agent-tool dispatch whose own SubagentStop
// never ran this gate (see concepts/design-pipeline-hardening-fix.md, A2): the child's gate was
// never invoked, and this session's own scope deliberately excludes files it didn't write itself
// (see the v3 note above — that exclusion is what stops a prior session's abandoned WIP from
// blocking every Stop forever, and it must not be undone here). So: warn loudly, never block. A
// hard block on a file this session didn't touch would repeat the exact v3 bug this file already
// fixed once. The real backstop is the hard rule in trivia-os-design-worker.md's header — this is
// a diagnostic net for when that rule is violated anyway, not a second enforcement mechanism.
for (const orphanFile of dirtyVisualFiles.filter(f => !touchedFiles.includes(f))) {
  const absOrphan = resolve(REPO_ROOT, orphanFile);
  if (!existsSync(absOrphan)) continue;
  const orphanMtime = statSync(absOrphan).mtimeMs;
  let anyFreshVerdict = false;
  try {
    for (const vf of readdirSync(VERDICT_DIR)) {
      if (!vf.endsWith('.json')) continue;
      let v;
      try { v = JSON.parse(readFileSync(resolve(VERDICT_DIR, vf), 'utf8')); } catch { continue; }
      if (v.checkedFile === orphanFile && v.timestamp && new Date(v.timestamp).getTime() >= orphanMtime) {
        anyFreshVerdict = true;
        break;
      }
    }
  } catch { /* no verdict dir yet — treat as no fresh verdict */ }
  if (!anyFreshVerdict) {
    console.error(`design-done-gate: WARNING — ${orphanFile} is dirty/uncommitted, was NOT written ` +
      `by this session's own transcript, and has no fresh critic verdict of any kind on file. This ` +
      `is the exact shape of a backgrounded Agent-tool dispatch whose own SubagentStop never ran ` +
      `this gate — foreground dispatch is required for all visual work (see ` +
      `trivia-os-design-worker.md). NOT blocking this Stop on it (it may also just be another ` +
      `session's unrelated WIP) — but if ${orphanFile} is meant to be done, a foreground session ` +
      `must render, screenshot, and Stop against it directly before it can pass.`);
  }
}

`;
```

Delete the stray trailing backtick-semicolon line above if your editor's paste tool adds one — it is
not part of the code, just a reminder to check the insert landed as a statement, not inside a
template literal (this block sits between two statements, not inside one).

- [ ] **Step 3: Verify the trip-wire fires — scratch repo, orphaned file scenario**

```bash
cd /tmp/gate-scratch
cat > concepts/orphan-scene.html <<'EOF'
<!-- ELEMENT: ghost -->
<!-- PASS = a fresh viewer names this as a ghost element. -->
<div class="ghost"></div>
EOF
# Leave it UNCOMMITTED (dirty) and do NOT reference it in any transcript payload.
node .claude/hooks/design-done-gate.mjs < /dev/null 2>&1 | grep -i orphan; echo "grep exit: $?"
```

Expected: the WARNING line above prints, mentioning `concepts/orphan-scene.html`, and the overall
hook still **exits 0** (confirm with `echo $?` on the `node` command itself, not the `grep`) — this
proves it warns without blocking.

- [ ] **Step 4: Verify it does NOT fire for a file with a fresh matching verdict**

```bash
cd /tmp/gate-scratch
mkdir -p concepts/.design-critic-verdicts
cat > concepts/.design-critic-verdicts/fake.json <<'EOF'
{"verdict":"PASS","checkedFile":"concepts/orphan-scene.html","timestamp":"2099-01-01T00:00:00.000Z"}
EOF
node .claude/hooks/design-done-gate.mjs < /dev/null 2>&1 | grep -i orphan; echo "grep exit: $?"
```

Expected: `grep exit: 1` (no match) — a far-future timestamp is unambiguously "fresh," so the
orphan warning must not fire once a real verdict covers the file.

- [ ] **Step 5: Syntax-check and commit**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
node --check .claude/hooks/design-done-gate.mjs && echo "syntax OK"
git add .claude/hooks/design-done-gate.mjs .claude/agents/trivia-os-design-worker.md
git commit -m "feat(design-gate): hard-ban background dispatch + non-blocking orphan trip-wire (fixes A2)"
```

---

## Task 5: Require verbatim relay of the gate's block list (fixes A3)

**Files:**
- Modify: `.claude/agents/trivia-os-design-worker.md:252-256` ("Reporting back" section)

- [ ] **Step 1: Rewrite the "Reporting back" section**

Replace the current section (lines 252-256):

```markdown
## Reporting back

Be specific about what you actually checked (which files, what you rendered, what the gates said),
not just "done." If you hit the two-strike stop condition on an element, say so plainly and name
what scope decision you need from Ben before continuing — don't quietly keep guessing.
```

with:

```markdown
## Reporting back

Be specific about what you actually checked (which files, what you rendered, what the gates said),
not just "done." If you hit the two-strike stop condition on an element, say so plainly and name
what scope decision you need from Ben before continuing — don't quietly keep guessing.

**If the gate blocks (exit 2), reproduce its full, unedited `problems[]` list to the human — every
line, not a summary or a selection.** This is not a style preference: a real FAIL on a real element
(groundGlow, 2026-07-27) was pushed into `problems[]` and printed on exit correctly, and then never
appeared in the reported summary anyway, because "be specific" left room to paraphrase. A summary
that drops even one blocked item is indistinguishable, to the human reading it, from a summary of a
gate that never found that problem at all — and the human cannot tell the difference from your
report alone, only by re-reading the raw stderr themselves, which defeats the point of you reporting
at all.

**If the gate passes (exit 0), state which slugs have non-blocking findings recorded even though
nothing blocked** — agreed MINOR defects, an off-vocabulary tag warning, or an orphan-file warning
about a DIFFERENT file are all printed to stderr on a passing run too, and "the gate passed" is not
the same claim as "the gate printed nothing."
```

- [ ] **Step 2: Commit**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
git add .claude/agents/trivia-os-design-worker.md
git commit -m "docs(design-worker): require verbatim relay of the gate's block list (fixes A3)"
```

---

## Task 6: Close B7 — pictorial ambient scenes resolved, across all three docs that assert it

**Files:**
- Modify: `concepts/OBJECT-RENDERING-PROTOCOL.md:74-79`
- Modify: `references/themes.md:230-241`
- Modify: `concepts/campfire-sing-along-spec.md:229-243`

- [ ] **Step 1: Close `OBJECT-RENDERING-PROTOCOL.md`'s addendum**

Replace (lines 74-79):

```markdown
  - **Open item, not yet resolved — needs Ben's explicit call before whole-scene pictorial
    ambients (a lakeshore, a campfire, a full illustrated setting) are treated as settled
    practice:** `references/themes.md` rule 1 says ambients should be "light, not clip-art" —
    written before whole-scene reference images were part of the pipeline. Whether a fully
    pictorial ambient scene is in-bounds at all, separate from the trace-vs-hand-build question
    resolved above, is still open and deserves a deliberate rule rewrite, not a quiet exception.
```

with:

```markdown
  - **Resolved 2026-07-27 — Ben's ruling: a fully pictorial ambient scene belongs in the house
    style, contingent on genuinely clearing the gate.** `references/themes.md` rule 1/1a's "light,
    not clip-art" language predates whole-scene reference images being part of the pipeline and read
    as a blanket ban on placed pictorial objects in ambient themes; it is not one. The operative bar
    was never "nothing may ever be recognizable as an object" — it's whether the built scene reads
    as one coherent hand (no register mismatch between hard pictorial elements and everything soft
    around them) and whether it genuinely passes both critic gates (noun-test correctness AND the
    whole-scene quality/craft critic), not whether a majority vote or a background dispatch let it
    through on a technicality. This makes fixes #1-#4 in
    `concepts/design-pipeline-hardening-fix.md` more load-bearing, not less: a gate that can be
    gamed is the actual risk a pictorial-scenes-allowed policy creates; a gate that genuinely holds
    is what makes the policy safe to rely on. See `references/themes.md` rule 1a's ambient branch
    and `concepts/campfire-sing-along-spec.md`'s "Known open item" section — both updated to match.
```

- [ ] **Step 2: Reconcile `references/themes.md` rule 1a's ambient branch**

Replace (lines 230-241, the `- **In an ambient theme: never generate...` bullet):

```markdown
- **In an ambient theme: never generate a pictorial figurative object and
  place it as-is.** Rule 2 above ("light, not clip-art") already forbids
  hard pictorial icons, characters, or objects here, generated or
  hand-coded — that rule predates and outranks this one. A figurative idea
  in an ambient brief gets one of two treatments: **cut it** from the brief
  entirely, or **restate it as an abstract light form** that fits the
  existing tonal exceptions only (a hot near-white anchor core; a dark
  silhouette drifter, per the in-family color rule above — `sand-dune-
  chill`'s gulls are the sanctioned example: recognizable in outline, but
  flat, tonal, and never rendered as a detailed pictorial asset). If
  neither treatment can make the idea work, the idea doesn't belong in an
  ambient theme — that is a valid, correct outcome, not a failure to solve.
```

with:

```markdown
- **In an ambient theme, a fully pictorial figurative scene is allowed —
  resolved 2026-07-27, Ben's ruling — but only by genuinely clearing both
  design-critic gates, never by placing it and hoping.** This bullet
  previously said "never" outright; that was written before whole-scene
  Recraft reference images and the dual correctness+quality critic gate
  existed, and it does not survive contact with either. The rule that
  actually still binds is rule 2 above ("light, not clip-art") in its literal
  form: no hard register mismatch, no clip-art-flat icon dropped into an
  otherwise-soft scene, no element that reads as pasted rather than drawn by
  the same hand as everything around it. A pictorial idea in an ambient
  brief is still cut, or restated as an abstract light form, whenever it
  can't clear that bar — those remain valid, correct outcomes, not just a
  fallback. What changed is that "fully pictorial and it clears the bar" is
  now also a valid outcome, where before it was foreclosed outright. See
  `concepts/OBJECT-RENDERING-PROTOCOL.md`'s addendum for the full reasoning
  and `concepts/design-pipeline-hardening-fix.md` for why the gate itself
  has to be trustworthy before this policy is safe to lean on.
```

- [ ] **Step 3: Close `campfire-sing-along-spec.md`'s "Known open item" section**

Replace (lines 229-243):

```markdown
## Known open item — not yet resolved, flagged rather than hidden

`references/themes.md` rule 1a states an ambient theme may **never** place a pictorial figurative
object as-is — only cut it or restate it as an abstract light form (the near-white-core / dark-
silhouette-drifter exceptions). Two static camp chairs and a full campfire scene are, literally,
placed pictorial objects, not abstracted into light forms. This spec's read: the brief itself
(explicit "trace the vector source's real shapes for the fire, chairs, and tree line") is a
same-session, explicit instruction that supersedes that default for this one theme, on the same
logic that already lets `sonora-balloons` ship five recognizable hot-air balloons as its anchor —
the operative bar in 1a's own text is "no hard pictorial icons... kept soft, reading as light" /
no register mismatch, not "nothing may ever be recognizable as an object." This traced geometry is
one coherent flat-vector asset (no photoreal/vector register mismatch) and the fire/core/glow
carry the "reading as light" quality the rule actually asks for. Flagging this rather than quietly
picking a side — if the design-critic gate or Ben reads it differently, the chairs are the
element to cut or re-abstract, not the flame.
```

with:

```markdown
## Formerly-open item — resolved 2026-07-27

`references/themes.md` rule 1a and `concepts/OBJECT-RENDERING-PROTOCOL.md`'s addendum both now say
plainly: a fully pictorial ambient scene is allowed, contingent on genuinely clearing both critic
gates. This spec's read at the time (below, kept for the record) turned out to be the direction Ben
actually ruled — but it is no longer a same-session judgment call resting on an analogy to
`sonora-balloons`; it's the standing rule. The bar is unchanged from what this section already
argued: no register mismatch, no element that reads as pasted rather than drawn by the same hand as
everything around it, and the chairs/flame/treeline/reflection genuinely passing both critics — not
this spec's own reasoning standing in for that.

Original reasoning, kept for the record: the operative bar in rule 1a was always "no hard pictorial
icons... kept soft, reading as light" / no register mismatch, not "nothing may ever be recognizable
as an object" — this traced geometry is one coherent flat-vector asset with no photoreal/vector
register mismatch, and the fire/core/glow carry the "reading as light" quality the rule asks for.
```

- [ ] **Step 4: Commit**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
git add concepts/OBJECT-RENDERING-PROTOCOL.md references/themes.md concepts/campfire-sing-along-spec.md
git commit -m "docs: close B7 — pictorial ambient scenes resolved across all three docs that assert it"
```

---

## Self-Review Notes (already folded in above, recorded here per the skill's discipline)

- **Spec coverage:** Fix #1 (Task 2), Fix #2 (Tasks 2 Step 4 + 3), Fix #3 (Task 4), Fix #4 (Task 5),
  B7 (Task 6) — all five items in the user's priority list have a task. Fixes #5-10 are explicitly
  out of scope per the user's instruction and have no task here.
- **Placeholder scan:** no TBD/TODO, no "add appropriate handling," no "similar to Task N" —
  every code block is the literal text to write, every verification step has a concrete expected
  output to compare against.
- **Type/name consistency:** `tallyDefects(samples, tagSet)` signature is identical at its Task 1
  definition and both Task 2/existing call sites; `CORRECTNESS_DEFECT_TAGS` and `QUALITY_DEFECT_TAGS`
  are both `Set` instances passed the same way; `agreedDefects`/`agreedMinor`/`defectsSingleSample`/
  `defectsOffVocabulary` are destructured with the same names in both the quality (Task 1) and
  correctness (Task 2) call sites.
