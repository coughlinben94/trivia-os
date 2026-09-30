# HANDOFF — two open ring-world bugs, both real, neither live-blocking

**Date:** 2026-09-30. **Status:** both confirmed real, neither fixed, neither urgent (the 2026-09-29 show is over; both bugs are contained — one behind a disabled feature flag, one behind a feature that ships off by default). Written for a fresh session to pick up either or both.

## Mandatory reading, in order, before touching either bug

1. `references/ring-world-mistakes.md` — read first, in full. "Rule Zero": eight+ instruments have lied on this project. The two heuristics at the end (mean-shaped vs peak-shaped checks; write falsifiers not conclusions) apply directly to both bugs below.
2. `concepts/FAILURE-LEDGER.md` — full instrument-failure history, especially instruments 8/9/11 (animation-freeze timing bugs that made ad hoc brightness measurements lie). **Any brightness/luminance measurement MUST go through the real, trusted `runChecks` function, imported from `concepts/tools/ring-verify.mjs`, never forked or reimplemented.** This is the single most expensive lesson on this project — both bugs below were investigated under this exact discipline and any fix work must continue it.
3. `references/ring-world-continuity.md` — session hygiene rules, and section 4, **STAYS HUMAN**: choosing target metrics or thresholds, editing check/gate code (`ring-verify.mjs` pass/fail logic, `ring-spec.lock.json`), and aesthetic acceptance are explicitly not an agent's call. Both bugs below have a real chance of requiring exactly this kind of decision — see each section's own note.

## Where things stand in git

