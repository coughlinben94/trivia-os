# Pin It — shiny question format (design)

Date: 2026-09-29. Status: DRAFT, awaiting Ben's review. Source idea: House of Games "Where Is Kazakhstan?" / "Put Your Finger On It" (see scratchpad `hog/shiny-candidates.md`).

## What it is

A team-play geography format. The TV shows a prompt ("Where is Apple Valley, MN?"). Each team zooms a US map on their phone, drops one pin, locks in. On reveal the TV shows every pin, the true spot, and each team's distance in miles. The closest 40% of the room score 10 points each.

## Decisions (all confirmed by Ben in chat, 2026-09-29)

- Target is a **point** (latitude/longitude), not a state.
- Map is the **lower 48 US** only. Alaska/Hawaii deferred.
- Phone: pinch/drag zoom; **press-and-hold (~350ms) drops the pin** (a plain tap or a pinch/pan never drops one, so no accidental pins); while still holding, the pin follows the finger and sits offset above it with a small magnifier so the finger never hides the spot; lift to set it; drag the pin to re-adjust; Lock In. A "Move pin" re-hold replaces the pin (one pin per team). Ben's idea, 2026-09-29.
- Score is **room-relative, flat**: top 40% by distance get 10 points each. No graded tiers, no fixed mile bands.
- Series of targets uses the wizard's blank-shell "How many questions?" box (shipped 2026-09-29): N separate blank slides.

## Scoring (`client/src/lib/pinScoring.js`)

Input: `entries: [{teamId, teamName, pin: {lat, lon} | null}]`, `correct: {lat, lon}`, `roomSize` (registered teams at lock time).

1. Distance = great-circle miles (haversine) from each valid pin to `correct`.
2. `k = roomSize < 5 ? 1 : ceil(0.4 * roomSize)` (small-room rule, Ben 2026-09-29: under 5 teams only the closest team scores; ties at the cutoff still all score). The room is every registered team, not only those who answered, so skipping cannot shrink the scoring group.
3. Sort pinned teams by distance ascending. Cutoff = distance of the k-th pinned team (or the farthest pinned team if fewer than k pinned).
4. Every pinned team with `distance <= cutoff` scores 10 (ties at the cutoff all score). Everyone else scores 0, including teams with no pin.
5. Return sorted closest-first, `{teamId, teamName, pin, miles, points}`, like `scoreHuesCuesRound`. Persist the sorted snapshot as `pinResults` on the slide (the TV cannot read `phone_answers`, same reason as `huesCuesResults`).
6. Fold into round totals via the existing `applyPhoneScoreUpdates` (`scoreboardMath.js`), same as Hues & Cues. Idempotent per slide.

Edge cases to test: 0 pins, 1 team, roomSize 20 (k=8), tie straddling the cutoff, invalid/NaN pin, pin outside the map bounds, all pins identical.

## Map + geometry

- **Data:** a one-time dev script (`scripts/build-us-map.mjs`) turns public-domain US Census state outlines (us-atlas) into `client/src/lib/usMapData.js`: one SVG path per state in a fixed viewBox. No runtime map library; the repo has none today and this adds none.
- **Projection:** Albers equal-area conic for the lower 48. It has a closed-form inverse, so a tap (x, y) converts to (lat, lon) in about 15 lines, no library. Unit test: forward then inverse round-trips within a tiny tolerance for known cities.
- **Stored pin:** `{lat, lon}` (not screen x/y), so distance is real and the map can change later without breaking saved answers.
- Outlines are orientation only. They never affect scoring.

## Surfaces (mirrors Hues & Cues wiring)

