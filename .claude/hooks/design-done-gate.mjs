#!/usr/bin/env node
// .claude/hooks/design-done-gate.mjs
//
// The mechanical backstop for "declared done without ever rendering it" —
// what actually happened to Campfire Sing-Along (shipped as a lit rectangle,
// never rendered, never committed, since fully deleted from this codebase).
// Wired as a Stop/SubagentStop hook.
//
// Changelog runs NEWEST FIRST. (v5 was appended below v4 by the pass that
// wrote it, which put the running record out of order in the one file whose
// whole point is an honest running record. Re-sorted here.)
//
// v10 (2026-07-28, round-2 independent review — concepts/design-pipeline-hardening-review-round2.md
// found two real bugs in what v9-era work shipped, confirmed by replaying the actual historical
// `logs` incident through the live code, not taken on faith):
//   1. THE MAJOR-DEFECT OVERRIDE WAS UNREACHABLE for the exact scenario it was built to catch. Both
//      critic prompts instruct "if it's major, vote FAIL," so a PASS-voting sample can never
//      legitimately carry a major tag — in the common 2-1 PASS split, only the one dissenting
//      (FAIL-voting) sample can ever name one, and the override required 2+ SAMPLES to agree on the
//      same major tag, which can never happen in that shape. Replaying `logs` (2 PASS with no majors,
//      1 FAIL naming box-tell+silhouette-mismatch as major) through the pre-fix code confirmed it:
//      majorOverride stayed false, verdict stayed PASS. Fixed by adding `dissentMajors` to
//      tallyDefects()'s return value (major tags named by any FAIL-voting sample) and OR-ing it into
//      both gates' majorOverride condition. The 2+-agreement condition is kept as a secondary
//      belt-and-suspenders branch, not removed — it just isn't what fires in the common case anymore.
//   2. A lone dissent on an otherwise-PASSing verdict was written to the verdict JSON and case log but
//      printed to stderr in NEITHER gate on a PASS (the quality gate only surfaced it inline as part
//      of a FAIL message). The worker's "relay non-blocking findings on a PASS" instruction had
//      nothing real to relay for exactly the case that motivated it. Both gates now print
//      `defectsSingleSample` unconditionally, mirroring the existing agreedMinor/minorFindings
//      "whatever the verdict" pattern.
//
// v9 (2026-07-27, sixth and final review pass of the night. v8's two headline
// fixes were re-tested in a scratch git repo, not re-read: (1) the
// session-start diff baseline genuinely catches every element across MULTIPLE
// session commits — built A, committed, built C, committed, and the gate
// demanded evidence for A and C both, where v7's `^!` would have shown only C;
// (2) the strong/weak Bash split genuinely drops a render-only command —
// `node concepts/tools/visual-audit.mjs concepts/scene.html` against a file
// whose mtime predates the session produced exit 0 and reviewed nothing. Both
// hold. What this pass changed:):
//   1. THE WEAK/STRONG SPLIT WAS PER COMMAND, NOT PER SEGMENT — so it leaked
//      exactly the false positives it was written to stop, one level up.
//      `sed -i s/a/b/ concepts/a.html && node render.mjs concepts/b.html` marked
//      BOTH files session-authored, because `sed -i` matched the whole command
//      string and the unanchored tier then swept every visual path in it.
//      Reproduced in the scratch repo (2 files reviewed, one of them only
//      rendered). Compound commands are how agents actually write Bash, so this
//      was not an edge case. All three tiers now run per segment, split on
//      `&&`, `||`, `;`, `|` and newlines.
//   2. OVER-BLOCKING, which is a failure mode this file had never treated as
//      one. A brand-new `client/src/components/display/*.jsx` was pulled into
//      the full craft review no matter what it was — so a scoreboard, a caption
//      bar or a timer got hard-blocked demanding a screenshot named after a line
//      range, a "PASS = a fresh viewer names this as ___" sentence about a flex
//      container, and a QUALITY_REFERENCE pointing at a locked reference image
//      nobody ever art-directed. No override existed for it. The only way to
//      ship one was to switch the hook off, and a gate people switch off is not
//      a gate. Scope is now: concepts/**.html always (that directory IS the
//      image-first build lab), and a display .jsx only when it shows a
//      figurative signal — an ELEMENT:/QUALITY_REFERENCE: marker, or an
//      <svg>/<canvas>/radial-gradient/clip-path drawing surface. See
//      inCraftScope for the honest statement of what that lets through.
//   3. A comment that still disagreed with the code directly beneath it — the
//      SAME false "the dirty scan feeds check 1" claim v8's own changelog says
//      it corrected. v8 fixed the copy 30 lines lower and left this one
//      standing. Check 1 runs its own per-file `git status`; when the transcript
//      is readable `dirtyVisualFiles` is computed and never read again.
//   4. Readability, after five rounds of patches: the pass-criterion check was
//      evaluated inside the per-slug loop while testing the whole file, so a new
//      five-element file printed the same paragraph five times; it is one
//      file-level check now, with the per-element proximity warning left where
//      it belongs. `abs` was read from disk three times per file (slug loop,
//      rotation check, quality gate) and is read once. `freshShotsFor`'s `shots`
//      return had no remaining caller — it now backs a genuinely better message
//      that distinguishes "never captured" from "captured, but before your last
//      edit," which was previously indistinguishable to the agent reading it.
//   5. geometry-lint's Bash path linted every visual file NAMED in a command,
//      including read-only renders — so rendering any legacy scene carrying a
//      known FAIL row exited 2 and told the agent to fix a file it never
//      touched, every time. Bash-derived paths now also have to have been
//      modified in the last 60s. Named-path payloads are untouched.
//
// v8 (2026-07-27, fifth review pass — v7's front-door fix was re-derived by
// hand and by scratch-repo test and it HOLDS: session authorship is now the
// trigger, committing cannot remove a file from review, and the trigger is
// scoped to writes, not reads (Read/Grep/Glob were never harvested). What v7
// left, plus what it broke on the way in):
//   1. THE SAME BYPASS, SMALLER, IN diffForFile(). v7's committed-file fallback
//      was `git diff <last commit touching the file>^!` — one commit. Build
//      elements A and B, commit, tweak C, commit again, Stop: the diff shows
//      only C, so A and B get no screenshot demand, no critic spawn and no
//      possible strike. Commit twice and the first commit's elements walk. Git
//      state was still deciding what got looked at, which is the exact shape of
//      the thing v7 fixed one level up. Now: baseline is the last commit
//      touching the file BEFORE this session started (session start read from
//      the transcript's earliest timestamp), and the diff is working-tree vs
//      that baseline — every session commit, plus staged, plus unstaged, in one
//      diff. No pre-session commit ⇒ the whole file is this session's work ⇒
//      whole-file, which is the correct scope there rather than a fallback.
//      v7's chain survives only for a transcript with no usable timestamps, and
//      now says out loud that it only scopes the last commit.
//   2. The Bash-write harvest was over-inclusive in a way its own comment
//      mis-described. That comment said a false positive "costs one extra
//      screenshot"; it costs a HARD BLOCK — commit, lint, per-element shots,
//      rotation evidence, QUALITY_REFERENCE and two critic panels, all demanded
//      of a file the session only read. And the regex matched bare `\bnode\b`,
//      so this repo's own render command (`node concepts/tools/visual-audit.mjs
//      concepts/scene.html`) marked the scene as session-authored. Rendering is
//      not authoring. Split into strong signals (redirect, tee, sed -i, cp, mv
//      onto the named path — always counted) and weak ones (an interpreter
//      command merely mentioning a visual path — counted only if the file's
//      mtime is at or after session start, i.e. it really did change while this
//      session ran). Weak matches are still counted whole when the session
//      can't be dated.
//   3. The comment above `touchedFiles` claimed "union, session side primary"
//      about a ternary, and claimed the dirty scan "feeds check 1" when check 1
//      runs its own per-file `git status`. Two false claims about the ten lines
//      underneath them, in the file whose whole point is an honest record.
//      Rewritten to say what the code does. (v7 item 1 below carries the same
//      wrong "input to check 1" phrase; corrected in place there.)
//   4. Repo-boundary bug in the transcript harvest: `abs.startsWith(REPO_ROOT)`
//      matched a SIBLING directory whose name merely started with the repo's,
//      and the slice then produced a phantom repo-relative path. Requires the
//      separator now, and paths genuinely outside the repo are dropped instead
//      of passed through raw.
//   5. RECURSION. Every critic is a `claude -p` spawned with cwd = REPO_ROOT, so
//      it inherits this repo's settings.json, so ITS Stop fires this hook again.
//      It happens to exit 0 today (a critic only reads, so its session-written
//      set is empty) — luck, not design: one write given to a critic, or the
//      transcript-unreadable fallback firing inside the child, and each child
//      spawns three more. Spawns now carry DESIGN_GATE_CHILD=1, inherited by
//      the child's own hooks, and the gate exits 0 immediately when it sees it.
//   6. A frozen pass-criterion sentence is now checked DETERMINISTICALLY before
//      the critic is spawned. It was already a hard blocker — the correctness
//      critic is told to FAIL any element with no "PASS = a fresh viewer names
//      this as ___" sentence, and the single real gate-written record in
//      design-cases.json is a 3-0 FAIL for exactly that — but it was an
//      expensive one (a strike plus a three-model panel spent on a missing
//      comment) and it appeared in NO worker-facing document. Checked here now,
//      costing no strike and naming the fix; and written into the worker agent's
//      conventions list, where every other blocking convention already was.
//   7. Smaller, all verified against the code rather than assumed: the named-
//      model fallback message claimed the retry was "NOT model-independent from
//      sample 1", which stopped being true when v7 made all three slots named
//      (the default's identity is unknowable from here — it may duplicate any
//      slot or none); the quality gate's missing-shot message described a
//      looser naming rule than freshShotsFor() enforces and omitted the 15KB
//      floor the per-element message states; a quality FAIL with no agreed
//      MAJOR defect now prints its agreed MINOR findings instead of reading as
//      "failed over nothing" (that combination is reachable — the verdict is the
//      vote, and severity only ever overrides a PASS, never softens a FAIL);
//      and geometry-lint's multi-file path mapped `status === 2 ? 2 : 0`, so a
//      CRASHED child lint (exit 1, or a signal) counted as a clean pass.
//   8. The critics were handed STALE screenshots. freshShotsFor() returned
//      every capture matching the slug and a boolean saying at least one was
//      fresh — and both callers then sent the whole list to the panel. So a
//      scene fixed after a bad capture had its panel look at the bad capture
//      too (and, with the correctness caller's order rotation, sometimes FIRST),
//      spending a strike on a version of the file that no longer exists. Every
//      other check here insists evidence must postdate the file; the evidence
//      actually put in front of the critic now does too.
//   9. `.design-attempt-counts.json` was read once at the top and written whole
//      at the bottom — last-writer-wins. Two sessions in this repo at once (the
//      situation v3's session scoping exists to support) could each read
//      `fails: 1`, each record a strike, and leave 2 where there should be 3:
//      a two-strike stop that silently never fires. Now merged against disk at
//      write time, highest count wins, with one deliberate exception for a
//      counter this run reset by consuming an override.
//  10. The per-slug loop reported one missing thing at a time: the screenshot
//      check `continue`d, so a slug missing both a screenshot and a criterion
//      told you about the screenshot, and only after you rendered and stopped
//      again did it mention the criterion. Deterministic checks all run and all
//      report now; only the critic spawn is skipped when any of them failed.
//
// v7 (2026-07-27, fourth review pass — an independent grader read v6 cold and
// found a front-door bypass that made every check below decorative. Verified by
// hand-trace and by a scratch-repo test before fixing; all of it was real):
//   1. THE ENTIRE GATE WAS SKIPPABLE BY COMMITTING FIRST, and worse, that was
//      the ONLY way a Stop ever succeeded. The trigger was
//      `dirty visual files ∩ this session's writes`. A file committed before
//      Stop is not dirty, so the set was empty and the script exited 0 at the
//      early exit — no screenshot check, no critic spawn, no quality gate.
//      Meanwhile check 1 below BLOCKS any file that IS still dirty ("not
//      committed"). Those two facts together meant: dirty ⇒ always blocked,
//      committed ⇒ never checked. The successful path was always the bypass.
//      Every fix in v2-v6 sat on a branch that the passing case never entered.
//      The trigger is now "visual files THIS SESSION WROTE," read from the
//      transcript, independent of git state. Committing no longer removes a
//      file from the gate's attention; it only satisfies check 1. The dirty-
//      file scan survives solely as the fallback for an unreadable transcript.
//      [Corrected in v8: this entry originally also claimed the dirty scan was
//      "the input to check 1." It is not and never was — check 1 runs its own
//      per-file `git status`, and `dirtyVisualFiles` is untouched whenever the
//      transcript is readable.]
//      (Architecture note, since a PreToolUse guard on `git commit` is the
//      obvious alternative: rejected. Stop fires at the end of every turn, so
//      session-write scope is already complete coverage, whereas a Bash-matcher
//      PreToolUse hook fires only on commits routed through the Bash tool, has
//      a documented matcher-matching bug for `Bash(git commit:*)`
//      (anthropics/claude-code#36389), and would have to re-derive the same
//      evidence one step earlier for no extra coverage. Fix the trigger, don't
//      add a second gate with its own holes.)
//   2. Files written by Bash (heredoc, `>`, `tee`, `sed -i`, a generator
//      script) were invisible to BOTH hooks: `sessionTouchedFiles()` harvested
//      only Edit/Write/NotebookEdit/MultiEdit, and geometry-lint's PostToolUse
//      matcher in settings.json was `Edit|Write` — which also missed MultiEdit
//      and NotebookEdit outright. Bash commands that look like writes are now
//      harvested here, and settings.json + geometry-lint were widened to match.
//   3. `isNewFile` tested `^\?\?` against git status. `git add` on a brand-new
//      file changes that prefix to `A `, so staging a new file downgraded the
//      MANDATORY QUALITY_REFERENCE requirement to the warn-only "legacy file"
//      path. Now: a file with no commit touching it (`git log -1 -- <file>`
//      empty) is new, which is true for untracked AND staged-never-committed.
//   4. `freshShotsFor()` matched with `startsWith()`, so element `flame` ate
//      `flame-inner`'s screenshots (and the rotation regex `ELEMENT:\s*flame`
//      matched `ELEMENT: flame-inner`). Shot names must now equal the slug or
//      be a numbered variant of it; the marker scan is word-boundaried.
//   5. Two overclaims removed. The panel-collapse "we always say so" was only
//      true when fewer than 2 samples parsed — the common case (one named-model
//      spawn falls back, panel still returns 3) said nothing anywhere. Spawn
//      failures and a panel with fewer than 2 DISTINCT models are now always
//      announced. And the screenshot message claimed "a same-named-but-
//      unrelated screenshot must not satisfy this check" when the check is
//      filename + mtime + size and cannot tell; it now says what it checks.
//   6. QUALITY_REFERENCE `https://` values skipped the existence check and
//      almost certainly cannot be opened by the spawned critic anyway — an
//      unopenable reference produces reference-blind samples, which this gate
//      then drops, which reads as a spawn failure. Remote references are now
//      refused with an instruction to vendor the image into the repo.
//   7. Defect SEVERITY. The quality rubric was binary, so a real-but-minor
//      defect two samples both saw had nowhere to go: `defects` had to be empty
//      on a PASS, so the finding was discarded. Defects now carry
//      `severity: minor|major`. Agreed minor defects are recorded on a PASS
//      instead of thrown away; an agreed MAJOR defect (2+ samples) forces FAIL
//      even if the vote said PASS, since that is the panel contradicting itself
//      in the one direction this gate is not allowed to round down.
//   8. The panel is three NAMED models (sonnet/opus/haiku) rather than
//      default+opus+haiku, which silently duplicated a model whenever the
//      ambient session default happened to be opus or haiku. Per-sample
//      fallback to the default on an unavailable model is unchanged.
//
// v6 (2026-07-27, third review pass — verification of v5's claims, then the
// gaps v5 left). v5's four fixes were re-derived and hold: the ELEMENT: scan
// was tested against a real untracked multi-element file and now finds every
// marker including the second one, and against a tracked file whose edit sits
// directly under its marker. Fixed on top of that:
//   1. THE PANEL WAS THREE SAMPLES OF ONE MODEL. Every prose file in this
//      system (the quality-critic agent, design-cases.json's `_sampleVotes`
//      note) correctly warns that LLM judge panels make correlated errors and
//      that a 3-0 is weaker than it looks — and the code then did nothing
//      about it, which is the worst of both: the caveat documented, the cheap
//      mitigation skipped. spawnCriticVotes() now runs a heterogeneous panel
//      (default model, opus, haiku) instead of one model three times, per the
//      juries-over-judges result; a named-model spawn failure falls back to the
//      default and SAYS so rather than quietly shrinking the panel, and the
//      model behind each counted vote is recorded in the verdict's `panel`
//      field so a later reader can tell a real panel from a collapsed one.
//      This reduces correlated error; it does not eliminate it, and nothing in
//      this file should be reworded to suggest it does.
//   2. v5's own two fixes collided. Making verdicts stale on file edit, plus
//      making the second Stop pass ENFORCE a cached verdict, together produced
//      a path where the single-use `unlocked` override was CONSUMED against a
//      verdict this script had itself just declared out of date (second pass,
//      fix already edited in, loop-guard forbids re-spawn). Ben's deliberate
//      override, spent on stale evidence, and no fresh strikes bought with it.
//      A stale verdict may now lift the two-strike stop but may not spend the
//      override; consumption waits for a verdict about the current file.
//   3. Rotation evidence was the only evidence in this gate checked for
//      EXISTENCE but not FRESHNESS — screenshots and both critic verdicts must
//      postdate the file, a rotation-check.json did not. So a run from before
//      the edit that broke the motion satisfied it forever: a check that cannot
//      see the failure it exists to catch, which is the meadow-swing failure
//      verbatim. Now required to be newer than the file, with a message that
//      distinguishes "missing" from "stale."
//   Also: the correctness caller's per-sample screenshot rotation is now
//   documented as the no-op it genuinely is when an element has exactly one
//   screenshot (the common case), rather than left implying variance it
//   doesn't provide; and the duplicated literal .audit-shots path was folded
//   into the existing SHOT_DIR constant.
//
// v5 (2026-07-27, second independent review pass over v4) — v4's fixes are
// real and hold up, but it left four holes open and opened one of its own:
//   1. The `ELEMENT:` marker scan searched UPWARD from the hunk header only.
//      With `-U15` the header sits 15 lines ABOVE the change, so a marker
//      written directly above the changed code lands INSIDE the hunk and was
//      never read. On an untracked file it was worse: a new file is ONE hunk
//      starting at line 1, so the scan looked at exactly line 1 and stopped —
//      meaning element markers could never be found on a brand-new file, the
//      only kind of file this convention was written for. That is precisely
//      how `concepts_campfire-sing-along-v1.html_L1` got into design-cases.json;
//      v4 fixed the null-elementName half of that bug and left this half. The
//      scan now covers the whole hunk body plus 20 lines above it, and emits
//      one slug PER marker found in the hunk rather than last-marker-wins.
//   2. The loop guard still failed open on the single most important check.
//      On the second Stop attempt the critic step did `continue` BEFORE
//      reading the cached verdict — so a FAIL recorded on attempt one was not
//      even looked at on attempt two. Fail once, hit Stop again, walk free:
//      the exact hole v2's header claims to have closed. Cached verdicts are
//      now ENFORCED on the second pass; only the spawn is skipped.
//   3. Verdicts cached for an hour were never invalidated by editing the file.
//      Fix the scene, re-Stop, and a stale FAIL blocked you for up to an hour
//      (and a stale PASS would have cleared a scene that changed underneath
//      it). A verdict older than the file's own mtime is now stale.
//   4. `unlocked: true` was a PERMANENT bypass of the two-strike stop for that
//      slug — set once, never checked again, never cleared, so every future
//      failure of that element also walked. It is now consumed on use: the
//      counter resets and the flag clears, giving a re-locked element a fresh
//      two strikes rather than immunity.
//   5. v4's own spawnCriticVotes() doc-comment says callers vary presentation
//      order per sample "so three votes are genuinely three reads." The
//      quality caller does. The correctness caller passed a closure ignoring
//      `i` — three byte-identical prompts. Now varied there too.
//   Also: `other` is no longer allowed to become an agreed defect (two samples
//   reaching for the catch-all tag for unrelated reasons is a false agreement,
//   the known failure mode of closed-vocabulary tagging); defect tags are
//   validated against the critic file's closed set; a quality verdict that
//   couldn't be recomputed no longer falls through to a stale one; setup code
//   above the main loop is inside the crash-to-BLOCK wrapper; and a quality
//   FAIL on a file whose elements all passed correctness now says so out loud,
//   because that disagreement is diagnostic rather than noise.
//
// v4 (2026-07-27, review pass on the same night's QUALITY-gate addition) —
// the quality gate shipped as a parallel system with its own conventions and
// its own copies of shared logic. Fixed here:
//   1. `elementName` was derived as `slug.includes('::') ? ... : null` — but
//      slugify() rewrites ':' to '_', so it was ALWAYS null. Element-scoped
//      rotation detection silently degraded to whole-file, and design-cases
//      records got line-anchored slugs as their `noun` (see the campfire L1
//      entry in design-cases.json — that's this bug, on the record). The
//      element name is now carried alongside the slug, not re-parsed from it.
//   2. Strike counting keyed off hook RUNS, not verdicts. Verdicts cache for
//      an hour; two Stop attempts inside that hour against one cached FAIL
//      burned both strikes and locked the element before a second attempt
//      existed. Now counted once per distinct verdict timestamp. Case records
//      had the same duplication and are now written only for fresh verdicts.
//   3. A deleted/renamed visual file (git status lists deletions) hit
//      readFileSync and threw — exit 1, which Claude Code treats as
//      non-blocking. Failing OPEN, the one thing the header promises. Deleted
//      files are now skipped and the whole pass is crash-wrapped into a BLOCK.
//   4. The quality gate invented `<basename>-quality*.png` screenshot naming,
//      unrelated to the per-element slug convention next to it. Both now use
//      one `freshShotsFor(prefix)` helper and one prefix rule.
//   5. spawnCriticVotes() existed but the correctness loop still ran its own
//      copy-pasted spawn/parse block. Both call it now. Its JSON extraction is
//      a real brace scan instead of two regexes that couldn't see two levels
//      of nesting, and spawn failures are reported instead of vanishing.
//   6. Quality-critic samples that never opened the reference image
//      (`referenceUsed: false`) were counted as votes. Now dropped.
//      QUALITY_REFERENCE paths are checked for existence, and the marker is
//      REQUIRED (blocking) on new/untracked files instead of only warned about.
//   7. Defect tags were unioned across samples — three private vocabularies in
//      one list. Now tags agreed by 2+ samples are the finding; singletons are
//      recorded separately. The critic file was given a closed tag set to match.
//
// v3 (2026-07-27) — touchedFiles was every dirty visual file in the repo,
// not just this session's. A prior session's abandoned WIP (or another
// agent's scratch files) sitting untracked in concepts/ blocked EVERY
// Stop for an unrelated session forever. Now intersected with files this
// session's own transcript actually wrote via Edit/Write/NotebookEdit —
// a background subagent's files get judged by ITS OWN SubagentStop pass,
// not the dispatching session's.
//
// v2 (2026-07-26) — three independent fresh-context research/audit passes
// (all landed within 2 points of each other: 52, 54, 54/100) found four real
// bugs in v1, fixed here:
//   1. Slug was `basename(file)` — every element in a multi-element file
//      (e.g. ParticleBackground.jsx, which holds every ambient theme) shared
//      ONE strike counter. Now derived per-hunk from a required
//      `ELEMENT: <name>` marker comment near the touched code (falls back to
//      a line-anchored slug if no marker exists yet — flagged as degraded,
//      not silently accepted as equivalent).
//   2. The critic spawn sent a generic one-line paraphrase of the critic's
//      job ("Act as the trivia-os-design-critic agent...") instead of the
//      actual agent definition. Now reads and forwards
//      .claude/agents/trivia-os-design-critic.md's real body text.
//   3. The screenshot freshness check accepted ANY recent >15KB PNG in the
//      shots directory, not one that actually corresponds to the touched
//      element. Now requires the screenshot filename to start with the
//      derived slug (a naming convention the worker agent must follow).
//   4. The stop_hook_active loop guard failed OPEN on the second Stop
//      attempt, skipping EVERY check (not just the critic spawn) — "try
//      twice and walk free." Now: on the second pass, only the critic-spawn
//      step (the one genuinely at risk of hanging/looping) is skipped;
//      geometry-lint and the commit check still run and still block.
//
// HONESTY NOTE (do not delete): still-unverified Claude Code hook mechanics
// from v1 remain unverified — SubagentStop's stop_hook_active field and
// agent-name matcher behavior, and whether `claude -p` can really be spawned
// from inside a hook process. This script fails toward blocking with manual
// instructions, not failing open, wherever an assumption might be wrong.
//
// Exit 0 = allow Stop. Exit 2 = block, forcing the agent to keep working.

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync, lstatSync, mkdirSync, readdirSync, appendFileSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOT_DIR = resolve(REPO_ROOT, 'concepts', '.audit-shots');
const VERDICT_DIR = resolve(REPO_ROOT, 'concepts', '.design-critic-verdicts');
const COUNTS_FILE = resolve(REPO_ROOT, 'concepts', '.design-attempt-counts.json');
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
// Turtles-all-the-way-down limitation, accepted: this sidecar cannot record a hash of itself, so its
// own protection rests on the chmod-444 lock plus the Bash-text guard's JSON_STORE_PATH_RE entry for
// it — the same category of imperfect defense as everything protect-json-stores.mjs itself accepts.
// A bypass that reaches this file directly reaches the sidecar in the same breath.
const INTEGRITY_FILE = resolve(REPO_ROOT, 'concepts', '.design-gate-integrity.json');
// OS-level backstop (independent of, and does not rely on, protect-json-stores.mjs at all): every
// protected file is chmod'd read-only immediately after this gate writes it, and briefly unlocked
// only around the gate's own next write. An ordinary accidental overwrite — `> file`, an editor
// save, a script that doesn't specifically re-chmod first — fails at the filesystem level even if
// some future Bash construct slips past the text guard entirely undetected.
const PROTECTED_STORE_MODE = 0o444;
const WRITABLE_MODE = 0o644;
// This hook can and does run concurrently — see the pre-existing countsMap merge-against-disk logic
// further down, added specifically because two Stop-hook sessions writing at once is a real,
// expected scenario in this repo, not a hypothetical. The chmod-444 lock (see PROTECTED_STORE_MODE
// above) introduces a brief mutual-exclusion window that didn't exist before this round — two
// concurrent writes to the SAME protected file can now race for that window, and the loser gets an
// EACCES instead of the write it used to just... eventually get. MAX_LOCK_ATTEMPTS bounds a short
// retry-with-backoff so that race resolves into "succeeds a beat later," not "throws and silently
// drops a strike count / case record / verdict / sidecar update" (round-3 adversarial review finding
// #3, verified live).
const MAX_LOCK_ATTEMPTS = 5;
function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}
const CRITIC_AGENT_FILE = resolve(REPO_ROOT, '.claude/agents/trivia-os-design-critic.md');
const QUALITY_AGENT_FILE = resolve(REPO_ROOT, '.claude/agents/trivia-os-design-quality-critic.md');
const VISUAL_PATH_RE = /(^|\/)concepts\/.*\.html$|(^|\/)client\/src\/components\/display\/.*\.jsx$/;

