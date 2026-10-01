# references/shiny-rules-card.md — Shiny Rules Card (second title beat)

**Read before:** adding a shiny format's "how it works" card, changing explainer copy, or touching `shinyExplainers.js`, `ShinyTitleSlide.jsx`, or `display/explainers/`.

**Status (2026-10-01):** branch `feat/shiny-rules-card`, NOT merged to main. Built in `1c71b79` (feat: add shiny rules cards) + `e560893` (fix(bendle): step points are 30/20/10). Wager + Order cards and the Hues Cues points fix added uncommitted on top. Headless-Chromium screenshots at 1920×1080 (full and reduced motion) checked for the Wager, Order and Hues Cues cards only, rendered in an isolated harness (default theme, no live show). 2026-10-01 critique pass (uncommitted): TV text sizes, label/example grouping with fit-to-space scaling, Bendle answer sheet, zoomed Pin It map, Drop contrast, beat crossfade, Wager copy, per-kind Choice card. Only unit tests and `npm run build` checked after it; no browser re-shoot yet. Still unverified: title → card → question navigation in a live show, Prev back onto the card, Bendle/Pin It/Not So Different on screen, other themes, a real TV.

Spec: `docs/superpowers/specs/2026-09-30-shiny-rules-card-design.md`. Plan: `docs/superpowers/plans/2026-09-30-shiny-rules-card.md`. Where they differ from the code, this doc follows the code.

---

## What it is

- A second beat on a `shiny-title` slide. Beat 0 (`currentPart` 0) = the normal `ShinyIntroScreen` announce card. Beat 1 = the explainer.
- Rules cards show, top to bottom: **Action** (one sentence, the biggest text on the card), **Scoring** (one or two lines, first line gold), then a large format-specific visual under an **Example** label. Action and scoring are on screen from the first frame; only the example animates.
- Beat 0 ↔ beat 1 is a 220ms opacity crossfade (`ShinyTitleSlide.jsx`). The announce card stays mounted under the card (faded out) and is always handed `currentPart: 0`, so its `replayKey` never changes: Prev from the card shows the landed title, it does not replay the spin-land entrance. The card itself sits in `AnimatePresence` (`initial={false}`), so Prev back onto it remounts it and the example replays.
- Known leftover hard cut: `SlideRenderer.jsx` switches the opaque `bgDeep` layer on instantly at beat 1 (and off at beat 0), so the ambient world still cuts while the content crossfades. Fixing it means fading that layer in `SlideRenderer.jsx`, which this card's files don't own.
- The example plays once when the host advances onto the beat, then holds its last frame. No auto-advance. Host moves on with normal Next/Prev; Prev back onto the card remounts it, so it replays.
- No new slide type, no DB field, no migration. It reuses `data.parts` / `data.currentPart` stepping (`slideStepping.js` already steps any slide with `parts.length > 1`).
- Only title slides built after this change get the beat. `buildShinyTitleSlide` stamps it at build time; older saved titles have no `shinyInputType` and no `parts`, so they stay one beat. (Old "Not So Different" titles already had `parts` and match by fixed ID, so they still work.)
- One card per title group, never per question or per Bendle step — it lives on the title slide only.
- `SlideRenderer.jsx` treats beat 1 as opaque (like shiny content); beat 0 stays ambient.

## Data flow

1. `client/src/lib/shinyExplainers.js` — `SHINY_EXPLAINERS`, the only catalog. `getShinyExplainer(selector, inputType)` takes either `(formatId, inputType)` or `({ formatId, inputType })` and returns the first match or `null`. `hasExplainer(formatId, inputType)` and `explainerImageUrls(formatId, inputType)` wrap it.
2. `client/src/lib/shinySeries.js` `buildShinyTitleSlide(fmt, groupId, roundId)` — stamps `shinyFormatId: fmt.id`, `shinyInputType: fmt.input_schema.type` (when present), and, if `hasExplainer(fmt.id, fmt.input_schema?.type)`, `parts: EXPLAINER_BEAT_PARTS` copies + `currentPart: 0`.
   For `choice` it also stamps `shinyMultiSelect: !!input_schema.multiSelect`, only when the schema defines the field.
