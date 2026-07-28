# Design-Gate Hardening — Fixes #5-10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining structural gaps named in `concepts/design-pipeline-hardening-fix.md` (B1-B6), now that fixes #1-4 + B7 are merged. Fix #5 (Bash write-protection on the gate's protected stores) is the highest-priority item — every other protection in this gate is defeatable via plain Bash today — and must land and be independently verified before the rest, even though the remaining fixes are implemented in the same pass.

**Architecture:** Fix #5 is a NEW `PreToolUse` hook (`.claude/hooks/protect-json-stores.mjs`) plus a `.claude/settings.json` narrowing — a mechanical layer independent of and stronger than the existing allow/deny permission lists. Fix #6 splits into two genuinely different mechanisms (see the deviation note below) rather than the single "content-hash" mechanism the doc originally proposed. Fixes #7-10 are smaller, mostly mechanical or prose-only changes inside the already-existing `.claude/hooks/design-done-gate.mjs` and the two critic/worker agent files. No changes to `concepts/campfire-sing-along-v1.html`.

**Tech Stack:** Plain Node.js, no new dependencies (uses `node:crypto`'s built-in `createHash` for fix #6's verdict-hash half). Same scratch-repo + `node --check` verification convention established for this file — no formal test runner exists for it.

**Deviation from the source doc, confirmed correct before writing this plan:** Fix #6 ("content-hash freshness, not just mtime") is split into two different mechanisms because a single hash-sidecar scheme for screenshots would not actually add security — the agent could compute `sha256(scene-file)` itself and write a matching sidecar entry without ever re-rendering, which is the exact same forgery B2 already describes, just moved one layer over. Only mechanisms where the hash is computed *and stored* by the gate itself (never by an agent-invoked step) are genuinely forgery-resistant. So:
- **Verdict freshness → content-hash** (Task 2): the gate already reads the scene file's content into memory and writes the verdict JSON itself — storing a hash there and comparing against it is airtight once Fix #5 makes the verdict JSON un-Bash-writable.
- **Screenshot freshness → extend Fix #5's write-protection to block `touch`/`utimes`-style mtime tampering on `concepts/.audit-shots/`** (done inside Task 1) — this blocks the literal, demonstrated B2 attack directly instead of replacing one forgeable signal with an equally-forgeable one.

---

## File Structure

- **Create `.claude/hooks/protect-json-stores.mjs`**: new `PreToolUse` hook on `Bash`, blocking write-shaped commands targeting the gate's protected stores.
- **Modify `.claude/settings.json`**: narrow both unscoped `cd`-wildcard `Bash` allow entries; wire the new `PreToolUse` hook.
- **Modify `.claude/hooks/design-done-gate.mjs`**:
  - Add `sceneFileHash` to both verdict objects (correctness + quality) and switch their freshness checks from mtime-ordering to hash-equality (Task 2).
  - Make the per-element pass-criterion proximity check blocking instead of warn-only (Task 3).
  - Add a shared `auditLog()` helper, called at every write site for the three protected stores (Task 6).
- **Create `concepts/tools/sweep-stale-design-entries.mjs`**: standalone, human-run report script (Task 6).
- **Modify `.claude/agents/trivia-os-design-worker.md`**: add the repeat-failure reconciliation rule (Task 4).
- **Modify `.claude/agents/trivia-os-design-critic.md`** and **`.claude/agents/trivia-os-design-quality-critic.md`**: add adversarial self-check framing (Task 5).

---

## Task 1 (HIGHEST PRIORITY — land and verify before continuing): Bash write-protection on the protected stores (fixes B1, half of B2)

**Files:**
- Create: `.claude/hooks/protect-json-stores.mjs`
- Modify: `.claude/settings.json`

- [ ] **Step 1: Write the PreToolUse hook script**

Create `.claude/hooks/protect-json-stores.mjs`:

```js
#!/usr/bin/env node
// .claude/hooks/protect-json-stores.mjs
//
// PreToolUse guard on Bash. Fixes B1 (and the screenshot half of B2) from
// concepts/design-pipeline-hardening-fix.md: the Write/Edit deny list on the
// gate's protected stores only blocks the Write/Edit TOOLS — Bash was always
// wide open (unscoped Bash(rm *), Bash(mv *), Bash(node *), Bash(cd *), and
// an unscoped Bash(cd /Users/.../trivia-os && *) that permits literally any
// command whatsoever once cd-prefixed). This hook is the actual enforcement:
// it inspects the Bash command string itself, independent of what
// settings.json's allow list already granted, and blocks (exit 2) any
// write-shaped access to the paths below — regardless of how permissive the
// allow list is or ever becomes.
//
// TWO PROTECTION TIERS, not one, because the two path classes need genuinely
// different treatment:
//
//   JSON_STORE_PATHS — concepts/.design-attempt-counts.json,
//   concepts/design-cases.json, concepts/.design-critic-verdicts/, and
//   concepts/.design-gate-audit.log (the audit trail added in a later pass of
//   this same plan — included here now so this file doesn't need a second
//   edit when that lands). These are GATE-OWNED: only design-done-gate.mjs's
//   own writeFileSync/appendFileSync calls may ever touch them. Every write
//   verb is blocked here — rm, mv, cp/install (destination), tee, sed -i,
//   redirection, touch, and an eval-flag interpreter invocation (node -e,
//   python3 -c, etc.) whose inline script text mentions the path.
//
//   SHOTS_DIR — concepts/.audit-shots/. This one is NOT gate-owned — the
//   worker legitimately writes, renames, and copies real screenshots there
//   constantly (that's the whole point of the directory), so blocking every
//   write verb here would break the intended workflow (e.g. `cp
//   .audit-shots/bundle/shot-t001-flame.png
//   .audit-shots/concepts_x.html__flame.png`, the documented convention for
//   getting a real capture into its slug-named final path). What must be
//   blocked here is narrower and specific to B2's actual attack: forging an
//   EXISTING file's mtime without re-rendering — `touch`/`touch -d`, or an
//   eval-flag interpreter call whose inline script mentions
//   utimes/utimesSync. Ordinary rm/mv/cp/tee/sed-i against this directory are
//   NOT blocked; they are the legitimate way screenshots get into place.
//
// Segment-parsing (split on &&, ||, ;, |, newlines) mirrors
// design-done-gate.mjs's own BASH_SEGMENT_SPLIT_RE/BASH_STRONG_*/BASH_WEAK_*
// convention exactly, for the reason that file's v9 changelog entry #1
// documents at length: a per-command (not per-segment) check leaks past
// compound commands, which is how agents actually write Bash. Not importing
// those constants directly — design-done-gate.mjs runs top-level code on
// import (it is a script, not a module: it reads stdin and executes
// immediately), so importing it here would run its entire Stop-hook body as
// a side effect of loading this file. Duplicated below deliberately; it is a
// handful of small regexes, and correctness here matters more than avoiding
// a few duplicate lines.
//
// Exit 0 = allow. Exit 2 = block. (Exit-code semantics confirmed in
// concepts/design-worker-p0-p2-plan.md's research note #2: exit 1 is
// non-blocking, exit 2 blocks.) Fails toward blocking: any error reading or
// parsing the PreToolUse payload is treated as "cannot prove this command is
// safe" and blocks, matching design-done-gate.mjs's own stated fail-toward-
// blocking discipline rather than failing open.

import { readFileSync } from 'node:fs';

function readStdinJson() {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return null; }
}

const SEGMENT_SPLIT_RE = /&&|\|\||[;|\n]/;

const JSON_STORE_PATH_RE = /concepts\/\.design-attempt-counts\.json|concepts\/design-cases\.json|concepts\/\.design-critic-verdicts\/|concepts\/\.design-gate-audit\.log/;
const SHOTS_DIR_RE = /concepts\/\.audit-shots\//;

const WHOLE_SEGMENT_WRITE_RE = /\brm\b|\bmv\b|\btouch\b|\bsed\s+-i\b|\btee\b/;
const ANCHORED_WRITE_RE = /(?:>>?\s*|\bcp\s+\S+\s+|\binstall\s+(?:-\S+\s+)*\S+\s+)(['"]?)([\w./-]+)\1/g;
const INTERPRETER_RE = /\b(?:node|python3?|deno|bun|perl|ruby)\b/;
const EVAL_FLAG_RE = /(?:^|\s)(?:-e|--eval|-p|--print|-c)(?:\s|$)/;
const MTIME_TAMPER_HINT_RE = /\butimes(?:Sync)?\b/; // node fs.utimesSync / fs.promises.utimes

// Full write-protection for the three gate-owned JSON stores + audit log.
function segmentTamperesWithJsonStore(seg) {
  if (WHOLE_SEGMENT_WRITE_RE.test(seg) && JSON_STORE_PATH_RE.test(seg)) return true;
  for (const m of seg.matchAll(ANCHORED_WRITE_RE)) {
    if (JSON_STORE_PATH_RE.test(m[2])) return true;
  }
  if (INTERPRETER_RE.test(seg) && EVAL_FLAG_RE.test(seg) && JSON_STORE_PATH_RE.test(seg)) return true;
  return false;
}

// Narrower mtime-forgery-only protection for the screenshots directory.
function segmentForgesShotMtime(seg) {
  if (/\btouch\b/.test(seg) && SHOTS_DIR_RE.test(seg)) return true;
  if (INTERPRETER_RE.test(seg) && EVAL_FLAG_RE.test(seg) && MTIME_TAMPER_HINT_RE.test(seg) && SHOTS_DIR_RE.test(seg)) return true;
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

for (const seg of command.split(SEGMENT_SPLIT_RE)) {
  if (segmentTamperesWithJsonStore(seg)) {
    console.error(`protect-json-stores: BLOCKED — this Bash segment writes (or could write) to a ` +
      `gate-owned store: "${seg.trim()}". concepts/.design-attempt-counts.json, ` +
      `concepts/design-cases.json, concepts/.design-critic-verdicts/, and ` +
      `concepts/.design-gate-audit.log are written ONLY by design-done-gate.mjs itself — no Bash ` +
      `command may touch them (rm, mv, cp/install as destination, tee, sed -i, redirection, touch, ` +
      `or an inline eval mentioning the path are all blocked here, regardless of what settings.json's ` +
      `allow list otherwise permits). Reads (cat, grep, python3 -c "json.load(...)") are unaffected. ` +
      `If you need to change one of these files, stop and ask Ben — do not route around this.`);
    process.exit(2);
  }
  if (segmentForgesShotMtime(seg)) {
    console.error(`protect-json-stores: BLOCKED — this Bash segment forges a screenshot's mtime instead ` +
      `of re-rendering: "${seg.trim()}". concepts/.audit-shots/ is normally writable (copying/renaming a ` +
      `real capture into its slug-named path is the documented workflow) — what is blocked specifically ` +
      `is touch/touch -d and an inline eval using fs.utimesSync, which fake freshness without a real ` +
      `render. Re-capture the screenshot for real instead.`);
    process.exit(2);
  }
}
process.exit(0);
```

- [ ] **Step 2: Narrow both unscoped `cd`-wildcard entries in `.claude/settings.json`**

The current `allow` array (verify it still matches before editing — a prior task's edits didn't touch this file, but re-check) contains, among others:

```json
      "Bash(cd *)",
      "Bash(echo *)",
      "Bash(rm *)",
      "Bash(cat *)",
      "Bash(mv *)",
      "Bash(gh *)",
      "Bash(cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && *)",
```

Note there are actually TWO unscoped `cd` wildcards here, not just the one the audit doc quoted — `"Bash(cd *)"` (matches ANY command starting with `cd `, not even scoped to this repo) is if anything a *broader* hole than the trivia-os-scoped one, and needs the same fix. Replace those two lines with cd-prefixed mirrors of every command already independently trusted in this same list (this preserves the CLAUDE.md-mandated "always cd into the project dir first" workflow for the exact command set already allowed, without also blanket-permitting entirely unlisted commands like `tee`/`sed -i`/heredocs the moment they're cd-prefixed):

```json
      "Bash(cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && git *)",
      "Bash(cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && node *)",
      "Bash(cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && npm *)",
      "Bash(cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && echo *)",
      "Bash(cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && rm *)",
      "Bash(cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && cat *)",
      "Bash(cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && mv *)",
      "Bash(cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && gh *)",
      "Bash(cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && ./concepts/tools/*)",
```

Leave the other entries (`"Bash(./concepts/tools/*)"`, `"Bash(git *)"`, `"Bash(node *)"`, `"Bash(npm *)"`, `"Bash(echo *)"`, `"Bash(rm *)"`, `"Bash(cat *)"`, `"Bash(mv *)"`, `"Bash(gh *)"`) exactly as they are — this narrowing is defense-in-depth on top of the PreToolUse hook (Step 1), which is the real enforcement layer and works regardless of how broad these entries are.

- [ ] **Step 3: Wire the new hook into `.claude/settings.json`**

The `hooks` object currently has `PostToolUse`, `Stop`, and `SubagentStop` keys but no `PreToolUse`. Add one:

```json
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/protect-json-stores.mjs" }
        ]
      }
    ],