// The quality critic's closed defect vocabulary, mirrored here so the gate can
// VALIDATE what comes back instead of trusting the prompt. Must stay in sync
// with the tag list in .claude/agents/trivia-os-design-quality-critic.md.
// Cross-sample tag counting only means anything if every sample is drawing
// from the same set; an unvalidated set is an open set with extra steps.
const QUALITY_DEFECT_TAGS = new Set([
  'missing-detail', 'faded-detail',
  'underdrawn-linework', 'scratchy-linework', 'uniform-mechanical-repetition',
  'whole-frame-blur', 'focal-subject-soft',
  'flat-depth', 'muddy-values', 'empty-region',
  'register-mismatch', 'other',
]);

// The correctness critic's closed defect vocabulary — mirrors its own three-part reasoning
// (silhouette/contour, edge/box-tell, scene coherence). Kept deliberately narrower than the
// quality critic's vocabulary: this critic grades "does it read as its noun," not "is it well
// made" — a small, tight set is easier to keep meaningfully distinct from QUALITY_DEFECT_TAGS.
const CORRECTNESS_DEFECT_TAGS = new Set([
  'silhouette-mismatch', 'box-tell', 'register-mismatch', 'other',
]);

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

// Pull the LAST balanced {...} object out of a model's stdout. The old
// version used two regexes (innermost-only, then one-level-nested) and
// concatenated them — it silently failed on any verdict object containing
// two levels of nesting, and its "last block" ordering was an accident of
// concat order rather than actual position in the text. A dropped parse
// here isn't cosmetic: it costs a vote, and losing two votes turns into a
// hard block with manual instructions. So: real brace scan, string-aware,
// from the end of the text backwards.
function extractLastJsonObject(text, mustInclude = '"verdict"') {
  const found = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; continue; }
    if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) { found.push(text.slice(start, i + 1)); start = -1; }
      if (depth < 0) depth = 0; // stray brace in prose — resync rather than give up
    }
  }
  for (let i = found.length - 1; i >= 0; i--) {
    if (!found[i].includes(mustInclude)) continue;
    try { return JSON.parse(found[i]); } catch { /* try the next-earlier object */ }
  }
  return null;
}

