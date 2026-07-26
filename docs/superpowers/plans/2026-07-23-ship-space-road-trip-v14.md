# Ship space-road-trip-v14 to the Tracked Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Formalize `concepts/space-road-trip-v14.html` (already built and manually verified this session) into this repo's tracked build-pipeline records — `concepts/QUEUE.md`, `concepts/manifest.js`, `concepts/NIGHTLY-LOG.md` — and get it committed and pushed to `origin/main` via the pipeline's own guarded commit script, exactly as every prior shipped iteration of this design was recorded.

**Architecture:** This is a records-and-commit task, not a code change — `space-road-trip-v14.html` itself is not touched by this plan. Follow the attended-mode path documented in `.claude/commands/run.md` (work directly in the connected repo, no scratch checkout — Ben is present) but only its Step 0 (preflight-lite: lock + baseline) and Step 6-7 (`ship.md`'s record updates + guarded commit/push) — Steps 1-5 (claim/build/audit) are not repeated here since the actual build and its own extensive verification (headless-Chromium render checks, `node --check`, reduced-motion checkbox checks) already happened earlier this session, outside the formal pipeline. That gap — a real build that never went through `/audit`'s formal Fable second-opinion pass — is disclosed honestly in the `NIGHTLY-LOG.md` entry this plan writes, not glossed over.

**A real constraint discovered while planning this, not assumed:** `concepts/manifest.js`'s `iteration`/`supersedes` chain is validated as *strictly consecutive* per design id (`concepts/tools/validate-manifest.mjs` fails any entry whose `iteration` isn't exactly one more than an existing entry for the same id). The manifest's last tracked `space-road-trip` entry is **iteration 5** (`space-road-trip-v5.html`) — iterations 6 through 13 (the untracked exploratory `.html` filename versions built across this session and the one before it) were never recorded in the manifest. So this ship's new entry is **manifest/QUEUE iteration 6**, even though the file itself is named `v14.html` — the filename-version-number and the tracked-iteration-count are two different, now-diverged counters, and this plan does not attempt to reconcile that history, only to correctly extend the chain from where it actually left off (iteration 5 → 6).

**Tech Stack:** Bash (`concepts/tools/*.sh`), Node (`concepts/tools/validate-manifest.mjs`), git. No test framework — verification is `validate-manifest.mjs`'s own exit code and `git log`/`git status` after the push.

**Context this plan assumes (already decided/done, do not re-litigate):**
- `space-road-trip-v14.html` exists, is `node --check`-clean, and has been rendered end-to-end (headless Chromium) with zero page/console errors in both normal motion and this file's real reduced-motion mode (the in-page `#reducedToggle` checkbox — **not** Playwright's `reducedMotion` context option, which this file does not read at all).
- v14 = the `space-road-trip-v13-camera.html` diner-stop fix, with the meteor-buildup candidate's hero-flyby-visibility fix and the supernova-climax candidate's nova redesign manually grafted on (one real call-site bug from that candidate fixed in the graft), **then** further reworked per Ben's direct follow-up instructions: the drone/single-destination-arrival concept is deleted outright and replaced with a four-rock banking flyby (fresh Recraft-generated diner/motel/arcade/drive-in-theater rock illustrations), and the midnight-galaxy barrel roll is deleted outright.
- A real, still-open, pre-existing gap was found (not caused by this session): the harvest/supernova stop's ember drift and converge→nova→settle sequence have no `reduced` gating anywhere in the file's history. Not fixed this session — deliberately out of scope, and it must be named plainly in the `NIGHTLY-LOG.md` entry this plan writes (see Task 4), not silently omitted.
- No other `.html` file in `concepts/` (`v6` through `v13-*`) is being shipped by this plan — they remain untracked local exploration artifacts, same convention as `v6` itself, which the prior planning session already noted was "an unshipped, untracked draft."

---

### Task 1: Preflight-lite — acquire the run lock and save the git baseline

**Files:**
- None modified — this task only creates `concepts/.nightly-lock/owner.json` (via the script) and a scratch baseline file under `/tmp`.

There is currently no live lock (`concepts/.nightly-lock/` does not exist — confirmed via `ls`) and no `RUN_ID` from this session, since the ship-relevant work happened outside the formal `/preflight` → `/claim` chain. `guarded-commit-push.sh` requires a `RUN_ID` (it forwards to `git-baseline.sh check`), so one must be minted now, and a baseline must be saved under that same `RUN_ID` *before* the commit step, or the check will have nothing to compare against.

