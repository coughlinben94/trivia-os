# Design-Gate Integrity Hash + OS-Level Chmod Backstop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop chasing the 11th-round-and-counting arms race of finding every possible Bash bypass shape (the guard's own changelog names multi-hop pipe chaining as a known, accepted residual gap — see `.claude/hooks/protect-json-stores.mjs`'s KNOWN LIMITATIONS section). Add two detection/prevention layers to `.claude/hooks/design-done-gate.mjs` that don't care *how* a protected file changed, only *that* it did: a gate-owned content-hash sidecar checked at the start of every run, and an OS-level chmod-444 read-only lock the gate briefly lifts only around its own writes.

**Architecture:** One new file (`concepts/.design-gate-integrity.json`, a sidecar the gate alone writes) and three additions to `.claude/hooks/design-done-gate.mjs`: (1) a hash-check function run as the very first statement in the script, before the existing `DESIGN_GATE_CHILD` early-exit; (2) a `writeProtectedFile()` helper that wraps every existing write to one of the four protected stores in a chmod-unlock/write/chmod-lock cycle; (3) a `recordIntegrity()` helper, called from inside `auditLog()` (the single choke point every protected write already passes through), that hashes the just-written file(s) and updates the sidecar. A small addition to `.claude/hooks/protect-json-stores.mjs`'s existing `JSON_STORE_PATH_RE` extends its (already-independent) Bash-text guard to also name the new sidecar file, for defense-in-depth consistency — the hash-check and chmod layers do not depend on this and work even if the Bash guard is bypassed entirely. One small recovery tool, `concepts/tools/reseed-design-gate-integrity.mjs`, gives Ben an explicit, human-invoked way to re-baseline after confirming a legitimate out-of-band change (the spec's "let the gate re-record the new hash" step needs a concrete mechanism, not a hand-wave).

**Tech Stack:** Plain Node.js (`node:fs`, `node:crypto`, `node:path`) — no new dependencies, matching every prior round of this hook.

---

## Context: why this shape, not another regex round

Three prior rounds (11 total adversarial cycles, commit `1563d54` and its ancestors) hardened `protect-json-stores.mjs`'s Bash-text pattern matching as far as it can reasonably go. Its own changelog says explicitly: *"Multi-hop pipe chaining ... defeats the single-hop pipe-merge detection ... Closing this fully needs real data-flow tracing across pipe stages, not a regex."* Text matching on shell command strings is provably incomplete — bash has unbounded ways to construct an equivalent command. Adding a 12th pattern only shifts where the next bypass hides.

This plan instead adds a layer that is *bounded* because it doesn't try to enumerate bypass shapes at all: it compares "what does this protected file contain right now" against "what did this gate itself last write there." Any divergence — regardless of mechanism — is caught. The chmod backstop is a second, independent bounded layer: even a bypass this hook's authors never imagined has to also defeat a filesystem permission bit to succeed silently, and if it does defeat that bit (e.g. running as a different user/root), the hash check still catches the resulting content change on the next gate invocation.

---

## File Structure

- **Modify `.claude/hooks/design-done-gate.mjs`**:
  - New imports: `chmodSync` (from the existing `node:fs` import), `relative` (from the existing `node:path` import).
  - New consts: `INTEGRITY_FILE`, `PROTECTED_STORE_MODE`, `WRITABLE_MODE`.
  - New functions: `hashFile()`, `checkIntegrityOrBlock()`, `recordIntegrity()`, `writeProtectedFile()`.
  - New top-level call: `checkIntegrityOrBlock()`, placed as the first executable statement, before the existing `DESIGN_GATE_CHILD` check.
  - Modified: `auditLog()` gains a 4th parameter and calls `recordIntegrity()`.
  - Modified: `writeCase()`, the two verdict-write sites, and the counts-write site now go through `writeProtectedFile()` and pass the written path to `auditLog()`.
- **Modify `.claude/hooks/protect-json-stores.mjs`**: add `concepts/.design-gate-integrity.json` to `JSON_STORE_PATH_RE`.
- **Create `concepts/tools/reseed-design-gate-integrity.mjs`**: human-invoked recovery script — recomputes and writes the sidecar (and re-locks files to 444) from the four stores' *current* on-disk content. Never called by the gate itself.
- **Modify `.gitignore`**: `concepts/.design-gate-integrity.json` is gate-generated local state, same treatment as `concepts/.design-gate-audit.log` (already ignored) — add it alongside.

---

## Task 1: Hash infrastructure — `hashFile`, `checkIntegrityOrBlock`, `recordIntegrity`

**Files:**
- Modify: `.claude/hooks/design-done-gate.mjs`

- [ ] **Step 1: Extend the existing imports**

Find (near the top of the file):

```js
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
```

Replace with:

```js
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync, appendFileSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';
```

- [ ] **Step 2: Add the integrity-file path and lock-mode consts**

Find:

```js
const AUDIT_LOG_FILE = resolve(REPO_ROOT, 'concepts', '.design-gate-audit.log');
```

Add directly after it:

```js
const AUDIT_LOG_FILE = resolve(REPO_ROOT, 'concepts', '.design-gate-audit.log');
// Gate-owned sidecar recording this gate's own last-known-good content hash for every protected
// store it writes — the ONLY thing that writes this file is recordIntegrity() below. Read at the
// very top of every invocation by checkIntegrityOrBlock(), before any other logic runs. This layer
// exists because protect-json-stores.mjs's Bash-text pattern matching is provably incomplete (its own
// KNOWN LIMITATIONS section names multi-hop pipe chaining as an accepted residual gap) — rather than
// chase the next bypass SHAPE with a 12th regex, this compares actual file content against this
// gate's own record of what it last wrote there. It does not matter how a mismatch happened —
// through a documented Bash-guard gap, a future Claude Code feature, a process running outside this
// hook's Bash-guard coverage entirely, or anything else. A mismatch is a mismatch.
const INTEGRITY_FILE = resolve(REPO_ROOT, 'concepts', '.design-gate-integrity.json');
// OS-level backstop (independent of, and does not rely on, protect-json-stores.mjs at all): every
// protected file is chmod'd read-only immediately after this gate writes it, and briefly unlocked
// only around the gate's own next write. An ordinary accidental overwrite — `> file`, an editor
// save, a script that doesn't specifically re-chmod first — fails at the filesystem level even if
// some future Bash construct slips past the text guard entirely undetected.
const PROTECTED_STORE_MODE = 0o444;
const WRITABLE_MODE = 0o644;
```

- [ ] **Step 3: Add `hashFile()` next to the existing `sceneHash()` helper**

Find (search for `function sceneHash(codeText)`):

```js
function sceneHash(codeText) { return createHash('sha256').update(codeText).digest('hex'); }
```

Add directly after it:

```js
function sceneHash(codeText) { return createHash('sha256').update(codeText).digest('hex'); }
// Content hash of a file on disk, for the integrity sidecar. Returns null (not throws) for a
// missing/unreadable file — a null hash means "this path currently has nothing," which is a valid,
// checkable state (see checkIntegrityOrBlock: a recorded hash with a now-missing file is itself a
// reportable mismatch, not a crash).
function hashFile(absPath) {
  try { return createHash('sha256').update(readFileSync(absPath)).digest('hex'); }
  catch { return null; }
}
```

- [ ] **Step 4: Add `checkIntegrityOrBlock()` and call it as the first executable statement in the file**

Find (the very first lines of executable code, right after the depth-guard comment):

```js
// Depth guard, set only on the critic subprocesses this script spawns (see the
// note in spawnCriticVotes). A critic session's Stop must not run the gate that
// spawned it. Exit 0, not 2: blocking a critic would turn a review into a
// failed spawn and cost the panel a vote.
if (process.env.DESIGN_GATE_CHILD === '1') {
```

Replace with (adds the integrity check immediately before the depth guard — it must run before *any* other logic, including the depth guard, since a critic-spawned child session touches none of the protected stores directly but the check itself is cheap and unconditional):

```js
// Integrity check — the FIRST thing this hook does on every single invocation, before anything
// else, including the depth guard directly below. See INTEGRITY_FILE's own comment above for why
// this layer exists: it does not try to guess HOW a protected file might have changed, only WHETHER
// it did, by comparing each protected store's current content hash against this gate's own last-
// recorded hash. The sidecar and the audit log are updated together, atomically, by the same
// recordIntegrity() call inside auditLog() (see below) — so a hash match is itself proof that the
// last change to that file happened through this gate's own write path, which the audit log
// necessarily also has an entry for. A mismatch therefore means exactly what the spec asks this
// check to catch: the file changed with no corresponding audit-log entry explaining it, regardless
// of mechanism.
function checkIntegrityOrBlock() {
  if (!existsSync(INTEGRITY_FILE)) return; // first run ever — no baseline recorded yet to compare against
  let sidecar;
  try {
    sidecar = JSON.parse(readFileSync(INTEGRITY_FILE, 'utf8'));
  } catch (e) {
    console.error(`design-done-gate: BLOCKED — ${INTEGRITY_FILE} exists but is not valid JSON ` +
      `(${e.message}). This file is gate-owned and should never be hand-edited or corrupted. A human ` +
      `must inspect it and either restore a good copy or intentionally reseed it (see ` +
      `concepts/tools/reseed-design-gate-integrity.mjs) before this gate can run again.`);
    process.exit(2);
  }
  const mismatches = [];
  for (const [rel, expectedHash] of Object.entries(sidecar)) {
    const actualHash = hashFile(resolve(REPO_ROOT, rel));
    if (actualHash !== expectedHash) mismatches.push({ rel, expectedHash, actualHash });
  }
  if (mismatches.length > 0) {
    console.error(`design-done-gate: BLOCKED — ${mismatches.length} gate-protected file(s) do not ` +
      `match this gate's own last-recorded content hash:\n` +
      mismatches.map(m => `  - ${m.rel}: expected ${m.expectedHash ?? '(no prior record — new to the ` +
        `sidecar)'}, found ${m.actualHash ?? '(file is now missing)'}`).join('\n') +
      `\nThis means at least one of these files changed by some means other than this gate's own ` +
      `writes — regardless of how (a Bash-guard bypass, a bug, anything else). This is a hard stop: ` +
      `stop and ask Ben to confirm whether the change was intentional. If it was, re-baseline with ` +
      `\`node concepts/tools/reseed-design-gate-integrity.mjs\` (a human-invoked action, never done by ` +
      `this gate automatically) before continuing. Do not silently proceed or auto-repair.`);
    process.exit(2);
  }
}
checkIntegrityOrBlock();

