# Shiny Rules Card Implementation Plan

> **For agentic workers:** Implement this plan task by task in the feature branch. Keep the shared registry as the only source of explainer selectors; keep each sample renderer focused on its own mechanic.

**Goal:** Add a reusable action-and-scoring card with format-specific examples to Bendle, Pin It, and Hues, Cues, and Booze shiny title groups.

**Architecture:** A code-owned registry selects mechanics by stable `input_schema.type` and the existing sample-only format by its fixed ID. It provides each card's copy, renderer key, and assets. `buildShinyTitleSlide` consults this registry to create the second beat and stamps the schema type; `ShinyTitleSlide` uses the same selector to render and warm assets. Three focused renderers reuse the real map, scoring rules, and generated color grid. The current “Not So Different” example remains sample-only.

**Tech Stack:** React 18, Vite, Framer Motion, existing shiny-title `currentPart` stepping, existing map and Hues/Cues grid components, Vitest (tests are not run unless requested).

---

## File map

- `client/src/lib/shinyExplainers.js` — single source for explainer eligibility, action/scoring copy, renderer key, and assets; interactive formats match by stable input-schema type, while the existing sample-only format matches by its fixed ID.
- `client/src/lib/shinySeries.js` — reads the registry when it builds a new shiny title's second beat and stamps its input-schema type for renderer lookup.
- `client/src/components/display/slides/ShinyTitleSlide.jsx` — reads the same definition to render the shared rules-card shell and format renderer, and warm its assets.
- `client/src/components/display/explainers/ShinyExampleFrame.jsx` — shared themed frame and Example label used by every explainer.
- `client/src/components/display/explainers/ShinyRulesCard.jsx` — shared persistent action/scoring layout composed with the Example frame.
- `client/src/components/display/explainers/BendleExplainer.jsx` — three step/point visual, no audio, no fixed stem order.
- `client/src/components/display/explainers/PinItExplainer.jsx` — sample map, guesses, target, and scoring group.
- `client/src/components/display/explainers/HuesCuesExplainer.jsx` — clue, selected square, target, and outlined distance zones.
- `client/src/components/display/explainers/NotSoDifferentExplainer.jsx` — adapts to receive the existing sample-only definition/assets; preserve its content and behavior.
- `client/src/lib/bendleScoring.js` — exports the three step-point values for use by scoring and explainer copy.
- `client/src/lib/huesCuesScoring.js` — exports exact/near-distance scoring bands for use by scoring and explainer copy.
- `client/src/lib/shinyExplainers.test.js`, `client/src/components/display/slides/ShinyTitleSlide.test.jsx`, and `client/src/lib/shinySeries.test.js` — existing coverage locations if behavior tests are added after explicit user request.

## Task 1: Unify format eligibility and instruction data

**Files:**
- Modify: `client/src/lib/shinyExplainers.js`
- Modify: `client/src/lib/shinySeries.js`
- Modify: `client/src/lib/shinySeries.test.js` only if the user requests tests

- [ ] Replace the parallel ID set and image table with one definitions list. Each entry has a unique selector (`formatId` or `inputType`), `mode` (`sample` or `rules`), `rendererKey`, `assets`, and, for rules cards, `action` and `scoring` text.
- [ ] Register `fmt_not_so_different` as `mode: 'sample'` with the four existing photo URLs. Register Bendle, Pin It, and Hues, Cues, and Booze by the stable `fmt.input_schema.type` values `bendle`, `pin`, and `hues-cues`; their database format IDs are generated and must not be hard-coded.
- [ ] Export `getShinyExplainer({ formatId, inputType })` and derive `hasExplainer` and asset warming from the registry; do not keep a second set of format selectors.
- [ ] Update `buildShinyTitleSlide` to resolve by `fmt.id` or `fmt.input_schema.type`, stamp `shinyInputType` in title data, and add the existing two-beat parts when a definition exists. Keep older stored title slides untouched.
- [ ] Preserve one explainer beat per title/group; don't add an explainer to every Bendle step slide.

## Task 2: Make displayed scoring come from the scorer

**Files:**
- Modify: `client/src/lib/bendleScoring.js`
- Modify: `client/src/lib/huesCuesScoring.js`
- Modify: `client/src/lib/pinScoring.js` only if the scoring summary needs a named exported rule helper
- Modify: `client/src/lib/shinyExplainers.js`