```

Add it as a new top-level key inside `"hooks": { ... }`, alongside the existing three (order doesn't matter; put it first for readability, matching the natural PreToolUse → PostToolUse → Stop lifecycle order).

- [ ] **Step 4: Syntax-check**

```bash
node --check .claude/hooks/protect-json-stores.mjs && echo "syntax OK"
python3 -c "import json; json.load(open('.claude/settings.json')); print('settings.json valid JSON')"
```

- [ ] **Step 5: Verify — scratch repo, attack commands must ALL block**

```bash
rm -rf /tmp/protect-scratch && mkdir -p /tmp/protect-scratch/.claude/hooks /tmp/protect-scratch/concepts/.audit-shots /tmp/protect-scratch/concepts/.design-critic-verdicts
cp .claude/hooks/protect-json-stores.mjs /tmp/protect-scratch/.claude/hooks/
cd /tmp/protect-scratch

test_block() {
  local desc="$1" cmd="$2"
  echo "$cmd" | node -e "
    const cmd = require('fs').readFileSync(0,'utf8').trim();
    process.stdout.write(JSON.stringify({tool_name:'Bash', tool_input:{command: cmd}}));
  " | node .claude/hooks/protect-json-stores.mjs >/dev/null 2>/tmp/protect-scratch/err.txt
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

# Attacks against the three JSON stores — all must exit 2 (BLOCK)
test_block "rm attempt-counts"       'rm concepts/.design-attempt-counts.json'
test_block "rm verdict dir"          'rm -rf concepts/.design-critic-verdicts'
test_block "redirect into cases"     'echo "{}" > concepts/design-cases.json'
test_block "tee into verdict"        'echo "{\"verdict\":\"PASS\"}" | tee concepts/.design-critic-verdicts/fake.json'
test_block "sed -i on counts"        "sed -i 's/2/0/' concepts/.design-attempt-counts.json"
test_block "mv counts away"          'mv concepts/.design-attempt-counts.json /tmp/stolen.json'
test_block "cp into cases"           'cp /tmp/fake.json concepts/design-cases.json'
test_block "node -e writing verdict" "node -e \"require('fs').writeFileSync('concepts/.design-critic-verdicts/fake.json','{}')\""
test_block "compound: cd then rm"    'cd /tmp/protect-scratch && rm concepts/.design-attempt-counts.json'
test_block "compound segment 2 only" 'echo hi && rm concepts/.design-attempt-counts.json'

# Mtime forgery against screenshots — must exit 2 (BLOCK)
test_block "touch -d on shot"        'touch -d "2099-01-01" concepts/.audit-shots/foo.png'
test_block "node -e utimesSync"      "node -e \"require('fs').utimesSync('concepts/.audit-shots/foo.png', new Date(), new Date('2099-01-01'))\""

# Legitimate operations — all must exit 0 (ALLOW)
test_allow "git status"              'git status'
test_allow "cat cases (read)"        'cat concepts/design-cases.json'
test_allow "grep verdict dir (read)" 'grep -r PASS concepts/.design-critic-verdicts/'
test_allow "cp shot into place"      'cp concepts/.audit-shots/bundle/shot.png concepts/.audit-shots/myshot.png'
test_allow "mv shot rename"          'mv concepts/.audit-shots/tmp.png concepts/.audit-shots/final.png'
test_allow "rm a shot"               'rm concepts/.audit-shots/old-shot.png'
test_allow "normal node render"      'node concepts/tools/visual-audit.mjs concepts/scene.html'
test_allow "git add + commit"        'git add concepts/design-cases.json && git commit -m wip'
test_allow "unrelated echo"          'echo hello world'
```

Report the FULL output of this script — every line must say PASS. If any says FAIL, do not proceed to Step 6; fix the regex and re-run.

- [ ] **Step 6: Commit**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
git add .claude/hooks/protect-json-stores.mjs .claude/settings.json
git commit -m "feat(design-gate): PreToolUse Bash guard on protected stores + narrow cd-wildcard allow entries (fixes B1, screenshot half of B2)"
```

**This task must be independently verified working (Step 5, all PASS) before starting Task 2.** The rest of this plan's fixes assume Bash write-protection is real.

---

## Task 2: Verdict freshness by content-hash (fixes the verdict half of B2)

**Files:**
- Modify: `.claude/hooks/design-done-gate.mjs` (import, correctness verdict object + freshness check, quality verdict object + freshness check)

- [ ] **Step 1: Add the `node:crypto` import**

Current import line (near the top of the file):

```js
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync } from 'node:fs';
```

Add a new import line directly after it:

```js
import { createHash } from 'node:crypto';
```

- [ ] **Step 2: Add a small hash helper next to `slugify`**

Find `function slugify(s) { return s.replace(/[^a-zA-Z0-9._-]/g, '_'); }` and add directly after it:

```js
// Content hash of the scene file, computed by the GATE itself from bytes
// already read into memory — never by an agent-invoked step. This is what
// makes verdict freshness genuinely forgery-resistant (fixes the verdict
// half of B2): mtime comparison can be defeated by backdating the SCENE
// FILE's own mtime (touch -d on the .html file, which is not one of the
// paths protect-json-stores.mjs restricts), making a stale cached verdict
// look erroneously "fresh" relative to it. A hash of the actual bytes cannot
// be fooled by any mtime trick on either side of the comparison.
function sceneHash(codeText) { return createHash('sha256').update(codeText).digest('hex'); }
```

- [ ] **Step 3: Store the hash in the correctness verdict, and switch its freshness check to hash-equality**

Find `const parsed = {` (in the correctness verdict-construction block) and add `sceneFileHash: sceneHash(codeText),` as a new field, e.g. right after `checkedFile: file,`:

```js
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
        sceneFileHash: sceneHash(codeText),
        timestamp: new Date().toISOString(),
        sampleVotes: { pass: votes.pass, fail: votes.fail, total: votes.total },
        panel: samples.map(s => s._model || 'default'),
      };
```

Now find the freshness check computed earlier in the same per-slug loop:

```js
    const verdictAge = verdict?.timestamp ? new Date(verdict.timestamp).getTime() : 0;
    const verdictIsFresh = !!verdict && verdict.checkedFile === file && verdictAge > 0 &&
      (Date.now() - verdictAge) < 1000 * 60 * 60 &&
      verdictAge >= statSync(abs).mtimeMs;
```

Replace the last line (the mtime-ordering condition) with a hash-equality condition instead:

```js
    const verdictAge = verdict?.timestamp ? new Date(verdict.timestamp).getTime() : 0;
    // Freshness's third condition used to be "verdict newer than the file's mtime" — forgeable by
    // backdating the SCENE FILE's own mtime (a path this gate does not otherwise restrict). Content-
    // hash equality replaces it: the verdict is about THIS EXACT content, or it isn't, independent of
    // any timestamp on either side. `codeText` is already in memory from this file's own read above.
    const verdictIsFresh = !!verdict && verdict.checkedFile === file && verdictAge > 0 &&
      (Date.now() - verdictAge) < 1000 * 60 * 60 &&
      verdict.sceneFileHash === sceneHash(codeText);
```

- [ ] **Step 4: Same two changes for the quality verdict**

Find the `qVerdict = {` object construction and add `sceneFileHash: sceneHash(codeText),` next to `checkedFile: file, timestamp: new Date().toISOString(),`:

```js
              qVerdict = {
                verdict: majorOverride ? 'FAIL' : votes.verdict,
                verdictSource: majorOverride ? 'agreed-major-defect-override' : 'majority-vote',
                reason: seeing.map((s, i) => `[sample ${i + 1}: ${s.verdict}] ${s.reason || ''}`).join(' '),
                defects: agreedDefects,
                minorFindings: agreedMinor,
                defectsSingleSample,
                defectsOffVocabulary,
                deviations: [...new Set(seeing.flatMap(s => s.deviations || []))],
                checkedFile: file, timestamp: new Date().toISOString(),
                sceneFileHash: sceneHash(codeText),
                sampleVotes: { pass: votes.pass, fail: votes.fail, total: votes.total, droppedBlind: blind },
                panel: seeing.map(s => s._model || 'default'), // see the correctness verdict's note
              };
```

Find the quality freshness check:

```js
          const qAge = qVerdict?.timestamp ? new Date(qVerdict.timestamp).getTime() : 0;
          const qVerdictIsFresh = !!qVerdict && qVerdict.checkedFile === file && qAge > 0 &&
            (Date.now() - qAge) < 1000 * 60 * 60 && qAge >= statSync(abs).mtimeMs;
```

Replace with:

```js
          const qAge = qVerdict?.timestamp ? new Date(qVerdict.timestamp).getTime() : 0;
          // Same hash-based freshness as the correctness verdict — see that check's comment.
          const qVerdictIsFresh = !!qVerdict && qVerdict.checkedFile === file && qAge > 0 &&
            (Date.now() - qAge) < 1000 * 60 * 60 && qVerdict.sceneFileHash === sceneHash(codeText);
```

- [ ] **Step 5: Syntax-check**

```bash
node --check .claude/hooks/design-done-gate.mjs && echo "syntax OK"
```

- [ ] **Step 6: Verify the hash logic in isolation**

```bash
node -e "
const { createHash } = require('node:crypto');
const hash = t => createHash('sha256').update(t).digest('hex');
const a = 'const x = 1;';
const b = 'const x = 1;'; // identical content
const c = 'const x = 2;'; // changed content
console.log('same content, same hash:', hash(a) === hash(b));
console.log('different content, different hash:', hash(a) !== hash(c));
"
```

Expected: both lines print `true`.

Then confirm this closes the actual attack it targets — a stale verdict cannot be reused just by manipulating the SCENE FILE's mtime, because hash equality never looks at mtime at all:

```bash
node -e "
const { createHash } = require('node:crypto');
const hash = t => createHash('sha256').update(t).digest('hex');
// Simulate: verdict was computed against OLD content, file was later edited (NEW content), and an
// attacker backdates the file's own mtime to make the verdict LOOK newer than the edit under the old
// mtime-ordering check. Hash-based freshness must still correctly see this as STALE.
const oldContent = 'const flame = 1;';
const newContent = 'const flame = 2;'; // real edit happened
const verdictSceneFileHash = hash(oldContent); // verdict recorded the OLD hash
const currentHash = hash(newContent); // gate recomputes against CURRENT (new) content
console.log('correctly detected as stale (hash mismatch):', verdictSceneFileHash !== currentHash);
"
```

Expected: `true` — the hash-based check correctly identifies staleness regardless of what any mtime says.

- [ ] **Step 7: Commit**

```bash
git add .claude/hooks/design-done-gate.mjs
git commit -m "feat(design-gate): content-hash verdict freshness, immune to scene-file mtime manipulation (fixes verdict half of B2)"
```

---

## Task 3: Make the per-element pass-criterion proximity check blocking (fixes B3)

**Files:**
- Modify: `.claude/hooks/design-done-gate.mjs`

- [ ] **Step 1: Change the proximity check from a warning to a blocker**

Find (inside the per-slug loop, after the rotation check):

```js
    // 3c. Per-element half of the pass-criterion check. The file-level half
    // ran once, above the loop; this one only asks whether the criterion that
    // exists is anywhere near THIS element's marker. Warning, not a blocker —
    // the gate cannot tell which element a given sentence is about.
    if (elementName && hasCriterionAnywhere) {
      const markerAt = codeText.search(new RegExp(`ELEMENT:\\s*${elementName}(?![A-Za-z0-9_-])`));
      if (markerAt >= 0 && !/PASS\s*=/.test(codeText.slice(Math.max(0, markerAt - 400), markerAt + 1200))) {
        console.error(`design-done-gate: [${slug}] the file has a "PASS =" criterion somewhere, but not within ` +
          `~1200 chars of this element's marker. The critic grades per element; if that distant sentence is ` +
          `about a different element, this one is effectively ungraded and will FAIL for it.`);
      }
    }