// Depth guard, set only on the critic subprocesses this script spawns (see the
// note in spawnCriticVotes). A critic session's Stop must not run the gate that
// spawned it. Exit 0, not 2: blocking a critic would turn a review into a
// failed spawn and cost the panel a vote.
if (process.env.DESIGN_GATE_CHILD === '1') {
```

- [ ] **Step 5: Add `recordIntegrity()` directly above `auditLog()`**

Find (search for `function auditLog(store, action, detail) {`):

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

Replace with (adds `recordIntegrity()`, `writeProtectedFile()`, and wires both into `auditLog()`; `auditLog()` gains a 4th, optional `writtenPath` parameter so every call site that writes an actual store — not just the audit log itself — tells this function what to hash):

```js
// The ONLY function anywhere that writes concepts/.design-gate-integrity.json (besides the
// human-invoked concepts/tools/reseed-design-gate-integrity.mjs, which exists specifically for the
// human-confirmed recovery path this file's own BLOCKED message points to). Called from auditLog()
// immediately after every protected-store write, so the sidecar's recorded hash and the audit log's
// record of that same write land together, atomically, from the same function call.
function recordIntegrity(...absPaths) {
  try {
    let sidecar = {};
    if (existsSync(INTEGRITY_FILE)) {
      try { sidecar = JSON.parse(readFileSync(INTEGRITY_FILE, 'utf8')); } catch { sidecar = {}; }
    }
    for (const absPath of absPaths) {
      const rel = relative(REPO_ROOT, absPath);
      const hash = hashFile(absPath);
      if (hash === null) delete sidecar[rel]; else sidecar[rel] = hash;
    }
    writeProtectedFile(INTEGRITY_FILE, () => writeFileSync(INTEGRITY_FILE, JSON.stringify(sidecar, null, 2)));
  } catch (e) { console.error(`design-done-gate: WARNING — could not update integrity sidecar: ${e.message}`); }
}

// OS-level chmod backstop (see PROTECTED_STORE_MODE's comment above) — every protected-store write in
// this file goes through this instead of calling writeFileSync/appendFileSync directly: briefly
// restore write access (the file is normally locked read-only from the PREVIOUS write this same
// function made), run the actual write via the caller-supplied `writeFn`, then re-lock read-only
// immediately. `writeFn` does the write itself (writeFileSync vs. appendFileSync differ enough — one
// full-replace, one append — that this helper stays agnostic and just brackets whichever one the
// caller needs).
function writeProtectedFile(absPath, writeFn) {
  const existedBefore = existsSync(absPath);
  if (existedBefore) { try { chmodSync(absPath, WRITABLE_MODE); } catch { /* not yet lockable, or already writable */ } }
  writeFn();
  try { chmodSync(absPath, PROTECTED_STORE_MODE); } catch (e) {
    console.error(`design-done-gate: WARNING — could not chmod ${absPath} read-only after writing it: ${e.message}`);
  }
}

// Append-only audit trail (mitigates B4: "no integrity trail on the three JSON stores. A
// delete-and-regenerate cycle is indistinguishable from a legitimate first run.") Every write this
// gate makes to one of its own protected stores is logged here — not to PREVENT tampering (that is
// protect-json-stores.mjs's job, and, as of this round, the hash/chmod layers' job too) but so a
// human sweep can tell a genuine write history from a store that was deleted and silently
// regenerated, and so concepts/tools/sweep-stale-design-entries.mjs below has something to
// cross-check against. Never blocks on failure — an audit log write failing should not itself fail
// the Stop. `writtenPath`, when given, is the absolute path of the OTHER protected file this call is
// reporting a write to (design-cases.json, a verdict file, or the counts file) — recordIntegrity()
// hashes both it and this audit log file (which the appendFileSync line below just changed) in one
// sidecar update, so the two stay synchronized.
function auditLog(store, action, detail, writtenPath) {
  try {
    writeProtectedFile(AUDIT_LOG_FILE, () =>
      appendFileSync(AUDIT_LOG_FILE, JSON.stringify({ timestamp: new Date().toISOString(), store, action, detail }) + '\n'));
  } catch (e) { console.error(`design-done-gate: WARNING — could not append to ${AUDIT_LOG_FILE}: ${e.message}`); }
  recordIntegrity(...(writtenPath ? [writtenPath, AUDIT_LOG_FILE] : [AUDIT_LOG_FILE]));
}
```

- [ ] **Step 6: Syntax-check**

```bash
node --check .claude/hooks/design-done-gate.mjs && echo "syntax OK"
```

- [ ] **Step 7: Commit**

```bash
git add .claude/hooks/design-done-gate.mjs
git commit -m "feat(design-gate): add gate-owned integrity-hash sidecar and OS-level chmod backstop infrastructure"
```

---

## Task 2: Wire the four protected-store write sites through `writeProtectedFile()` + pass `writtenPath` to `auditLog()`

**Files:**
- Modify: `.claude/hooks/design-done-gate.mjs`

- [ ] **Step 1: `writeCase()` — the `concepts/design-cases.json` write**

Find (search for `function writeCase(record) {`):

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

Replace with:

```js
function writeCase(record) {
  try {
    const casesFile = resolve(REPO_ROOT, 'concepts', 'design-cases.json');
    const casesData = existsSync(casesFile) ? JSON.parse(readFileSync(casesFile, 'utf8')) : { cases: [] };
    casesData.cases = casesData.cases || [];
    casesData.cases.push(record);
    writeProtectedFile(casesFile, () => writeFileSync(casesFile, JSON.stringify(casesData, null, 2)));
    auditLog('design-cases.json', 'append-case', { noun: record.noun, verdict: record.verdict, file: record.file }, casesFile);
  } catch (e) { console.error(`design-done-gate: WARNING — could not auto-write case record: ${e.message}`); }
}
```

Note: reading `casesFile` via `readFileSync` two lines above works fine even when the file is currently locked to `0o444` — read permission is still set (`r--r--r--`); only the write needs the brief unlock `writeProtectedFile()` performs.

- [ ] **Step 2: The correctness-gate verdict write**

Find (search for `writeFileSync(verdictPath, JSON.stringify(parsed, null, 2));`):

```js
      writeFileSync(verdictPath, JSON.stringify(parsed, null, 2));
      auditLog('design-critic-verdicts', 'write-verdict', { slug, verdict: parsed.verdict, file });
```

Replace with:

```js
      writeProtectedFile(verdictPath, () => writeFileSync(verdictPath, JSON.stringify(parsed, null, 2)));
      auditLog('design-critic-verdicts', 'write-verdict', { slug, verdict: parsed.verdict, file }, verdictPath);
```

- [ ] **Step 3: The quality-gate verdict write**

Find (search for `writeFileSync(qualityVerdictPath, JSON.stringify(qVerdict, null, 2));`):

```js
              writeFileSync(qualityVerdictPath, JSON.stringify(qVerdict, null, 2));
              auditLog('design-critic-verdicts', 'write-quality-verdict', { qualitySlug, verdict: qVerdict.verdict, file });
```

Replace with:

```js
              writeProtectedFile(qualityVerdictPath, () => writeFileSync(qualityVerdictPath, JSON.stringify(qVerdict, null, 2)));
              auditLog('design-critic-verdicts', 'write-quality-verdict', { qualitySlug, verdict: qVerdict.verdict, file }, qualityVerdictPath);
```

- [ ] **Step 4: The attempt-counts write**

Find (search for `writeFileSync(COUNTS_FILE, JSON.stringify(countsMap, null, 2));`):

```js
  writeFileSync(COUNTS_FILE, JSON.stringify(countsMap, null, 2));
  auditLog('design-attempt-counts.json', 'write-counts', { keys: Object.keys(countsMap) });
} catch (e) { console.error(`design-done-gate: WARNING — could not write ${COUNTS_FILE}: ${e.message} (strike counts for this run are lost).`); }
```

Replace with:

```js
  writeProtectedFile(COUNTS_FILE, () => writeFileSync(COUNTS_FILE, JSON.stringify(countsMap, null, 2)));
  auditLog('design-attempt-counts.json', 'write-counts', { keys: Object.keys(countsMap) }, COUNTS_FILE);
} catch (e) { console.error(`design-done-gate: WARNING — could not write ${COUNTS_FILE}: ${e.message} (strike counts for this run are lost).`); }
```

- [ ] **Step 5: Syntax-check**

```bash
node --check .claude/hooks/design-done-gate.mjs && echo "syntax OK"
```

- [ ] **Step 6: Verify — a full read-modify-write cycle through `writeProtectedFile`/`recordIntegrity` behaves correctly, end to end, against real temp files (not the real stores)**

```bash
node -e "
const { writeFileSync, readFileSync, existsSync, chmodSync } = require('fs');
const { createHash } = require('crypto');
const path = require('path');
const os = require('os');
const dir = require('fs').mkdtempSync(path.join(os.tmpdir(), 'gate-integrity-'));
const target = path.join(dir, 'store.json');
const sidecar = path.join(dir, 'sidecar.json');
const MODE = 0o444, WMODE = 0o644;
function hashFile(p) { try { return createHash('sha256').update(readFileSync(p)).digest('hex'); } catch { return null; } }
function writeProtectedFile(p, fn) {
  const existed = existsSync(p);
  if (existed) { try { chmodSync(p, WMODE); } catch {} }
  fn();
  chmodSync(p, MODE);
}
function recordIntegrity(...paths) {
  let s = {};
  if (existsSync(sidecar)) { try { s = JSON.parse(readFileSync(sidecar, 'utf8')); } catch {} }
  for (const p of paths) { const h = hashFile(p); if (h === null) delete s[path.basename(p)]; else s[path.basename(p)] = h; }
  writeProtectedFile(sidecar, () => writeFileSync(sidecar, JSON.stringify(s)));
}
// First write
writeProtectedFile(target, () => writeFileSync(target, JSON.stringify({ v: 1 })));
recordIntegrity(target);
const mode1 = (require('fs').statSync(target).mode & 0o777).toString(8);
// Second write (simulates a real second gate run against the SAME already-locked file)
writeProtectedFile(target, () => writeFileSync(target, JSON.stringify({ v: 2 })));
recordIntegrity(target);
const mode2 = (require('fs').statSync(target).mode & 0o777).toString(8);
const finalContent = JSON.parse(readFileSync(target, 'utf8'));
const sidecarHash = JSON.parse(readFileSync(sidecar, 'utf8'))[path.basename(target)];
const actualHash = hashFile(target);
console.log('mode after write 1:', mode1, '(expect 444)');
console.log('mode after write 2:', mode2, '(expect 444)');
console.log('final content:', finalContent, '(expect v:2 — second write succeeded despite file being locked from write 1)');
console.log('sidecar hash matches actual file hash:', sidecarHash === actualHash, '(expect true)');
"
```

Expected: `mode after write 1: 444`, `mode after write 2: 444`, `final content: { v: 2 }`, `sidecar hash matches actual file hash: true`. This proves the unlock→write→lock cycle round-trips correctly across repeated writes to the same file — the exact pattern every real gate run repeats every time it touches one of the four stores.

- [ ] **Step 7: Commit**

```bash
git add .claude/hooks/design-done-gate.mjs
git commit -m "feat(design-gate): wire the four protected-store writes through the chmod backstop and hash sidecar"
```

---

## Task 3: Extend the Bash-text guard's protected-path list (defense-in-depth, not load-bearing)

**Files:**
- Modify: `.claude/hooks/protect-json-stores.mjs`

- [ ] **Step 1: Add the new sidecar path to `JSON_STORE_PATH_RE`**

Find:

```js
const JSON_STORE_PATH_RE = /concepts\/\.design-attempt-counts\.json|concepts\/design-cases\.json|concepts\/\.design-critic-verdicts\b|concepts\/\.design-gate-audit\.log|\.claude\/settings\.json|\.claude\/hooks\/protect-json-stores\.mjs|\.claude\/hooks\/design-done-gate\.mjs|\.claude\/hooks\/geometry-lint\.mjs/;
```

Replace with (adds `concepts/.design-gate-integrity.json` — round 3's new sidecar is gate-owned exactly like the other three JSON stores, and belongs in the same protected-path tier for the same reason; this is a consistency addition to the EXISTING Bash-text layer, not something the hash-check or chmod layers depend on — those two are independent of this file entirely, by design, so that a bypass of this regex-based layer does not defeat them):

```js
const JSON_STORE_PATH_RE = /concepts\/\.design-attempt-counts\.json|concepts\/design-cases\.json|concepts\/\.design-critic-verdicts\b|concepts\/\.design-gate-audit\.log|concepts\/\.design-gate-integrity\.json|\.claude\/settings\.json|\.claude\/hooks\/protect-json-stores\.mjs|\.claude\/hooks\/design-done-gate\.mjs|\.claude\/hooks\/geometry-lint\.mjs/;
```

- [ ] **Step 2: Syntax-check**

```bash
node --check .claude/hooks/protect-json-stores.mjs && echo "syntax OK"
```

- [ ] **Step 3: Verify — re-run the full existing test_block/test_allow suite from the round-2 plan (`docs/superpowers/plans/2026-07-28-design-gate-hardening-round2-review-fixes.md`, Task 2/Task 4/Task 5's verify steps) to confirm this one-line regex addition changed nothing else, plus one new case for the sidecar itself**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.worktrees/design-gate-integrity-hardening
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
test_block "rm the new integrity sidecar"      'rm concepts/.design-gate-integrity.json'
test_block "git checkout the integrity sidecar" 'git checkout HEAD -- concepts/.design-gate-integrity.json'
test_block "rm design-cases.json (pre-existing)" 'rm concepts/design-cases.json'
test_block "git clean -fdx concepts/"           'git clean -fdx concepts/'
test_block "git reset --hard HEAD~1"            'git reset --hard HEAD~1'
test_allow "git status"                         'git status'
test_allow "cat the integrity sidecar (read)"   'cat concepts/.design-gate-integrity.json'
test_allow "git commit unrelated file"          'git add concepts/campfire-sing-along-spec.md && git commit -m wip'
```

Every `test_block` must print `exit=2`; every `test_allow` must print `exit=0`.

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/protect-json-stores.mjs
git commit -m "chore(design-gate): add the new integrity sidecar to the Bash guard's protected-path list"
```

---

## Task 4: The hash-check actually blocks an out-of-band change, and the chmod backstop actually blocks an ordinary write

**Files:**
- None modified — this task is pure verification against the already-committed code from Tasks 1–2, run in a scratch copy so it doesn't touch the real repo's stores.

- [ ] **Step 1: Verify the hash check blocks a mismatch, using the REAL gate code, in an isolated scratch copy**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.worktrees/design-gate-integrity-hardening
SCRATCH=$(mktemp -d)
mkdir -p "$SCRATCH/.claude/hooks" "$SCRATCH/concepts"
cp .claude/hooks/design-done-gate.mjs "$SCRATCH/.claude/hooks/"
cd "$SCRATCH" && git init -q && git add -A && git commit -q -m scratch
# Simulate a legitimate gate write having already happened: seed a real counts file + real sidecar
# whose hash matches it, exactly as recordIntegrity() would have left them.
echo '{"foo":{"fails":0}}' > concepts/.design-attempt-counts.json
node -e "
const { createHash } = require('crypto');
const { readFileSync, writeFileSync } = require('fs');
const hash = createHash('sha256').update(readFileSync('concepts/.design-attempt-counts.json')).digest('hex');
writeFileSync('concepts/.design-gate-integrity.json', JSON.stringify({'concepts/.design-attempt-counts.json': hash}));
"
# Case A: content matches sidecar exactly — checkIntegrityOrBlock must NOT be what stops this run.
# (Run just the integrity function in isolation by requiring the gate file's exit-0 path indirectly:
# instead, prove the underlying comparison directly, matching the gate's own hashFile/checkIntegrityOrBlock logic.)
node -e "
const { createHash } = require('crypto');
const { readFileSync, existsSync } = require('fs');
const path = require('path');
function hashFile(p) { try { return createHash('sha256').update(readFileSync(p)).digest('hex'); } catch { return null; } }
const sidecar = JSON.parse(readFileSync('concepts/.design-gate-integrity.json', 'utf8'));
let mismatches = [];
for (const [rel, expected] of Object.entries(sidecar)) {
  const actual = hashFile(path.resolve('.', rel));
  if (actual !== expected) mismatches.push(rel);
}
console.log('Case A (untouched) mismatches:', mismatches, '(expect [])');
"
# Case B: tamper with the file OUTSIDE the gate entirely — plain fs write, zero relationship to
# protect-json-stores.mjs or any Bash command at all. This is deliberately NOT a Bash bypass — the
# whole point of this layer is that it does not matter whether the change came through a Bash bypass,
# an editor, or anything else.
node -e "require('fs').writeFileSync('concepts/.design-attempt-counts.json', JSON.stringify({foo:{fails:99}}))"
node -e "
const { createHash } = require('crypto');
const { readFileSync } = require('fs');
const path = require('path');
function hashFile(p) { try { return createHash('sha256').update(readFileSync(p)).digest('hex'); } catch { return null; } }
const sidecar = JSON.parse(readFileSync('concepts/.design-gate-integrity.json', 'utf8'));
let mismatches = [];
for (const [rel, expected] of Object.entries(sidecar)) {
  const actual = hashFile(path.resolve('.', rel));
  if (actual !== expected) mismatches.push(rel);
}
console.log('Case B (tampered) mismatches:', mismatches, '(expect [\"concepts/.design-attempt-counts.json\"])');
"
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.worktrees/design-gate-integrity-hardening
rm -rf "$SCRATCH"
```

Expected: `Case A (untouched) mismatches: [] (expect [])` and `Case B (tampered) mismatches: [ 'concepts/.design-attempt-counts.json' ] (expect [...])`. This is the load-bearing proof for the whole hash layer: it catches a change made by a mechanism with ZERO relationship to Bash or this repo's guard — a plain `fs.writeFileSync`, standing in for "any means whatsoever."

- [ ] **Step 2: Verify the chmod backstop actually blocks an ordinary overwrite attempt**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.worktrees/design-gate-integrity-hardening
SCRATCH=$(mktemp -d)
echo '{"v":1}' > "$SCRATCH/store.json"
chmod 444 "$SCRATCH/store.json"
# An ordinary write attempt that does NOT know to chmod first — exactly what "accidental" or
# "some future Bash construct that slips past the text guard entirely" looks like at the OS level.
node -e "
try {
  require('fs').writeFileSync('$SCRATCH/store.json', JSON.stringify({v:2}));
  console.log('WROTE (this would be the bug)');
} catch (e) {
  console.log('BLOCKED at the OS level:', e.code, '(expect EACCES/EPERM)');
}
"
cat "$SCRATCH/store.json"
echo "(expect unchanged: {\"v\":1})"
rm -rf "$SCRATCH"
```

Expected: `BLOCKED at the OS level: EACCES (expect EACCES/EPERM)` (exact code may be `EACCES` or `EPERM` depending on OS/user — either is correct evidence of an OS-level permission failure) and the file content printed unchanged. This proves the second, independent layer: even a write that never goes near Bash at all (a plain Node `fs.writeFileSync`, an editor save, a script with no awareness of this project's guard) fails outright.

- [ ] **Step 3: No commit** — this task is verification-only against already-committed code.

---

## Task 5: Recovery tool — `concepts/tools/reseed-design-gate-integrity.mjs`

**Files:**
- Create: `concepts/tools/reseed-design-gate-integrity.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: Check the existing tools directory's style for the header/shebang convention this project uses**

```bash
head -20 concepts/tools/sweep-stale-design-entries.mjs
```

(Match its shebang line and top-of-file comment style — human-invoked, explains what it does and why in plain terms, no framework.)

- [ ] **Step 2: Write the recovery tool**

Create `concepts/tools/reseed-design-gate-integrity.mjs`:

```js
#!/usr/bin/env node
// concepts/tools/reseed-design-gate-integrity.mjs
//
// HUMAN-INVOKED ONLY. Never called by design-done-gate.mjs itself — the whole point of the
// integrity check in design-done-gate.mjs is that it blocks and asks a human to confirm before
// anything re-baselines. This script IS that confirmation step, made concrete: run it after you
// (Ben) have looked at a BLOCKED message naming a mismatched file, decided the change was
// intentional, and want the gate to accept the current on-disk content as the new known-good
// baseline going forward.
//
// What it does: for each of the four gate-protected stores that currently exists on disk, computes
// its content hash, writes the full result to concepts/.design-gate-integrity.json (overwriting
// whatever was there), and chmod's every file it just hashed to 0o444 (read-only) — the same state
// design-done-gate.mjs's own writeProtectedFile() leaves them in after a normal gate write. Verdict
// files inside concepts/.design-critic-verdicts/ are each hashed individually, matching how
// design-done-gate.mjs records them (one sidecar entry per verdict file, not one for the whole
// directory).
//
// Run it as: node concepts/tools/reseed-design-gate-integrity.mjs

import { readFileSync, writeFileSync, existsSync, chmodSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INTEGRITY_FILE = resolve(REPO_ROOT, 'concepts', '.design-gate-integrity.json');
const VERDICT_DIR = resolve(REPO_ROOT, 'concepts', '.design-critic-verdicts');
const PROTECTED_STORE_MODE = 0o444;

const singleFilePaths = [
  resolve(REPO_ROOT, 'concepts', '.design-attempt-counts.json'),
  resolve(REPO_ROOT, 'concepts', 'design-cases.json'),
  resolve(REPO_ROOT, 'concepts', '.design-gate-audit.log'),
];

function hashFile(absPath) {
  try { return createHash('sha256').update(readFileSync(absPath)).digest('hex'); }
  catch { return null; }
}

const sidecar = {};
let seeded = 0;

for (const absPath of singleFilePaths) {
  if (!existsSync(absPath)) continue;
  const hash = hashFile(absPath);
  if (hash === null) continue;
  sidecar[relative(REPO_ROOT, absPath)] = hash;
  try { chmodSync(absPath, PROTECTED_STORE_MODE); } catch (e) {
    console.error(`reseed: WARNING — could not chmod ${absPath}: ${e.message}`);
  }
  seeded++;
}

if (existsSync(VERDICT_DIR)) {
  for (const f of readdirSync(VERDICT_DIR)) {
    if (!f.endsWith('.json')) continue;
    const absPath = resolve(VERDICT_DIR, f);
    const hash = hashFile(absPath);
    if (hash === null) continue;
    sidecar[relative(REPO_ROOT, absPath)] = hash;
    try { chmodSync(absPath, PROTECTED_STORE_MODE); } catch (e) {
      console.error(`reseed: WARNING — could not chmod ${absPath}: ${e.message}`);
    }
    seeded++;
  }
}

writeFileSync(INTEGRITY_FILE, JSON.stringify(sidecar, null, 2));
try { chmodSync(INTEGRITY_FILE, PROTECTED_STORE_MODE); } catch (e) {
  console.error(`reseed: WARNING — could not chmod ${INTEGRITY_FILE}: ${e.message}`);
}

console.log(`reseed-design-gate-integrity: recorded ${seeded} file(s) into ${INTEGRITY_FILE} and ` +
  `locked each to read-only. This is now the new baseline design-done-gate.mjs will check against.`);
```

- [ ] **Step 3: Add the new sidecar to `.gitignore`, next to the existing audit-log entry**

Find:

```
concepts/.audit-shots/
concepts/.design-gate-audit.log
```

Replace with:

```
concepts/.audit-shots/
concepts/.design-gate-audit.log
concepts/.design-gate-integrity.json
```

- [ ] **Step 4: Syntax-check and dry-run against a scratch copy (not the real repo's stores)**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.worktrees/design-gate-integrity-hardening
node --check concepts/tools/reseed-design-gate-integrity.mjs && echo "syntax OK"
SCRATCH=$(mktemp -d)
mkdir -p "$SCRATCH/concepts/.design-critic-verdicts"
echo '{"cases":[]}' > "$SCRATCH/concepts/design-cases.json"
echo '{}' > "$SCRATCH/concepts/.design-attempt-counts.json"
echo '{"slug":"x","verdict":"PASS"}' > "$SCRATCH/concepts/.design-critic-verdicts/x.json"
node -e "
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const REPO_ROOT = '$SCRATCH';
const INTEGRITY_FILE = path.resolve(REPO_ROOT, 'concepts', '.design-gate-integrity.json');
const VERDICT_DIR = path.resolve(REPO_ROOT, 'concepts', '.design-critic-verdicts');
const singleFilePaths = [
  path.resolve(REPO_ROOT, 'concepts', '.design-attempt-counts.json'),
  path.resolve(REPO_ROOT, 'concepts', 'design-cases.json'),
];
function hashFile(p) { try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch { return null; } }
const sidecar = {};
for (const p of singleFilePaths) { const h = hashFile(p); if (h !== null) { sidecar[path.relative(REPO_ROOT, p)] = h; fs.chmodSync(p, 0o444); } }
for (const f of fs.readdirSync(VERDICT_DIR)) {
  const p = path.resolve(VERDICT_DIR, f); const h = hashFile(p);
  if (h !== null) { sidecar[path.relative(REPO_ROOT, p)] = h; fs.chmodSync(p, 0o444); }
}
fs.writeFileSync(INTEGRITY_FILE, JSON.stringify(sidecar, null, 2));
console.log('seeded', Object.keys(sidecar).length, 'entries');
console.log(fs.readFileSync(INTEGRITY_FILE, 'utf8'));
console.log('design-cases.json mode:', (fs.statSync(path.resolve(REPO_ROOT, 'concepts/design-cases.json')).mode & 0o777).toString(8), '(expect 444)');
"
rm -rf "$SCRATCH"
```

Expected: `seeded 3 entries` (counts, cases, one verdict file), the printed JSON has three keys with 64-char hex hash values, and `design-cases.json mode: 444`. (This dry-run reimplements the same logic inline against a scratch dir rather than invoking the real script against `$SCRATCH`, because the real script's `REPO_ROOT` is derived from its own file location via `import.meta.url`, which always resolves to the real repo — that's correct behavior for the shipped tool and exactly why this step tests the logic in isolation instead.)

- [ ] **Step 5: Commit**

```bash
git add concepts/tools/reseed-design-gate-integrity.mjs .gitignore
git commit -m "feat(design-gate): add human-invoked reseed tool for the integrity sidecar, ignore the sidecar file"
```

---

## Task 6: Independent adversarial review

- [ ] **Step 1: Dispatch a fresh subagent — NOT the implementer — to adversarially review this branch's full diff against main**

Prompt for the review subagent (run via the Agent tool, `subagent_type: general-purpose`, in the worktree at `/Users/bencoughlin/Projects/baynes-trivia/trivia-os/.worktrees/design-gate-integrity-hardening`):

> Adversarially review the diff between `main` and the current branch (`git diff main`) in this trivia-os worktree. This adds a gate-owned content-hash integrity sidecar (`concepts/.design-gate-integrity.json`) and an OS-level chmod-444 read-only backstop to `.claude/hooks/design-done-gate.mjs`, plus a one-line addition to `.claude/hooks/protect-json-stores.mjs` and a new recovery tool `concepts/tools/reseed-design-gate-integrity.mjs`. The stated goal: catch ANY out-of-band change to `concepts/.design-attempt-counts.json`, `concepts/design-cases.json`, `concepts/.design-critic-verdicts/*`, and `concepts/.design-gate-audit.log`, regardless of mechanism — not just Bash bypasses. Look specifically for: (1) TOCTOU races — can a file be swapped between `writeProtectedFile()`'s chmod-unlock and its actual write, or between the write and the re-lock? (2) Can `recordIntegrity()` ever run against a DIFFERENT file's content than what was actually just written (e.g. a path mismatch, a stale read)? (3) Does `checkIntegrityOrBlock()` actually run unconditionally on every invocation — trace every early-exit/process.exit path above and below it in the file to confirm none of them skip it. (4) Can a symlink at one of the four protected paths defeat either the hash check or the chmod lock? (5) Is there any path where `writeFileSync`/`appendFileSync` to one of the four stores happens WITHOUT going through `writeProtectedFile()` — grep for every remaining direct call. (6) Does the chmod-444 lock ever break a LEGITIMATE subsequent gate operation (e.g. `existsSync`/`readFileSync` calls elsewhere in the file against these now-read-only files)? (7) Sanity-check the reseed tool: could a bug in it silently seed a hash for the WRONG file, or skip a file it should have covered? Report findings as concrete bugs with file:line, not style opinions — this mirrors the same adversarial-review process the three prior hardening rounds used and is the reason this plan explicitly forbids skipping it.

- [ ] **Step 2: Fix every real finding from the review**

For each confirmed finding, make the fix, re-run `node --check` on whichever file changed, and re-run the relevant verification command(s) from Tasks 1–4 that cover the affected code path. Commit each fix separately:

```bash
git add <changed files>
git commit -m "fix(design-gate): <describe the specific finding fixed>"
```

- [ ] **Step 3: If the review surfaces zero findings, say so explicitly in the session**, the same way prior rounds recorded "0 findings, independently confirmed" rather than silently moving on — a review that found nothing is a claim that needs to be visible, not just an implicit pass.

---

## Task 7: Verification-before-completion (final gate, replayed, not self-reported)

**Files:**
- None modified.

- [ ] **Step 1: Re-run every verification command from Tasks 1, 2, 3, and 4 in sequence, in the worktree, and paste the actual output** — not a summary, not "should pass," the literal terminal output for each.

- [ ] **Step 2: Run the full existing test suite (if any covers hooks) plus a syntax check on every file touched this round**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.worktrees/design-gate-integrity-hardening
node --check .claude/hooks/design-done-gate.mjs && echo "design-done-gate.mjs OK"
node --check .claude/hooks/protect-json-stores.mjs && echo "protect-json-stores.mjs OK"
node --check concepts/tools/reseed-design-gate-integrity.mjs && echo "reseed tool OK"
```

- [ ] **Step 3: Confirm `git log` shows one commit per task, nothing squashed or skipped, and `git status` is clean**

```bash
git log --oneline main..HEAD
git status --short
```

Expected: a clean, empty `git status --short` and a commit list matching Tasks 1–6's individual commits (plus any fix commits from Task 6, Step 2).

---

## Task 8: Merge to main, seed the real baseline, clean up the worktree

**Files:**
- None modified in the worktree — this task runs from the MAIN working tree, not the worktree.

- [ ] **Step 1: From the main working tree (`/Users/bencoughlin/Projects/baynes-trivia/trivia-os`, NOT the worktree), check for any concurrent uncommitted/staged work before merging — do not disturb it**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
git status --short
```

If this shows uncommitted or staged changes from other concurrent work (as it did when this plan was written — another session was mid-flight on unrelated phone-answer-scoring/matching-scoring work), the merge below must not touch any of those paths. `git merge` only ever modifies files that actually DIFFER between the merge base and the incoming branch; since this branch's commits only touch `.claude/hooks/*.mjs`, `.gitignore`, and `concepts/tools/reseed-design-gate-integrity.mjs`, a normal merge will not conflict with or alter unrelated uncommitted files. Confirm this assumption by diffing the merge branch's changed paths against the other session's dirty/staged paths — if there is ANY overlap, stop and ask Ben before merging.

```bash
git diff --name-only main worktree-design-gate-integrity-hardening
```

- [ ] **Step 2: Merge**

```bash
git merge worktree-design-gate-integrity-hardening -m "Merge branch 'worktree-design-gate-integrity-hardening'"
```

- [ ] **Step 3: Re-verify concurrent unrelated work is untouched, byte-for-byte**

```bash
git status --short
```

Confirm the same set of modified/staged/untracked unrelated files from Step 1 is still present, unchanged.

- [ ] **Step 4: Seed the REAL baseline from main's actual current file contents** — this is the step that closes the "first run has no baseline yet" window entirely, so the very next gate invocation onward is fully covered:

```bash
node concepts/tools/reseed-design-gate-integrity.mjs
```

Expected output: `reseed-design-gate-integrity: recorded N file(s) into .../.design-gate-integrity.json and locked each to read-only.` Confirm with:

```bash
ls -la concepts/design-cases.json concepts/.design-attempt-counts.json | awk '{print $1, $NF}'
```

Expected: `-r--r--r--` permission bits on both.

- [ ] **Step 5: Remove the worktree**

```bash
git worktree remove .worktrees/design-gate-integrity-hardening
git branch -d worktree-design-gate-integrity-hardening
```

- [ ] **Step 6: Final sanity check — trigger a real gate run (or the closest safe simulation) and confirm it still runs to completion without the integrity check false-triggering on its own writes**

Since the four stores are now chmod 444 with a matching sidecar, the very next legitimate Stop-hook invocation of `design-done-gate.mjs` must (a) pass `checkIntegrityOrBlock()` cleanly (content matches the just-seeded sidecar), (b) successfully unlock/write/re-lock whichever store(s) it touches, and (c) leave the sidecar updated to match. There is no safe way to force a full real gate run outside of normal usage without touching real design work, so this step is: the NEXT time any session actually finishes visual work in this repo and the Stop hook fires for real, confirm it did not print an integrity-mismatch BLOCKED message. Note this explicitly rather than silently assuming it — if it does false-trigger, the fix is almost certainly in `writeProtectedFile()`'s unlock/write/lock ordering, not in `checkIntegrityOrBlock()` itself, since the sidecar was seeded from the exact same content the check will compare against.