| Surface | Change |
|---|---|
| `lib/shinySeries.js` | `isPinShiny(data)` = `shinyInputSchema.type === 'pin'` |
| `lib/slideStepping.js:379` | add `pin: { guard: isPinShiny, lockFields: ['pinLocked'], revealField: 'pinRevealed' }` |
| `components/join/PinBoard.jsx` (new) | phone map: zoom/pan, pin drop + drag, Lock In, saves `{lat,lon}` to `phone_answers` (same lock-in / committed-state pattern as `HuesCuesBoard`/`ChoiceBoard`) |
| `components/display/slides/ShinyPinQuestion.jsx` (new) | TV: prompt + map + "N of M locked in" line (via `phone_answers_count` RPC); on reveal, auto-zoom to fit all pins + true spot, team-colored pins with name labels, line to the true spot, miles shown, scorers marked |
| `components/display/slides/QuestionSlide.jsx:1496` | route to `ShinyPinQuestion` |
| `views/Display.jsx:556` | add pin to the `suppressed` check |
| `views/Join.jsx:734` | render `PinBoard` |
| `components/host/LiveMode.jsx` (~648) | `handleLockAndScorePin`, same lock-then-score-then-snapshot flow as `handleLockAndScoreHuesCues`; add `pinBusy` to `scoringBusy` |
| `components/host/SlideEditor.jsx` (~1195) | `PinAnswerPicker`: zoomable map, click to set the true spot; live phone preview via `PinBoard preview` |
| `components/host/FormatLibrary.jsx:3` | add `'pin'` to `INPUT_TYPES` |
| `lib/shinyWizardKinds.jsx` | `pin: { hasOwnControls: false, nextStepHint: ... }` (blank-shell; gets the count box for free) |
| `AddSlideWizard.jsx:631` | exclude `pin` from `showAnswerField` (answer is a picked spot, like hues-cues) |
| `shiny_formats` row | NEW ROW "Pin It", `input_schema: {type:'pin', slots:1, seriesEnabled:false}`. Data insert into project `qwtbgusqfoypvehnungr`. Needs Ben's OK. |

No schema migration expected: `phone_answers.answer` is jsonb and already holds arrays/objects for other formats. To confirm during the plan (check the RLS lock-down migration `20260817171310` covers a new slide type without change).

## Risks / things to verify in the plan

1. **Pinch-zoom vs page scroll on the phone.** The map must own touch gestures (`touch-action: none`) without trapping the page. Test on real 375/390/430 widths and one real iPhone (Safari), not only headless.
2. **`ShrinkToFit`** wrapper used by other Boards may fight a zoomable canvas; likely skip it for Pin.
3. **Small-target precision:** zoom must reach roughly city scale. Cap max zoom, keep the pin's visible tip precise (offset the pin above the finger while dragging so the finger does not cover it).
4. **TV reveal legibility at 25 teams:** overlapping pins need color + name labels and a leader line; test with 25 synthetic pins.
5. **RT-1 landmine** (Realtime omits TOASTed columns): new `pinLocked`/`pinRevealed`/`pinResults` fields live in slide data inside the `slides` jsonb. `/display` and `/join` must merge, not full-replace, as documented in the trivia-os skill.
6. **Two show-shape implementations** (`Display.jsx` raw vs `useShow.js` `normalizeShow`): new slide fields ride inside `slides`, so no new top-level column, but confirm.
7. **Skills to read before building:** trivia-os references (`slides.md`, `features.md`), `emil-design-eng` for the zoom/pin motion, and a phone audit at 375/390/430 after build.

## Plan-time simplifications (2026-09-29, see `docs/superpowers/plans/2026-09-29-pin-it.md`)

- No magnifier loupe: the pin sits 48px above the finger while dragging; add a loupe only if the real-iPhone check shows it is needed.
- "Drag to re-adjust" became "press and hold again to move the pin" (one gesture instead of two).
- No far-outlier edge markers: the reveal camera frames the true spot plus the scoring pins, and every team's miles are in the side list.

## Critique fixes (adversarial review, 2026-09-29; blockers 1-3 and the surface list verified against code)

Full review: scratchpad `pin-it-critique.md`. These OVERRIDE anything above that conflicts.

**Answer shape (blocker).** `data.answer` stays a plain label string ("Apple Valley, MN"). The true spot lives in `data.pinAnswer = {lat, lon}`. Putting an object in `data.answer` breaks `LiveMode.jsx:146`, `remoteSnapshot.js:25` and the `questionRows.js` archive `.trim()`.