- [ ] Export `BENDLE_STEP_POINTS = [20, 15, 10]` from `bendleScoring.js` and have `buildBendleTiers` read these values by step position.
- [ ] Export `HUES_CUES_SCORE_BANDS` with exact (30), distance-one (20), distance-two (10), and beyond-two (0) values; have `scoreHuesCuesRound` read these values.
- [ ] Export `PIN_WINNER_FRACTION = { numerator: 2, denominator: 5 }` and `PIN_MIN_ROOM_FOR_FRACTION = 5`; have `scoringGroupSize` use those values. Keep `PIN_POINTS = 10` as the point source. The card derives the closest-room-fraction and small-room summary from these values; the rounded-mile tie explanation reflects the scoring algorithm.
- [ ] Derive scoring copy from these exports/helpers in the registry, not from duplicated numeric literals. Keep Bendle text independent of the per-question stem order.

## Task 3: Add the shared card shell and render the existing sample

**Files:**
- Create: `client/src/components/display/explainers/ShinyRulesCard.jsx`
- Modify: `client/src/components/display/slides/ShinyTitleSlide.jsx`
- Modify: `client/src/components/display/explainers/NotSoDifferentExplainer.jsx`

- [ ] Build `ShinyExampleFrame` for the shared themed layout and Example label. Compose `ShinyRulesCard` from it with one action sentence and one scoring line/diagram, keeping action and scoring visible throughout each rules example.
- [ ] Pass the registry definition to the card and its renderer. For `mode: 'sample'`, render `NotSoDifferentExplainer` inside `ShinyExampleFrame`, without action/scoring fields. Preserve its four photos, prompt, answer, duration, and final hold.
- [ ] For `mode: 'rules'`, render the shared card shell around the renderer selected by `rendererKey`.
- [ ] Warm all registry `assets` while the title card is visible. Keep the shared registry as the only place with explainer selectors.
- [ ] Use theme fonts/colors and high-contrast large type. Every spatial animation respects `useReducedMotion`; reduced motion retains content and uses opacity only.

## Task 4: Implement format examples

**Files:**
- Create: `client/src/components/display/explainers/BendleExplainer.jsx`
- Create: `client/src/components/display/explainers/PinItExplainer.jsx`
- Create: `client/src/components/display/explainers/HuesCuesExplainer.jsx`

- [ ] Bendle shows three successive mix stages with one additional layer at each step and point values 20/15/10. Label stages by position rather than naming a fixed instrument order. Show “write it down” in the shared action text. Do not play audio or suggest phone submission/automatic scoring.
- [ ] Pin It reuses the actual lower-48 map surface with sample-only pins. Show a clear sample clue, target, and qualifying nearest group. Do not expose city labels on the team-facing map. Copy states that the closest 40%, rounded up, generally earn 10 points; under five teams, the closest team wins; ties at the rounded-mile cutoff can also score.
- [ ] Hues, Cues, and Booze uses the generated Hues/Cues palette. A sample clue leads to a marked guess and target; outlines/coordinate labels show exact, one-square, and two-square scoring zones, including diagonal distance. Show 30/20/10 values.
- [ ] Mark each illustration `Example`; use synthetic sample content, never real team guesses/results or the live question's answer.
- [ ] Keep example play self-contained, start it when the host advances onto the explainer, and hold its final frame until the next host navigation. Do not add automatic advancement or additional live-mode controls.

## Task 5: Wire and review the experience

**Files:**
- Modify: `client/src/components/display/slides/ShinyTitleSlide.jsx`
- Modify: `client/src/lib/shinyExplainers.js`
- Modify: `docs/superpowers/specs/2026-09-30-shiny-rules-card-design.md` only if implementation reveals a required design clarification

- [ ] Confirm each supported format selector resolves to exactly one definition and renderer; unknown formats keep the ordinary one-beat shiny title.
- [ ] Manually review title → card → first question navigation and Prev back-navigation in the display, including a return to the card.
- [ ] Review the display at 16:9 and a narrow preview; check that rules remain legible, examples are visibly labeled, and no scoring summary is clipped.
- [ ] Review reduced-motion behavior and verify no Bendle audio starts on the card.
- [ ] Compare every displayed score and exception with the shared scoring definitions. Do not run automated tests unless the user asks for testing/verification.

## Plan self-review

- The plan covers all success criteria in the approved spec: action, score, example, format-specific rules, legacy sample-only behavior, registry-driven rendering/warming, reduced motion, hold/skip/revisit, and saved-show compatibility. It accounts for randomly generated format IDs by using schema types for interactive mechanics.
- It avoids changing phone answering or live scoring mechanics; only the scoring constants are extracted for shared display/scorer use.
- There are no unresolved format identifiers: the three mechanics use stable input-schema types from each format row, and “Not So Different” retains its existing fixed ID.