// Spawn N independent critic-agent samples, majority-vote the result.
// Shared between the correctness critic and the quality critic so both go
// through the identical "don't trust one VLM sample" discipline.
//
// `buildPrompt(i)` is a function, not a string, on purpose: identical
// prompts to the same model produce correlated errors, and pairwise
// image judging carries a documented position bias (whichever image is
// presented first gets favoured). Callers vary presentation order per
// sample so three votes are closer to three reads than to one read x3.
// (Honest limit: order variance can only do so much. The correctness caller
// rotates screenshot order, which is a genuine no-op when an element has
// exactly ONE screenshot — the common case. That is one more reason the
// model panel below matters: it is the only source of variance that always
// applies.)
// Returns { samples, failures } — failures are surfaced to the agent
// instead of vanishing, since "0 of 3 parsed" and "3 of 3 timed out" call
// for completely different fixes.
//
// Model diversity, not just prompt diversity. Three samples of ONE model is
// the weakest possible panel, and this file already said so in prose (in the
// critic agent file and in design-cases.json) while doing nothing about it in
// code. The literature is specific: Verga et al. 2024 ("Replacing Judges with
// Juries") found panels of DIVERSE models beat a single larger judge, and the
// follow-up measurement ("Nine Judges, Two Effective Votes", 2026) found a
// 9-judge panel spanning 7 model families still retained only ~2 votes' worth
// of independence — about three quarters of the nominal independence lost to
// correlated errors, and no aggregation algorithm recovers it. So: vary the
// model, because it is the only lever that buys real independence; and keep
// saying out loud that a 3-0 is far weaker confirmation than it looks,
// because a diverse panel reduces that problem rather than solving it.
// All three slots are NAMED models. The previous list was [null, 'opus',
// 'haiku'] — sample 0 on the ambient session default, so that the panel never
// depended on named models being available. That traded one problem for a
// quieter one: if the session's own default already IS opus or haiku, the
// "heterogeneous" panel silently contained the same model twice, and nothing
// could detect it because the default's identity is not knowable from here.
// Naming all three makes duplication impossible when they resolve, and the
// per-sample fallback below still covers a model being unavailable — loudly.
const CRITIC_MODEL_PANEL = ['sonnet', 'opus', 'haiku'];

function spawnCriticVotes(buildPrompt, n = 3) {
  const samples = [];
  const failures = [];
  for (let i = 0; i < n; i++) {
    const prompt = typeof buildPrompt === 'function' ? buildPrompt(i) : buildPrompt;
    const wantModel = CRITIC_MODEL_PANEL[i % CRITIC_MODEL_PANEL.length];
    // DESIGN_GATE_CHILD closes a recursion this script opens on itself: the
    // spawned `claude -p` runs with cwd = REPO_ROOT, so it inherits THIS repo's
    // .claude/settings.json, so its own Stop fires design-done-gate.mjs again.
    // Today that child exits 0 quickly (a critic only reads, so its session-
    // written set is empty), but that is luck, not design — the moment a critic
    // is given any write, or the transcript-unreadable fallback fires inside
    // the child, the child starts spawning its own panel of three, each of
    // which spawns three. The env var is inherited by the child's own hook
    // processes, so one flag stops the whole tree at depth 1.
    const run = (m) => spawnSync('claude', m ? ['-p', '--model', m, prompt] : ['-p', prompt],
      { encoding: 'utf8', cwd: REPO_ROOT, timeout: 120000,
        env: { ...process.env, DESIGN_GATE_CHILD: '1' } });
    const spawnFailure = (r) => r.error
      ? `spawn error ${r.error.code || r.error.message}`
      : (r.status !== 0 ? `claude -p exited ${r.status}${r.signal ? ` (signal ${r.signal})` : ''}` : null);
    try {
      let usedModel = wantModel;
      let critique = run(wantModel);
      let why = spawnFailure(critique);
      if (why && wantModel) {
        // A named model being unavailable in this install must not quietly
        // shrink the panel — fall back to the default and say so, since a
        // panel that silently collapsed to fewer votes is exactly the kind of
        // degradation this script refuses to let pass unremarked.
        const retry = run(null);
        const retryWhy = spawnFailure(retry);
        failures.push(`sample ${i + 1}: --model ${wantModel} failed (${why}); retried on the default model — ` +
          `${retryWhy ? `that also failed (${retryWhy})`
            : 'retry succeeded, but on the session default, whose identity is not knowable from inside this ' +
              'hook — so this sample may silently be the same model as another slot. Counted, and flagged: the ' +
              'distinct-model warning below can only see slots that resolved by name'}`);
        critique = retry; why = retryWhy; usedModel = null;
      }
      if (why) { if (!wantModel) failures.push(`sample ${i + 1}: ${why}`); continue; }
      if (!critique.stdout) { failures.push(`sample ${i + 1}: empty stdout`); continue; }
      const parsed = extractLastJsonObject(critique.stdout);
      if (parsed) { parsed._model = usedModel || 'default'; samples.push(parsed); }
      else failures.push(`sample ${i + 1}: no parseable JSON object containing "verdict" in output (model: ${usedModel || 'default'})`);
    } catch (e) { failures.push(`sample ${i + 1}: ${e.message}`); }
  }
  // Say it every time, not only when the panel collapses below 2 samples.
  // Previously these strings were built and then only ever surfaced on the
  // `samples.length < 2` path — so the common degradation (one named model
  // unavailable, retry on the default succeeds, three samples come back) was
  // recorded in a `panel` field nobody was told to read and announced nowhere.
  // A panel that quietly stopped being a panel is exactly the thing this whole
  // mechanism claims not to let pass unremarked.
  if (failures.length) {
    console.error(`design-done-gate: critic panel degraded — ${failures.join('; ')}`);
  }
  const distinct = new Set(samples.map(s => s._model || 'default'));
  if (samples.length >= 2 && distinct.size < 2) {
    console.error(`design-done-gate: WARNING — all ${samples.length} counted critic samples came from ONE model ` +
      `(${[...distinct].join(', ')}). This is a single read sampled ${samples.length} times, not a panel; ` +
      `treat a unanimous result from it as roughly one vote. Recorded in the verdict's "panel" field.`);
  }
  return { samples, failures };
}

// Majority of VALID samples, not of n — an inconclusive split (e.g. 1-1 of
// 2 valid) is NOT a pass; ties resolve to FAIL, matching this project's own
// "don't guess, stop" instinct.
function tallyVotes(samples) {
  const pass = samples.filter(s => s.verdict === 'PASS').length;
  const fail = samples.length - pass; // anything not an explicit PASS counts against
  return { pass, fail, total: samples.length, verdict: pass > fail ? 'PASS' : 'FAIL' };
}

// A fresh screenshot for `prefix`: name matches the slug EXACTLY (or is a
// numbered variant of it), newer than the file's last edit, big enough not to
// be a blank/error capture.
// One helper for both gates — the quality gate previously invented its own
// `<basename>-quality*.png` scheme that shared no prefix with the per-element
// slug convention, so the two could never be globbed, sorted, or cleaned up
// together and a worker had to learn two naming rules for one directory.
//
// Matching used to be a bare `startsWith()`, which is a real hole rather than
// a looseness: an element named `flame` matched `...__flame-inner.png`, so a
// screenshot of a DIFFERENT element satisfied `flame`'s evidence requirement,
// and `flame` could then be signed off having never been rendered — the
// original Campfire failure, reached through the check built to prevent it.
// (A separator rule doesn't fix it either: `flame-inner` also starts with
// `flame` + a separator.) So: exact match, or the slug plus `-<n>`/`_<n>` for
// multiple captures of the one element. Nothing else counts.
const shotNameMatches = (filename, prefix) => {
  const base = filename.replace(/\.png$/i, '');
  return base === prefix || new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[-_]\\d+$`).test(base);
};

// Returns `shots` (every name matching the slug) and `freshShots` (only the
// ones that postdate the file and clear the size floor). Callers must hand the
// critic `freshShots`, never `shots`: the gate's freshness rule passes if ANY
// matching capture is fresh, so `shots` routinely also contains captures from
// BEFORE the fix — and handing those to a critic means a panel judging the
// broken version of a scene that has since been fixed, then spending a strike
// on it. Every other part of this gate insists evidence must postdate the file;
// the evidence actually sent to the critic has to obey the same rule.
function freshShotsFor(prefix, absFile) {
  let shots = [];
  const freshShots = [];
  try {
    const fileMtime = statSync(absFile).mtimeMs;
    shots = readdirSync(SHOT_DIR).filter(f => /\.png$/i.test(f) && shotNameMatches(f, prefix));
    for (const shot of shots) {
      const st = statSync(resolve(SHOT_DIR, shot));
      if (st.mtimeMs >= fileMtime && st.size > 15000) freshShots.push(shot);
    }
  } catch { /* no shots dir yet */ }
  return { fresh: freshShots.length > 0, shots, freshShots };
}

// The ONLY function anywhere that writes concepts/.design-gate-integrity.json (besides the
// human-invoked concepts/tools/reseed-design-gate-integrity.mjs, which exists specifically for the
// human-confirmed recovery path this file's own BLOCKED message points to). Called from auditLog()
// immediately after every protected-store write, so the sidecar's recorded hash and the audit log's
// record of that same write land together, atomically, from the same function call.
function recordIntegrity(...absPaths) {
  for (let attempt = 1; attempt <= MAX_LOCK_ATTEMPTS; attempt++) {
    try {
      // Re-read the sidecar FRESH every attempt, not once outside the loop — round-3 finding #4:
      // this read-merge-write was a classic non-atomic race. Process A reads the sidecar, process B
      // (a concurrent gate run) finishes its own read-merge-write in between, then A writes its
      // merge back — silently dropping B's entry, with no mismatch ever detected for the file B just
      // protected (checkIntegrityOrBlock only iterates entries the sidecar ALREADY has). Re-reading
      // on every retry means a losing attempt sees the winner's update and merges on top of it
      // instead of overwriting it.
      let sidecar = {};
      if (existsSync(INTEGRITY_FILE)) {
        try { sidecar = JSON.parse(readFileSync(INTEGRITY_FILE, 'utf8')); } catch { sidecar = {}; }
      }
      for (const absPath of absPaths) {
        const rel = relative(REPO_ROOT, absPath);
        const hash = hashFile(absPath);
        if (hash === null) {
          // Round-3 finding #10: hashFile() returns null for ANY read error, not just "the file is
          // genuinely gone" — a transient permission blip from another concurrent writer would look
          // identical to a real delete. Only actually erase the sidecar entry (i.e. stop protecting
          // this path) when the file is truly absent (ENOENT). Any OTHER error leaves the existing
          // entry in place — erring toward keeping protection rather than silently dropping it; the
          // next successful write to this path will correct the entry regardless.
          let stillExists = true;
          try { lstatSync(absPath); } catch (e) { if (e.code === 'ENOENT') stillExists = false; }
          if (!stillExists) delete sidecar[rel];
        } else {
          sidecar[rel] = hash;
        }
      }
      writeProtectedFile(INTEGRITY_FILE, () => writeFileSync(INTEGRITY_FILE, JSON.stringify(sidecar, null, 2)));
      return;
    } catch (e) {
      if ((e.code === 'EACCES' || e.code === 'EPERM') && attempt < MAX_LOCK_ATTEMPTS) { sleepSync(20 * attempt); continue; }
      console.error(`design-done-gate: WARNING — could not update integrity sidecar: ${e.message}`);
      return;
    }
  }
}

// OS-level chmod backstop (see PROTECTED_STORE_MODE's comment above) — every protected-store write in
// this file goes through this instead of calling writeFileSync/appendFileSync directly: briefly
// restore write access (the file is normally locked read-only from the PREVIOUS write this same
// function made), run the actual write via the caller-supplied `writeFn`, then re-lock read-only
// immediately. `writeFn` does the write itself (writeFileSync vs. appendFileSync differ enough — one
// full-replace, one append — that this helper stays agnostic and just brackets whichever one the
// caller needs).
// Does not, and cannot, survive a SIGKILL between the unlock and the finally's re-lock (no process
// can trap SIGKILL in any language) — a real but narrow window, and this hook does run for minutes
// at a time (multiple critic-panel spawns), so being killed by an external timeout is a normal event,
// not exotic. Accepted, same spirit as this file's other documented residual gaps.
function writeProtectedFile(absPath, writeFn) {
  for (let attempt = 1; attempt <= MAX_LOCK_ATTEMPTS; attempt++) {
    if (existsSync(absPath)) {
      // Round-3 finding #11: chmodSync follows symlinks — it chmods the TARGET, not the link itself.
      // If one of these paths were ever replaced with a symlink, the "directory" holding the link
      // stays writable (no chmod needed to swap it out), and this function would happily chmod
      // whatever the link points AT, silently making some unrelated file read-only. None of these
      // paths should ever legitimately be a symlink — refuse outright rather than operate through one.
      try {
        if (lstatSync(absPath).isSymbolicLink()) {
          throw new Error(`${absPath} is a symlink, not a regular file — refusing to write through it`);
        }
      } catch (e) { if (e.code !== 'ENOENT') throw e; }
      try { chmodSync(absPath, WRITABLE_MODE); } catch { /* not yet lockable, or already writable */ }
    }
    try {
      writeFn();
      return;
    } catch (e) {
      if ((e.code === 'EACCES' || e.code === 'EPERM') && attempt < MAX_LOCK_ATTEMPTS) {
        sleepSync(20 * attempt);
        continue;
      }
      throw e;
    } finally {
      try { chmodSync(absPath, PROTECTED_STORE_MODE); } catch (e2) {
        console.error(`design-done-gate: WARNING — could not chmod ${absPath} read-only after writing it: ${e2.message}`);
      }
    }
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
// sidecar update, so the two stay synchronized. writeCase, both verdict writes, and the counts write
// all pass writtenPath as of this commit.
function auditLog(store, action, detail, writtenPath) {
  try {
    writeProtectedFile(AUDIT_LOG_FILE, () =>
      appendFileSync(AUDIT_LOG_FILE, JSON.stringify({ timestamp: new Date().toISOString(), store, action, detail }) + '\n'));
  } catch (e) { console.error(`design-done-gate: WARNING — could not append to ${AUDIT_LOG_FILE}: ${e.message}`); }
  recordIntegrity(...(writtenPath ? [writtenPath, AUDIT_LOG_FILE] : [AUDIT_LOG_FILE]));
}

// Append one gate-owned record to design-cases.json. Shared so the quality
// gate's verdicts land in the same case log as the correctness gate's —
// "thin, blurry, worse than the reference" is exactly the history this file
// exists to remember, and it had no way in before.
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

// Strike counting must key off the VERDICT, not off how many times the hook
// ran. Verdicts are cached for an hour; without this, two Stop attempts
// inside that hour against ONE cached FAIL burned both strikes and locked
// the element before the agent had made a second attempt at all.
function recordFail(countsMap, key, verdict, extra = {}) {
  const entry = countsMap[key] || (countsMap[key] = { fails: 0 });
  if (entry.lastCountedTimestamp !== verdict.timestamp) {
    entry.fails = (entry.fails || 0) + 1;
    entry.lastCountedTimestamp = verdict.timestamp;
  }
  entry.lastReason = verdict.reason || '';
  Object.assign(entry, extra);
  return entry;
}

// The two-strike stop's manual override, and the reason it is CONSUMED here.
// `unlocked: true` was read but never cleared and never reset the counter —
// so setting it once granted that slug permanent immunity from the two-strike
// stop, silently, for every future failure of that element. An override is a
// decision about one specific re-lock ("we talked to Ben, the scope changed"),
// not a standing exemption. Using it now resets the counter and clears the
// flag: the element gets two fresh strikes, and a second override has to be a
// second deliberate act.
//
// `verdictIsFresh` exists because the two v5 fixes above collide without it.
// Making verdicts go stale on file edit, and making the second Stop pass
// ENFORCE a cached verdict instead of skipping it, together create a path this
// function is reached on with a verdict that is KNOWN to be about a previous
// version of the file: second pass, agent already edited the fix in, loop guard
// forbids a re-spawn. Consuming a single-use override there burns Ben's
// deliberate decision against evidence the script itself has just declared out
// of date, and the agent never gets the two fresh strikes it paid for. So a
// stale verdict may still lift the two-strike stop (the override IS set — Ben
// decided) but may not spend it. Consumption waits for a verdict that actually
// describes the current file.
function twoStrikeBlocked(entry, key, verdictIsFresh = true) {
  if ((entry.fails || 0) < 2) return false;
  if (!entry.unlocked) return true;
  if (!verdictIsFresh) {
    console.error(`design-done-gate: [${key}] two-strike stop lifted by the "unlocked" override, but the ` +
      `override was NOT consumed — the verdict driving it is stale (it predates the file's last edit and the ` +
      `loop-guard blocked a re-spawn this turn). It will be consumed by the first verdict that actually ` +
      `describes the current file.`);
    return false;
  }
  console.error(`design-done-gate: [${key}] two-strike stop bypassed by the manual "unlocked" override in ` +
    `${COUNTS_FILE}. Override CONSUMED — strike count reset to 0 and unlocked cleared. Two fresh strikes, ` +
    `not permanent immunity; overriding again is a second deliberate edit.`);
  entry.fails = 0;
  entry.unlocked = false;
  entry.overridesUsed = (entry.overridesUsed || 0) + 1;
  entry.lastOverrideAt = new Date().toISOString();
  return false;
}