**Room size (blocker).** `roomSize` = teams that have BOTH a live `teams` row AND a matching scoreboard row (`applyPhoneScoreUpdates`, `scoreboardMath.js:116`, skips teams with no scoreboard row, so counting them would raise the cutoff for teams that can never be paid). The lock step shows the host that number before scoring, with a host override field.

**Repeatable scoring (blocker).** On first lock, save `pinRoomSize` and `pinResults` on the slide. "Retry Scoring" reuses the saved `pinRoomSize`, never re-reads live teams. Unlock clears `pinResults` and `pinRoomSize`. A retry re-sends nothing new from phones; a phone whose save timed out re-sends its CURRENT pin on Lock In tap.

**Ties.** Compare on distance rounded to whole miles (what the TV shows), so two "312 mi" teams both score or both miss. `ceil(0.4 N)`: 1/1, 1/2, 2/3, 2/4, 2/5, 4/10, 6/15, 8/20, 10/25.

**Input validation.** `phone_answers.answer` has no shape check, so `pinScoring` rejects anything that is not `{lat, lon}` finite numbers inside the lower-48 bounds (treated as no pin). Note: `pinAnswer` and `pinResults` reach every phone at lock time, before the host reveal. That is acceptable (locked answers cannot change) and matches Hues & Cues; state it, do not hide it.

**iOS hold-to-drop (blocker) — build spec, not behavior.** Map surface: `touch-action: none`, `-webkit-touch-callout: none`, `-webkit-user-select: none`, `user-select: none`. Pointer events with `setPointerCapture`; a ~350ms timer arms on pointerdown; cancel on movement past ~8px slop or a second pointer (pinch). No haptics on iOS Safari (do not promise any). Zoom about the pinch centre (the existing `HuesCuesBoard.jsx:264-330` pan/pinch does not; write it properly, tested on a real iPhone). Hand-rolled, no new dependency.

**Map.** Blank outlines have no landmarks, so cap zoom at ~8x and add ~40-60 city dots with labels that appear as you zoom. One shared `UsMap` component used by phone, TV and the host picker (consistency by construction). Lazy-load the map data (~25-40 KB raw). Host picker also gets a "paste lat, lon" field.

**TV reveal.** Camera fits the true spot plus the scoring pins only; far outliers get edge markers. Label the top 5 by name; list the rest at the side; rank numbers as well as color. Animate only `transform`/`opacity` (no dashed-line draw via stroke-dashoffset; use an opacity/scale reveal). Honor `prefers-reduced-motion`. Keep the center safe-area rule for the prompt text.

**Extra surfaces the first pass missed.**
- `LiveMode.jsx:1058` `lockHandlersRef`: add `pin: handleLockAndScorePin`, or the "Next locks answers" countdown never locks/scores Pin.
- `LiveMode.jsx` ~1545 per-mechanic panel map: add a `pin` entry (undefined dereference otherwise).
- `SlideEditor.jsx:1182`: hide the generic Answer box for `pin` (like hues-cues).
- `shinyWizardKinds.test.js:8`: the hard-coded kind list gains `'pin'`.
- `DatabaseAddPanels.jsx`: block adding a Pin question to the question bank (no coordinates), or store label-only with an explicit note.
- `Join.jsx` ~690: the global `ShrinkToFit` is skipped for phone mechanics, so `PinBoard` must size itself to the viewport.
- No change needed: Swing Round wizard, `BuildMode`, `RoundSidebar`, `ShowDetail`; `questions.shiny_type` has no constraint.

**Save contract.** Copy `HuesCuesBoard`'s commit-only-after-confirmed-save pattern and its 8s timeout race; a late-landing timed-out save is harmless because Lock In always re-sends the current pin.

## Testing

- Unit: `pinScoring` (edge cases above), projection round-trip, haversine sanity (known city pairs).
- Component: `PinBoard` lock-in commits only after a confirmed save (same contract as other Boards).
- Manual/E2E: real phone, 2+ teams, lock, reveal, scoreboard totals; TV reveal with 25 synthetic pins.

## Out of scope (now)

Alaska/Hawaii, world map, photo-as-map ("tap the fake item"), per-question radius, graded tiers, sliding-scale scoring. The `pin` type stores lat/lon, so a photo variant would be a separate later type.
