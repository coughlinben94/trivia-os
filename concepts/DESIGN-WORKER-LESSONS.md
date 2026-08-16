# Design Worker — Lessons

Read this file in full before starting any visual/ambient/design task in Trivia OS. Update it
after every real failure or fix — not every task, only when something actually went wrong or a
genuinely new pattern got confirmed. Same cap discipline as `concepts/LESSONS.md`: at most 10
active directives below "Established Conventions." When a normal run would push past 10, fold
the oldest into a one-line addition to Established Conventions and drop the verbatim original.

This file is scoped to the design worker only (ambient themes, round-journey visuals, hand-coded
shapes, Recraft assets). It does not replace `concepts/LESSONS.md` (the nightly round-journey
storybook pipeline's own feedback loop) — that one stays as-is.

**2026-07-26 status change, per external audit:** this file is now config and human-readable
history, not enforcement. The mechanical layer — `.claude/hooks/geometry-lint.mjs`,
`.claude/hooks/design-done-gate.mjs`, the `trivia-os-design-critic` agent, and
`concepts/.design-attempt-counts.json` (all write-denied to the design-worker agent at the
permissions level) — is what actually enforces anything now. This file's own Active Directives
section previously contained an arithmetic error about the exact incident it was written to
prevent (see the corrected entry below) — a live demonstration of why prose self-review wasn't
sufficient on its own.

## What has worked (confirmed-good, keep doing this)

Short list on purpose — most attempts in this project's history have failed or partially failed.
Don't read the shortness as "nothing works"; read it as "these are the few load-bearing patterns,
lean on them before trying anything new."

- **Recraft-generated art for anything figurative/contour-identifiable, isolation-validated before
  it touches a scene.** Firefly Summer's oak: 3 hand-coded attempts failed, 1 Recraft pass fixed
  it outright. Pond water: hand-coded fill failed 6 non-converging ways, 1 generated raster
  texture (plus a dark scrim) was the only version that stopped reading as "a wall/court/pool."
- **A single soft glow blob as an abstract fire/light stand-in** (autumn-harvest theme) — this
  project's one other real fire, confirmed good, never re-litigated. The lesson taken from it for
  Campfire Sing-Along was narrower: keep this abstract-glow approach, don't upgrade to a literal
  animated flame silhouette (that's the swing's failure category, not this one's).
  Note this is one theme's element, not the flame's own full solution — Campfire's flame is still
  mid-fix as of 2026-07-26; see Active Directives.
- **Asymmetric pairs beat matched pairs.** Firefly Summer's two pond-deck lanterns (different
  height/size/sway amplitude/period) passed Fable checkpoint B outright — the first checkpoint in
  either build to pass without surfacing a real defect. A prior matched/mirrored version would
  have repeated the "dead-center/mirror composition" mistake this project explicitly flags.
  Full-width rail + baluster occlusion did the same job for "selling the vantage" that the earlier
  under-scoped single-corner rail stub couldn't.
- **Rotation-angle-over-time sampling for anything that's supposed to swing/sway subtly.** The
  only assertion technique in this project's history proven to catch a real invisible-motion bug
  (the meadow swing's near-motionless sway went undetected across 27/27 position-only PASSes for
  many rounds; the same swing, once resampled by rotation angle, immediately showed the gap).
- **A ground-anchored light-pool that lags the light source instead of strobing in sync with it**
  (Campfire's ember-lit ground glow, per an Opus review that found a single strobing blob wasn't
  convincing on its own).
- **Reclassifying a stuck figurative element as ICONIC once it turns out to be specifiable in one
  sentence of pure geometry** (Campfire's camp chairs, 2026-07-27 fix-round). Three figurative
  hand-built attempts at the reference's realistic bent-wood sling-chair pose — including a tight
  roto-trace off the reference itself — all converged on the same failure: a rounded pod/mushroom
  on thin legs, because a smooth continuous backrest curve was the shared mechanism each time.
  Rather than a fourth figurative attempt (already past the two-strike cap) or shipping generated
  art (banned by the reference-first addendum), the fix was to re-examine the classification
  itself: a flat back panel + flat seat panel meeting at a right-angle corner, plus two straight
  legs, is fully specifiable in one sentence of pure geometry — iconic, not figurative, per the
  noun test's own definition — and hand-codes with no escalation ladder at all. Fixed on the first
  attempt under the new classification. Takeaway: when a hand-coded figurative element keeps
  failing in the same way (here, "reads as round/organic" every time), check whether it was
  mis-classified as figurative in the first place before trying a tighter trace — the noun test
  cuts both ways, and re-classifying can dissolve a stuck multi-round failure instead of forcing
  another lap of the same ladder.

## What has failed (confirmed-bad, do not retry as-is)

- **Hand-typed rope/cord that stays thick, wood-toned, and visible its whole run.** Reads as a
  rigid post/crane boom, not slack cord — failed across all 7 Fable-verified rounds of the meadow
  swing. A written rule requiring "vertical, parallel, visible whole run" forecloses the sag/taper
  that would have sold rope; don't write that rule again for a cord/rope element.
- **Hand-coded flat rectangular/trapezoid water fill for a pond/lake/ocean surface.** Failed 4
  distinct, non-converging ways (wall → sports court/pool with "lane line" streaks → still
  pool/ice-rink-reading blob reflections → correctly-graduated blur that still didn't register as
  intentional). Start any future water surface with generated raster texture, not a hand-coded
  fill.
- **A single blur value applied uniformly across an entire scene ("blur floor" applied too
  literally).** Firefly Summer's pond attempt 3 used uniform 1.5px blur everywhere and it read as
  "the whole frame is out of focus," not a deliberate depth style — the floor is a *minimum*, not
  a target; foreground/background still need to graduate (attempt 4 tried ~1.6-2.4px foreground /
  ~3.4-4.5px background, which fixed the "out of focus" complaint even though the underlying pond
  shape complaint was separate and unresolved).
- **`box-shadow` as a stand-in for a soft radial glow on a non-rounded element.** Renders a
  blurred rectangle, not a glow — see the box-shadow convention below. Confirmed as (at minimum) a
  contributing cause of Campfire's flame reading as "a lit rectangle."
- **Radial-gradient ellipse radii sized without checking `center ± radius` against the box's own
  edges.** Same Campfire flame bug, independent of the box-shadow issue above — the gradient
  stops themselves never reached transparent before the box's edges cut them off on 2 of 3 layers,
  worst on the brightest/most-visible one.
- **A radial-gradient scrim sized without checking its radius against the *target shape's own
  extent* — the inverse of the overrun bug above.** Campfire's `#reflectionScrim` (dimming the
  fire-reflection streak where it crosses the question safe-area) fit cleanly inside its own box
  (geometry-lint gave it a real margin) but its radius was far smaller than the reflection's actual
  bbox: `ry` resolved to only ~4.2% of stage height against a reflection that was ~6.6% tall, so the
  gradient's dark color decayed to near-transparent well before covering the shape, and its bottom
  ~1.4% sat entirely past the 100% stop. Direct pixel-sampling of the rendered PNG (not a re-read of
  the CSS) confirmed it: the brightest reflection pixel inside the protected zone was 238,184,134 —
  a ~4-point luminance difference out of 255 from the raw undimmed fill (249,178,110), i.e. no
  visible dimming, matching two independent design-critic FAILs that found the same thing by eye.
  Checking a gradient's margin against its own box is necessary but not sufficient — also check its
  radius against the real half-extents of whatever it's supposed to cover, from the shape's own
  measured bbox, not an eyeballed guess.

## Established Conventions

- **Radial-gradient-in-a-box must be checked with real math, not eyeballed.** A `radial-gradient`
  ellipse's percentage radii are relative to the element's own box width/height. If
  `center ± radius` (computed per axis) falls outside the box on any side the design needs to
  taper (usually top/left/right; bottom is often fine to leave open if it's the object's anchor
  point), that side never reaches `transparent` before the box edge cuts it off — the box's own
  rectangular boundary becomes visible as a hard edge. This reads as "a lit rectangle," not the
  intended shape. Compute `center_x ± (radius_x% * width)` and `center_y ± (radius_y% * height)`
  explicitly for every stop before shipping; leave real margin (aim for 5-15%), don't rely on the
  gradient stop reaching exactly 100%.
- **`box-shadow` on a plain (non-rounded) div follows that div's rectangular shape.** A soft glow
  effect built as `box-shadow: 0 0 <blur> <spread> <color>` on an element with no `border-radius`
  renders a blurred rectangle, not a blurred glow. If the intent is an ambient soft-glow halo, use
  a separate radial-gradient layer (own box, own margin math above) or set `border-radius: 50%`
  on that specific element first.
- **Hand-typed figurative shapes (rope, swing, treeline, literal flame silhouette) are the highest
  failure-rate category in this project.** Firefly Summer's swing passed 27/27 locked numeric
  checks and still read as a crane boom after 7 rounds; two Recraft-generated replacements (oak,
  pond water) each fixed on the first or near-first pass what hand-coding couldn't converge on in
  3-6 rounds. Classify every element with the noun test (`concepts/OBJECT-RENDERING-PROTOCOL.md`)
  before writing a line of code. Anything a guest would identify by contour or joints escalates to
  generated + isolation-validated art. Only truly one-sentence-of-geometry shapes (disc, beam, flat
  gradient plane, glowing dot) get hand-coded.
- **Blur-floor rule: every element in a bespoke ambient scene needs ≥1.5px blur, no exceptions.**
  A rendering-technique mismatch (one sharp-vector element next to everything-else-soft) reads as
  visibly wrong even when the shape itself is correct — this is a separate failure mode from a bad
  shape, and needs its own explicit check.
- **A position-only assertion cannot verify motion that's supposed to be subtle.** Small-angle
  swings/sways can move a bounding box only 1-2% of stage width — inside typical position
  tolerance — and pass numerically while being visually motionless. Any assertion covering
  rotation/sway must sample the actual transform (e.g. `getComputedStyle(...).transform` converted
  to an angle) over multiple real-time points across a full period, not just position.
- **Verification-before-completion is not optional for visual work, ever.** "Code parses, timing
  hits spec, safe-area math clears" is not the same claim as "I rendered this and looked at it."
  Do not report a visual task done without an actual render + look step (Chrome MCP screenshot,
  or a real headless capture) in the same turn.
- **A safe-area/zone check should scan the zone's actual rendered pixels, not just re-verify the
  one named element.** `assert-safe-zone-luminance.mjs` (Campfire, round 3) caught a bright static
  sand-path corner, several twinkling stars, and the shooting star's tail — none of which were the
  element it was built to re-check — simply because it scans every pixel in the zone instead of
  asserting per-element opacity values. A raw-pixel scan is a strict superset of a hand-picked
  per-element check; prefer it whenever the failure mode is "something in this region is too
  bright," not "this one shape's opacity is wrong."
- **An eased (non-`linear`) CSS animation's `animation-timing-function` re-applies fresh to EACH
  keyframe-to-keyframe segment independently, not once across the whole timeline.** If one
  property (e.g. `transform`) is keyed at only 0%/100% while another (e.g. `opacity`) gains extra
  keyframes in between, they no longer share one "current progress" value once a non-linear easing
  is in play — computing "which keyframe% this animation reaches a given rendered position" from
  one property and using it to predict another property's value at that instant will be wrong, and
  wrong in a way invisible from reading the CSS source (three successive, arithmetically-correct
  opacity-clamp attempts on Campfire's embers all failed at real render time for exactly this
  reason). `linear` timing is exempt (a linear map is invariant to per-segment vs. global
  application). When a rendered position must be guaranteed safe regardless of an eased
  animation's internal timing, occlude by the FINAL RENDERED POSITION (e.g. a `mask-image` keyed
  to real stage coordinates) instead of trying to predict the right keyframe percentage.

