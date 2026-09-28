# Halloween Ring World — Design Spec (DRAFT r1, not approved)

Date: 2026-09-28. Source: council run `wf_34f21741-107`, then Codex round 1 (log: `2026-09-28-halloween-ring-world-review-log.md`). Nothing here is built. Ben has not approved.

## 0. Gate questions for Ben (answer before any code)

1. `references/ring-world-mistakes.md` line 142 says new themes come "after the space world is finished." ANSWERED by Ben 2026-09-28: the space world is NOT finished, it is still being worked on. Ben still wants this world specced. Consequence: Phase 1 edits shared files (`RingAmbient.jsx`, `ringWorldFor.js`, `ringDraw.js`, `Display.jsx`, `ParticleBackground.jsx`, pickers) that the space-world work is also touching. Before Phase 1, the builder checks `git log`/`git status`/worktrees for in-flight space-world changes to those files, works on a separate branch off current main, and rebases onto the space work as it lands. DECIDED by Ben 2026-09-28 ("go on an own branch"): Phase 1 goes first on its own branch, named `feat/haunted-october-world`, and merges only after the space-world work it overlaps has landed or been checked for conflicts. Ben can override. Phases 2+ (Halloween-only files) are independent of this.
2. Look: DECIDED by Ben 2026-09-28: the mix of dark shapes, lit sources, and colored skies, with orange as the lead sky. Per-station sky regions still cover orange dusk, bruise purple, sick green, blood red, fog grey, moon white, with orange dominant. Still show one mock station before full build.
3. Theme id: DECIDED by Ben 2026-09-28: `haunted-october`. The existing `halloween` bespoke theme is untouched.
4. Jukebox-break picture (called "music station" in the code): during a grading break the jukebox plays and the background parks on ONE fixed picture behind it. In the space world that is the eclipse. This world needs one picture in that slot (index 10). DECIDED by Ben 2026-09-28: the harvest moon.
5. Viewing distance: DECIDED by Ben 2026-09-28: the TV sits 10 to 30 ft from players. Gates use both ends: the worst case for legibility is 30 ft (silhouettes and thin lines must still read), the worst case for glare and text contrast is 10 ft. This replaces the unconfirmed 12 ft / 20 ft numbers in the repo docs; flag that to Ben, do not edit those docs unprompted.

## 1. Goal

Second ring world, October/Halloween. Same 13-station contract as `midnight-galaxy`. Objects drawn in code per `concepts/OBJECT-RENDERING-PROTOCOL.md` (Recraft = reference only, no vectorized paths).

## 2. Look contract