- `main` (`487e2b0` and later) has the color-evolution/arrangement-split feature merged (PR #3) and the auto-draw safety stopgap merged (PR #4, `AUTO_DRAW_ENABLED = false` in `client/src/lib/ringWorldFor.js`). Both are live on main, both ship inert (color evolution off by default; auto-draw disabled entirely).
- Two worktrees exist for the two bugs below, both uncommitted beyond a throwaway probe script:
  - `.claude/worktrees/ring-autodraw-placement-fix` (branch `worktree-ring-autodraw-placement-fix`) — Bug A.
  - `.claude/worktrees/ring-duo-same-color-fix` (branch `worktree-ring-duo-same-color-fix`) — Bug B.
- Both worktrees were last synced to main at commit `ba1b5c5`. Re-fetch/merge `origin/main` before starting — other sessions are actively committing to this repo.

---

## Bug A — auto-draw can put a bright object in the safe box (real, confirmed, disabled as stopgap)

**Where:** `client/src/lib/ringWorldFor.js` (`autoDrawWorld`, gated by `AUTO_DRAW_ENABLED = false`), `client/src/lib/ringDraw.js` (`drawStations`, `assertRing`), `client/src/worlds/ringPool.js`, `client/src/lib/ringEngine.js` (`buildArc`/`arcAt`/`loudnessOf` — see the hypothesis below).

### Confirmed, via the real gate

The per-show random station-order draw (live 2026-09-26 to 2026-09-29) can place a bright headline object where its glow reaches the question-text safe box. Reproduced through `runChecks` (not an ad hoc script): **4 of 6 real random draws FAILED the safe-box luminance cap** (check 15, `mean<=34, p99.5<=68`), one at **p99.5=111** — nearly double the cap. Repro method (works, reuse it):

```js
import { runChecks, startStaticServer } from './ring-verify.mjs'
import { autoDrawWorld } from '../../client/src/lib/ringWorldFor.js'
import { midnightGalaxyRing } from '../../client/src/worlds/midnightGalaxy.ring.js'
// draw: autoDrawWorld(midnightGalaxyRing, showId).stations.map(s => s.key)
// URL: `<base>/concepts/world-07-ring.html?stations=<comma-separated-keys>` (no colors param —
// an uncolored draw keeps each station's own authored hue)
// run through runChecks for both html and react-live builds, read check 15's per-station p99.5
```

A working, reusable version of this exists at `concepts/tools/_autodraw_probe_tmp.mjs` in the `ring-autodraw-placement-fix` worktree (untracked, throwaway — supports `authored`, `show:<id>`, and `order:<k1|k2|...>` specs for targeted A/B testing of specific station arrangements). Rename/commit it properly if it proves durably useful, or delete it once superseded by a real test.

### Root cause — NOT yet empirically confirmed, two hypotheses, neither fully tested

**H1 (original framing):** the hand-authored order was tuned so bright headline objects (planets, pulsars, comets) never sit where their glow reaches the safe box. `drawStations`'s current constraints (radial-mass lane caps, `eclipse` pin at station 10, family-adjacency spacing via `assertRing`) have no equivalent "stay away from the safe box" rule. A random shuffle can put a bright object exactly where the authored order never would.

**H2 (found reading `ringEngine.js`, not yet tested):** `arcAt(engine, world, i)` computes a per-POSITION "loudness" value from a cosine curve over `i` and `world.phase` (plus a small seeded jitter keyed only by `i`) — **independent of which object occupies that position.** `loudnessOf()` reads this to scale how prominently an object at that position renders (`fillOf`, "realised arc" throughout `FAILURE-LEDGER.md`). This raises a real, distinct hypothesis: the violation may depend on whether a bright object lands on a structurally LOUD ring position (by the cosine/jitter curve), not on "near center" specifically — these likely correlate in the authored order (which is why H1 and H2 haven't been distinguished yet) but are not necessarily the same thing.

**How to actually distinguish them (not yet done):** hold one known-over-cap object fixed, move it between a measured-loud position and a measured-quiet position (per `arcAt`'s own formula, computable directly without rendering anything), and read the real per-station p99.5 via `runChecks` for both placements. If p99.5 tracks loudness regardless of "center-ness," that's H2. If it tracks proximity to whatever's currently centered/safe-box-adjacent regardless of the cosine loudness value, that's H1. It could also be both contributing.

### What to do

1. Complete the root-cause split above — real measurements, not reasoning from the code.
2. Design a placement constraint for `drawStations` (or wherever Phase 1 points) that prevents the violation while preserving real per-show variety (the whole point of this feature). **If this requires inventing a new threshold or classification** (e.g. "which stations count as bright enough to need spacing," "what loudness value is too loud for a bright object," "how far apart is far enough") — that's a STAYS-HUMAN call. Write the reasoning and a specific, evidence-backed recommendation; don't decide and ship a number unilaterally. A concrete implemented prototype embodying the recommendation is fine and useful — just flag exactly which values are proposal vs. established fact.
3. Implement, flip `AUTO_DRAW_ENABLED = true` locally to test, run a real batch (20-30+ different showIds) through the real gate, report the full pass/fail breakdown — not a sample.
4. Add real unit tests for the new constraint logic (`ringDraw.js`'s test file).
5. Leave `AUTO_DRAW_ENABLED = false` in the shipped commit — turning it back on for real shows is Ben's call, after he's reviewed the fix.
6. Full suite + build clean. Commit in the worktree; don't push/merge without review.

### Note on background-agent reliability

Three dispatch attempts at this exact task hit either a tooling collision (the controller moved to a different worktree while a subagent's Bash was in flight — subagent Bash appears to route through whatever directory the CONTROLLING session currently sits in, not something pinned independently at dispatch time; fix is: physically enter the target worktree yourself before dispatching, and don't leave it until that agent finishes) or an unexplained stall (two `SubagentHandback` timeouts in a row on the same task, no clear cause, possibly just Playwright-heavy long-running work tripping a stream watchdog). Per this project's own working-style rule, stop delegating this specific task to a background agent after a 2nd failure and do it directly in-session instead.

---

## Bug B — 11-of-17 duos have a same-color station merge (real bug, confirmed via math + prior visual check, not yet root-caused with certainty or fixed)

**Where:** `client/src/lib/weightedPalette.js`, specifically `derivePalette()`'s ladder-offset pick logic (lines ~333-363 as of `ba1b5c5`).

### What's confirmed

- This is a DIFFERENT bug from the cross-color hue-collapse bug fixed 2026-09-28 (`safeDriftPlans`, commit `2aa1f47`, merged). That fix guarantees the two DIFFERENT palette colors in a duo stay >=20° apart at the ANCHOR level. It does not touch same-color separation at all.
- A prior session's real visual pass (Playwright, `/ambient?evolving=1`) found two SAME-color neighboring stations rendering nearly identical under color evolution — worst measured cases `electric_bloom` and `neon_garden` at literally 0° apart, and confirmed byte-identical both before and after the 2026-09-28 cross-color fix (expected — that fix never touched this mechanism).
- **The "11 of 17" figure is NOT independently re-verified this session and should not be trusted as exact** — it traces back to a since-deleted subagent report, relayed secondhand, never confirmed against a fresh measurement. Re-derive it for real before using it in any commit message or report.
- No original design spec documents this issue anywhere findable (`docs/superpowers/specs/2026-09-24-ring-world-night-color-evolution-design.md` has no mention of "shading," "cancel," or same-color adjacency) — it was discovered empirically during this session's build, not a known/scoped item from the original design.

### Root cause — strong lead, found via code reading, NOT yet numerically verified

`derivePalette()`'s ladder-offset assignment (`weightedPalette.js`):

```js
const pick = drift.arc > 0 ? j : (j % 2 === 0 ? Math.floor(j / 2) : k - 1 - Math.floor(j / 2))
const h = anchors[c].deg + rot(c, i) + ladders[c][pick]
```

The comment above this line: *"Outside-in at drift 0 (unchanged behaviour); ring order under drift, so the ladder and the drift bump move the SAME way (Fable's Phase 2.5 'why step 2/adjacent-rung' finding — outside-in fights drift)."*

**The mechanism:** when a color owns multiple stations (which is structurally forced for the heavier-weighted color in every 2-color duo — `allocate()`'s Hamilton apportionment gives the heavier color >=7 of 13 stations for any duo in this project's actual weight range, and `minCostRingAssignment`'s DP guarantees at least `max(0, 2c-n)` of them are RING-ADJACENT to each other), the ladder-offset "pick" that's supposed to keep ring-consecutive same-color stations visually distinct (`hueLadder`'s outside-in alternation, explicitly documented as existing for exactly this purpose: *"Two neighbours forced to share a colour at least read as two distinct shades of it rather than as one 2-station-wide smear"*) is **unconditionally disabled whenever `drift.arc > 0`** — which is every single one of the 17 curated duos (`duoGraph.js`'s `DUO_PALETTES`, all 17 entries have `drift.arc` between 31 and 85, none at 0).

Under drift, `pick = j` (sequential order) instead of outside-in. For two ring-adjacent same-color stations with sequential ladder picks, their final hue is `anchor + rot(c, i) + ladder[j]` — the ladder-step difference between consecutive picks and the `rot()` drift-bump difference between their two positions `i` can, for certain anchor/arc/position combinations, cancel out near-exactly, producing the observed ~0° gaps. This is consistent with everything measured so far but **has not been directly verified with a same-color-specific measurement script** (the existing verification work this session only checked cross-color anchor separation, via `safeDriftPlans`'s own tests — nobody has yet written the equivalent same-color ring-adjacent check).

### What to do

1. **Write the missing verification first.** For each of the 17 duos, using the real `derivePalette()` output (not a reimplementation), find every pair of RING-ADJACENT stations assigned the same source color, compute their real final hue gap, and get an honest count/severity table — this replaces the untrusted "11 of 17" figure with a real one. Expected: this should reproduce `electric_bloom`/`neon_garden` at ~0° if the hypothesis above is right; if it doesn't, the hypothesis is wrong and needs revisiting (per systematic-debugging: state a falsifiable prediction, then test it).
2. **Design a fix**, most likely one of:
   - Extend `safeDriftPlans`'s existing "shrink until it's safe" technique to also cover same-color ring-adjacent separation (it currently only checks cross-color pairs) — would need to search over ladder pick ORDERINGS (a discrete choice, not a continuous scale factor like the existing fix), or
   - Make the ladder pick choose whichever ordering (among a small number of candidates — outside-in, sequential, or others) maximizes minimum same-color ring-adjacent separation given the actual computed `rot()` values for that duo's real station positions, instead of a fixed rule keyed only on `drift.arc > 0`.
   - Read Fable's original Phase 2.5 reasoning for why outside-in was abandoned under drift (referenced in the comment above, not yet located in this session — check `docs/superpowers/` and `concepts/` for anything dated around when duo drift was first built) before assuming a full reversion to outside-in is safe; there may be a real reason it doesn't work that a naive fix would reintroduce.
3. **If this requires a new threshold or classification** (e.g. "how many degrees apart is enough for a same color," similar to the existing `MIN_SEPARATION = 20` constant for cross-color) — same STAYS-HUMAN note as Bug A: propose with evidence, don't decide unilaterally.
4. Verify via real rendering (Playwright, `/ambient?evolving=1&showId=...`, stepping through slides) after any math fix — a numeric fix to `derivePalette()`'s output doesn't by itself prove the RENDERED result looks right; this project has been burned before by trusting math over a real look.
5. Add unit tests to `weightedPalette.test.js` covering same-color adjacency the same way the existing `it.each` block covers cross-color.
6. Full suite + build clean.

### Why this matters, and why it doesn't right now

Color evolution ships OFF by default (`theme.colorEvolution`, unset on every real show) and now ALSO cannot combine with a drawn arrangement (forced to the fixed authored order, per the final-review fix in the same PR). This bug is real but has zero live impact today. **Do not turn color evolution on for a real show until this is fixed and re-verified** — that's the standing instruction from the session that found it, not a new constraint being added here.