```

Replace with (now increments `blockers` and pushes into `problems[]`, mirroring exactly how the screenshot check above it already does):

```js
    // 3c. Per-element half of the pass-criterion check. The file-level half
    // ran once, above the loop; this one asks whether the criterion that
    // exists is anywhere near THIS element's marker. Now BLOCKING, not a
    // warning: the file-level check alone let one "PASS =" sentence anywhere
    // in a multi-element file satisfy every element, so a five-element file
    // needed only one criterion comment total and four elements were
    // effectively ungraded while reading as "compliant." The correctness
    // critic's own instructions already say a criterion-less element should
    // block "just as hard as a visual defect would" — this makes that literal
    // instead of a check that only ever printed a warning nobody was required
    // to act on.
    if (elementName && hasCriterionAnywhere) {
      const markerAt = codeText.search(new RegExp(`ELEMENT:\\s*${elementName}(?![A-Za-z0-9_-])`));
      if (markerAt >= 0 && !/PASS\s*=/.test(codeText.slice(Math.max(0, markerAt - 400), markerAt + 1200))) {
        blockers++;
        problems.push(`${file} [${slug}]: the file has a "PASS =" criterion somewhere, but not within ` +
          `~1200 chars of THIS element's "ELEMENT: ${elementName}" marker. The critic grades per element; a ` +
          `criterion that far away is very likely about a different element, which leaves this one effectively ` +
          `ungraded. Add "PASS = a fresh viewer names this as ___." directly next to this element's marker.`);
      }
    }
