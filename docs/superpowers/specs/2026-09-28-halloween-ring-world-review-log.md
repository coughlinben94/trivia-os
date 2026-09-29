# Plan Review Log: Halloween ring world spec
Started 2026-09-28. MAX_ROUNDS=5. Reviewer: Codex gpt-6-sol (read-only). Plan file: 2026-09-28-halloween-ring-world-design.md

## Round 1 — Codex
VERDICT: REVISE. 11 findings: (1) music slot off by one (zero-based 10 = table #11, the house); (2) registry is routing only, draw pool/pin still space; (3) "lower arc" has no vertical meaning, slots come from midnightGalaxy.slots.js; (4) station list broke family rules (3 block, adjacent #11/#12, crescent beside #1 across wrap); (5) bare tree/steeple mislabeled iconic, wisp glow can't be headline, protocol says trace-escalate not swap; (6) sky is 4-stop ramp + 3 space-named SKY_REGIONS, does not "read regions from world"; (7) RingAmbient always builds stars/drifter/shooting-star lane; (8) file inventory errors (StageFrame path, midnightGalaxy.ring.js), both pickers filter to Midnight Galaxy; (9) ring-verify live pass + AmbientAudit hardcode space world; (10) gates: unmeasured venue distance, 8/12 vs 13, zero-diff needs frozen baseline; (11) Phase 1 over-generalizes.

### Claude's response (r1)
Accepted all 11. Changes: zero-based index table, moon at 10; auto-draw off + fixed order + per-world pool/pin; own slot file, arcAt not used for height; table rebuilt with cyclic spacing checked (block {3,8}, scatter {0,5}, radial {1,4,7,10}); steeple moved to horizon band; tree/gravestone marked figurative-lite with noun test; failure path = tighter trace then ask Ben (council swap rule dropped); Halloween sky-region model separate; per-world ambient layers; corrected inventory + pickers + AmbientAudit/ring-verify parameterized; venue distance measured, 9/13 distinct outlines, frozen baseline phase 0; Phase 1 narrowed to needed seams with a reason logged for every space-only file left alone. Rejected: nothing.

## Round 2 — Codex
VERDICT: REVISE. 4 gaps: (1) live theme switching shows old world (ParticleBackground freezes ringWorldFor at mount, RingAmbient builds DOM once); (2) world.musicStation needs non-ring fallback (grading breaks run on every theme); (3) ring-verify needs 150-260 stars and searches only ringPrimitives.js, so world id alone can't make a valid gate; (4) horizon band bypasses noun test.

### Claude's response (r2)
Accepted all 4. Added §4.7 world-specific gate config + known-answer probes, §4.8 keyed-remount handoff with a live-switch test, §4.9 guarded musicStation fallback + non-ring grading-break verification, §2 band elements classified with noun test + isolation read. Rejected: nothing.

## Round 3 — Codex
VERDICT: REVISE. 2 blockers: (1) theme handoff must reset ParticleBackground's frozen ringWorldRef, not just key RingAmbient; (2) Halloween primitives have no runtime dispatch (makePrim branches live in ringPrimitives.js). Factual correction: non-ring themes currently DO receive numeric MUSIC_STATION; ring just doesn't render it.

### Claude's response (r3)
Accepted all. §4.8 now keys ParticleBackground by `ringWorldId ?? 'none'`. §4.9 corrected: `world ? world.musicStation : 10` (zero behavior change for non-ring/space). Added §4.10 per-world makePrim dispatch passed into RingAmbient, verified through the production render path. Rejected: nothing.

## Round 4 — Codex
VERDICT: REVISE. 1 defect: newly mounted RingAmbient starts at station 0 mid-show (lastSlideIndexRef seeded to current slideIndex, so first layout effect never calls jumpTo). Test checked remount counts, not alignment.

### Claude's response (r4)
Accepted. §4.8 now requires aligning to slideIndex % 13 before first paint and asserting visible station index after each switch and each advance. Rejected: nothing.

## Round 5 — Codex
VERDICT: APPROVED. Station-0 defect resolved; runtime and verification blockers covered; Ben's §0 decisions remain explicit gates before implementation.

## Post-approval edits (2026-09-28, Ben's answers)
Theme id `haunted-october`; TV 10-30 ft, two 80" gating, 40" advisory, 7px floor; mix look with orange sky; harvest moon; space world unfinished so Phase 1 on own branch `feat/haunted-october-world`; phone Tier 1 palette + Tier 2 static backdrop (Phase 6). Sent back to Codex for a check of these edits only.

## Codex re-check of post-approval edits (r6)
VERDICT: REVISE (not re-approved). Px/deg math confirmed. Two gaps: phone can't derive station from raw slide index; "downscaled to match px/deg" lacked a viewing reference. Fixed in spec (§4.11 shared station resolver fed host position; §5.3 blur-by-acuity gate). Those two fixes have NOT been re-reviewed by Codex.

## Independent Opus review of Phase 0 commit d133b4d
VERDICT: HAS-GAPS. Accepted: /ambient baseline skips ringWorldFor/ParticleBackground/Display.jsx (added snapshot test + coverage map §5.1); animations:'disabled' hides motion (added motion.json, claim narrowed to static rest frames); settle too short (6000ms); station index unchecked (now asserted); capture ignored page/console errors (now fails); no provenance (provenance.json); pngjs undeclared (added devDependency); diff blunt (size mismatch / missing frame / frame count / mkdtemp); probe extended with single-pixel flip; spec line ref 695->693 and stale status header fixed. Not adopted: build-marker check on the served page (speculative; provenance.json records the SHA instead).

## Phase 1 review (independent Opus, read-only, range 3be946c..fa06efb)
VERDICT: RISKS-FOUND, no space regression beyond intended changes. Findings: (1) MEDIUM intended behavior change: a reloaded/remounted /display mid-show on the space world now lands on the right station (was station 0, offset); edge case: before the first ring-visible slide, new code jumps to station 12 then glides to 0 (old: stayed 0 then turned to 1). (2) Intended: host preview / theme switch between space and a non-ring theme now remounts the ring. (3) Untracked copies of the spec in the main checkout would have blocked a merge: removed those two stale copies (content lives on this branch). (4) Stub reachable outside pickers via JSON import or a DB theme_id. (5) hauntedOctober.ring.js throws at module load if its THEMES entry is missing, same pattern as midnightGalaxy.ring.js. (6) future-world caveat: Display passes the base world to ringStationOverride. (7) AmbientAudit ?stations=/?colors= on haunted may drop haunted-only fields. (8) stale MUSIC_STATION comments, "21 themes" now 22.
Open decisions/todos: #1 edge case, #4 seal, #6/#7 before Phase 2.