## Active Directives

- 2026-07-26 (corrected 2026-07-26, same day — see status note at top of file): Campfire
  Sing-Along's flame rendered as "a lit rectangle" on first ship. Root cause, confirmed by
  `.claude/hooks/geometry-lint.mjs` run against the actual code (not eyeballed): of the three
  flame `GlowLayer` radial gradients, the two brightest layers (`ellipse 70% 85% at 50% 78%` and
  `ellipse 58% 72% at 50% 82%`) genuinely overran the flame wrapper's left/right edges (and, for
  the brightest layer, the top edge too) before reaching `transparent` — real overruns, up to
  30 percentage points on the worst one. **The third, dimmest layer (`ellipse 46% 60% at 50%
  86%`) does NOT overrun** — its horizontal margin is a real but thin ~4%, a near-miss the linter
  now grades WARN rather than FAIL. That layer's actual, confirmed defect is independent: it
  carried a `box-shadow: 0 0 5vw 1.5vw ...` on a plain rectangular div with no `border-radius`
  (see the box-shadow convention above) — a blurred-rectangle-not-a-glow bug, caught by the
  linter's second check, not the gradient-margin one. The original version of this entry claimed
  "all three gradients overran by 4-20%," which was wrong for this layer; an external audit
  caught the error by hand-checking the math, and `geometry-lint.mjs` now confirms the audit's
  correction mechanically. Fix applied same session: recomputed the two overrunning gradients'
  radii/centers with real margin, removed the box-shadow in favor of a separate wide/blurred
  ambient bloom layer, and added `filter: blur()` as a mechanical safety net. **Not yet
  re-verified by an actual render + look, and not yet re-checked against the fixed
  `geometry-lint.mjs`** — do not report this fixed until both happen. If a fresh visual check
  still fails on this same hand-coded flame approach, that is strike two on this element — now
  tracked mechanically in `concepts/.design-attempt-counts.json`, not just by memory.