- Mix: near-black forms, a small light source at every station, colour carried by the sky behind each station (orange dusk, bruise purple, sick green, blood red, fog grey, moon white).
- Centre 60% x 45% stays dark enough that white question text keeps contrast, measured per station against its sky. A station that lowers contrast is cut; text never changes.
- Every station has a DRAWN headline subject (the rule in `ring-world-mistakes.md`); a glow alone is never the headline. A wisp is a drawn teardrop flame plus glow, a lantern is a drawn lantern shape plus glow.
- Ground eligibility: this world defines its own slot placement (§4). Ground nouns go only in slots the Halloween slots file marks low on screen. `ringEngine.arcAt()` is loudness, NOT vertical position; do not use it for this.
- One shared horizon band along the bottom edge below the text zone. World-specific, not a station. Its elements are classified like stations, and each gets the same noun test and isolation read before it goes in the world:
  - fence posts: iconic (repeated rectangles + pointed tops)
  - headstone rectangles: iconic (rounded-top rectangles, no inscription)
  - church steeple: FIGURATIVE-lite (contour-dependent; one only, at the band's far end)
  The band's skyline outline must not merge into a station's block silhouette: keep it a low, continuous strip, at most ~12% of screen height.

## 3. Stations (zero-based indices, matching `MUSIC_STATION` and `pinAt`)

Fixed authored order. Auto-draw and saved station overrides are DISABLED for this world (Codex: the draw pool is space-only). Cyclic family spacing >= 3 verified below.

| Idx | Noun | Family | Class | Notes |
|-----|------|--------|-------|-------|
| 0 | Bat flock | scatter | contour-dependent | simple M-wing marks |
| 1 | Jack-o'-lantern | radial (lane B) | iconic | lit disc + triangle cut-outs only |
| 2 | Bare tree | branching | FIGURATIVE-lite | ground slot |
| 3 | Gravestone row | block | FIGURATIVE-lite | ground slot |
| 4 | Will-o'-wisp cluster | radial (lane B) | iconic | drawn flame shape + glow |
| 5 | Falling leaves | scatter | iconic | d(0,5)=5 |
| 6 | Spiderweb | line work | iconic | |
| 7 | Lantern / candle | radial (lane B) | iconic | drawn lantern + flame |
| 8 | Haunted house, lit windows | block | FIGURATIVE | ground slot; d(3,8)=5 |
| 9 | Fog bank | diffuse cloud | iconic | |
| 10 | Harvest moon, thin cloud | radial (lane B) | iconic | MUSIC STATION, index 10 |
| 11 | Storm + lightning | streak | iconic | no animation |
| 12 | Crow on a branch | figure | FIGURATIVE | d to idx 0 differs family |

Counts: radial lane B = {1,4,7,10} (spacing 3), block = {3,8} (2, at cap), scatter = {0,5}. Figurative-class stations: house, crow (full two-strike path) plus tree and gravestone row (lite: must pass the noun test "PASS = a fresh viewer names this as ___" written before drawing). Steeple moved to the horizon band.

Failure path (matches the protocol, replacing the council's swap rule): a figurative station failing a fresh visual read twice escalates to tighter reference-tracing of a Recraft reference, still hand-built. If it still fails, STOP and ask Ben; he decides swap vs keep. Never a third blind attempt; never ship generated art.

Paper check before approval (`ART-DIRECTION-SPEC.md` §6.2): fill all 13 shapes black; at least 9 of 13 must have distinct outlines (8/12 scaled to 13, rounded up; the spec says "twelve," so this states the count). Hue does not count.

## 4. Engine changes (only the seams Halloween needs)

Repo facts (verified by Codex): `RING_WORLDS` in `lib/ringWorldFor.js` is a routing registry only. Space-only coupling remains in: `ringWorldFor` (draws from the space `RING_POOL`, pins `'eclipse'` at 10), `ringDraw.js` (`pinKey='eclipse', pinAt=10`), `Display.jsx:695` (`MUSIC_STATION = 10`), `RingAmbient.jsx` (imports `midnightGalaxy.slots.js` directly; always builds stars, a space drifter, and a shooting-star lane), `ringPrimitives.js` (`SKY_REGIONS`, three space-named regions), `ringEngine.js skyFromTheme` (four-stop ramp only), `ThemePickerModal.jsx:184` and `LiveMode.jsx:1359` (both pickers filter to Midnight Galaxy), `AmbientAudit.jsx` (hardcodes `midnightGalaxyRing`), `concepts/tools/ring-verify.mjs` (live pass always opens `/ambient?ring=1`).

Phase 1 changes, each behind a space pixel-regression check:
1. Register `haunted-october` in `RING_WORLDS` and `THEMES` (mirror the guard that throws when a world's theme is missing).
2. Per-world config: pool/pin (`pinKey`, `pinAt`), `musicStation`, slot file, ambient-layer flags. Halloween sets auto-draw off.
3. `Display.jsx` reads `world.musicStation` instead of the constant.
4. `RingAmbient` reads slots and ambient layers from the world; Halloween disables stars, drifter, shooting-star lane.
5. A Halloween sky-region model and renderer path, separate from the base sky ramp (`skyFromTheme` is not changed to "read regions"; it does not do that today).
6. Both host theme pickers expose registered, approved worlds.
7. `AmbientAudit` and `ring-verify` parameterized by world id; both passes assert the expected world id and station keys. World-specific gate config (not just an id): expected star-count band per world (Halloween has no stars, so the 150-260 check is skipped for it, with a known-answer probe proving the skip does not skip the space world), and static primitive check reads the primitive dispatch of the world under test (Halloween kinds live outside `ringPrimitives.js`). Every changed gate gets a known-answer probe: one deliberately bad fixture that must fail, one good fixture that must pass.
8. World-change handoff. `ParticleBackground` freezes `ringWorldFor()` at mount and `RingAmbient` builds its DOM once, so a host switching themes live would keep drawing the old world. Fix: key the `ParticleBackground` instance by `ringWorldId ?? 'none'` (so its frozen `ringWorldRef`, including the `false` a non-ring theme leaves, resets on a world change, and switching between two non-ring themes does not remount); slide advances never change the key. Keying `RingAmbient` alone is not enough. Station alignment: a freshly mounted `RingAmbient` initializes `lastSlideIndexRef` to the current `slideIndex`, so it never calls `jumpTo()` and would show station 0 mid-show. The new ring must align to `slideIndex % 13` before first paint (initial `jumpTo`, or seed the ref so the first layout effect fires it). The switch test asserts the visible station index immediately after each switch and after each following advance, not just remount counts. Test: switch space to Halloween and back mid-show, then advance 3 slides; assert one remount per switch, zero on advances, and Rule 1 (ParticleBackground never re-mounts on slides) still holds.
9. `musicStation` fallback. Grading breaks run on every theme and `ringWorldFor()` returns no world for non-ring themes. Today non-ring themes receive the numeric `MUSIC_STATION` (10) override and the ring simply does not render it (`Display.jsx:860`). Zero-change rule: `Display.jsx` uses `world ? world.musicStation : 10`, so non-ring and space behavior is byte-identical. Verify a grading break on one non-ring theme, on midnight-galaxy, and on Halloween.
10. Runtime primitive dispatch. `RingAmbient` calls `dom.makePrim`, whose kind branches live in `ringPrimitives.js`. Halloween kinds render only if the world supplies its own `makePrim` (a per-world dispatch object, falling back to the shared `makePrim` for shared kinds) passed into `RingAmbient`. Each Halloween kind is verified through that production path (render the real `RingAmbient` with the Halloween world, one station forced in view), not by static lookup alone. `ring-verify`'s static check reads the same per-world dispatch object.

11. Phones (`/join`). Repo fact: `Join.jsx` themes itself only from the `THEMES` entry's `colors` (`bg`, `bgDeep`, `accent`, `highlight`, `text`); it renders no ring, particle, or sky art. So:
    - Tier 1 (free, in scope): the `haunted-october` THEMES entry carries a Halloween palette (near-black warm bg, orange accent, pale highlight, cream text), and phones pick it up with no `Join.jsx` change. Contrast of `text` on `bg` must pass the same 7:1 floor the space world uses (`floorContrast`). Fonts stay Boogaloo + DM Sans.
    - Tier 2 (APPROVED by Ben 2026-09-28, built last, after the TV world passes its gates): a static phone backdrop, CSS/inline-SVG only: a dark-to-orange sky gradient plus the same low horizon strip along the bottom edge, and the gradient's hue shifts to the current station's sky color as the show advances. The phone cannot derive the station from its raw slide index (the TV counts only ring-visible slides, peeks ahead for team-picker, and overrides the station during grading breaks: `Display.jsx` ~332, `Join.jsx` ~1373). So: extract the TV's station resolver (including the break override) into one shared pure function that both `Display.jsx` and `Join.jsx` call, and feed it the HOST's live position (`show.current_slide_index`), not the slide a phone is browsing. Unit-test the resolver against the TV's existing behavior before phones use it. No animation, no canvas, no ring on phones. Must not reduce contrast of any answer control, and every interactive board (`WagerBoard`, `ChoiceBoard`, etc.) must be re-checked against it.
    - Not in scope: the live ring on phones (battery, heat, and perf in a bar for no answering benefit).
    - Gate: phone audit at 375/390/430 widths together (Ben's standing "phone audit" definition).

Every other file naming `midnightGalaxy` (`ringRecolor`, `ringCertification`, `weightedPalette`, `drawWorld`, `WorldPaletteEditor`, `EvolvingRingAmbient`, `WarpTransition`, `StageFrame` at `client/src/display/`, jukebox `LiveScreen`, `GradientAudit`, `midnightGalaxy.{candidates,slots,ring}.js`) is triaged in the Phase 1 report with a one-line reason it stays space-only, or the change if the seam touches it. No blanket import rewrite.

Per-world only: horizon band, filled-silhouette-path primitive hand-traced from a reference, thin Halloween-named kinds calling shared helpers. Nothing moves into `ringPrimitives.js` until a third world needs it. No picker UI.

## 5. Verification and gates

1. Before Phase 1: capture frozen baseline frames of midnight-galaxy (1920x1080, every station). Validate the diff tool with a known-different pair. Zero-change is measured against those frames.
2. Halloween static HTML copy for `ring-verify`, plus the parameterized live pass (§4.7).
3. Per station: screenshot at 1920, then downscaled to simulate 10 ft and 30 ft (state the pixels-per-degree math used, based on the TV size Ben confirms); silhouette/squint check at 30 ft; centre clear; contrast against that station's sky at 10 ft. Any hard-edge or thin-line floor in `ART-DIRECTION-SPEC.md` §13 is recomputed for 30 ft, not taken from its 12 ft assumption.
   TV sizes (Ben, 2026-09-28): two 80" and one 40", all 16:9, rendering the same 1920x1080 frame. Pixels per degree of view (px/deg = 1920 / horizontal view angle):
   - 80" at 10 ft: 59 px/deg. 80" at 30 ft: 173 px/deg.
   - 40" at 10 ft: 116 px/deg. 40" at 30 ft: 346 px/deg.
   The repo's 4px hard-edge floor assumes 55" at 12 ft (about 102 px/deg, so 4px is about 2.4 arcmin). Holding that same 2.4 arcmin: floor is about 7px on an 80" at 30 ft, and about 14px on the 40" at 30 ft. Spec rule (Ben: focus on the bigger TVs): the two 80" TVs are the gating targets. Minimum stroke/edge width 7px. The 40" is advisory only: it gets a screenshot for a look, but it never fails a gate. If Ben later says the 40" is a real 30 ft seat, raise the floor to 14px for anything that must read on it. Simulated-view gate (no viewing reference needed, Codex r6): apply a Gaussian blur to the 1920 frame whose width equals one arcminute of acuity in pixels, i.e. px/deg / 60: about 2.9px for 80" at 30 ft, about 5.8px for 40" at 30 ft (advisory), about 1px for 80" at 10 ft. Run the silhouette-distinctness and squint checks on the blurred 30 ft frame (80" gates). Run text contrast on the unblurred frame (glare case, 10 ft).
4. `ring-object-craft` skill on every new primitive.
5. Two-strike log for house and crow (and tree/gravestone if they trigger) in `concepts/FAILURE-LEDGER.md`.
6. Ben views it on the real TV before music-station placement is final.

## 6. Deferred

Picker UI. Recolor run for this world. Motion beyond existing drift/flicker. Halloween jukebox tint. Shared part kit. Detailed figures (witch, skeleton, ghost, cat): Ben's taste call.

## 7. Stop conditions

Any gate fails, or a figurative station fails after tighter tracing: stop and ask Ben. No push without review. Git-first. Multiple sessions may share this checkout.

## 8. Implementation prompt for Opus 5.5 (paste-ready, use only after approval)

> You are building the Halloween ring world for Trivia OS in `~/Projects/baynes-trivia/trivia-os`. The approved spec is `docs/superpowers/specs/2026-09-28-halloween-ring-world-design.md`; follow it exactly.
>
> Read first: `SKILL.md`, `references/ring-world-mistakes.md`, `references/ring-world-continuity.md`, `concepts/OBJECT-RENDERING-PROTOCOL.md`, `concepts/ART-DIRECTION-SPEC.md`, `concepts/FAILURE-LEDGER.md`, the `ring-object-craft` skill. Run `git status`, `git log -5`, `git stash list` first; another session may share this checkout.
>
> Phases, each ending in a report and a stop for review:
> 0. Capture frozen space-world baseline frames; validate the diff tool on a known pair.
> 1. Seams in spec §4 only, then the pixel diff (zero change). No Halloween art yet.
> 2. Halloween sky-region model, ambient-layer gating, horizon band. Screenshots.
> 3. Iconic stations (idx 1, 4, 5, 6, 7, 9, 10, 11). One screenshot each, alone and in ring.
> 4. Contour-dependent and figurative stations (idx 0, 2, 3, 8, 12) under the noun test and two-strike protocol; log in `FAILURE-LEDGER.md`.
> 5. Parameterized `ring-verify`, per-station contrast, hand off for Ben's real-TV check.
> 6. Phones: Tier 1 palette (spec §4.11), then the Tier 2 static backdrop. Phone audit at 375/390/430 together; re-check every interactive board against the backdrop.
>
> Rules: Recraft is reference only, never shipped, never vectorized. Fixed authored order, 13 stations, auto-draw off. Never a third blind attempt on a noun; after tighter tracing fails, stop and ask. Render and look in the same message that claims a station works. Gate on exit codes, never pipe tests through `tail`. Do not push. Do not touch the `halloween` bespoke theme. Confirm Supabase project `qwtbgusqfoypvehnungr` if anything touches the DB.