3. `client/src/components/display/slides/ShinyTitleSlide.jsx` — `getShinyExplainer(slide.data.shinyFormatId, slide.data.shinyInputType)`; warms assets in a `useEffect`; on `currentPart >= 1` renders `EXPLAINER_RENDERERS[definition.rendererKey]` with props `{ definition, data }` (`data` = `slide.data`) inside `ShinyRulesCard` (`mode: 'rules'`) or bare `ShinyExampleFrame` (`mode: 'sample'`).
4. `client/src/components/display/explainers/ShinyExampleFrame.jsx` — shared layout: optional `action`, optional `scoring[]`, then the Example label and children as ONE block centered in the space left. A ResizeObserver scale (never above 1, transform only) shrinks that block if it would not fit, so nothing clips under the frame's `overflow: hidden` (720p, long copy). TV sizes live in `FRAME_TEXT`. `ShinyRulesCard.jsx` passes `explainerCopy(definition, data)` into it — the definition's own `action`/`scoring`, or a `variants` entry (today only Choice).

## How to add a new format

1. **Registry entry** in `SHINY_EXPLAINERS` (`shinyExplainers.js`), wrapped in `Object.freeze`:
   - selector: `inputType: '<input_schema.type>'` for any format with a phone input schema. Use `formatId` only for a fixed, code-seeded ID (today only `fmt_not_so_different`).
   - `mode`: `'rules'` (action + scoring + example) or `'sample'` (example only, no rules text).
   - `rendererKey`: new string key.
   - `assets`: image URLs to warm (`[]` if none). Set `preloadMapData: true` if the example uses the US map.
   - `action`: one sentence string. `scoring`: array of 1–2 strings, built from imported scorer constants (template literals), never typed numbers.
2. **Export the scoring constants** from the format's scorer in `client/src/lib/` and make the scorer read them (pattern: `BENDLE_STEP_POINTS`, `HUES_CUES_SCORE_BANDS`, `PIN_POINTS` / `PIN_WINNER_FRACTION` / `PIN_MIN_ROOM_FOR_FRACTION`). If a rule exists only as a literal inside scoring logic, extract it first.
3. **Renderer file** `client/src/components/display/explainers/<Name>Explainer.jsx`. Receives `{ definition, data }`. Root must size to its content (no `height: '100%'`): the frame centers label + example as a block. Example headings ≤ ~3.4vmin (the action headline is 4.4vmin); no example text below ~2.2vmin. Renders only the example — the frame supplies action, scoring and the Example label. Use synthetic sample data, never real team guesses or the live answer. Reuse the real format surface (e.g. `UsMap`, `getHuesCuesGrid`, the real scorer) over hand-drawn stand-ins.
4. **Wire the key** in `ShinyTitleSlide.jsx`: import the component and add `<rendererKey>: Component` to `EXPLAINER_RENDERERS`. That map holds no format IDs; eligibility stays in the registry.
5. **Asset warming** is automatic from `definition.assets` (`warmImages`) and `definition.preloadMapData` (`preloadUsMapData`). Add a new flag + branch in the same `useEffect` only if a new asset kind needs it.
6. Nothing in the builder or host needs a separate allowlist — `buildShinyTitleSlide` picks it up through `hasExplainer`. Only titles it builds from then on get the beat; saved titles do not change. (`shinyTitleMigration.js` also calls `buildShinyTitleSlide`, so a re-run of that migration would stamp the beat on titles it creates.)

## Current coverage

Point values below are what the code produces today.

