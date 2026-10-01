# references/shiny-rules-card.md — Shiny Rules Card (second title beat)

**Read before:** adding a shiny format's "how it works" card, changing explainer copy, or touching `shinyExplainers.js`, `ShinyTitleSlide.jsx`, or `display/explainers/`.

**Status (2026-10-01):** branch `feat/shiny-rules-card`, NOT merged to main. Built in `1c71b79` (feat: add shiny rules cards) + `e560893` (fix(bendle): step points are 30/20/10). No browser check done yet — title → card → question navigation, Prev back onto the card, 16:9 legibility, and reduced motion are all unverified on a real display.

Spec: `docs/superpowers/specs/2026-09-30-shiny-rules-card-design.md`. Plan: `docs/superpowers/plans/2026-09-30-shiny-rules-card.md`. Where they differ from the code, this doc follows the code.

---

## What it is

- A second beat on a `shiny-title` slide. Beat 0 (`currentPart` 0) = the normal `ShinyIntroScreen` announce card. Beat 1 = the explainer.
- Rules cards show, top to bottom: **Action** (one sentence), **Scoring** (one or two lines, first line gold), then a large format-specific visual under an **Example** label. Action and scoring are on screen from the first frame; only the example animates.
- The example plays once when the host advances onto the beat, then holds its last frame. No auto-advance. Host moves on with normal Next/Prev; Prev back onto the card remounts it, so it replays.
- No new slide type, no DB field, no migration. It reuses `data.parts` / `data.currentPart` stepping (`slideStepping.js` already steps any slide with `parts.length > 1`).
- Only title slides built after this change get the beat. `buildShinyTitleSlide` stamps it at build time; older saved titles have no `shinyInputType` and no `parts`, so they stay one beat. (Old "Not So Different" titles already had `parts` and match by fixed ID, so they still work.)
- One card per title group, never per question or per Bendle step — it lives on the title slide only.
- `SlideRenderer.jsx` treats beat 1 as opaque (like shiny content); beat 0 stays ambient.

## Data flow

1. `client/src/lib/shinyExplainers.js` — `SHINY_EXPLAINERS`, the only catalog. `getShinyExplainer(selector, inputType)` takes either `(formatId, inputType)` or `({ formatId, inputType })` and returns the first match or `null`. `hasExplainer(formatId, inputType)` and `explainerImageUrls(formatId, inputType)` wrap it.
2. `client/src/lib/shinySeries.js` `buildShinyTitleSlide(fmt, groupId, roundId)` — stamps `shinyFormatId: fmt.id`, `shinyInputType: fmt.input_schema.type` (when present), and, if `hasExplainer(fmt.id, fmt.input_schema?.type)`, `parts: EXPLAINER_BEAT_PARTS` copies + `currentPart: 0`.
3. `client/src/components/display/slides/ShinyTitleSlide.jsx` — `getShinyExplainer(slide.data.shinyFormatId, slide.data.shinyInputType)`; warms assets in a `useEffect`; on `currentPart >= 1` renders `EXPLAINER_RENDERERS[definition.rendererKey]` inside `ShinyRulesCard` (`mode: 'rules'`) or bare `ShinyExampleFrame` (`mode: 'sample'`).
4. `client/src/components/display/explainers/ShinyExampleFrame.jsx` — shared layout: optional `action`, optional `scoring[]`, Example label, children. `ShinyRulesCard.jsx` is a 5-line wrapper that passes `definition.action` / `definition.scoring` into it.

## How to add a new format

1. **Registry entry** in `SHINY_EXPLAINERS` (`shinyExplainers.js`), wrapped in `Object.freeze`:
   - selector: `inputType: '<input_schema.type>'` for any format with a phone input schema. Use `formatId` only for a fixed, code-seeded ID (today only `fmt_not_so_different`).
   - `mode`: `'rules'` (action + scoring + example) or `'sample'` (example only, no rules text).
   - `rendererKey`: new string key.
   - `assets`: image URLs to warm (`[]` if none). Set `preloadMapData: true` if the example uses the US map.
   - `action`: one sentence string. `scoring`: array of 1–2 strings, built from imported scorer constants (template literals), never typed numbers.