- [ ] **Step 1: Confirm no other run is currently holding the lock**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
ls concepts/.nightly-lock/ 2>/dev/null && echo "LOCK EXISTS — stop, do not proceed, read owner.json first" || echo "no lock present, safe to proceed"
```

Expected: `no lock present, safe to proceed`

- [ ] **Step 2: Acquire the lock, capture RUN_ID**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
RUN_ID="$(./concepts/tools/lock-acquire.sh manual)"
echo "RUN_ID=$RUN_ID"
```

Expected: a single line printed of the form `RUN_ID=20260723T...-<pid>-<random>`, exit code 0. Keep this shell variable (or write it to a scratch file, e.g. `echo "$RUN_ID" > /tmp/ship-v14-run-id.txt`) — every remaining task in this plan needs the exact same value.

- [ ] **Step 3: Save the git baseline under this RUN_ID**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
./concepts/tools/git-baseline.sh save "$RUN_ID"
```

Expected: exits 0, no output required. This snapshots the current out-of-scope dirty/untracked state (the pre-existing `.gitignore`/`SKILL.md`/`trivia-questions/*`/fact-hunt-related modifications and untracked files already sitting in the working tree from unrelated earlier work this session) as the accepted baseline, so Task 5's guarded commit doesn't spuriously refuse over drift that has nothing to do with this ship.

---

### Task 2: Update `concepts/QUEUE.md`'s space-road-trip entry

**Files:**
- Modify: `concepts/QUEUE.md`

- [ ] **Step 1: Update the entry header fields**

Find (starts at line 54):

```
### space-road-trip — Space Road Trip (four destinations)
status: built
journeyType: cross-theme
fromTheme: midnight-galaxy
toTheme: autumn-harvest
source: ben-grilled
iteration: 5
file: space-road-trip-v5.html
supersedes: space-road-trip-v4.html
```

Replace with:

```
### space-road-trip — Space Road Trip (four destinations)
status: built
journeyType: cross-theme
fromTheme: midnight-galaxy
toTheme: autumn-harvest
source: ben-grilled
iteration: 6
file: space-road-trip-v14.html
supersedes: space-road-trip-v5.html
```

(`status` stays `built` — a completed revision pass clears back to `built`, never `approved`, per `ship.md`'s own rule; that's Ben's call on a later pass, not this one.)

- [ ] **Step 2: Prepend a new revision-notes entry**

Find the start of the existing revision-notes list:

```
Revision notes (newest first):
- 2026-07-22 [Claude, iteration 5 built + audited — status now `built`, awaiting
  Ben's review]: implemented bank/tilt on arrival + a new quick punch-out
```

Replace with (this inserts one new entry above the existing iteration-5 one, which is otherwise untouched):

```
Revision notes (newest first):
- 2026-07-23 [Claude, iteration 6 built — status now `built`, awaiting Ben's
  review]: ships `space-road-trip-v14.html`. This iteration's actual history
  spans two sessions and was never recorded incrementally in this file or in
  `manifest.js` — recorded here as one entry rather than backfilling nine
  fictitious intermediate ones. Chronologically: (1) a prior session dispatched
  5 independent Fable agents on the diner stop, 2 on the harvest/supernova
  finale, and 1 on the meteor shower, each with full creative authority and a
  requirement to call Recraft; all 8 independently discovered that the file
  they were handed (then `v12.html`) silently crashed on its very first diner-
  stop frame (a deleted function, `drawFloatingIsland`, left called from
  `drawGasWorld`) — nobody had ever actually watched that version play. (2)
  This session manually consolidated the strongest surviving candidates by
  hand (no new agents dispatched): the `v13-camera.html` diner-stop fix (most
  root-caused of 5 independent rebuilds, already carrying a real Recraft
  diner-rock asset) as the base, with the meteor-buildup candidate's hero-
  visibility geometry fix and the supernova-climax candidate's nova redesign
  grafted on top — the latter graft included fixing one real bug in the
  source candidate (`drawHarWorld`'s signature was changed to take a new
  `now` param but its call site was never updated; caught by grep, not
  assumed, before it could ship broken). (3) Ben then gave two more direct
  instructions this same session: scrap the drone/single-destination-arrival
  concept entirely ("each of the four scenes is just going to be a diff vibe
  now") in favor of a movie-style flyby past four separate small business-
  rocks (diner/motel/arcade/drive-in theater — four fresh Recraft
  illustrations, one generation pass so they read as a consistent set,
  background-removed with alpha-content bounds measured programmatically, not
  eyeballed); and delete the midnight-galaxy barrel roll outright. Both
  implemented and verified directly (real headless-Chromium renders, `node
  --check`, and — after discovering this file's `reduced` flag is wired only
  to the in-page `#reducedToggle` checkbox, not the actual
  `prefers-reduced-motion` media query — a corrected reduced-motion check via
  that checkbox specifically). **One real gap surfaced by that correction and
  deliberately left open, not fixed this pass:** the harvest/supernova stop's
  ember drift and its whole converge→nova→settle sequence have zero `reduced`
  gating anywhere in this file's history (pre-dates this session's climax
  work) — checking the box during the finale currently plays the full burst
  identically to normal motion. Flagged in `NIGHTLY-LOG.md`, not silently
  carried forward. **What this ship does NOT include:** no formal `/audit`
  Fable second-opinion pass was run against the final `v14.html` specifically
  — verification was direct (this session's own headless renders +
  screenshots), not the pipeline's own second-reviewer step. Ben's own job:
  everything real-time-feel (not just frame-correctness) always is in this
  file — specifically, does the flyby's banking read right at real speed, and
  do the four rock illustrations hold up at real venue-TV brightness.
- 2026-07-22 [Claude, iteration 5 built + audited — status now `built`, awaiting
  Ben's review]: implemented bank/tilt on arrival + a new quick punch-out
```

- [ ] **Step 3: Sanity-check the edit**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
grep -n "^iteration: 6$" concepts/QUEUE.md
grep -n "^file: space-road-trip-v14.html$" concepts/QUEUE.md
```

Expected: both `grep` calls print exactly one matching line each.

---

### Task 3: Update `concepts/manifest.js` (atomic write)

**Files:**
- Modify: `concepts/manifest.js`

- [ ] **Step 1: Build the new entries array and write it via the tmp-file + atomic-rename procedure**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
node -e "
const fs = require('fs');
const src = fs.readFileSync('concepts/manifest.js', 'utf8');
const marker = 'window.MANIFEST = ';
const start = src.lastIndexOf(marker) + marker.length;
let jsonText = src.slice(start).trim();
if (jsonText.endsWith(';')) jsonText = jsonText.slice(0, -1);
const entries = JSON.parse(jsonText.replace(/\\\\u003c/g, '<'));

entries.push({
  id: 'space-road-trip',
  file: 'space-road-trip-v14.html',
  journeyType: 'cross-theme',
  fromTheme: 'midnight-galaxy',
  toTheme: 'autumn-harvest',
  status: 'draft',
  degraded: false,
  source: 'ben-grilled',
  date: '2026-07-23',
  iteration: 6,
  supersedes: 'space-road-trip-v5.html',
  revisionNotes: [],
});

// Escape every literal '<' in string field values so a value containing the
// literal substring '</script>' can't break out of the script tag — the same
// rule this file's own header comment states, enforced here, not by hand.
const escaped = JSON.stringify(entries).replace(/</g, '\\\\u003c');

const out = \`// Generated and rewritten by the nightly Storybook Agent — never hand-edited.
window.MANIFEST = \${escaped};
\`;
fs.writeFileSync('concepts/manifest.js.tmp', out);
console.log('wrote concepts/manifest.js.tmp,', entries.length, 'entries');
"
```

Expected output: `wrote concepts/manifest.js.tmp, 6 entries`

- [ ] **Step 2: Validate the tmp file BEFORE renaming it into place**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
node concepts/tools/validate-manifest.mjs concepts/manifest.js.tmp
```

Expected: `VALID: 6 entries, all fields well-formed, (id,iteration) pairs and filenames unique, iteration chains consistent.` and exit code 0.

If this fails: **do not rename the tmp file into place.** Fix `manifest.js.tmp` (or redo Step 1) and re-validate. This mirrors `ship.md`'s own rule — treat a validation failure exactly like a failed sanitizer self-test.

- [ ] **Step 3: Atomic rename into place**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
mv concepts/manifest.js.tmp concepts/manifest.js
```

- [ ] **Step 4: Re-validate the real file (not just the tmp file) as a final check**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
node concepts/tools/validate-manifest.mjs
```

Expected: `VALID: 6 entries, all fields well-formed, (id,iteration) pairs and filenames unique, iteration chains consistent.`

---

### Task 4: Append the `concepts/NIGHTLY-LOG.md` entry

**Files:**
- Modify: `concepts/NIGHTLY-LOG.md`

This entry's `commit:` line cannot be known yet (the push in Task 5 hasn't happened). Write it now with `commit: pending (see follow-up entry below, Task 6)` — the same "claim commit; completion commit sha appended after Step 7" pattern this file's own very first real entry (2026-07-20 23:51 UTC) already used.

- [ ] **Step 1: Get the current UTC timestamp for the entry header**

```bash
date -u +"%Y-%m-%d %H:%M UTC"
```

Use the printed value in place of `<DATE> <TIME> UTC` below.

- [ ] **Step 2: Append this entry to the end of `concepts/NIGHTLY-LOG.md`**

```
## <DATE> <TIME> UTC — run <RUN_ID>
trigger: manual (attended, Ben present — `/run`'s attended path per `.claude/commands/run.md`, not the scratch-checkout unattended path; working directly in the connected folder)
claimed: space-road-trip (iteration 5 → 6)
preflight: pass (lock acquired clean via Task 1; git-baseline saved under this run's own RUN_ID; manifest confirmed valid before any edit — see Task 3 Step 4's pre-edit run this same session)
sprites: 8 Recraft `generate_image` calls (4 businesses × n=2 candidates each: diner, motel, arcade, drive-in theater, one generation pass so the set reads consistently), 4 selected + 4 `remove_background` calls, all 8 succeeded. Alpha-content bounds for each selected image measured programmatically via a headless-canvas scan (not eyeballed) before being wired into the new flyby geometry.
audit: fixed (one real bug: a grafted candidate's `drawHarWorld` signature took a new `now` param but its call site was never updated — caught by grep during the manual consolidation, fixed before verification, not assumed correct). **Not run: this ship's own formal `/audit` Fable second-opinion pass** — verification this pass was direct (headless-Chromium renders across both normal and reduced motion, `node --check`, targeted screenshot spot-checks of the meteor hero streaks, the nova peak, and all four flyby rocks), not the pipeline's own second-reviewer step. Flagged plainly, not glossed over. **A real, pre-existing, still-open gap found while re-verifying reduced motion correctly (via the in-page `#reducedToggle` checkbox, not Playwright's `reducedMotion` context option, which this file's `reduced` flag does not read at all):** the harvest/supernova stop's ember drift and its whole converge→nova→settle sequence have zero `reduced` gating anywhere in this file's history — pre-dates this session, not introduced by it, and not fixed this pass (out of scope for what was asked). Checking the box during the harvest finale currently plays the full supernova burst identically to normal motion.
result: built space-road-trip-v14.html (iteration 6, supersedes space-road-trip-v5.html — v5.html itself untouched, per the iterations-never-overwritten-in-place rule). Full technical account of what changed and why lives in `QUEUE.md`'s own revision-notes entry for this iteration and in `space-road-trip-v14.html`'s own `.notes` div.
commit: pending (see follow-up entry below)
```

- [ ] **Step 3: Sanity-check the append**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
tail -20 concepts/NIGHTLY-LOG.md
```

Expected: the entry from Step 2 is the last thing in the file, ending in `commit: pending (see follow-up entry below)`.

---

### Task 5: Guarded commit and push

**Files:**
- Commits (does not further modify): `concepts/QUEUE.md`, `concepts/manifest.js`, `concepts/NIGHTLY-LOG.md`, `concepts/space-road-trip-v14.html`

- [ ] **Step 1: Run the guarded commit+push script**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
./concepts/tools/guarded-commit-push.sh "$RUN_ID" "nightly: built space-road-trip v6 (iteration 6, file v14.html — flyby rework + barrel-roll removal)" concepts/QUEUE.md concepts/manifest.js concepts/NIGHTLY-LOG.md concepts/space-road-trip-v14.html
```

(If `$RUN_ID` is no longer set in your current shell because Task 1 ran in a different shell session, read it back first: `RUN_ID="$(cat /tmp/ship-v14-run-id.txt)"`.)

- [ ] **Step 2: Capture the machine-readable result line**

The script prints exactly one `RESULT: <status> sha=<sha-or-none>` line to stdout as the last thing it does. Capture it:

```bash
RESULT_LINE="$(./concepts/tools/guarded-commit-push.sh "$RUN_ID" "nightly: built space-road-trip v6 (iteration 6, file v14.html — flyby rework + barrel-roll removal)" concepts/QUEUE.md concepts/manifest.js concepts/NIGHTLY-LOG.md concepts/space-road-trip-v14.html | tail -1)"
echo "$RESULT_LINE"
```

Expected: `RESULT: pushed sha=<40-char-hex>` (the happy path — this session's branch is `main`, up to date with `origin/main` per the git status already checked, and Ben has push credentials already configured per this repo's own git remote setup).

**If the result is anything other than `pushed`:** stop here — do not proceed to Task 6. `push-rejected`/`push-auth-failed`/`push-failed` are real stuck-protocol conditions per this script's own documented behavior (it never force-pushes or auto-rebases). Report the exact status word and let Ben decide the next step; don't guess a workaround.

**⚠️ This step pushes directly to `origin/main`, a shared branch — a hard-to-reverse, visible-to-others action.** Confirm with Ben immediately before running Step 1 if this hasn't already been explicitly authorized as part of choosing this plan.

---

### Task 6: Backfill the real commit sha into `NIGHTLY-LOG.md`

**Files:**
- Modify: `concepts/NIGHTLY-LOG.md`

- [ ] **Step 1: Replace the placeholder commit line**

Find:

```
commit: pending (see follow-up entry below)
```

Replace with (substituting the actual sha captured in Task 5 Step 2):

```
commit: pushed sha=<SHA_FROM_TASK_5>
```

- [ ] **Step 2: Commit this one-line follow-up**

This is a second, separate commit — never amend the previous one (this repo's own hard rule: "CRITICAL: Always create NEW commits rather than amending"). It touches only `NIGHTLY-LOG.md`, so `git-baseline.sh check`'s out-of-scope-drift concern doesn't apply any differently than it did in Task 5, but still route it through the same guarded script for consistency (same allowlist-only-commit guarantee):

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
./concepts/tools/guarded-commit-push.sh "$RUN_ID" "nightly: record commit sha for space-road-trip v6 (v14.html)" concepts/NIGHTLY-LOG.md
```

Expected: `RESULT: pushed sha=<a-different-40-char-hex>` on the final line.

---

### Task 7: Release the lock and do a final sanity check

**Files:**
- None modified — removes `concepts/.nightly-lock/`.

- [ ] **Step 1: Release the lock**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
./concepts/tools/lock-release.sh "$RUN_ID"
```

Expected: exits 0; `concepts/.nightly-lock/` no longer exists.

- [ ] **Step 2: Confirm the working tree and remote agree**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
git log --oneline -3
git status --short concepts/QUEUE.md concepts/manifest.js concepts/NIGHTLY-LOG.md concepts/space-road-trip-v14.html
git fetch origin main --quiet
git log --oneline origin/main -1
```

Expected: the two most recent local commits are the ones from Task 5 and Task 6 (in that order, newest last shown as most recent); the `git status --short` line for all four paths prints nothing (clean — they're committed, not still dirty); `origin/main`'s latest commit matches your local `HEAD`.

- [ ] **Step 3: Confirm `node --check` still passes on the now-committed file (paranoia check — the working copy shouldn't have changed, but confirm the shipped bytes are the same ones verified earlier this session)**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/concepts
node -e "
const fs = require('fs');
const html = fs.readFileSync('space-road-trip-v14.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
scripts.forEach((s, i) => fs.writeFileSync('/tmp/ship-check' + i + '.js', s));
"
node --check /tmp/ship-check0.js && node --check /tmp/ship-check1.js && echo "SHIPPED FILE SYNTAX OK"
```

Expected: `SHIPPED FILE SYNTAX OK`

---

## Self-review notes (for whoever executes this)

- Every `Edit`-style "Find/Replace" block above quotes the *exact* current text of `concepts/QUEUE.md` as read during planning — if QUEUE.md has changed since this plan was written, re-read it and adjust the `Find:` block before applying, don't force a stale match.
- Task 3's manifest rebuild reads the *current* `concepts/manifest.js` at execution time (not a hardcoded copy of today's 5 entries) — it will correctly include any entries added between now and execution, as long as nothing else touches the `space-road-trip` id's iteration chain in the meantime.
- If Task 1's lock acquisition fails with exit code 2 (another live lock held), stop — do not override or delete another run's lock file by hand.