- **Not So Different** — `formatId: 'fmt_not_so_different'`, `mode: 'sample'`, key `notSoDifferent`. Four One Direction headshots (`/explainers/not-so-different/{harry,niall,louis,zayn}.jpg`), "What connects them?", answer. No rules/scoring text by design. ~9.5s timeline.
- **Bendle** — `inputType: 'bendle'`, key `bendle`. Scoring line from `BENDLE_STEP_POINTS` = **30 / 20 / 10** by step (changed back to 30/20/10 in `e560893`). Reference only: Ben grades by hand via Quick Entry; there is no phone entry and no auto-scoring. Example: three static waveform stages ("Step 1–3", "1 layer / 2 layers / 3 layers", sentence case) and a blank "Your answer sheet" with Step 1/2/3 lines and 30/20/10 pts beside each. **Open question for Ben:** how answers across steps are graded (does a right answer written at step 1 also count at steps 2–3? any penalty for a wrong early guess?) is not stated anywhere in code. The card deliberately states neither; a comment in `BendleExplainer.jsx` marks this. Add it to the copy only once Ben states the rule.
- **Pin It** — `inputType: 'pin'`, key `pinIt`, `preloadMapData: true`. Lines: "Top 40% (rounded up) earn +10 points." and "Under 5 teams: closest pin only. Ties at the rounded-mile cutoff also score." (40 = `PIN_WINNER_FRACTION` 2/5, 10 = `PIN_POINTS`, 5 = `PIN_MIN_ROOM_FOR_FRACTION`). Example: map zoomed to the Midwest/Southeast (`ZOOM_VIEW`, k 1.8 around map point 630,320), up to 60vh tall; five sample pins (label size 36) around a target near Detroit, scored by the real `scorePinRound` (room of 5, so A and B score). Scorers get a gold "+10" tag on the side away from the target and a 3.5px dashed line to it; non-scorers are dimmed with "✗". The "Target" label sits above its pin, clear of A.
- **Hues, Cues, and Booze** — `inputType: 'hues-cues'`, key `huesCues`. Lines: "Exact +30 · one square +20 · two squares +10." and "Diagonal neighbors count as one square." (from `HUES_CUES_SCORE_BANDS`). Example: 9×9 crop of the real grid around target H15, guess I16, clue "Fresh-cut grass", T/G markers, sample points from the real `scoreHuesCuesRound` (= the distance-1 band, +20), solid outline = 1 away, dashed = 2 away.
- **Wager** — `inputType: 'wager'`, key `wager`. Lines: "Beat at least half / three-quarters / nearly all of the other teams to win +10 / +20 / +30." and "Ties don't count as beating. Miss your bar: 0. No wager = Play It Safe." Points come from `WAGER_TIERS`; the threshold words from `WAGER_THRESHOLD_WORDS` keyed by tier threshold (test asserts each real `wagerTierBar` is at or above the stated fraction for rooms 2–30). No raw percentages: `wagerTierBar` rounds up and bumps colliding tiers, so up to 10 teams Sun means beating every other team; "at least" keeps the words true and the phone shows the exact bar. Ties: only strictly-worse teams count (`scoreWagerRound`). No wager = `DEFAULT_TIER_ID` (LiveMode). Example: the three real tier cards with the real `wagerOddsLine` for a room of 5, answer 412, five sample teams scored by the real `scoreWagerRound` (+20, 0, +10, 0, 0); B's row has a wavy underline on its tier and "needs 4" under its 0, plus a line explaining why B (Sun, beat 3 of 4, needs 4) scored 0.
- **Order** — `inputType: 'order'`, key `order`. Lines: "All or nothing: every item in the right spot scores." and "One out of place scores 0." No number: points are host-set per slide (`pointsForOrder`, default `DEFAULT_ORDER_POINTS`). Example: prompt "Smallest to biggest", four word tiles lettered A–D (stand-ins for the real picture tiles), then an exact answer ("Scores") and a one-swap answer ("0"), both scored by the real `scoreOrderSubmission`.

- **The Drop** — `inputType: 'drop'`, key `drop`. Lines: "You keep the points on the right tile. Points on the other tiles are lost." and "Every point must be placed. No split locked in scores 0." No number: the pool is host-set per slide (`data.dropTotal`, default `DEFAULT_DROP_TOTAL` 25). Example: 25 points split over tiles A-D, wrong tiles drop (±2.5° tilt, 3vmin gaps) in the real `dropSequence` order and dim to 0.65 (worst theme, halloween: "0" 4.11:1, "pts" 3.86:1 on bgDeep; 0.45 was 2.08:1), the right tile keeps its points (real `scoreDropSubmission`). Tile count varies per slide, so copy says "the tiles".
- **Movie Chain** — `inputType: 'movie-chain'`, key `movieChain`. Lines from `MOVIE_CHAIN_POINTS` (`movieChainScoring.js`): shortest or better +15, one extra movie +10, any wrong link 0, a repeated movie or actor 0 (`structureError` 'repeat'); count includes both end movies. The announced count is host-set, so the card never states one. Example: Titanic to Good Will Hunting, three sample chains scored by the real `scoreMovieChainSubmission` (+15, +10, 0 with a marked broken link). `ShinyMovieChainQuestion.jsx` and `MovieChainBoard.jsx` still hard-code 15/10 instead of reading `MOVIE_CHAIN_POINTS`.
- **Choice** — `inputType: 'choice'`, key `choice`. Per kind, from the stamped `data.shinyMultiSelect` (`explainerCopy` / `choiceVariantKey` in `shinyExplainers.js`; registry `variants.single` / `variants.multi`):
  - single (Mandela Effect): "Tap the one right answer on your phone, then lock it in." / "Pick the right one and you score." / "A wrong pick scores 0." Example shows only the pick-one sample.
  - multi (Mixology): "Tap every answer that fits on your phone, then lock it in." / "All or nothing: only the exact right picks score." / "One wrong, missing or extra pick scores 0." Example shows only the pick-every-one sample.
  - no stamp (titles built before this): the generic action ("…your phone says to pick one or every one that fits.") and both samples side by side.
  No number: host-set (`pointsForChoice`). Samples scored by the real `scoreChoiceSubmission`.
