# Handoff: space-road-trip "floating diner" stop — camera feel still not landing (→ iteration 6)

Written by Claude (Cowork session), 2026-07-22 evening, for Claude Code to pick up.
Ben wants this run through Claude Code specifically **so it can actually watch the
render properly** (real browser + MCP tools), not Cowork's headless-Chromium stub.

## The ask, in one line

Ben: "we are going to be inside the spaceship, like we're driving it, pull up to
the diner. park. the drone is then going to bring us dinner. then we fly off."
Three iterations built against this ask (v3→v4→v5). None of them have registered
for Ben as "driving." His exact words after watching v5 live in his own browser:
**"it is semi frozen. but again, we arent seeing the ship fly up to the diner. it
looks exactly as it did for the last two renders."**

Ben is not asking for a literal external ship model back (that was explicitly
rejected in the v3→v4 turn — "remember, we are in the spaceship, i dont want to
see the exterior"). He's saying the CAMERA MOTION we built to sell "we're piloting
this" isn't perceptible when actually watching it play, even though it is real in
the code and measurably present in screenshots (verified via pixel-diffing across
frames, both by me and by a Fable second-opinion pass).

## Why it's probably too subtle

Current implementation in `concepts/space-road-trip-v5.html`, inside `drawGasWorld`
(search for `updateGasArrival` and the camera-transform block right after it):

- Arrival: `camScale` eases from 0.88 → 1.0 over ~3.3s (`SHIP_HOLD_BEFORE` +
  `SHIP_FLIGHT_DUR`). That's a 12% size change spread over 3+ seconds — very
  gradual, easy to not consciously notice while watching in real time even though
  it measures cleanly frame-to-frame in screenshots.
- Bank/tilt: `GAS_BANK_MAX = -0.06` radians (~3.4°), easing to level by settle.
  Also real, also probably too small to read as "banking into a turn" rather than
  looking like nothing changed.
- Departure punch: `camScale` down to `GAS_DEPART_MIN_SCALE = 0.7` over the final
  500ms before the crossfade — this one IS a bigger, faster move and should be the
  most noticeable of the three. Worth specifically asking Ben if he saw THIS part
  (the punch-out right before the crossfade to harvest) or if he stopped watching
  before the stop's ~13s hold finished.

My working theory: the arrival and bank are both real but under-scaled for how
briefly and casually a live viewer will actually watch this. They need to be
dialed up by a lot, not a little — and possibly paired with an actual "we're
moving fast" visual cue (motion, not just slow scale/rotate), not just tuned
harder in isolation.

## What I proposed to Ben, not yet confirmed

I offered two directions and he cut the conversation short before picking (sent
you here instead). Both are still on the table — use judgment, or ask him:

1. **Much bigger, unmistakable camera move.** Widen the scale range a lot (start
   noticeably more zoomed-out/distant, swoop in with real perceptible speed) and
   push the bank angle to something like 10-15° instead of ~3°, so it genuinely
   reads as a turn, not a drift.
2. **Add a "we're moving fast" cue, not just scale/tilt.** This file's own
   meteor-shower stop (earlier in the same file, function `drawMsWorld`-ish name —
   grep for `msDebris`/`msShake`) already solves "feels like we're moving through
   space" via a z-depth debris rush + camera shake (`msRumbleNoise`), and **Ben
   himself already confirmed that stop reads correctly** ("the galaxy and meteor
   shower already look like we're in the cockpit," said earlier in this same
   revision thread). The diner arrival might need an analogous rush/shake
   treatment during the ~3s approach window, not just a static-feeling zoom+tilt.

Recommend leading with option 2 conceptually (reuse a technique Ben already
signed off on, rather than inventing new tuning by feel a fourth time), possibly
combined with turning up option 1's numbers too. But confirm with Ben rather than
assuming — this is the same repeated-guess trap that already burned iterations
3-5; if Claude Code can render this live and Ben can watch it in real time
together in the same session, that's strictly better than another blind tune.

## Why Claude Code, not Cowork, for this next pass

This Cowork session's only rendering path is a headless Chromium launched via a
`libXdamage.so.1` stub (`concepts/tools/ensure-xdamage-stub.sh`) with no real
display — screenshots work, but there's no live/interactive viewing, and subtle
motion-over-time qualities (does this feel snappy? does it read as "driving"?)
are exactly the kind of thing that's hard to judge from discrete PNG frames,
which is likely part of why 3 iterations have shipped without Ben confirming the
feel actually landed. Claude Code running locally can:
- Actually open the file in a real browser and watch it play, ideally with Ben
  watching alongside in the same room/session.
- Use Playwright MCP or Chrome DevTools MCP (**request access to these — Ben
  said "need the MCPs," meaning make sure they're connected/enabled before
  starting**) for a genuine interactive render, screen recording, or frame-by-
  frame scrub, rather than only fixed-timestamp screenshots.

## Pipeline conventions — read before touching anything

This repo runs a locked nightly-build-style pipeline even for interactive runs.
Read `SKILL.md` (project root) and `references/round-journeys.md` first. Key
rules that matter for this specific task:

- **Iterations are never overwritten in place.** Copy `space-road-trip-v5.html`
  to `space-road-trip-v6.html` and edit the copy. v5.html stays untouched as the
  prior iteration's record. See `manifest.js`'s own header comment.
- **Lock discipline:** `concepts/tools/lock-acquire.sh "manual"` at the start,
  `concepts/tools/lock-release.sh "$RUN_ID"` at the end — always, even if
  something goes wrong. The lock from this session's run
  (`20260722T204309Z-6-27627`) was already released cleanly; you're starting
  fresh.
- **Baseline check:** `concepts/tools/git-baseline.sh save "$RUN_ID"` right after
  lock-acquire, `git-baseline.sh check "$RUN_ID"` right before every commit. If it
  flags drift outside `concepts/`, that's someone else's unrelated work (this
  session hit that twice tonight, both times benign/unrelated file — `FACT-HUNT-PROGRESS.md`,
  `.claude/settings.local.json` — re-save and proceed if you independently confirm
  it's unrelated to this task, same as I did).
- **One-attempt rule on audit findings:** fix a finding once, re-check once,
  then stop looping and hand it to the Fable pass either way (clean or not).
- **Exactly one Fable second-opinion pass** per audit — evidence-only, doesn't
  rebuild or re-run its own visual tooling, just checks your claims against your
  screenshots/recording.
- **Ship sequence:** `QUEUE.md` → `built`, `manifest.js` gets a new entry for v6
  (atomic tmp-file + rename + `node concepts/tools/validate-manifest.mjs`),
  `NIGHTLY-LOG.md` gets a full entry, then
  `concepts/tools/guarded-commit-push.sh "$RUN_ID" "nightly: built <msg>" <paths>`
  — never a raw `git commit`/`git push`. Read `.claude/commands/ship.md` and
  `.claude/commands/audit.md` for the exact procedure; both are short and
  authoritative.

## Current state of the files (as of this handoff)

- `concepts/QUEUE.md` — `space-road-trip` entry: `status: built`, `iteration: 5`,
  `file: space-road-trip-v5.html`, `supersedes: space-road-trip-v4.html`. Revision
  notes (newest first) already contain Ben's exact v4 and v5 feedback verbatim —
  read those before re-deriving context from this handoff alone.
- `concepts/manifest.js` — 5 entries for `space-road-trip`, v5's own entry has
  `status: "draft"` (awaiting Ben's review — that's still accurate, he hasn't
  approved v5), `revisionNotes: []` (empty — this handoff is effectively what
  would have gone in there once Ben's v5 feedback was captured formally; feel
  free to backfill it onto the v5 entry when you add v6's).
- `concepts/NIGHTLY-LOG.md` — full run history through run
  `20260722T204309Z-6-27627` (v5's build+audit+ship), commit
  `13f3c46bfb6e90e596b2f62596f6f28e89998835` pushed clean.
- `concepts/space-road-trip-v5.html` — current shipped file, camera-POV rework
  (v4) + bank/tilt/punch-out (v5) both in place, both real but per Ben's live
  feedback not landing as intended. This is what iteration 6 should copy forward
  from.
- `concepts/tools/spot-check.mjs` — currently pointed at
  `space-road-trip-v5.html` with 8 sub-beat timestamps
  (camera-mid-push/camera-near-settle/touchdown-jolt-flare/debris-settling/
  drone-launched/drone-hover-delivery/drone-returning/settled-idle). Retarget its
  `FILE` constant to v6 when you get there.
- `concepts/.audit-shots/` — has several evidence bundles from tonight's v4 and
  v5 passes if useful for before/after comparison; gitignored, not committed,
  fine to leave or let accumulate.

## One honest data point to carry forward

Every prior visual-audit pass this session (mine and Fable's) confirmed the
motion IS present and measurable via screenshots/pixel-diffs — this is not a
"the code doesn't work" bug, it's a "the effect is too subtle to be felt by a
human actually watching it" gap. Don't just re-verify presence again the same
way; the fix has to actually be watched playing in real time by a human (Ben,
ideally) to know if the NEW version lands, not just re-confirmed via more
timestamped screenshots.
