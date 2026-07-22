# Round Journey Queue

Theme entries for the nightly Storybook Agent. Schema and lifecycle are defined in `PLAN.md` §Approach 1 & 3c — this file is the living data, that file is the spec.

## Status machine

`raw` → `grilled` → `building` → `audit-pending` → `built` → { `approved` | `rejected` | `needs-revision` }
(a `needs-revision` entry loops back through `building` → `audit-pending` → `built` for its next iteration)

- **raw**: an idea exists but hasn't been through a grill session yet. The agent will never build a `raw` entry.
- **grilled**: Ben + Claude have run a daytime grill session and locked a one-paragraph brief with explicit beginning/middle/end story beats (per `references/round-journeys.md`'s "It's a story, not just a mood transition"). Cross-theme handoff briefs name both themes explicitly.
- **building**: an agent run has claimed this entry (see PLAN.md §3c). If you see this status and no agent is currently running, the claiming run likely crashed — the next preflight will detect and reclassify it once its lock has expired.
- **audit-pending**: the code exists and is committed, but Step 5 (static + visual audit) hasn't finished yet — a checkpoint so a dropped connection mid-audit resumes by re-running the audit, not by re-building from scratch (see AGENT-PROMPT.md Step 5 / 2026-07-22 checkpointing addition). If you see this with no run active, the next run's own preflight treats it the same as a stale `building` entry — reclassify once its lock has expired.
- **built**: audit complete (both static and visual passed, or issues were found and the one allowed fix attempt was made — see the one-attempt rule below), tracked in `manifest.js`, awaiting Ben's morning review.
- **blocked**: the agent hit a wall (see NIGHTLY-LOG.md for why) and stopped rather than guessing.
- **approved**: Ben reviewed and signed off on the direction and execution. Ready for the human-driven promotion path (PLAN.md §5).
- **rejected**: Ben reviewed and passed on the whole direction — not worth continuing. Reason lives in `LESSONS.md` (a general, cross-theme takeaway).
- **needs-revision**: Ben reviewed, liked the direction, and gave one or more concrete fixable notes — this is NOT rejection. The notes live in this entry's own `Revision notes` list (below), not in `LESSONS.md`, because they're specific to this one piece. The next agent run claims `needs-revision` entries FIRST, before any `grilled` entry or a fresh invention (see PLAN.md §3c) — a stalled draft always gets priority over starting something new. **Capped at 5 iterations**: on the 5th revision cycle without Ben's approval, the agent stops looping automatically and logs "iteration cap hit, needs your call" — it's your decision from there whether to keep iterating by hand or mark it `rejected`. This is Ben's own review cycle (across separate runs) — see the ONE-ATTEMPT rule below for the separate, much tighter cap on self-fix retries *within* a single run.

**One-attempt rule (2026-07-22, Ben's explicit instruction — see NIGHTLY-LOG.md):** when Step 5's own audit (static or visual) finds an issue during a run, the agent gets exactly ONE fix attempt, then re-audits once. Whether that re-audit comes back clean or not, the run does NOT keep self-looping fix attempts — it proceeds straight to the single Fable second-opinion pass (see `.claude/commands/audit.md`'s "Second opinion" section) either way. If issues remain after the one attempt, say so plainly in the notes handed to Fable and to Ben — do not keep trying to fix it silently. This is deliberately much tighter than the 5-iteration Ben-review cap above: that cap governs iterations across separate mornings with Ben's own input between them; this rule governs a single run's own internal retry behavior, where repeated self-fix attempts without new information are the "sunk cost" failure mode Ben is explicitly guarding against.

## Entry format

```
### <id> — <short title>
status: raw | grilled | building | built | blocked | approved | rejected | needs-revision
journeyType: same-theme | cross-theme
theme: <theme name>          (same-theme)
fromTheme / toTheme: <...>   (cross-theme, instead of theme)
targetShow / targetRound: <optional — a real upcoming show/round boundary this journey
                            is meant for, if one's been decided. Not required; plenty of
                            journeys get grilled and built before a specific show is set.>
source: ben-grilled | agent-proposed+self-grilled
                              (agent-proposed entries ARE appended here, status `building`
                               directly, on the same night they're invented and self-grilled
                               — see PLAN.md §3c / AGENT-PROMPT.md Step 2(3). This durable
                               record is what future nights read for the anti-repetition
                               check — an agent-proposed idea that never touched this file
                               would leave no trace for the next night's "don't repeat the
                               last 5" scan.)
iteration: <n>                (starts at 1; increments each needs-revision pass)

Brief (beginning/middle/end):
<one paragraph. What happens, what it costs, how it resolves. This is the locked
creative direction the agent builds from — it does not re-interpret or improve on it.>

Revision notes (newest first, only if iteration > 1):
- <date>: <Ben's concrete note from that morning's review — the specific fixable thing,
  not a vibe, per round-journeys.md's feedback protocol>
```

## Queue

### space-road-trip — Space Road Trip (four destinations)
status: built
journeyType: cross-theme
fromTheme: midnight-galaxy
toTheme: autumn-harvest
source: ben-grilled
iteration: 4
file: space-road-trip-v4.html
supersedes: space-road-trip-v3.html

Brief (beginning/middle/end):
A four-stop tour built and heavily revised across a separate live session (not this
tracking system) before tonight: midnight galaxy (opens, 10s, a calm star-warp hold
with a hyperspace-snap flash punctuating it) → meteor shower (10s, flying THROUGH a
z-depth debris field with camera shake, not watching one from a distance) → retro-arcade
gas station on a rocky moon (10s, a ship flies in, lands with an engine-flare and
ground-dust thump, parks beside a small relabeled "DINER" sign under a dominant ringed
planet) → autumn harvest / supernova (10s, ember field building to a converge-burst-settle
nova). In the real app these fire as four SEPARATE round-boundary journeys, each at its
own round transition — this file is a combined review artifact for watching the whole
arc at once, not how it plays live. Each individual stop, including its own bridge-in,
sums to exactly 10,000ms — within the normal 8-14s per-journey target once split apart.
Already through three Fable review passes (2nd: 5 findings fixed; 3rd: 10 findings
fixed), one Gemini pass (2 fixes applied), and a guest-reaction simulation pass that
drove the galaxy hyperspace-snap and gas-station touchdown-thump additions. Self-gate
checklist in the file already passes.

Revision notes (newest first):
- 2026-07-22 [Claude, iteration 4 built + audited — status now `built`, awaiting
  Ben's review]: implemented the camera-POV fix below in `space-road-trip-v4.html`.
  `drawGasShip`/`drawGasShipBody` deleted outright; the diner stop's arrival is now
  a camera push (scale/translate on `drawGasWorld`'s own content, same technique
  class as galaxy's zoom-punch) with no ship sprite ever drawn. Takeout-drone beat
  kept, retargeted to deliver low-center-of-frame ("to us"). Step 5 visual pass
  (generic + targeted spot-check) found one real bug — the touchdown flare was
  centered near roof height instead of the ground-contact point the debris burst
  uses — fixed within the one-attempt rule and re-checked once. Fable's evidence
  pass confirmed no ship/no cockpit chrome/camera-motion arrival/correct drone
  delivery, but could not confirm via pixel-diff that the flare fix is visible at
  the exact captured touchdown millisecond (plausibly just fast decay + capture
  timing, same class as this file's earlier debris-subtlety note, not re-litigated
  further per the one-attempt rule). Full account in the file's own notes block.
  Ben's own job: does the camera push read right, and is the touchdown flare
  visible enough at real venue-TV brightness.
- 2026-07-22 [Ben, after watching v3]: "remember, we are in the spaceship. i dont
  want to see the exterior when we go to the diner." Root cause: this file's own
  established scaffold (`meteor-shower-liftoff-pov-teampicker.html`'s notes — "Ben's
  framing: this ground→glide→POV→transit→handoff shape is the general scaffold for
  the whole journey concept going forward") means the audience is a PASSENGER inside
  the ship, not an outside observer watching our own ship fly around — v3's diner stop
  broke this by showing our ship as a third-person object flying in and landing.
  Clarified through follow-up: galaxy's calm star-warp hold and meteor shower's
  debris-rush-plus-camera-shake ALREADY sell "we're inside" correctly — via pure
  content and camera motion, zero UI chrome, zero visible external ship — that's the
  target model for the diner fix too ("the middle": no full cockpit-dashboard overlay
  like the liftoff file's struts/dash/vignette, but also no visible hull). Concrete
  fix for the diner stop specifically (galaxy/meteor/harvest are NOT part of this
  revision — Ben confirmed those already read right):
  - Remove `drawGasShip`/`drawGasShipBody`'s rendering entirely — no external ship
    silhouette ever flies across the frame.
  - The flight-in becomes a CAMERA move instead: the diner/island/planet grow larger
    as the camera itself pushes in and settles, same technique class as galaxy's
    `zoomPunch` and the meteor shake (canvas-level transform, not a drawn object).
  - Touchdown becomes a camera jolt (reuse the existing `shipThump` jolt mechanic,
    already wired to `canvas.style.transform`) — no engine-flare-on-a-hull, consider
    a screen-edge glow flash instead if a flare beat is still wanted.
  - Debris kicked up on landing stays — it's kicked up outside "our window," not by a
    visible ship, so it still makes sense with no hull present.
  - **Keep the takeout-drone beat — Ben's explicit call, "the drone is bringing us
    dinner!"** — reframe it as delivering TO the passengers/camera position, not to a
    parked external ship. Drone still launches from the diner's roof dock, approaches,
    delivers (the pink blip), returns — just arrives at "us" instead of at a hull.
  - Idle beat (currently an idling ship engine-glow) becomes an ambient hold once
    landed — some equivalent low-key life (e.g. a soft edge glow pulse) is fine, an
    idling ship engine specifically is not, since there's no ship to show it on.
- 2026-07-22 [Ben + Claude, live grilling session — using the `grilling` skill for
  the first time on this pipeline]: the gas-station/diner stop is a full redesign,
  not a tweak — Ben's words: "the space diner sucks... it doesn't pull anything into
  it that I want." Root direction, clarified through the grill: **it's a distant
  planet that happens to have a diner on it, not a "gas station" scene** — rename the
  concept accordingly everywhere except existing internal code identifiers
  (`GAS_HOLD`/`drawGasWorld`/etc. stay as legacy names, not worth a churn-risk rename
  mid-pipeline; the CONCEPT is diner, full stop). Concrete resolved direction,
  beginning to end:
  - **Composition:** a floating rock/island in space, the diner built on it —
    inspired by a Minecraft build Ben shared (small structure perched on a floating
    island, planet looming behind). Keep leaning into the dominant background planet
    already in the scene, don't compete with it.
  - **Ground effect:** debris kicked up on touchdown, not dust — this is space, not a
    dusty desert moon.
  - **Palette:** stays purple-dominant (extend the existing `ARC` palette), teal and
    pink as accent colors only — not a repaint, an accent shift.
  - **Camera/blocking:** the ship does NOT fly into/at the diner. It approaches,
    slows down on the way in (current flight-in reads too fast/abrupt), and parks
    BESIDE the diner. After it lands, the camera holds a static wide shot — we're
    looking back up at the ambient theme/planet backdrop with the ship parked next to
    the diner in frame, not pushing in close.
  - **Idle beat:** after landing, a small idle behavior (engine-glow idling) before the
    payoff beat — don't cut straight from thump to done.
  - **Payoff beat:** a small drone delivers a takeout order to the ship. Drone is
    simple and on-palette (no fussy detail), mounted/docked on the diner's roof
    (roof-mounted launch point, same roof that carries the sign — see below).
  - **Signage:** "DINER" sign is roof-mounted with visible support posts holding it up
    off the roofline — not flush-painted or floating.
  - **Interior:** minimal — glimpses of warm interior light through windows only, not
    a detailed interior scene. Keep it a silhouette/glow read, not content to render.
  - **Duration:** extend this stop toward ~13s (up from the current ~10,000ms budget)
    to fit the slowed flight-in + idle beat + drone delivery without feeling rushed —
    still within the pipeline's 8-14s per-journey range.
  This is a locked creative direction from a full grill session (not a vague vibe
  note) — the next build pass should implement this redesign of the diner stop
  specifically; the other three stops (galaxy, meteor shower, supernova) are NOT part
  of this revision and should not be touched.
- 2026-07-22 [Fable second-opinion, first real use of the new /audit step]: dispatched
  the one-Fable-pass against this file's evidence bundle (per the one-attempt-rule /
  second-opinion design). Fable read the screenshots itself and correctly flagged that
  the single `harNova`-labeled frame (captured ~103ms into the ~1100ms burst window, at
  the moment of phase-onset) showed pre-burst convergence, not the actual bright flash —
  a real gap: the sampler only guaranteed one frame at a phase's *first* moment, nothing
  guaranteeing coverage of a short phase's *peak*. Verified by reading that exact frame:
  Fable was right. Root-caused and fixed in `visual-audit.mjs` (added a dense-sampling
  window after every phase change, not just a single onset shot — see the script's own
  comment for detail) and re-verified: a fresh bundle now captures 3 frames inside the
  burst window, including one squarely at its peak (clear bright warm-white/gold flash,
  confirmed by direct inspection). This is the second-opinion step doing exactly its job
  — catching a real gap in the builder's own evidence, not redundant confirmation of
  what the builder already knew. No further revision needed on this beat; the finding
  was about the AUDIT TOOL's coverage, not the animation itself (which was already
  correct, per the 2026-07-22 [CORRECTION] entry below).
- 2026-07-22 [CORRECTION]: [Claude + Ben] The entry directly below this one ("finale
  never visually pays off") was WRONG — retracted, not deleted, so the mistake and why
  it happened stays on the record. Root cause: `visual-audit.mjs`'s first version
  scheduled screenshot N+1 by adding to a running "requested time so far" tally that
  never accounted for the real wall-clock cost of writing screenshot N to disk
  (~100-300ms each). Over 6 screenshots that drift compounded to 1s+ — enough to miss
  the supernova burst's entire ~1.1s window while still reporting a plausible-looking
  nominal timestamp ("38.7s") that was actually already past it. Caught by building a
  ground-truth probe that polls the file's own `#phaseLabel` DOM text instead of
  trusting elapsed-time math, confirmed the real burst window is 38.2s-39.3s, and
  captured it directly: the burst DOES fire, IS bright (a clear warm-white/gold radial
  flash, easily legible against the ember field), and settles correctly afterward.
  Nothing wrong with the animation. `visual-audit.mjs` is now fixed the same way (every
  wait computed from real `Date.now()` elapsed, never a running tally; every screenshot
  filename/log line includes real elapsed ms + the page's own phase label so a future
  drift bug is self-evident instead of silently producing a false report). Re-verified
  after the fix: the corrected script caught `phase: harNova` unassisted on a plain
  `--interval=700` run, no manual probing needed. Lesson for future visual-audit passes,
  general not file-specific: for any beat under ~2s, don't trust a single nominal-
  timestamp sample — use a narrow `--interval` relative to that beat's own duration, and
  cross-check the printed `real=`/label fields actually landed where you expected.
- 2026-07-20: [Claude, static audit] Missing `document.visibilitychange` handler —
  `tStart` only resets on replay, never when the tab is backgrounded and returns. If
  someone tabs away mid-animation, elapsed-time math will think far more time passed
  than actually rendered, likely causing the sequence to jump or skip ahead
  unpredictably on refocus. Add a visibilitychange listener that resets `tStart` the
  same way `play()`'s replay reset already does.
- 2026-07-20: [Claude, static audit] Missing the postMessage contract required by
  `references/round-journeys.md` and AGENT-PROMPT.md Step 4. This file has a working
  on-page Replay button but no `window.__journeyControls = { play, pause, replay }`,
  no `postmessage-child-boilerplate.js` embedded, and no `pause` capability at all
  (only play/restart exists). Embed the boilerplate verbatim; wire `play`/`pause`/
  `replay` to the existing `tick()` / `cancelAnimationFrame()` / `resetUI()` mechanism
  — `pause` needs a real implementation, not a no-op, since none currently exists.

Known open item, not yet resolved (Ben's call, do not silently pick a side): the file's
own notes flag that meteor shower's z-depth debris-field rework may be a "parallel
invention" rather than an extension of the real `MeteorShowerStreak` motif in
`ParticleBackground.jsx`, per `references/round-journeys.md`'s "extend, don't invent
parallel" rule. This is a creative/architecture judgment call, not a bug — do not
resolve it as part of tonight's revision pass; if it blocks you from completing the two
technical fixes above cleanly, log it and stop rather than guessing which way it should
go.

### greenhouse-gnome-rescue — Greenhouse Rescue
status: blocked
note: this was a supervised dry-run claim (2026-07-20) used to validate the nightly
  pipeline's infra end-to-end. The dry run was paused after the claim commit to fix two
  real infra bugs (a sandbox delete-permission gate, and a push-failure misclassification
  in guarded-commit-push.sh) and never resumed into Steps 3-6 — this was never actually
  built, not a crash. Left `blocked` rather than deleted so there's a durable record; a
  future run can pick this concept back up from scratch if it's still wanted, but should
  treat it as unstarted, not resume "building."
journeyType: same-theme
theme: greenhouse
source: agent-proposed+self-grilled
iteration: 1

Brief (beginning/middle/end):
A sunlit greenhouse shelf holds a row of tidy terracotta pots in warm afternoon light;
one vine, planted a little too close to the edge, is growing suspiciously fast.
Time-lapse-style, it bursts into a frantic growth spurt, spiraling wildly and knocking
its own pot toward the shelf's edge — it teeters, about to fall. A garden gnome
ornament sitting at the base of the shelf, until this instant pure static decor,
snaps to life for one single frame, reaches up, and catches the pot just before it
hits the ground — then freezes right back into its normal pose as if nothing moved,
vine now trimmed back to a tidy, contained shape. The turn: an object established as
decoration turns out to be secretly capable, saves the day in one beat, and the
reveal is withheld — we never see it move again.

Anti-repetition check (Step 1.6, self-noted): the 5 most recent prototypes
(space-road-trip-full-journey, meteor-shower-liftoff-pov-teampicker,
meteor-shower-windshield-journey, midnight-galaxy-spaceship-journey,
in-round-echo-spaceship) are all space/cosmic in setting, navy/icy-white in palette,
and awe-or-adventure in register. This piece differs on all three: greenhouse
setting (not space), warm terracotta/green/gold palette (`#C4622D` / `#2E5339` /
`#F6E8CC` / `#E9A73A`, not navy/cosmic), and a cozy-whimsical register (not
awe/wonder). Candidates killed: a deep-sea "looming shape resolves into an ordinary
fish" premise (killed — same danger-deflated-to-mundane arc as the meteor/bandaid
piece, just reskinned underwater); a mail-sorting-belt "package caught by a robotic
arm" premise (killed — same near-miss-catch story shape as the windshield piece's
beat structure, just reskinned industrial).

Self-grill against references/round-journeys.md checklist:
- Crowning moment: the gnome's single catch is the fastest, sharpest motion in the
  piece — everything else (vine growth, pot teeter) is comparatively gradual build
  toward that one snap, satisfying the "crowning moment" rule for the piece's one beat.
- Anticipation: the pot's teeter-hang is held briefly before the catch.
- Silhouette: gnome needs strong fill contrast against the wood shelf — flagged for
  Step 5's static audit.
- No pop-in: vine grows via path/scale animation, not instant appearance; gnome is
  on-screen the whole time, static, then moves — never appears/disappears.
- Follow-through: vine settles with a small overshoot after the catch; gnome's
  arm has a brief settle-wobble on the pot before fully still.