- **Matching** — `inputType: 'matching'`, key `matching`. Lines: "Each correct pair scores points." and "Wrong pairs score 0. The others still count." No number: host-set per slide (`pointsPerMatch`, default `2` is only a literal in `SlideEditor.jsx` and `LiveMode.jsx`). Example: four sample pairs, two right and two swapped, scored by the real `scoreMatchingSubmission`. Its colors copy the first 4 of the phone's `PALETTE` (not exported from `MatchingBoard.jsx`).

**Not covered (decided 2026-10-01):** race (`inputType: 'race'`, slide/phone type `horse-race`; flat 10, no speed, no penalty, phone states the lock-in, ties are host-fixed bad data — nothing a team would miss), elimination / venn / grid / image / audio / video / text / list (paper or host-run, familiar).

## Rules and gotchas

- **Match by `input_schema.type`, not format ID.** Interactive format DB IDs are generated per row; hard-coding one breaks on any other DB.
- **Bendle never names a layer order.** Which stem plays at which step is per-slide (`data.bendleTierOrder`, `buildBendleTiers`). Copy and visuals say "step" / "layers", never "drums first".
- **Bendle card is visual-only.** `WaveformBars` with `playing={false}`; no audio on the card. Song audio starts in the normal question flow; vocals only at answer reveal.
- **Scoring copy comes from exported constants** so the card and the scorer can't drift. Change the number in the scorer, the card follows.
- **Pin It scoring** (`pinScoring.js`): group size = `ceil(2/5 × room)` via integer math; room under 5 = 1. Cutoff = the k-th closest pin's distance rounded to whole miles; every pin at or under that rounded cutoff scores `PIN_POINTS` — so ties at the cutoff add winners, even in a small room. Room = payable teams (live team row + scoreboard row); the size saved at first lock wins on retry.
- **Hues Cues scoring** (`huesCuesScoring.js`): Chebyshev distance (`max(|Δcol|, |Δrow|)`, `huesCuesGrid.js`), so diagonals count as 1. 0 → 30, ≤1 → 20, ≤2 → 10, beyond → 0 (fallback, not a band). Absolute, not room-relative.
- **Reduced motion:** every explainer gates spatial offsets on `useReducedMotion()`; reduced = opacity-only fade, same content, no stagger.
- **GPU-only animation:** animate only `transform` and `opacity` (SKILL.md Critical Rule 2). The explainers use Framer Motion `transform: translateY(...)` / `scale`, never layout props.
- **Fonts:** use `theme.fonts.display` / `theme.fonts.body` from `useTheme()` (Boogaloo / DM Sans only as CSS fallbacks). Don't hard-code a font family.
- **Text size:** TV-first (15–20ft from a 1080p set). Action `clamp(2.2rem, 4.4vmin, 5rem)`, max width `min(88%, 46ch)`, balanced wrap; scoring line 1 `clamp(1.8rem, 3.2vmin, 3.6rem)`, line 2 `clamp(1.5rem, 2.7vmin, 3rem)`; Example label 2.2vmin. Keep action to one sentence and scoring to two lines; longer copy leaves less room, and the frame's fit scale shrinks the example to match.
- Team-facing map examples pass `showCities={false}` — city names would give answers away.

## Known gaps in the code

- Bendle cross-step grading rule unstated (see Bendle above) — pending Ben.
- `SlideRenderer.jsx` background layer still hard-cuts between beats (see "What it is").
- Fit scale and the 1080p/720p layout are reasoned from vmin budgets, not yet measured in a browser.
- `ShinyTitleSlide.test.jsx`'s `skipsLockedBackground` test imports `SlideRenderer.jsx`, which builds a Supabase client at import; it fails without `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set (any dummy values work).
- Matching's default `pointsPerMatch` is the literal `2` in two places (`SlideEditor.jsx`, `LiveMode.jsx`), not an exported constant. Extract it before any matching card states a number.
- Movie Chain's 15/10 are still literals in `ShinyMovieChainQuestion.jsx` and `MovieChainBoard.jsx` copy; they should read `MOVIE_CHAIN_POINTS`.