function readStdinJson() {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return {}; }
}
function sh(cmd) { try { return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' }); } catch (e) { return e.stdout || ''; } }
function slugify(s) { return s.replace(/[^a-zA-Z0-9._-]/g, '_'); }

// Content hash of the scene file, computed by the GATE itself from bytes
// already read into memory — never by an agent-invoked step. This is what
// makes verdict freshness genuinely forgery-resistant (fixes the verdict
// half of B2): mtime comparison can be defeated by backdating the SCENE
// FILE's own mtime (touch -d on the .html file, which is not one of the
// paths protect-json-stores.mjs restricts), making a stale cached verdict
// look erroneously "fresh" relative to it. A hash of the actual bytes cannot
// be fooled by any mtime trick on either side of the comparison.
function sceneHash(codeText) { return createHash('sha256').update(codeText).digest('hex'); }
// Content hash of a file on disk, for the integrity sidecar. Returns null (not throws) for a
// missing/unreadable file — a null hash means "this path currently has nothing," which is a valid,
// checkable state (see checkIntegrityOrBlock: a recorded hash with a now-missing file is itself a
// reportable mismatch, not a crash).
function hashFile(absPath) {
  try { return createHash('sha256').update(readFileSync(absPath)).digest('hex'); }
  catch { return null; }
}

// Files this session's OWN transcript wrote, as repo-relative paths. A
// background subagent it dispatched has its own transcript and its own
// SubagentStop pass — its files are deliberately NOT included here. Returns
// `{ paths, startedAt }`, or null (meaning "couldn't determine, fall back to
// the old broad check") if the transcript is missing or unparseable — this
// script fails toward blocking, never toward silently under-checking.
// `startedAt` is the earliest timestamp in the transcript, used by the weak
// Bash tier below and by diffForFile()'s baseline. On a RESUMED session that is
// the original session's start, which makes both of those wider, never
// narrower — the safe direction, and the only one available without a field
// naming the resume point.
//
// Bash-written files count. Harvesting only the file-writing TOOLS left an
// open door wide enough to drive the whole build through: `cat > scene.html
// <<'EOF'`, `tee`, `sed -i`, or a generator script produced a visual file that
// this hook could not see AND that geometry-lint's PostToolUse hook never fired
// on (its matcher was `Edit|Write`; now widened, but a hook that fires is still
// no substitute for a Stop-time check that knows the file exists).
//
// Bash matching is in TWO tiers, because the v7 version was one tier and it was
// wrong in a way its own comment mis-stated. That comment said "a false
// positive costs one extra screenshot" — it does not. A file pulled into this
// set must satisfy every check below: committed, geometry-lint clean, a fresh
// >15KB screenshot per element, rotation evidence, a QUALITY_REFERENCE, and two
// three-sample critic panels. A false positive is a HARD BLOCK on a file the
// session only read. And v7's regex produced them routinely: it matched bare
// `\bnode\b`, so this repo's own render command
// (`node concepts/tools/visual-audit.mjs concepts/scene.html`) marked the scene
// as session-authored. Rendering is not authoring.
//
//   STRONG — the command demonstrably writes the named path: redirection into
//   it, `tee`, `sed -i`, `cp`/`mv` onto it. Always counted.
//   WEAK — an interpreter/generator command that merely mentions a visual path
//   (`node gen.mjs --out concepts/x.html`, and also `node render.mjs
//   concepts/x.html`, which are indistinguishable from here). Counted only if
//   the file's mtime is at or after this session's start, i.e. it actually
//   changed while this session was running. That test is exact for the case it
//   exists to cover and silently drops the read-only ones. If the session start
//   can't be determined, weak matches are counted anyway — under-checking is
//   the failure this script is not allowed to have.
// Two shapes of strong signal. Anchored: the path is the destination of a
// redirect, `cp`, `mv` or `install`, so its POSITION proves the write (and a
// `cp src dst` correctly counts only dst — reading a file is not writing it).
// Unanchored: `sed -i` and `tee` rewrite a path that can sit anywhere in their
// own argument list, and their option shapes vary too much to anchor
// (`sed -i '' -e ...` on BSD vs `sed -i -e ...` on GNU), so every visual path
// in such a command counts.
//
// "In such a command" has to mean the SEGMENT, not the whole Bash string, and
// that was a live bug: v8 applied the unanchored rule to the entire command, so
// `sed -i s/a/b/ concepts/a.html && node render.mjs concepts/b.html` marked
// b.html as session-authored too — a hard block (commit, lint, per-element
// shots, rotation evidence, QUALITY_REFERENCE, two critic panels) on a file the
// command only rendered. Proved in a scratch repo, not assumed. That is the
// same over-inclusive shape v8 fixed for bare `\bnode\b`, surviving one level
// up in the compound-command case, which is the normal way agents write Bash.
// So every tier is now evaluated per segment, split on `&&`, `||`, `;`, `|` and
// newlines. Redirects and `cp`/`mv` are positional and so were already
// segment-local; splitting costs them nothing.
const BASH_SEGMENT_SPLIT_RE = /&&|\|\||[;|\n]/;
const BASH_STRONG_ANCHORED_RE = /(?:>>?\s*|\bcp\s+\S+\s+|\bmv\s+\S+\s+|\binstall\s+(?:-\S+\s+)*\S+\s+)(['"]?)([\w./-]+\.(?:html|jsx))\1/g;
const BASH_STRONG_WHOLE_SEGMENT_RE = /\bsed\s+-i|\btee\b/;
const BASH_WEAK_HINT_RE = /\b(?:node|python3?|deno|bun|npx|awk|perl|ruby)\b/;

function sessionTouchedFiles(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  let raw;
  try { raw = readFileSync(transcriptPath, 'utf8'); } catch { return null; }
  const paths = new Set();
  const weak = new Set();
  let startedAt = 0;
  const relOrNull = (p) => {
    if (typeof p !== 'string' || !p) return null;
    const abs = resolve(REPO_ROOT, p);
    // `startsWith(REPO_ROOT)` alone matched a SIBLING directory whose name
    // merely began with the repo's (`/x/trivia-os-scratch/concepts/a.html`),
    // and slicing produced the phantom repo-relative path
    // "scratch/concepts/a.html". Require the separator, and drop anything
    // genuinely outside the repo rather than passing it through raw — a path
    // this hook cannot resolve is a path it cannot check.
    if (!abs.startsWith(REPO_ROOT + '/')) return null;
    return abs.slice(REPO_ROOT.length + 1);
  };
  const addPath = (p, tier = paths) => { const r = relOrNull(p); if (r) tier.add(r); };
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    // Session start, used by the weak-tier mtime test above and by
    // diffForFile()'s baseline. Guarded: an entry without a parseable
    // timestamp just doesn't contribute one, and if none of them do, both
    // callers fall back to their older, broader behaviour.
    const ts = entry?.timestamp ? new Date(entry.timestamp).getTime() : NaN;
    if (Number.isFinite(ts) && ts > 0 && (startedAt === 0 || ts < startedAt)) startedAt = ts;
    const blocks = entry?.message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const b of blocks) {
      if (b?.type !== 'tool_use') continue;
      if (['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(b.name)) {
        addPath(b.input?.file_path || b.input?.notebook_path);
        continue;
      }
      if (b.name === 'Bash' && typeof b.input?.command === 'string') {
        // Per segment, not per command — see the note above BASH_SEGMENT_SPLIT_RE.
        for (const seg of b.input.command.split(BASH_SEGMENT_SPLIT_RE)) {
          const strong = new Set();
          const visualTokens = (seg.match(/[\w./-]+\.(?:html|jsx)/g) || []).filter(t => VISUAL_PATH_RE.test(t));
          for (const m of seg.matchAll(BASH_STRONG_ANCHORED_RE)) {
            if (VISUAL_PATH_RE.test(m[2])) strong.add(m[2]);
          }
          if (BASH_STRONG_WHOLE_SEGMENT_RE.test(seg)) for (const tok of visualTokens) strong.add(tok);
          for (const s of strong) addPath(s);
          if (!BASH_WEAK_HINT_RE.test(seg)) continue;
          for (const tok of visualTokens) if (!strong.has(tok)) addPath(tok, weak);
        }
      }
    }
  }
  for (const w of weak) {
    if (paths.has(w)) continue;
    if (!startedAt) { paths.add(w); continue; } // can't date the session — keep it
    let mtime = 0;
    try { mtime = statSync(resolve(REPO_ROOT, w)).mtimeMs; } catch { continue; }
    if (mtime >= startedAt) paths.add(w);
  }
  return { paths, startedAt };
}

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
// Known, accepted operational cost: concepts/design-cases.json and concepts/.design-attempt-counts.json
// are git-tracked. An ordinary `git checkout`/`merge`/`pull` that changes either file's content is,
// by this check's own definition, exactly the kind of out-of-band change it exists to catch — even
// though the actual cause was completely benign. This WILL false-block after routine git activity in
// a multi-worktree/multi-session workflow; the fix each time is the same one-time reseed as any other
// mismatch. Deliberately not special-cased to trust git's own history instead, since doing so would
// mean an attacker's committed tampering auto-passes too — accepting the operational friction is
// safer than weakening the check for convenience.
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
    const absPath = resolve(REPO_ROOT, rel);
    // Round-3 finding #11 (read side): none of these paths should ever legitimately be a symlink.
    // chmodSync follows symlinks (chmods the TARGET, not the link), so a symlinked protected path
    // would silently defeat the OS-level lock without ever showing up as a hash mismatch on its own
    // — treat "this is currently a symlink" as its own reportable condition, independent of hash.
    let isSymlink = false;
    try { isSymlink = lstatSync(absPath).isSymbolicLink(); } catch { /* doesn't exist — handled by the hash check below */ }
    const actualHash = hashFile(absPath);
    if (isSymlink || actualHash !== expectedHash) mismatches.push({ rel, expectedHash, actualHash, isSymlink });
  }
  // Round-3 finding #6: the loop above only checks entries the sidecar ALREADY has. A file that
  // reaches disk WITHOUT ever going through this gate's own write path (recordIntegrity is the only
  // thing that adds an entry) would have no entry to compare against and would sit permanently
  // invisible to this check. Separately confirm every canonical store location that currently EXISTS
  // has SOME sidecar entry at all.
  const canonicalSingleFiles = [COUNTS_FILE, resolve(REPO_ROOT, 'concepts', 'design-cases.json'), AUDIT_LOG_FILE];
  const onDiskPaths = canonicalSingleFiles.filter(existsSync);
  if (existsSync(VERDICT_DIR)) {
    for (const f of readdirSync(VERDICT_DIR)) {
      if (f.endsWith('.json')) onDiskPaths.push(resolve(VERDICT_DIR, f));
    }
  }
  for (const absPath of onDiskPaths) {
    const rel = relative(REPO_ROOT, absPath);
    if (!(rel in sidecar)) mismatches.push({ rel, expectedHash: undefined, actualHash: hashFile(absPath), isSymlink: false });
  }
  if (mismatches.length > 0) {
    console.error(`design-done-gate: BLOCKED — ${mismatches.length} gate-protected file(s) do not ` +
      `match this gate's own last-recorded content hash (or are missing a hash record entirely, or ` +
      `are unexpectedly a symlink):\n` +
      mismatches.map(m => `  - ${m.rel}${m.isSymlink ? ' [IS A SYMLINK — should never be one]' : ''}: expected ` +
        `${m.expectedHash ?? '(no prior record — new to the sidecar)'}, found ${m.actualHash ?? '(file is now missing)'}`).join('\n') +
      `\nThis means at least one of these files changed (or appeared, or was replaced by a symlink) by ` +
      `some means other than this gate's own writes — regardless of how (a Bash-guard bypass, a bug, ` +
      `anything else). This is a hard stop. STOP HERE: do not attempt to resolve this yourself, do not ` +
      `run any recovery command, and do not guess at a fix. Tell Ben exactly which file(s) are listed ` +
      `above and wait for him to investigate from his own terminal. Only Ben re-baselining this by ` +
      `hand, after confirming the change was intentional, is a valid way past this block.`);
    process.exit(2);
  }
}

// Depth guard, set only on the critic subprocesses this script spawns (see the
// note in spawnCriticVotes). A critic session's Stop must not run the gate that
// spawned it. Exit 0, not 2: blocking a critic would turn a review into a
// failed spawn and cost the panel a vote. checkIntegrityOrBlock() runs AFTER this guard, not before
// (round-3 adversarial review finding #7) — a critic child never performs any protected-store write
// itself (only the top-level orchestrating process does, after collecting all samples), so skipping
// the integrity check for DESIGN_GATE_CHILD=1 sessions costs nothing security-wise, and running it
// BEFORE this guard turned any real mismatch into every spawned critic sample also hitting the
// integrity block and exit(2)-ing instead of this guard's clean exit(0) skip — cascading one
// mismatch into minutes of every child burning its full spawn timeout before the panel reports
// "degraded." Non-child (real) invocations still get the integrity check as the first substantive
// thing this script does, immediately after this guard.
if (process.env.DESIGN_GATE_CHILD === '1') {
  console.error('design-done-gate: skipped — this session is a critic spawned BY the gate ' +
    '(DESIGN_GATE_CHILD=1). Reviewing the reviewer would recurse.');
  process.exit(0);
}
checkIntegrityOrBlock();

const payload = readStdinJson();
const isSecondPass = payload.stop_hook_active === true;
if (isSecondPass) {
  console.error('design-done-gate: stop_hook_active=true (second pass this turn) — skipping the critic ' +
    'spawn step only (it is the one step at real risk of hanging/looping). Deterministic checks ' +
    '(geometry-lint, commit status) still run and still block below.');
}

// ── What this pass is responsible for: every visual file THIS SESSION WROTE.
//
// It used to be `dirty visual files ∩ this session's writes`, and that made the
// entire script decorative. Trace it: check 1 below blocks any file that is
// still dirty ("not committed"). So a Stop could only ever succeed with nothing
// dirty — and with nothing dirty, this set was EMPTY and the script exited 0
// right here, before a single screenshot, critic spawn, or quality check. Every
// passing Stop took the bypass; the enforcement branch was only ever reached by
// runs that were going to be blocked anyway on the commit check alone.
// Committing first — which this project's own worker instructions tell the
// agent to do — skipped the whole gate.
//
// Git state is no longer the trigger. Session authorship is. Committing now
// satisfies check 1 and nothing else; it cannot remove a file from review.
// The dirty scan below survives for exactly ONE job: standing in as a coarse
// fallback when the transcript can't be read. It does NOT feed check 1 — that
// check runs its own per-file `git status` — and when the transcript is
// readable `dirtyVisualFiles` is computed and never looked at again. (v8's
// changelog says it corrected this same false "feeds check 1" claim; it
// corrected the copy 30 lines below and left this one, which is how a comment
// ends up disagreeing with the code it sits on top of.) ──
const statusOut = sh('git status --short -- concepts client/src/components/display');
const dirtyVisualFiles = statusOut.split('\n')
  .map(l => l.replace(/^.{0,3}/, '').trim())
  // A rename prints `R  old -> new`; taking the raw remainder produced the
  // literal string "old -> new" as a path, which still matched VISUAL_PATH_RE
  // (it ends in .html) and then resolved to a file that cannot exist. Take the
  // destination. Git also quotes paths containing spaces/unicode — unquote.
  .map(f => (f.includes(' -> ') ? f.split(' -> ').pop() : f).trim())
  .map(f => (f.startsWith('"') && f.endsWith('"') ? f.slice(1, -1) : f))
  .filter(f => f && VISUAL_PATH_RE.test(f));

const session = sessionTouchedFiles(payload.transcript_path);
if (session === null) {
  console.error('design-done-gate: WARNING — could not read this session\'s transcript ' +
    `(${payload.transcript_path || '(no transcript_path in payload)'}); falling back to checking ` +
    'every dirty visual file in the repo, not just this session\'s.');
}
// NOT a union — an either/or, and saying so plainly because the v7 comment here
// claimed "union, session side primary" about code that was already a ternary,
// and claimed the dirty scan "feeds check 1" when check 1 runs its own
// per-file `git status`. Both were wrong about the ten lines under them, which
// is the kind of thing this file exists to not do. Accurately: when the
// transcript is readable, scope is EXACTLY the visual files this session wrote,
// and `dirtyVisualFiles` is unused. When it is not readable, scope falls back
// to every dirty visual file in the repo — deliberately over-broad, because
// under-checking is the failure this script is not allowed to have.
const SESSION_STARTED_AT = session?.startedAt || 0;
const touchedFiles = session === null
  ? dirtyVisualFiles
  : [...new Set([...session.paths].filter(f => VISUAL_PATH_RE.test(f)))];

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

if (touchedFiles.length === 0) process.exit(0);

// Said out loud so a reader of the hook output can tell "the gate ran and
// passed" from "the gate found nothing to do" — the two used to be
// indistinguishable, which is how a bypass this large stayed invisible.
console.error(`design-done-gate: reviewing ${touchedFiles.length} visual file(s) written this session ` +
  `(committed or not): ${touchedFiles.join(', ')}`);

const problems = [];

let countsMap = {};
let criticInstructions = '';
let qualityInstructions = '';

// Setup is inside the crash-to-BLOCK wrapper too. v4 wrapped only the main
// loop, which left mkdirSync (read-only volume, permissions, a file where a
// directory should be) and the agent-file reads able to throw an uncaught
// error → exit 1 → non-blocking. Same fail-open, one screen higher up.
try {
  mkdirSync(VERDICT_DIR, { recursive: true });
  mkdirSync(SHOT_DIR, { recursive: true });

  if (existsSync(COUNTS_FILE)) {
    try { countsMap = JSON.parse(readFileSync(COUNTS_FILE, 'utf8')); } catch { countsMap = {}; }
  }

  // ── critic agent's real instructions, read once, forwarded verbatim to
  // whatever spawns the critic — not a paraphrase. Strip the YAML frontmatter
  // (--- ... ---) since that's config, not instructions. ──
  if (existsSync(CRITIC_AGENT_FILE)) {
    criticInstructions = readFileSync(CRITIC_AGENT_FILE, 'utf8').replace(/^---[\s\S]*?---\n/, '').trim();
  } else {
    console.error(`design-done-gate: WARNING — ${CRITIC_AGENT_FILE} not found. Critic spawn will use a degraded fallback prompt.`);
  }

  // ── quality critic's real instructions, same verbatim-forward treatment. ──
  if (existsSync(QUALITY_AGENT_FILE)) {
    qualityInstructions = readFileSync(QUALITY_AGENT_FILE, 'utf8').replace(/^---[\s\S]*?---\n/, '').trim();
  } else {
    console.error(`design-done-gate: WARNING — ${QUALITY_AGENT_FILE} not found. Quality gate will be skipped entirely (correctness-only, the exact gap that shipped a passing-but-thin scene once already).`);
  }
} catch (e) {
  problems.push(`design-done-gate could not set up (${e.message}). Treating this as a BLOCK: with the verdict/` +
    `shot directories or the critic agent files unavailable, nothing below could have been verified.`);
}

// ── derive per-element slugs from `ELEMENT: <name>` marker comments near
// each touched diff hunk, per file. Falls back to a line-anchored slug
// (still more granular than whole-file, but flagged as degraded) when no
// marker exists — this repo's existing files predate the convention, so
// the design-worker agent's instructions now require adding one for any
// NEW figurative/iconic element going forward. ──
// `__quality__` is the whole-scene quality gate's reserved element name —
// an element marker using it would share a strike counter with the quality
// verdict for the same file. Rejected rather than silently collided.
const RESERVED_ELEMENT_NAMES = new Set(['__quality__']);

// ── Which touched files get the full craft review, and which get only the
// cheap deterministic checks (commit status, geometry-lint) above it.
//
// `concepts/**.html` is unconditionally in scope. That directory IS the
// image-first build lab; every file in it exists to become a rendered scene,
// and the failure this whole engine was built around lived there.
//
// `client/src/components/display/*.jsx` is mixed, and treating it as if it
// weren't was a real hole in the opposite direction from every other one on
// this list — over-blocking. A brand-new layout component there (a scoreboard,
// a caption bar, a timer) was refused outright: no ELEMENT markers, so every
// touched hunk got a degraded line-anchored slug demanding a screenshot named
// after a line range and a "PASS = a fresh viewer names this as ___" sentence
// about a flex container; then the quality gate demanded a QUALITY_REFERENCE
// pointing at a locked reference image nobody ever generated, because nobody
// art-directs a scoreboard. There was no escape hatch and no override for it,
// so the only way to ship one was to turn the hook off — and a gate people
// switch off is not a gate.
//
// A display .jsx is in scope when it carries a signal that it is figurative
// work: an `ELEMENT:` or `QUALITY_REFERENCE:` marker (the worker declaring it
// outright), or a drawing surface this project's scenes are actually built out
// of. Deliberately NOT on the list: `linear-gradient` and `box-shadow`, which
// are ordinary UI chrome and would drag every card component back in.
//
// The honest cost: a figurative scene built in a display .jsx out of nothing
// but plain divs and flat colour, carrying no marker, is out of scope and
// walks. That gap is real. It is also strictly narrower than the one it
// replaces, the ELEMENT marker is already mandatory for the worker on exactly
// this kind of element, and the moment such a file grows an svg, a canvas, a
// radial gradient or a clip-path it comes straight back in. The skip is
// announced loudly on every run rather than passing silently, so it cannot
// quietly become the normal path.
const FIGURATIVE_SIGNAL_RE = /ELEMENT:|QUALITY_REFERENCE:|<svg|<canvas|getContext\(|radial-gradient\(|conic-gradient\(|clip-path/i;
const inCraftScope = (file, text) => /(^|\/)concepts\//.test(file) || FIGURATIVE_SIGNAL_RE.test(text);

// Where the "what changed" diff comes from. Before v7 a file under review was
// always dirty by construction, so `git diff` alone was enough. Now that an
// already-committed file is in scope (see the trigger note above), a committed
// file would otherwise fall through to the whole-file no-index diff — which
// collapses every element in a multi-element file (ParticleBackground.jsx holds
// all 21 ambient themes) into one review, demanding a screenshot for every
// element in the file including ones the session never touched.
//
// The right question is "what did THIS SESSION change in this file," and the
// honest answer needs a baseline. v7 used `git diff <last commit touching the
// file>^!`, which is correct for exactly one shape of session — one commit —
// and silently wrong for the common other one. Trace it: the agent builds
// elements A and B, commits, then tweaks element C and commits again, all
// inside one turn. `^!` on the LAST commit shows only C. A and B are then not
// reviewed at this Stop at all: no screenshot demanded, no critic spawned, no
// strike possible. Commit twice and the first commit's elements walk — a
// smaller cousin of the v7 front-door bypass, reached the same way (git state
// deciding what gets looked at).
//
// So: baseline = the last commit that touched this file BEFORE this session
// started, and diff the WORKING TREE against it. That covers committed,
// staged and unstaged session work in one diff, across any number of commits.
// No such commit (the file is new this session) → whole-file. The old chain
// survives underneath as the fallback for when the session start is unknown.
function diffForFile(file) {
  if (SESSION_STARTED_AT) {
    // ISO-8601 with an explicit Z; `git log --before` parses it directly.
    const before = new Date(SESSION_STARTED_AT).toISOString();
    const baseSha = sh(`git log -1 --format=%H --before="${before}" -- "${file}"`).trim();
    if (baseSha) {
      // Single rev, no `..`: `git diff <sha> -- <file>` is working-tree vs that
      // commit, which is what "everything this session did to it" means.
      const sinceSession = sh(`git diff -U15 ${baseSha} -- "${file}"`);
      if (sinceSession.trim()) return sinceSession;
      // Empty means the session's net change to this file is nothing (edited
      // and reverted). Nothing to scope to, so fall through to whole-file —
      // over-broad, never under-broad.
    }
    // No pre-session commit touches this file: either it is brand-new, or every
    // commit touching it belongs to this session. Both mean the whole file is
    // this session's work, so whole-file is the correct scope, not a fallback.
    return sh(`git diff --no-index -U15 /dev/null "${file}" 2>/dev/null`);
  }
  const unstaged = sh(`git diff -U15 -- "${file}"`);
  if (unstaged.trim()) return unstaged;
  const staged = sh(`git diff -U15 --cached -- "${file}"`);
  if (staged.trim()) return staged;
  const lastSha = sh(`git log -1 --format=%H -- "${file}"`).trim();
  if (lastSha) {
    // Honest limit of this fallback branch: `^!` is the diff of ONE commit, so
    // if the session made several commits to this file, only the last one's
    // hunks are scoped here. It is reached only when the transcript carried no
    // usable timestamps.
    const committed = sh(`git diff -U15 ${lastSha}^! -- "${file}"`);
    if (committed.trim()) return committed;
  }
  return sh(`git diff --no-index -U15 /dev/null "${file}" 2>/dev/null`);
}

function elementSlugsForFile(file) {
  const diffText = diffForFile(file);
  // Both halves of the new-side range are needed, not just the start line:
  // `@@ -a,b +c,d @@` means the hunk covers new-file lines c..c+d-1. The old
  // code captured only `c` and then searched UPWARD from it — but with -U15
  // the header sits 15 lines above the actual change, so a marker written
  // directly above the changed code is INSIDE the hunk, below `c`, and was
  // never looked at. On an untracked file this was total: a new file is one
  // hunk `@@ -0,0 +1,N @@`, so the scan examined line 1 and quit. Markers
  // could never be found on a brand-new file — the exact case they exist for.
  const hunks = [...diffText.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)]
    .map(m => ({ start: Math.max(1, parseInt(m[1], 10) || 1), len: m[2] === undefined ? 1 : parseInt(m[2], 10) }));
  if (hunks.length === 0) return [{ slug: slugify(`${file}#whole-file`), element: null, degraded: true }];

  const abs = resolve(REPO_ROOT, file);
  let lines = [];
  try { lines = readFileSync(abs, 'utf8').split('\n'); } catch { return [{ slug: slugify(`${file}#unreadable`), element: null, degraded: true }]; }

  const seen = new Set();
  const slugs = [];
  const push = (markerName, startLine) => {
    // The element name is carried alongside the slug, NOT re-derived from it:
    // slugify() rewrites "::" to "__", so the old `slug.includes('::')` test was
    // dead code and elementName was ALWAYS null — which silently disabled
    // element-scoped rotation detection and wrote line-anchored slugs into
    // design-cases.json's `noun` field (see the campfire L1 case in that file).
    const slug = markerName ? slugify(`${file}::${markerName}`) : slugify(`${file}#L${startLine}`);
    if (!seen.has(slug)) { seen.add(slug); slugs.push({ slug, element: markerName, degraded: !markerName }); }
  };

  for (const { start, len } of hunks) {
    // Window = the hunk body itself, plus 20 lines above it for a marker that
    // legitimately sits outside the changed range.
    const from = Math.max(0, start - 21);
    const to = Math.min(lines.length - 1, start - 1 + Math.max(len, 1));
    const names = [];
    for (let i = from; i <= to; i++) {
      const m = lines[i]?.match(/ELEMENT:\s*([a-zA-Z0-9_-]+)/);
      if (!m) continue;
      if (RESERVED_ELEMENT_NAMES.has(m[1])) {
        console.error(`design-done-gate: "ELEMENT: ${m[1]}" in ${file} uses a name reserved by this hook — ` +
          `rename it. Ignoring this marker so it cannot collide with the whole-scene quality counter.`);
        continue;
      }
      if (!names.includes(m[1])) names.push(m[1]);
    }
    // One slug PER marker in the hunk, not last-marker-wins. A new file is a
    // single hunk covering everything; collapsing it to one element would put
    // every element in the file back on one shared strike counter, which is
    // the v2 bug this whole mechanism was built to fix.
    if (names.length === 0) push(null, start);
    else for (const n of names) push(n, start);
  }
  return slugs;
}

// The whole per-file pass is wrapped: an unexpected throw anywhere below
// used to exit 1, which Claude Code treats as a NON-blocking error — this
// script failing open, which its header promises it never does. A crash now
// becomes a blocking problem with the error attached, and the strike counts
// accumulated so far still get written.
try {
for (const file of touchedFiles) {
  const abs = resolve(REPO_ROOT, file);
  // Per-file record of what the CORRECTNESS critic concluded, so the quality
  // gate below can say when the two critics disagree in the one way that is
  // actually diagnostic (see the cross-gate note at the quality FAIL branch).
  const correctnessByFile = { pass: [], fail: [] };

  // 1. Uncommitted?
  const dirty = sh(`git status --short -- "${file}"`).trim();
  if (dirty) problems.push(`${file}: not committed (git status shows "${dirty}"). Commit before Stop.`);

  // 1b. Deleted this session? `git status --short` lists deletions too, and
  // every check below reads the file — an uncaught ENOENT here exits 1, which
  // Claude Code treats as a non-blocking error. That is this script failing
  // OPEN, the one behaviour its header promises it never does. The commit
  // requirement above still stands for the deletion itself.
  if (!existsSync(abs)) {
    console.error(`design-done-gate: ${file} no longer exists on disk (deleted/renamed) — skipping visual checks for it; the commit requirement above still applies.`);
    continue;
  }

  // 2. Geometry-lint — always runs, even on the second pass.
  const lintRes = spawnSync('node', [resolve(REPO_ROOT, '.claude/hooks/geometry-lint.mjs'), abs], { encoding: 'utf8' });
  if (lintRes.status !== 0) {
    problems.push(`${file}: geometry-lint FAILED (exit ${lintRes.status}). Output:\n${lintRes.stdout}\n${lintRes.stderr}`);
  }

  // Read once per file, not once per slug (it was re-read inside the slug loop
  // AND again by the quality gate, three reads of the same bytes).
  const codeText = readFileSync(abs, 'utf8');

  // 2b. In scope for craft review at all? See inCraftScope's note.
  if (!inCraftScope(file, codeText)) {
    console.error(`design-done-gate: ${file} is a /display component with no figurative signal ` +
      `(no ELEMENT:/QUALITY_REFERENCE: marker, no <svg>/<canvas>/radial-gradient/clip-path) — treating it as ` +
      `ordinary UI, not an art-directed scene. Commit status and geometry-lint still applied above; the ` +
      `screenshot, pass-criterion, rotation, reference and critic-panel requirements are SKIPPED. If this IS ` +
      `a scene, that is wrong: add the "ELEMENT: <name>" marker the worker conventions already require and it ` +
      `comes back under full review on the next Stop.`);
    continue;
  }

  // 3c. Frozen pass-criterion sentence. FILE-level, checked once — it always
  // was file-level (`/PASS\s*=/` over the whole text), it was just evaluated
  // inside the per-slug loop, so a new five-element file printed the same
  // paragraph five times and made the real problem list harder to read.
  //
  // This is a deterministic pre-check for something that was already a hard
  // blocker — just an expensive, punitive and undocumented one. The correctness
  // critic's own instructions say an element with no "PASS = a fresh viewer
  // names this as ___" sentence "should block just as hard as a visual defect
  // would," and it does: the one real gate-written record in design-cases.json
  // is a 3-0 FAIL where all three samples said, in three different words, that
  // they could not find a criterion to grade against. Nothing in the worker
  // agent's instructions ever told it to write that sentence (fixed there too).
  // So the loop was: build correctly, get failed for a missing comment, spend a
  // strike, spend a three-model panel, and be told about it in prose. Checking
  // it here costs nothing, cannot cost a strike, and says exactly what to add.
  const hasCriterionAnywhere = /PASS\s*=/.test(codeText);
  if (!hasCriterionAnywhere) {
    problems.push(`${file}: no frozen pass-criterion sentence found in the file. Per ` +
      `concepts/OBJECT-RENDERING-PROTOCOL.md every element needs one comment reading ` +
      `"PASS = a fresh viewer names this as ___." The correctness critic is instructed to FAIL an element ` +
      `it cannot grade against a stated criterion, so without this the critic panel would burn a strike on ` +
      `a missing comment rather than on the work. Add one next to each ELEMENT marker and stop again.`);
  }

  const slugs = elementSlugsForFile(file);
  for (const { slug, element: elementName, degraded } of slugs) {
    if (degraded) {
      console.error(`design-done-gate: no "ELEMENT: <name>" marker found for a touched hunk in ${file} — ` +
        `using degraded line-anchored slug "${slug}". Add the marker comment above new figurative/iconic ` +
        `elements so strikes and screenshots track per-element, not per-line-range.`);
    }

    // 3. Screenshot: filename must BE the slug (or slug-<n>), not merely start
    // with it. The old second branch (`f.startsWith(slug.split('::').pop())`)
    // was a no-op — slugify() already ate the "::" — and would have been a hole
    // if it worked, since a bare element name like "flame" matches any file's
    // flame shot. The surviving `startsWith(slug)` had a smaller version of the
    // same hole: element `flame` was satisfied by `flame-inner`'s screenshot.
    // `blockers` rather than an early `continue`: a slug missing BOTH a
    // screenshot and a pass criterion used to report only the screenshot,
    // because the screenshot check bailed out of the iteration before the rest
    // ran. That is one blocking problem per Stop attempt on a file that needs
    // two things — the agent renders, stops, and only then learns it also
    // needed a criterion comment. Everything cheap and deterministic is
    // collected first now; only the critic spawn is skipped.
    let blockers = hasCriterionAnywhere ? 0 : 1; // file-level criterion check, reported once above
    const { fresh: hasFreshShot, freshShots: shotsForSlug, shots: allShotsForSlug } = freshShotsFor(slug, abs);
    if (!hasFreshShot) {
      blockers++;
      problems.push(`${file} [${slug}]: no fresh screenshot named exactly "${slug}.png" (or "${slug}-<n>.png") ` +
        `found in ${SHOT_DIR}, newer than the file's last edit and larger than 15KB. ` +
        `${allShotsForSlug.length
          ? `(${allShotsForSlug.length} correctly-named capture(s) DO exist — ${allShotsForSlug.join(', ')} — but ` +
            `every one of them predates the file's last edit or is under 15KB, so they describe a version of ` +
            `this element that no longer exists. Re-capture after your last edit.) `
          : ''}` +
        `Be honest about what this check can and cannot do: it verifies filename, mtime and size only. ` +
        `It cannot tell whether the PNG actually shows this element, so a correctly-named capture of ` +
        `something else passes it — the check catches "never rendered," not "rendered the wrong thing." ` +
        `Judging the content is the critic's job, downstream of this.`);
    }

    // 3b. Motion check — per the critic-reliability think-tank finding that
    // static-frame VLM judgment of continuous motion is unreliable enough
    // that the critic is now explicitly instructed NEVER to judge it. If
    // this element's code has rotation motion, a deterministic
    // assert-rotation-over-time.mjs result is mandatory, independent of
    // whatever the critic says about static form.
    // The `(?![A-Za-z0-9_-])` boundary is load-bearing: without it
    // `ELEMENT:\s*flame` also matches `ELEMENT: flame-inner`, so `flame`'s
    // rotation requirement was decided by whatever code followed a DIFFERENT
    // element's marker — in both directions (a spurious requirement, or a real
    // one missed because the sibling's 600-char window had no rotate()).
    const hasRotation = elementName
      ? new RegExp(`ELEMENT:\\s*${elementName}(?![A-Za-z0-9_-])[\\s\\S]{0,600}?rotate\\(`).test(codeText)
      : /rotate\(/.test(codeText); // degraded slug — can't scope to the element, check the whole file
    if (hasRotation) {
      const rotationLogPath = resolve(SHOT_DIR, `${slug}-rotation-check.json`);
      // Freshness, not just existence. Every other piece of evidence this gate
      // accepts has to postdate the file it describes — screenshots do
      // (freshShotsFor), critic verdicts do (the mtime rule above). Rotation
      // evidence was the one exception, so a run from an earlier version of the
      // animation satisfied this check forever, including after the very edit
      // that broke the motion. That is the meadow-swing failure mode exactly:
      // a check that cannot see the failure it exists to catch.
      const rotationFresh = existsSync(rotationLogPath) &&
        statSync(rotationLogPath).mtimeMs >= statSync(abs).mtimeMs;
      if (!rotationFresh) {
        problems.push(`${file} [${slug}]: this element animates rotation but no ${existsSync(rotationLogPath)
          ? `rotation-angle-over-time result NEWER THAN THE FILE'S LAST EDIT exists at ${rotationLogPath} (the one ` +
            `there describes an earlier version of this animation — re-run it)`
          : `rotation-angle-over-time result exists at ${rotationLogPath}`}. Run ` +
          `concepts/tools/assert-rotation-over-time.mjs and save its result there before Stop — the critic will ` +
          `not (and should not) judge motion from screenshots.`);
        // Deliberately NOT a `blockers++`: this problem already blocks the Stop
        // on its own, and unlike a missing screenshot or a missing criterion it
        // does not stop the critic from doing its job — the critic grades static
        // form and is forbidden from grading motion at all. Skipping the panel
        // here would cost a real static verdict for a missing motion log.
      }
    }

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

    // Deterministic evidence is missing, so there is nothing coherent to ask a
    // critic: no confirmed-relevant screenshot to look at, or no criterion to
    // grade against. Skip the panel (and skip recording a verdict), having
    // already said everything that is wrong.
    if (blockers) continue;

    // 4. Critic verdict, per-slug — spawned THREE times independently,
    // majority vote, per the critic-reliability think-tank finding that a
    // single VLM sample driving an irreversible two-strike counter is a
    // coin flip wired to a state machine.
    const verdictPath = resolve(VERDICT_DIR, `${slug}.json`);
    let verdict = null;
    if (existsSync(verdictPath)) {
      try { verdict = JSON.parse(readFileSync(verdictPath, 'utf8')); } catch { verdict = null; }
    }
    // Freshness has THREE conditions, not two. The third — verdict newer than
    // the file it judged — was missing: an hour-long cache with no
    // invalidation meant fixing the scene and re-Stopping still hit the old
    // FAIL (burning the agent's remaining attempt on work it had already
    // redone), and symmetrically a PASS would have cleared a file that changed
    // underneath it. A verdict about a previous version of the file is not a
    // verdict about this one.
    const verdictAge = verdict?.timestamp ? new Date(verdict.timestamp).getTime() : 0;
    // Freshness's third condition used to be "verdict newer than the file's mtime" — forgeable by
    // backdating the SCENE FILE's own mtime (a path this gate does not otherwise restrict). Content-
    // hash equality replaces it: the verdict is about THIS EXACT content, or it isn't, independent of
    // any timestamp on either side. `codeText` is already in memory from this file's own read above.
    const verdictIsFresh = !!verdict && verdict.checkedFile === file && verdictAge > 0 &&
      (Date.now() - verdictAge) < 1000 * 60 * 60 &&
      verdict.sceneFileHash === sceneHash(codeText);

    let verdictJustComputed = false;
    if (!verdictIsFresh && isSecondPass) {
      // Loop guard: don't spawn. But DO read and enforce whatever verdict is
      // already on disk. The old code `continue`d here, BEFORE the verdict was
      // even loaded — so a FAIL recorded on the first Stop attempt was never
      // looked at on the second. Fail once, press Stop again, walk free: the
      // literal "try twice and walk free" behaviour v2's header claims to have
      // closed, still open on the one check that matters most.
      // Yes, blocking here can repeat across Stop attempts within a turn. So
      // can the commit and geometry-lint checks, which have always blocked on
      // the second pass. Refusing an unverified Stop is this script's stated
      // contract; the escapes are to make an edit (which lets the next turn
      // re-spawn), run the critic by hand and drop its JSON at the path below,
      // or tell Ben the gate is stuck.
      if (!verdict) {
        problems.push(`${file} [${slug}]: no critic verdict exists at all and the second-pass loop-guard ` +
          `forbids spawning one this turn. This Stop is refused rather than allowed unverified. ` +
          `Either make a real edit and stop again (next turn can spawn), or stop and tell Ben the ` +
          `critic never ran for this slug — do not report this element as done.`);
        continue;
      }
      console.error(`design-done-gate: [${slug}] second pass — reusing the on-disk verdict ` +
        `(${verdict.verdict}, ${verdict.timestamp}) instead of spawning. Provisional, not fresh.`);
      if (verdict.verdict !== 'FAIL') {
        problems.push(`${file} [${slug}]: the only critic verdict on file is stale (${verdict.timestamp}, ` +
          `file last edited ${new Date(statSync(abs).mtimeMs).toISOString()}) and the loop-guard blocks a ` +
          `re-spawn this turn. A stale PASS is not a PASS.`);
        continue;
      }
      // A stale FAIL falls through to the strike logic below — recordFail()
      // keys off verdict.timestamp, so re-reading it costs no extra strike.
    } else if (!verdictIsFresh) {
      // Same shared spawn/vote helper the quality gate uses — this loop used
      // to carry its own copy-pasted version of it, so a fix to one (better
      // JSON extraction, failure reporting, order variance) silently didn't
      // reach the other. One code path, one discipline.
      const promptBody = criticInstructions || 'Act as a strict, independent visual QA critic.';
      const shotPaths = shotsForSlug.map(s => resolve(SHOT_DIR, s));
      // Vary the prompt per sample. spawnCriticVotes()'s own doc-comment says
      // callers do this — the quality caller did, this one passed a closure
      // that ignored `i` and sent three byte-identical prompts, which is one
      // read counted three times dressed up as a 3-0 vote. Rotating the
      // screenshot order is the correctness-side equivalent of the quality
      // gate's A/B swap: same evidence, different presentation order — but be
      // honest about its reach. With a single screenshot (the usual case for
      // one element) the rotation is a no-op and the ONLY thing separating
      // these three samples is the model panel in spawnCriticVotes().
      const { samples, failures } = spawnCriticVotes((i) => {
        const ordered = shotPaths.length > 1
          ? shotPaths.slice(i % shotPaths.length).concat(shotPaths.slice(0, i % shotPaths.length))
          : shotPaths;
        return `${promptBody}\n\n---\nYou are being invoked by design-done-gate.mjs, not the authoring agent. ` +
          `Element slug: "${slug}". File: ${file}. Screenshot(s): ${ordered.join(', ') || '(none matched — say so in your reason)'}.\n` +
          `Open and actually look at every screenshot listed before judging. Judge only what you can see; ` +
          `you are one of three independent reads and you will not see the others, so do not hedge toward ` +
          `a middle answer you imagine they might give.\n` +
          `Reason through the three named parts, THEN output the final JSON object as the LAST thing in your response, with "checkedFile":"${file}".`;
      });

      if (samples.length < 2) {
        problems.push(`${file} [${slug}]: could not obtain at least 2 of 3 valid critic samples (claude -p ` +
          `spawn unverified/failed — see this script's header note). Spawn failures: ` +
          `${failures.join('; ') || '(none recorded)'}. MANUAL STEP REQUIRED: run the ` +
          `trivia-os-design-critic agent against this element 3x by hand. Note that the worker agent is ` +
          `permission-denied from writing ${VERDICT_DIR} — if you are the worker, stop and hand this to Ben ` +
          `rather than trying to write the verdict yourself.`);
        continue;
      }
      const votes = tallyVotes(samples);
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
        // Which model produced each counted vote. Recorded so a later reader
        // can tell a genuinely diverse panel from one that collapsed onto a
        // single model (every entry 'default') after model-spawn fallbacks —
        // the difference decides how much a unanimous result is worth.
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
      if (defectsSingleSample.length) {
        console.error(`design-done-gate: [${slug}] correctness verdict ${parsed.verdict} with a ` +
          `SINGLE-SAMPLE finding (only one of three samples named it — treat as a lead, not a confirmed ` +
          `finding): ${defectsSingleSample.join(', ')}. This is the exact shape a lone dissenting sample ` +
          `takes when the vote outvotes it without an agreed-major override firing — logged to ` +
          `design-cases.json; worth reading the full reason text before treating this element as settled.`);
      }
      writeProtectedFile(verdictPath, () => writeFileSync(verdictPath, JSON.stringify(parsed, null, 2)));
      auditLog('design-critic-verdicts', 'write-verdict', { slug, verdict: parsed.verdict, file }, verdictPath);
      verdict = parsed;
      verdictJustComputed = true;
    }

    // 5. Case-writing — GATE-owned, not worker-owned (memory think-tank
    // finding: the worker writing its own case history reproduces the
    // self-report problem one layer down). Only the verdict/category come
    // from the critic; rootCause/fixThatWorked are left for a human or a
    // future pass to enrich — never auto-filled with agent-authored prose.
    // Written ONLY for a freshly-computed verdict: a cached verdict re-read on
    // a later Stop within the hour is the same event, and appending it again
    // would inflate the case log with duplicates of one critic read.
    // The condition is `verdictJustComputed`, NOT `!verdictIsFresh` — those
    // were only ever equivalent because the second-pass branch used to bail
    // before reaching here. Now that a stale verdict can reach this line,
    // `!verdictIsFresh` would re-log the same critic read on every Stop.
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

    if (verdict && verdict.verdict === 'FAIL') {
      correctnessByFile.fail.push(slug);
      const entry = recordFail(countsMap, slug, verdict, { lastCheckedFile: file });
      if (twoStrikeBlocked(entry, slug, verdictIsFresh || verdictJustComputed)) {
        problems.push(`${file} [${slug}]: TWO-STRIKE STOP — this exact element has now failed a real ` +
          `visual/critic read ${entry.fails} times (latest: "${entry.lastReason}"). ` +
          `Do not attempt a third blind guess. Re-lock scope with Ben. Override (single-use, consumed ` +
          `when it fires): set countsMap["${slug}"].unlocked = true directly in ${COUNTS_FILE}.`);
      } else {
        problems.push(`${file} [${slug}]: critic verdict FAIL (${verdict.sampleVotes?.pass ?? '?'}/${verdict.sampleVotes?.total ?? '?'} PASS votes) — "${verdict.reason || '(no reason given)'}"`);
      }
    } else if (verdict && verdict.verdict === 'PASS') {
      correctnessByFile.pass.push(elementName || slug);
    }
  }

  // 6. QUALITY gate — separate from every correctness check above, runs
  // once per file against the whole scene, not per element. This is the
  // fix for a scene that passed every noun-test/geometry-lint/safe-zone
  // check above and still shipped thin, blurry, and worse than the
  // reference image it was built from — nothing above this line has ever
  // been asked "is this actually good," only "is this technically correct."
  // A scene must PASS both gates. Passing only this one, or only the
  // correctness loop above, is not done.
  if (!qualityInstructions) {
    console.error(`design-done-gate: [${file}] QUALITY gate not run — no quality critic agent file. See warning above.`);
  } else {
    // NOTE: `isSecondPass` no longer skips this whole block. It used to, which
    // meant an existing quality FAIL was not even read on the second Stop
    // attempt — same fail-open as the correctness loop had. Only the SPAWN is
    // skipped on the second pass now; see the branch further down.
    const refMatch = codeText.match(/QUALITY_REFERENCE:\s*(\S+)/);
    // Namespaced away from the per-element slug space on purpose: element
    // slugs are slugify(file::name), and slugify() flattens "::" to "__", so
    // a slugify(file::__quality__) key was one unlucky element name away from
    // sharing a strike counter with the whole-scene quality verdict.
    const qualitySlug = `QUALITY__${slugify(file)}`;
    // The screenshot prefix is the slug itself — same rule as every
    // per-element shot, so one convention covers the whole directory.
    const qualityShotPrefix = qualitySlug;

    if (!refMatch) {
      // Enforcement is by file age, not by promise: an untracked (brand-new)
      // visual file is exactly the "NEW image-first build" this convention was
      // written for, so it blocks. Files already in git predate the convention
      // and only warn — otherwise every legacy theme becomes unstoppable.
      // "New" = no commit has ever touched this path. The old test was
      // `/^\?\?/` against git status, which is only true while the file is
      // UNTRACKED: `git add` on a brand-new file flips the porcelain prefix to
      // "A " (verified), so staging a new build silently downgraded this from
      // MANDATORY to a warning — and the worker instructions tell the agent to
      // commit, so the staged state is on its normal path, not an edge case.
      // `git log -1 -- <file>` is empty for untracked AND for
      // staged-never-committed, and non-empty for anything with history.
      const isNewFile = !sh(`git log -1 --format=%H -- "${file}"`).trim();
      const msg = `${file}: no "QUALITY_REFERENCE: <repo-relative-path>" marker comment found — ` +
        `the quality gate cannot run without a locked reference image to compare against. Add one near the top of the file.`;
      if (isNewFile) {
        problems.push(`${msg} BLOCKING because this file is new/untracked: a new image-first build with no ` +
          `reference marker has never had its craft checked at all, which is the exact gap this gate exists to close.`);
      } else {
        console.error(`design-done-gate: ${msg} Not blocking — this file predates the convention (already tracked in git).`);
      }
    } else {
      const rawRef = refMatch[1].replace(/[)>,;'"]+$/, ''); // trailing comment punctuation
      const isUrl = /^https?:\/\//i.test(rawRef);
      const referenceImage = isUrl ? rawRef : resolve(REPO_ROOT, rawRef);
      // A reference path nobody checked is a reference the critic silently
      // can't open — and its verdict would then be an unanchored vibe read,
      // the precise failure this gate was built to prevent.
      //
      // Remote references are refused outright, not waved through. A URL
      // skipped the existence check entirely (there was nothing local to
      // stat), and a spawned `claude -p` critic given an https URL as its
      // "locked reference image" most likely cannot open it at all — which
      // produces exactly the reference-blind samples this gate then drops,
      // surfacing as a confusing "could not obtain 2 of 3 valid samples"
      // instead of the real cause. A locked reference also has to be locked:
      // a remote image can change or vanish, so the standard the work was
      // approved against would not be reproducible later.
      if (isUrl) {
        problems.push(`${file}: QUALITY_REFERENCE is a remote URL ("${rawRef}"). Not accepted. Download the ` +
          `locked reference into the repo (concepts/references/) and point the marker at the repo-relative ` +
          `path. A reference the critic cannot open is not a standard, and a reference that can change ` +
          `upstream is not locked.`);
      } else if (!existsSync(referenceImage)) {
        problems.push(`${file}: QUALITY_REFERENCE points at "${rawRef}", which does not exist (resolved to ` +
          `${referenceImage}). Fix the marker to a real repo-relative path before Stop.`);
      } else {
        const { fresh: hasFreshQualityShot, freshShots: qualityShots } = freshShotsFor(qualityShotPrefix, abs);
        if (!hasFreshQualityShot) {
          problems.push(`${file}: no fresh WHOLE-SCENE screenshot named exactly "${qualityShotPrefix}.png" (or ` +
            `"${qualityShotPrefix}-<n>.png") found in ${SHOT_DIR}, newer than the file's last edit and larger than ` +
            `15KB. This is a separate capture from the per-element shots above: one full ` +
            `frame of the finished scene, same viewport the display renders at, for the quality gate.`);
        } else {
          const qualityVerdictPath = resolve(VERDICT_DIR, `${qualitySlug}.json`);
          let qVerdict = null;
          if (existsSync(qualityVerdictPath)) {
            try { qVerdict = JSON.parse(readFileSync(qualityVerdictPath, 'utf8')); } catch { qVerdict = null; }
          }
          // Same three-part freshness rule as the correctness verdict: a
          // verdict older than the file it judged is about a different file.
          const qAge = qVerdict?.timestamp ? new Date(qVerdict.timestamp).getTime() : 0;
          // Same hash-based freshness as the correctness verdict — see that check's comment.
          const qVerdictIsFresh = !!qVerdict && qVerdict.checkedFile === file && qAge > 0 &&
            (Date.now() - qAge) < 1000 * 60 * 60 && qVerdict.sceneFileHash === sceneHash(codeText);
          // Mirrors the correctness loop's `verdictJustComputed`: needed so the
          // single-use override is not spent against a verdict this script has
          // already declared out of date. See twoStrikeBlocked()'s note.
          let qJustComputed = false;

          if (!qVerdictIsFresh && isSecondPass) {
            // Loop guard: no spawn, but the on-disk verdict is still read and
            // enforced (below) rather than the whole gate being skipped.
            if (!qVerdict) {
              problems.push(`${file} [QUALITY]: no craft verdict exists at all and the second-pass loop-guard ` +
                `forbids spawning one this turn. Refusing the Stop rather than allowing it unverified — this ` +
                `scene's craft has never been checked. Make an edit and stop again, or hand it to Ben.`);
              qVerdict = null;
            } else if (qVerdict.verdict !== 'FAIL') {
              problems.push(`${file} [QUALITY]: the only craft verdict on file is stale (${qVerdict.timestamp}) ` +
                `and the loop-guard blocks a re-spawn this turn. A stale PASS is not a PASS.`);
              qVerdict = null;
            } else {
              console.error(`design-done-gate: [${file}] second pass — reusing the on-disk QUALITY verdict ` +
                `(FAIL, ${qVerdict.timestamp}) instead of spawning.`);
            }
          } else if (!qVerdictIsFresh) {
            const shotPaths = qualityShots.map(s => resolve(SHOT_DIR, s)).join(', ');
            // Presentation order alternates across samples. Pairwise image
            // judging carries a documented position bias (whichever image is
            // shown first is favoured), and three identical prompts to one
            // model produce correlated errors — which would make a 3-0 vote
            // look like agreement when it is one read counted three times.
            const { samples: qSamples, failures: qFailures } = spawnCriticVotes((i) => {
              const refFirst = i % 2 === 1;
              const pair = refFirst
                ? `Image A (locked reference): ${referenceImage}\nImage B (rendered scene): ${shotPaths}`
                : `Image A (rendered scene): ${shotPaths}\nImage B (locked reference): ${referenceImage}`;
              return `${qualityInstructions}\n\n---\nYou are being invoked by design-done-gate.mjs. File: ${file}.\n${pair}\n` +
                `Open and actually look at BOTH images before judging — do not reason from filenames or from the code.\n` +
                `Reason through the named checks, THEN output the final JSON object as the LAST thing in your response, ` +
                `with "checkedFile":"${file}".`;
            }, 3);

            // A sample that never opened the reference is not a quality
            // judgment, whatever verdict it printed. Dropped, not counted.
            // `=== true`, not `!== false`: the critic file requires the field
            // on every response, so a sample omitting it did not follow the
            // output contract and there is no evidence it looked at anything.
            // Counting it would be guessing in the gate's favour, which is the
            // one direction this script is not allowed to guess.
            const seeing = qSamples.filter(s => s.referenceUsed === true);
            const blind = qSamples.length - seeing.length;

            if (seeing.length < 2) {
              problems.push(`${file}: could not obtain at least 2 of 3 valid QUALITY critic samples ` +
                `(${qSamples.length} parsed, ${blind} of those did not report referenceUsed:true, i.e. could ` +
                `not open the reference image or ignored the output contract). ` +
                `Spawn failures: ${qFailures.join('; ') || '(none recorded)'}. MANUAL STEP REQUIRED: run the ` +
                `trivia-os-design-quality-critic agent by hand 3x against ${referenceImage}. The worker agent ` +
                `cannot write ${VERDICT_DIR} — if you are the worker, hand this to Ben instead of writing it.`);
              qVerdict = null; // do NOT fall through to a stale verdict below
            } else {
              const votes = tallyVotes(seeing);
              // Defect tags only mean something if independent samples reach
              // for the SAME tag. Union-of-everything turned three private
              // vocabularies into one noisy list that could never be counted
              // across scenes; agreed tags (2+ samples) are the signal, the
              // rest is kept but marked as single-sample.
              // Severity, added because the rubric was binary and threw real
              // signal away. `defects` had to be empty on a PASS, so two
              // samples that BOTH genuinely saw the same small flaw had
              // nowhere to put it: either it was severe enough to sink the
              // whole scene, or it evaporated. That is a gate that can only
              // learn about disasters. Each defect now carries
              // severity major|minor (a bare string stays major, for
              // back-compat with anything already on disk). A tag two or more
              // samples reach for is a finding either way; it is MAJOR only if
              // two or more of them called it major.
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
              qVerdict = {
                verdict: majorOverride ? 'FAIL' : votes.verdict,
                verdictSource: majorOverride ? 'agreed-major-defect-override' : 'majority-vote',
                reason: seeing.map((s, i) => `[sample ${i + 1}: ${s.verdict}] ${s.reason || ''}`).join(' '),
                defects: agreedDefects,
                // Real, agreed, and NOT blocking. This is the whole point of
                // adding severity: a small flaw two samples both saw used to
                // have to be discarded to keep `defects` empty on a PASS.
                // It now lands in the verdict and in the case log, where it can
                // be counted across scenes — which is how "every hand-built
                // treeline comes out slightly faded" ever becomes visible.
                minorFindings: agreedMinor,
                defectsSingleSample,
                defectsOffVocabulary,
                deviations: [...new Set(seeing.flatMap(s => s.deviations || []))],
                checkedFile: file, timestamp: new Date().toISOString(),
                sceneFileHash: sceneHash(codeText),
                sampleVotes: { pass: votes.pass, fail: votes.fail, total: votes.total, droppedBlind: blind },
                panel: seeing.map(s => s._model || 'default'), // see the correctness verdict's note
              };
              writeProtectedFile(qualityVerdictPath, () => writeFileSync(qualityVerdictPath, JSON.stringify(qVerdict, null, 2)));
              auditLog('design-critic-verdicts', 'write-quality-verdict', { qualitySlug, verdict: qVerdict.verdict, file }, qualityVerdictPath);
              qJustComputed = true;
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
            }
          }

          if (qVerdict?.defectsOffVocabulary?.length) {
            console.error(`design-done-gate: [${file}] QUALITY critic returned tags outside its closed set and ` +
              `they were discarded: ${qVerdict.defectsOffVocabulary.join(', ')}. If these keep recurring they are ` +
              `a real gap in the vocabulary — add them to BOTH the critic file and QUALITY_DEFECT_TAGS here, ` +
              `rather than letting the set quietly reopen.`);
          }

          // Agreed MINOR findings are surfaced whatever the verdict — on a
          // PASS especially, since that is the case the old binary rubric had
          // to delete. Not blocking, and deliberately not phrased as a to-do:
          // a scene can ship with known minor findings. What it cannot do is
          // ship with them unrecorded.
          if (qVerdict?.minorFindings?.length) {
            console.error(`design-done-gate: [${file}] QUALITY verdict ${qVerdict.verdict} with agreed MINOR ` +
              `findings (2+ samples, none blocking): ${qVerdict.minorFindings.join(', ')}. Logged to ` +
              `design-cases.json. Worth fixing if it is cheap; worth watching if the same tag keeps recurring ` +
              `across scenes, which is the pattern this field exists to make countable.`);
          }
          if (qVerdict?.defectsSingleSample?.length) {
            console.error(`design-done-gate: [${file}] QUALITY verdict ${qVerdict.verdict} with a ` +
              `SINGLE-SAMPLE finding (only one of three samples named it): ${qVerdict.defectsSingleSample.join(', ')}. ` +
              `Previously this was only surfaced inline as part of a FAIL message — meaning a single dissent on ` +
              `an otherwise-PASSing scene was recorded but never printed anywhere. Logged to design-cases.json ` +
              `regardless of verdict now.`);
          }

          if (qVerdict && qVerdict.verdict === 'FAIL') {
            // Cross-gate note. The two critics grading the same frame and
            // reaching opposite conclusions is usually them each doing their
            // own job — "that is unmistakably a chair" and "that chair is
            // underdrawn" are both true at once, by design; the split exists
            // precisely so the first can't excuse the second. But it is worth
            // saying out loud, because the wrong reaction to a craft FAIL is
            // to go re-argue correctness (which already passed) or to start
            // adding elements. The fix for a craft FAIL is craft.
            const crossGate = correctnessByFile.pass.length && !correctnessByFile.fail.length
              ? ` NOTE: every element in this file PASSED the correctness critic (${correctnessByFile.pass.join(', ')}) ` +
                `and the scene still fails on craft. That is not a contradiction and neither critic is wrong — ` +
                `it is the exact gap this gate was added for. Do not re-litigate correctness or add new elements; ` +
                `raise execution on what is already there.`
              : '';
            const entry = recordFail(countsMap, qualitySlug, qVerdict, { lastCheckedFile: file, lastDefects: qVerdict.defects || [] });
            if (twoStrikeBlocked(entry, qualitySlug, qVerdictIsFresh || qJustComputed)) {
              problems.push(`${file} [QUALITY]: TWO-STRIKE STOP — this scene has failed craft review ` +
                `${entry.fails} times (defects agreed by 2+ samples: ${(qVerdict.defects || []).join(', ') || 'see reason'}). ` +
                `Do not attempt a third blind revision pass. Per OBJECT-RENDERING-PROTOCOL.md the escalation is a closer ` +
                `roto-trace off the locked reference — still hand-built — not another invented pass, and not shipping the ` +
                `reference itself. Re-lock scope with Ben first. Override (single-use, consumed when it fires): set ` +
                `countsMap["${qualitySlug}"].unlocked = true directly in ${COUNTS_FILE}.${crossGate}`);
            } else {
              problems.push(`${file} [QUALITY]: FAIL (${qVerdict.sampleVotes?.pass ?? '?'}/${qVerdict.sampleVotes?.total ?? '?'} PASS votes) ` +
                `— agreed MAJOR defects: ${(qVerdict.defects || []).join(', ') || '(none agreed by 2+ samples)'}` +
                // A FAIL with no agreed major defect is reachable and is not a
                // contradiction: the samples voted FAIL on the whole frame
                // while their tags happened to land minor or unshared. Saying
                // "agreed defects: (none)" and stopping there reads like the
                // gate failed a scene over nothing, so the minor findings and
                // the reason carry the explanation. The strike is counted the
                // same either way — the verdict is the vote, and severity
                // decides what can OVERRIDE a PASS, never what softens a FAIL.
                `${qVerdict.minorFindings?.length ? `; agreed MINOR (non-blocking, listed for context): ${qVerdict.minorFindings.join(', ')}` : ''}` +
                `${qVerdict.defectsSingleSample?.length ? `; single-sample only (treat as a lead, not a finding): ${qVerdict.defectsSingleSample.join(', ')}` : ''}. ` +
                `Reason: "${qVerdict.reason || '(none)'}"${crossGate}`);
            }
          }
        }
      }
    }
  }
}

} catch (e) {
  problems.push(`design-done-gate crashed mid-check: ${e && e.stack ? e.stack : e}. Treating this as a BLOCK, ` +
    `not a pass — the checks below the crash point never ran, so nothing has actually been verified.`);
}

// Merge against disk instead of overwriting it. This file was read once at the
// top of the run and written back whole at the bottom, which is last-writer-
// wins: two sessions working in this repo at the same time (the exact situation
// the v3 session-scoping fix exists to support) could each read `fails: 1`,
// each record a strike, and leave `fails: 2` where there should be 3 — a
// two-strike stop that never fires. Strikes are the enforcement; losing one
// silently is the worst failure this file has. Merge rule: highest `fails`
// wins, and `unlocked` stays false if EITHER side cleared it, so a consumed
// single-use override cannot be resurrected by a concurrent writer.
// Honest limit: this can still under-count by one when two sessions record
// against the same slug in the same instant. It cannot lose a whole history.
try {
  let onDisk = {};
  if (existsSync(COUNTS_FILE)) {
    try { onDisk = JSON.parse(readFileSync(COUNTS_FILE, 'utf8')) || {}; } catch { onDisk = {}; }
  }
  for (const [key, theirs] of Object.entries(onDisk)) {
    const mine = countsMap[key];
    if (!mine) { countsMap[key] = theirs; continue; }
    // One exception to "highest wins", and it is the whole reason this needs
    // thought: if THIS run consumed the override, it deliberately reset the
    // counter to 0, and max()-ing against the pre-reset number on disk would
    // undo the reset and hand back the two-strike stop Ben just paid to lift.
    const iConsumedAnOverride = (mine.overridesUsed || 0) > (theirs.overridesUsed || 0);
    if (!iConsumedAnOverride) mine.fails = Math.max(mine.fails || 0, theirs.fails || 0);
    if (theirs.unlocked === false) mine.unlocked = false;
    mine.overridesUsed = Math.max(mine.overridesUsed || 0, theirs.overridesUsed || 0);
  }
  writeProtectedFile(COUNTS_FILE, () => writeFileSync(COUNTS_FILE, JSON.stringify(countsMap, null, 2)));
  auditLog('design-attempt-counts.json', 'write-counts', { keys: Object.keys(countsMap) }, COUNTS_FILE);
} catch (e) { console.error(`design-done-gate: WARNING — could not write ${COUNTS_FILE}: ${e.message} (strike counts for this run are lost).`); }

if (problems.length > 0) {
  console.error('design-done-gate: BLOCKED —\n' + problems.map(p => '  - ' + p).join('\n'));
  process.exit(2);
}
process.exit(0);