```

Note: `blockers` is declared earlier in this same per-slug loop iteration (`let blockers = hasCriterionAnywhere ? 0 : 1;`), and `if (blockers) continue;` runs after this block — incrementing `blockers` here correctly skips the critic spawn for this slug when the proximity check fails, exactly like the screenshot check already does.

- [ ] **Step 2: Syntax-check**

```bash
node --check .claude/hooks/design-done-gate.mjs && echo "syntax OK"
```

- [ ] **Step 3: Verify — scratch repo, distant criterion now blocks**

```bash
rm -rf /tmp/gate-scratch-b3 && mkdir -p /tmp/gate-scratch-b3/.claude/hooks /tmp/gate-scratch-b3/concepts/.audit-shots /tmp/gate-scratch-b3/concepts/.design-critic-verdicts
cd /tmp/gate-scratch-b3 && git init -q
cp /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.claude/hooks/design-done-gate.mjs .claude/hooks/
cp /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.claude/hooks/geometry-lint.mjs .claude/hooks/
git add -A && git commit -q -m baseline
cat > concepts/far-criterion.html <<'EOF'
<!-- PASS = a fresh viewer names this as a totally unrelated element far away. -->
<div>padding padding padding padding padding padding padding padding padding padding
padding padding padding padding padding padding padding padding padding padding
padding padding padding padding padding padding padding padding padding padding
padding padding padding padding padding padding padding padding padding padding
padding padding padding padding padding padding padding padding padding padding
padding padding padding padding padding padding padding padding padding padding</div>
<!-- ELEMENT: lonely -->
<div class="lonely"></div>
EOF
cat > fake-transcript.jsonl <<'EOF2'
{"timestamp":"2026-01-01T00:00:00.000Z","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"concepts/far-criterion.html"}}]}}
EOF2
echo '{"transcript_path":"/tmp/gate-scratch-b3/fake-transcript.jsonl"}' | node .claude/hooks/design-done-gate.mjs 2>&1 | grep -i "effectively ungraded\|BLOCKED"
echo '{"transcript_path":"/tmp/gate-scratch-b3/fake-transcript.jsonl"}' | node .claude/hooks/design-done-gate.mjs > /dev/null 2>/dev/null; echo "exit code: $?"
```

Expected: the grep line prints the new blocking message text, and `exit code: 2` (blocked — previously this would have been exit 0 with only a console.error warning).

- [ ] **Step 4: Commit**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
git add .claude/hooks/design-done-gate.mjs
git commit -m "fix(design-gate): make the per-element pass-criterion proximity check blocking (fixes B3)"
```

---

## Task 4: Force reconciliation before re-attempting a repeat-failure category (fixes A4's remaining half)

**Files:**
- Modify: `.claude/agents/trivia-os-design-worker.md`

- [ ] **Step 1: Add the reconciliation rule**

Find the "## While working" section's bulleted list (which already includes rules like "Classify every element with the noun test..." and "Two-strike rule..."). Add a new bullet:

```markdown
- **Before hand-coding or roto-tracing any element in a category with 2+ prior FAILs anywhere in
  `concepts/design-cases.json`** (check the `category` field — e.g. `organic-contour`, `liquid-
  surface` — across ALL scenes, not just this one), **quote the prior root causes in your build plan
  and state specifically why this attempt addresses the mechanism, not just repeats it.** Treeline and
  reflection have each failed this way multiple times, in multiple scenes, for the same underlying
  reasons named in `DESIGN-WORKER-LESSONS.md` — re-guessing blind on a category with an established
  failure pattern, without first naming what's different about this attempt, is exactly the "same
  mistake, different scene" loop this file exists to stop. This does not mean the category is banned
  (B7 is resolved — pictorial scenes are allowed, contingent on genuinely clearing the gate) — it means
  don't re-attempt it on hope alone.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/agents/trivia-os-design-worker.md
git commit -m "docs(design-worker): require reconciliation before re-attempting a repeat-failure category (fixes A4 remainder)"
```

---

## Task 5: Adversarial framing in critic prompts (mitigates B6)

**Files:**
- Modify: `.claude/agents/trivia-os-design-critic.md`
- Modify: `.claude/agents/trivia-os-design-quality-critic.md`

- [ ] **Step 1: Add the self-check instruction to the correctness critic**

In `.claude/agents/trivia-os-design-critic.md`, find the "**Reason BEFORE you conclude...**" section (the three-part silhouette/box-tell/coherence framework). Add a new paragraph directly after that numbered list, before "Cite roughly WHERE...":

```markdown
**Before concluding PASS, name the single most likely reason a skeptical second reviewer would FAIL
this, then check whether that reason actually holds.** If it does hold, that is your verdict — FAIL,
with that reason. If it genuinely doesn't (you checked and the thing you worried about isn't actually
there), say so and explain why in your reasoning; don't skip this step just because your first
instinct was PASS. This costs nothing extra to run and directly targets the panel's known weak point:
three samples reasoning independently toward "yes, looks fine" make the same mistake far more often
than three samples that each had to argue against their own leaning conclusion first.
```

- [ ] **Step 2: Add the same instruction to the quality critic**

In `.claude/agents/trivia-os-design-quality-critic.md`, find the "**Anti-overfit self-check, run it every time before you conclude:**" paragraph (it already has a self-check convention — add this as a second, distinct self-check right after it, not a replacement):

```markdown
**Second self-check, distinct from the anti-overfit one above: before concluding PASS, name the
single most likely reason a skeptical second reviewer would FAIL this, then check whether that reason
actually holds.** If it does, that's a real defect — name it with its tag and severity. If it
genuinely doesn't hold, say so in your reasoning rather than silently skipping the question. Three
samples that each independently argued against their own leaning PASS catch more real defects than
three samples that all just confirmed their first read.
```

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/trivia-os-design-critic.md .claude/agents/trivia-os-design-quality-critic.md
git commit -m "docs(critics): add adversarial self-check framing to both critic prompts (mitigates B6)"
```

---

## Task 6: Audit trail + stale-entry pruning sweep (mitigates B4/B5)

**Files:**
- Modify: `.claude/hooks/design-done-gate.mjs` (add `auditLog()`, call it at every write site for the three protected stores)
- Create: `concepts/tools/sweep-stale-design-entries.mjs`

- [ ] **Step 1: Add the audit-log constant and helper**

Find `const COUNTS_FILE = resolve(REPO_ROOT, 'concepts', '.design-attempt-counts.json');` and add a new constant directly after it:

```js
const AUDIT_LOG_FILE = resolve(REPO_ROOT, 'concepts', '.design-gate-audit.log');
```

Add `appendFileSync` to the existing `node:fs` import:

```js
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs';
```

Add the helper function next to `writeCase()`:

```js
// Append-only audit trail (mitigates B4: "no integrity trail on the three JSON stores. A
// delete-and-regenerate cycle is indistinguishable from a legitimate first run.") Every write this
// gate makes to one of its own protected stores is logged here — not to PREVENT tampering (that is
// protect-json-stores.mjs's job) but so a human sweep can tell a genuine write history from a store
// that was deleted and silently regenerated, and so concepts/tools/sweep-stale-design-entries.mjs
// below has something to cross-check against. Never blocks on failure — an audit log write failing
// should not itself fail the Stop.
function auditLog(store, action, detail) {
  try {
    appendFileSync(AUDIT_LOG_FILE, JSON.stringify({ timestamp: new Date().toISOString(), store, action, detail }) + '\n');
  } catch (e) { console.error(`design-done-gate: WARNING — could not append to ${AUDIT_LOG_FILE}: ${e.message}`); }
}
```

- [ ] **Step 2: Call it at each of the four write sites**

In `writeCase()`, right after the existing `writeFileSync(casesFile, ...)` line:

```js
function writeCase(record) {
  try {
    const casesFile = resolve(REPO_ROOT, 'concepts', 'design-cases.json');
    const casesData = existsSync(casesFile) ? JSON.parse(readFileSync(casesFile, 'utf8')) : { cases: [] };
    casesData.cases = casesData.cases || [];
    casesData.cases.push(record);
    writeFileSync(casesFile, JSON.stringify(casesData, null, 2));
    auditLog('design-cases.json', 'append-case', { noun: record.noun, verdict: record.verdict, file: record.file });
  } catch (e) { console.error(`design-done-gate: WARNING — could not auto-write case record: ${e.message}`); }
}
```

After the correctness verdict's `writeFileSync(verdictPath, JSON.stringify(parsed, null, 2));` line, add:

```js
      auditLog('design-critic-verdicts', 'write-verdict', { slug, verdict: parsed.verdict, file });
```

After the quality verdict's `writeFileSync(qualityVerdictPath, JSON.stringify(qVerdict, null, 2));` line, add:

```js
              auditLog('design-critic-verdicts', 'write-quality-verdict', { qualitySlug, verdict: qVerdict.verdict, file });
```

After the final merge-and-write section's `writeFileSync(COUNTS_FILE, JSON.stringify(countsMap, null, 2));` line, add:

```js
  auditLog('design-attempt-counts.json', 'write-counts', { keys: Object.keys(countsMap) });
```

- [ ] **Step 3: Create the standalone stale-entry sweep script**

Create `concepts/tools/sweep-stale-design-entries.mjs`:

```js
#!/usr/bin/env node
// concepts/tools/sweep-stale-design-entries.mjs
//
// Mitigates B5 from concepts/design-pipeline-hardening-fix.md: "stale per-slug history can outlive
// a deleted or renamed scene. Nothing purges verdict/attempt-count entries for scenes that no longer
// exist." This is a HUMAN-RUN, READ-ONLY report, not an automatic prune — the doc's own fix #10 asks
// for "a periodic human-run sweep flagging entries," not silent deletion. Deleting history
// automatically at Stop-time risks removing real, load-bearing two-strike counts under a bug or a
// race; flagging for a human to review and clean up by hand is the safer, doc-specified shape.
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

const fileExists = (relPath) => relPath && existsSync(resolve(REPO_ROOT, relPath));

console.log('# Stale design-gate entry sweep\n');

// .design-attempt-counts.json — keys carry `lastCheckedFile`.
if (existsSync(COUNTS_FILE)) {
  const counts = JSON.parse(readFileSync(COUNTS_FILE, 'utf8'));
  const stale = Object.entries(counts).filter(([, v]) => v.lastCheckedFile && !fileExists(v.lastCheckedFile));
  console.log(`## ${COUNTS_FILE}`);
  console.log(`${Object.keys(counts).length} total entries, ${stale.length} reference a file that no longer exists:`);
  for (const [key, v] of stale) console.log(`  - "${key}" -> ${v.lastCheckedFile} (fails: ${v.fails ?? '?'})`);
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
  console.log('');
} else {
  console.log(`## ${CASES_FILE} — does not exist, nothing to sweep\n`);
}

// .design-critic-verdicts/*.json — each carries `checkedFile`.
if (existsSync(VERDICT_DIR)) {
  const files = readdirSync(VERDICT_DIR).filter(f => f.endsWith('.json'));
  const stale = [];
  for (const f of files) {
    try {
      const v = JSON.parse(readFileSync(resolve(VERDICT_DIR, f), 'utf8'));
      if (v.checkedFile && !fileExists(v.checkedFile)) stale.push({ f, checkedFile: v.checkedFile, verdict: v.verdict });
    } catch { /* unparseable verdict file — not this sweep's job to flag malformed JSON */ }
  }
  console.log(`## ${VERDICT_DIR}`);
  console.log(`${files.length} total verdict files, ${stale.length} reference a file that no longer exists:`);
  for (const s of stale) console.log(`  - ${s.f} (verdict ${s.verdict}) -> ${s.checkedFile}`);
  console.log('');
} else {
  console.log(`## ${VERDICT_DIR} — does not exist, nothing to sweep\n`);
}

console.log('Nothing above was deleted. Review and clean up by hand if these entries are truly dead —');
console.log('a future scene reusing an old path+element-name slug would otherwise inherit these counts.');
```

- [ ] **Step 4: Syntax-check both files**

```bash
node --check .claude/hooks/design-done-gate.mjs && echo "gate syntax OK"
node --check concepts/tools/sweep-stale-design-entries.mjs && echo "sweep syntax OK"
```

- [ ] **Step 5: Verify — scratch repo, full round trip**

```bash
rm -rf /tmp/gate-scratch-audit && mkdir -p /tmp/gate-scratch-audit/.claude/hooks /tmp/gate-scratch-audit/concepts/tools /tmp/gate-scratch-audit/concepts/.audit-shots /tmp/gate-scratch-audit/concepts/.design-critic-verdicts
cd /tmp/gate-scratch-audit && git init -q
cp /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.claude/hooks/design-done-gate.mjs .claude/hooks/
cp /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.claude/hooks/geometry-lint.mjs .claude/hooks/
cp /Users/bencoughlin/Projects/baynes-trivia/trivia-os/concepts/tools/sweep-stale-design-entries.mjs concepts/tools/
git add -A && git commit -q -m baseline

# Manufacture a stale record: a countsMap entry and a design-cases.json entry pointing at a file that
# does not exist on disk.
cat > concepts/.design-attempt-counts.json <<'EOF'
{"concepts_ghost-scene.html::flame": {"fails": 2, "lastCheckedFile": "concepts/ghost-scene.html"}}
EOF
cat > concepts/design-cases.json <<'EOF'
{"cases": [{"noun": "flame", "file": "concepts/ghost-scene.html", "verdict": "FAIL", "date": "2026-01-01"}]}
EOF
cat > concepts/.design-critic-verdicts/ghost.json <<'EOF'
{"verdict": "FAIL", "checkedFile": "concepts/ghost-scene.html"}
EOF

node concepts/tools/sweep-stale-design-entries.mjs
```

Expected: the report names all three stale entries (the countsMap key, the design-cases.json case, and the verdict file), each correctly pointing out `concepts/ghost-scene.html` doesn't exist, and exits 0. Confirm with `echo $?` that it's `0`.

Then confirm the audit log actually accumulates real entries during a normal gate run:

```bash
cat > concepts/real-scene.html <<'EOF'
<!-- ELEMENT: dot -->
<!-- PASS = a fresh viewer names this as a glowing dot. -->
<div class="dot"></div>
EOF
git add -A && git commit -q -m "add real scene"
# No transcript, nothing dirty after commit -> gate should exit 0 with nothing to audit-log this run
echo '{}' | node .claude/hooks/design-done-gate.mjs > /dev/null 2>&1
echo "audit log exists yet: $(test -f concepts/.design-gate-audit.log && echo yes || echo no, correctly, nothing was written this run)"
```

Expected: "no, correctly, nothing was written this run" — the audit log only grows when the gate actually writes to one of the three stores, which didn't happen in this no-op run (nothing was dirty/session-touched). This confirms `auditLog()` doesn't fire spuriously.

- [ ] **Step 6: Commit**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
git add .claude/hooks/design-done-gate.mjs concepts/tools/sweep-stale-design-entries.mjs
git commit -m "feat(design-gate): append-only audit trail on the three protected stores + human-run stale-entry sweep (mitigates B4/B5)"
```

---

## Self-Review Notes (per the skill's discipline)

- **Spec coverage:** Fix #5 (Task 1, highest priority, verified before continuing), Fix #6 (Task 2, redesigned per the deviation note — verdict-hash + screenshot mtime-tamper-blocking folded into Task 1), Fix #7 (Task 3), Fix #8 (Task 4), Fix #9 (Task 5), Fix #10 (Task 6). All six items covered.
- **Placeholder scan:** no TBD/TODO, no "add appropriate handling" — every code block is literal text to write, every verification step has a concrete expected output.
- **Type/name consistency:** `sceneHash(codeText)` signature identical at both call sites (correctness and quality verdict construction); `auditLog(store, action, detail)` signature identical across all four call sites; `JSON_STORE_PATH_RE`/`SHOTS_DIR_RE` and their corresponding verb-check functions (`segmentTamperesWithJsonStore`/`segmentForgesShotMtime`) are named to describe exactly what they each block, matching the two-tier design explained in the file header comment.
- **Known, deliberate scope limit:** the PreToolUse hook's `EVAL_FLAG_RE`/`INTERPRETER_RE` combination is a pattern match on the Bash command string, not a JS/Python parser — a sufficiently obfuscated inline script (e.g. string concatenation building the path at runtime) could theoretically evade it. This is the same honest limitation `design-done-gate.mjs` itself already accepts for its own Bash-authorship detection (pattern-matching, not parsing); closing it further would require actually parsing arbitrary shell/JS, which is out of scope for a hook script. Worth naming if this ever needs another hardening pass.