- 2026-07-27: **Flame directive above, closed out.** `trivia-os-design-critic` ran 3/3 PASS on the
  flame (per the dispatching session, which runs the critic manually since the automated done-gate
  hook doesn't reliably fire for background Agent-tool dispatches). No action needed — the fix that
  got it there (real margin math per gradient, no `box-shadow`, `filter: blur()` as a mechanical
  floor) is already captured in Established Conventions above.

- 2026-07-27: **Reflection-dimming scrim, round 2 (radial-gradient refit) — superseded, see round
  3 below.** The radial refit (box `18%,63%,66%,17%`; `ellipse 40.9% 27.6% at 50.3% 44.9%`) fixed
  the *radius-too-small* bug but two independent critic passes still failed it: dimming was
  inconsistent ACROSS THE WIDTH of the streak (bright at some x, dim at others) — a radial
  gradient decays from one center point in every direction and cannot hold a flat level across a
  wide horizontal band, no matter how its radius/stops are tuned. Mechanism-level bug, not a
  tuning bug. Superseded by the round-3 entry below.

- 2026-07-27 (round 3): **`#reflectionScrim` switched from radial- to linear-gradient (vertical
  only) — mechanism fix, not another tuning pass.** `linear-gradient(to bottom, ...)` has no
  x-term, so "brighter at some x than others" becomes structurally impossible rather than merely
  improved. Also caught, same round, by building `concepts/tools/assert-safe-zone-luminance.mjs`
  (a raw-pixel scan of the safe-area, independent of which element causes a bright pixel) —
  confirms the "verification must render+look, and must check the ZONE not just the named fix"
  convention earns its keep: the tool caught THREE things nobody had named going in — (1) the
  static sand path's own traced fill poking into the zone's bottom-left corner (a documented,
  never-pixel-verified claim in this file's own notes block that "sand is dark/low-contrast
  atmosphere" was flatly wrong — sand's fill is one of the brighter tones in the scene); (2)
  several twinkling background stars sitting inside or near enough to the zone that their
  box-shadow glow crosses the boundary at too-bright a level, including two independently-dim
  stars whose halos still stacked over threshold when both twinkled near-peak at once; (3) the
  shooting star's own tail-end (its visible window spans y13-36%, and the y28-72% floor cuts
  through the middle of that) at a brightness this session had earlier *eyeballed* as "probably
  fine, already fading" without measuring — wrong, by about +29 luminance over the chosen
  threshold. All three got the same tool-driven fix-and-reverify loop as the named elements.
  Also surfaced a genuine renderer quirk worth flagging for future work: embers' `ease-out`
  timing function is applied FRESH to each keyframe-to-keyframe segment independently (per the
  CSS Animations spec), not once across the whole 0-100% timeline — so once opacity gained extra
  keyframes beyond transform's original two (0%/100%), assuming a shared "current progress"
  value for both properties became false, and three successive opacity-clamp attempts (each
  correct arithmetic on paper) kept failing at real render time for a reason invisible from the
  CSS source alone. Fixed by occluding embers with a `mask-image` keyed to final rendered
  stage-y instead of trying to predict which keyframe% an eased timeline reaches a given
  position — mechanism-independent of easing entirely. (The shooting star's own `linear` timing
  was NOT affected by this — linear is invariant to per-segment vs. global application, so its
  keyframe-percentage math stayed reliable.) See Established Conventions below for the
  generalized versions of both new findings.

- 2026-08-09: **This entry's mechanism finding (rounds 2-3 above) is now the canonical rule, not
  scoped to this one scrim.** `ART-DIRECTION-SPEC.md`'s ring-world scrim rule independently
  shipped the SAME defect in the other geometric form: not a band this time, but an ellipse sized
  off a box far wider than tall, clipped at the box edge before its own falloff completed — same
  abrupt discontinuity, confirmed by rendering it. The two rules (that file's old "elliptical,
  never a band" and this file's "switch to linear") were both narrower phrasings of one fact:
  **the scrim's alpha must reach exactly zero strictly inside its own element bounds, on every
  axis.** That single rule now lives at `ART-DIRECTION-SPEC.md`'s scrim entry (§2) and is the
  citable one going forward; this entry stays as the mechanism proof and incident history, not a
  live rule in its own right.

- 2026-07-27 (round 4): **Flame reopened — the 2026-07-27 "closed out, 3/3 PASS" entry above did
  not hold.** A later independent critic pass (3 samples) came back 2/3 FAIL on the same
  hand-drawn flame, all three converging on one root defect: two near-mirrored outer paths plus
  one scaled-down mid path, each a single flat fill, read as symmetric "cauliflower/dough-ball"
  scallops with only the topmost lobe actually tapering to a point, and no hot-core-to-edge color
  transition. Geometry-lint and the safe-zone luminance check had both been PASSing the whole
  time — neither one checks path-level symmetry or per-lobe taper, so a clean mechanical run
  co-existed with a real form failure the whole prior round; a numeric gate is not a substitute
  for looking at the actual silhouette. Fix: rebuilt as one crown per layer (outer/mid/core), each
  layer's tongues independently drawn with distinct height/lean/flank-width so none are scaled or
  mirrored copies of another, plus a real per-layer vertical `linearGradient` (cool red-orange at
  the tips, hot yellow-white near the base) replacing the flat single-color fills. Re-rendered and
  zoomed at two different flicker-animation phases — silhouette held asymmetric with every visible
  tip tapering to a real point at both. Not yet re-scored by an independent critic pass at the time
  of this entry — this is strike 2 on this element if the fresh independent read fails again; a
  third hand-coded attempt would be a protocol violation, escalating to a tighter roto-trace off
  the locked Recraft reference instead of another free-form redesign.

- 2026-07-27 (round 5): **Strike 2 confirmed** — 2/3 FAIL again, this time localized: both FAIL
  votes independently named the same specific spot, a tight row of 3 near-identical small
  triangular teeth on the outer path's right shoulder (x145-172 in the 200x300 viewBox), reading
  as "a repeated decorative zigzag/sawtooth" rather than organic flame licks. Per the escalation
  rule this went to a tighter reference-trace, not a third free-form redesign: zoomed into the
  actual Recraft reference's own right shoulder (existing session crops, `flame_right_big.png`)
  and found it has only ONE clearly rounded medium lick there (wide control-point spread, not a
  sharp triangle) followed by ONE distinctly smaller, lower, unevenly-spaced flatter bump before
  the taper to the base — not a repeating row at all. Rebuilt that segment to match: two bumps at
  clearly different heights (168 vs 192, a 24-unit gap) and uneven x-spacing (15/12/8 units, not a
  fixed interval), with rounder curve-handle spread instead of tight sawtooth control points. Left
  crown, mid layer, core layer, and the hot-core-to-cool-edge gradient were untouched (neither
  critic flagged them). **Confirmed pattern for the record, not yet re-verified by an independent
  critic pass — do not read this as closed:** when a small-lobe region of a hand-traced figurative
  silhouette reads as a "repeated/uniform tooth pattern," check whether the reference itself has
  that many bumps at all before adding variety to existing bumps — here the reference had *fewer*
  bumps (2, not 3) at more clearly differentiated heights, not the same 3 bumps with more jitter
  added. A tighter trace can mean *simplifying* the shape count, not just varying the shapes
  already there.

- 2026-07-27 (round 6): **Third consecutive independent FAIL on the same right-shoulder region —
  fix was removal, not another reshape, per Ben's explicit instruction.** The round-5 two-bump
  retrace still read as "a repeated small-bump pattern" / "3-4 small evenly-sized teeth stepping
  down" on a fresh critic pass — three strikes total on this exact spot, each a different bump
  count (uniform lobes → 3 teeth → 2 teeth) but the same underlying failure mode: any small
  secondary shape placed in that zone reads as a decorative repeat, regardless of how carefully its
  count/height/spacing is varied. Ben's call: stop trying to reshape small lobes in that region,
  remove them entirely. Fix: the outer path's secondary peak (128,90) now tapers in one continuous
  curve straight down into the log-base flare — no local peak or notch anywhere in x128-180. Left
  shoulder, central spire, mid/core layers, and gradient untouched (never flagged). geometry-lint
  0 FAIL/0 WARN, `assert-safe-zone-luminance.mjs` 51/51 PASS, rendered and zoomed at two animation
  phases by eye — no repeated bump visible either time. **Not yet independently critic-verified —
  Ben is running that pass manually; do not read this as closed until that verdict lands.**
  Takeaway for future stuck-region fixes: when the same coordinate range fails 3 times running with
  the fix varying only the *shape* of the small elements inside it (not their presence), the next
  move is testing whether the region needs any small shape there at all — a null/removal hypothesis
  — before trying a 4th version of "the right small shape."

- 2026-07-27 (round 7): **Round 6's fix was the right silhouette but introduced a real bezier
  tangent-continuity break, not another shape/symmetry defect — a genuinely new failure category
  for this element.** 2/3 fresh critic reads described the same right-shoulder spot as "a hard
  right-angle stair-step notch," "a ledge then a vertical drop," and "a construction seam/glitch,"
  language distinct from every prior round's "repeated bump/tooth" complaints. Root cause, found
  by reading the actual path data and computing tangent directions (not by eyeballing): at the
  shared anchor (168,275) where the shoulder curve (`...160,250 168,275`) meets the base-flare
  curve (`168,275 140,295...`), the incoming tangent (anchor minus its control point) pointed
  ~72° and the outgoing tangent (its control point minus anchor) pointed ~144° — a 72° direction
  reversal at one point, which reads as a corner regardless of how clean the silhouette is on
  either side of it. Fixed by moving only the two control points immediately flanking that one
  anchor (160,250→176,250 and 140,295→160,299) so both tangent vectors land within ~1° of each
  other, then confirming the adjacent segments stay monotonic (no new bulge introduced) by solving
  for each segment's x-extrema before re-rendering. geometry-lint 0 FAIL, `assert-safe-zone-
  luminance.mjs` 51/51 PASS, rendered/zoomed at two flicker phases — edge traces as one continuous
  curve both times. Takeaway: when a critic's language shifts from "repeated/bumpy" to "notch/
  ledge/right-angle/seam" on the *same* coordinate range across rounds, that's a signal to check
  bezier tangent continuity at the segment boundary directly (compare the vector from each
  anchor's incoming control point to the anchor against the vector from the anchor to its outgoing
  control point) rather than reshaping the silhouette again — the defect can be purely mechanical
  even when the overall curve looks fine zoomed out.