2. **Export the scoring constants** from the format's scorer in `client/src/lib/` and make the scorer read them (pattern: `BENDLE_STEP_POINTS`, `HUES_CUES_SCORE_BANDS`, `PIN_POINTS` / `PIN_WINNER_FRACTION` / `PIN_MIN_ROOM_FOR_FRACTION`). If a rule exists only as a literal inside scoring logic, extract it first.
3. **Renderer file** `client/src/components/display/explainers/<Name>Explainer.jsx`. Receives `{ definition }`. Renders only the example — the frame supplies action, scoring and the Example label. Use synthetic sample data, never real team guesses or the live answer. Reuse the real format surface (e.g. `UsMap`, `getHuesCuesGrid`, the real scorer) over hand-drawn stand-ins.
4. **Wire the key** in `ShinyTitleSlide.jsx`: import the component and add `<rendererKey>: Component` to `EXPLAINER_RENDERERS`. That map holds no format IDs; eligibility stays in the registry.
5. **Asset warming** is automatic from `definition.assets` (`warmImages`) and `definition.preloadMapData` (`preloadUsMapData`). Add a new flag + branch in the same `useEffect` only if a new asset kind needs it.
6. Nothing in the builder or host needs a separate allowlist — `buildShinyTitleSlide` picks it up through `hasExplainer`. Only titles it builds from then on get the beat; saved titles do not change. (`shinyTitleMigration.js` also calls `buildShinyTitleSlide`, so a re-run of that migration would stamp the beat on titles it creates.)

## Current coverage

Point values below are what the code produces today.

- **Not So Different** — `formatId: 'fmt_not_so_different'`, `mode: 'sample'`, key `notSoDifferent`. Four One Direction headshots (`/explainers/not-so-different/{harry,niall,louis,zayn}.jpg`), "What connects them?", answer. No rules/scoring text by design. ~9.5s timeline.
- **Bendle** — `inputType: 'bendle'`, key `bendle`. Scoring line from `BENDLE_STEP_POINTS` = **30 / 20 / 10** by step (changed back to 30/20/10 in `e560893`). Reference only: Ben grades by hand via Quick Entry; there is no phone entry and no auto-scoring. Example: three static waveform stages (1, 2, 3 layers) labeled Step 1–3 with points.
- **Pin It** — `inputType: 'pin'`, key `pinIt`, `preloadMapData: true`. Lines: "Top 40% (rounded up) earn +10 points." and "Under 5 teams: closest pin only. Ties at the rounded-mile cutoff also score." (40 = `PIN_WINNER_FRACTION` 2/5, 10 = `PIN_POINTS`, 5 = `PIN_MIN_ROOM_FOR_FRACTION`). Example: five sample pins around a sample target near Detroit, scored by the real `scorePinRound` (room of 5, so 2 score).
- **Hues, Cues, and Booze** — `inputType: 'hues-cues'`, key `huesCues`. Lines: "Exact +30 · one square +20 · two squares +10." and "Diagonal neighbors count as one square." (from `HUES_CUES_SCORE_BANDS`). Example: 9×9 crop of the real grid around target H15, guess I16, clue "Fresh-cut grass", T/G markers, solid outline = 1 away, dashed = 2 away.

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
- **Text size:** TV-first. Keep action to one sentence and scoring to two lines; the example area is whatever height is left (`flex: 1`), so longer copy shrinks the example.
- Team-facing map examples pass `showCities={false}` — city names would give answers away.

## Known gaps in the code (as of `e560893`)

- `HuesCuesExplainer.jsx` hard-codes "+20 points" for the sample guess instead of reading `HUES_CUES_SCORE_BANDS[1].points` — the one place card copy can drift from the scorer.
- `ShinyTitleSlide.jsx`'s header comment lists the title `data` shape without `shinyInputType`, `parts`, or `currentPart`.
- `client/src/lib/shinyExplainers.test.js` covers only the Not So Different ID path; no test for `inputType` lookup or the rules entries, and `shinySeries.test.js` has no `shinyInputType` assertion. Tests were not run.
