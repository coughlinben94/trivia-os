# "And They're Off!" — Shiny Format Spec (horse-race reveal)

Date: 2026-09-14
Status: design, checked against the codebase at `af1d9fa`. Not yet planned or
built. Follows the same spec-then-feasibility process as today's Flip 'Em Down!
spec (`2026-09-14-flip-em-down-shiny-spec.md`), which has since shipped and is
the concrete precedent this design copies.

## Concept (Ben's shape, 2026-09-14)

Host presents 4 real, named contenders and a real historical dataset — four
1994 movies and their weekly box office, say. Teams write down which ONE of
the 4 ultimately won. Plain paper answer, graded like any other question.

The reveal is the show: the host triggers an animated horse race. **One lap
around an oval track** (Ben, 2026-09-14 — supersedes the straight-parallel-
lanes draft below this line in the original pass) — four horse-and-jockey
sprites on four concentric lanes of one ellipse, each one's position around
the lap driven beat by beat by the real numbers (one week of box office per
beat), so the horses visibly trade the lead exactly as the real data did,
until the true winner crosses the finish line at the top of the final lap.

**Not a bar chart.** Sprites on a track, a finish line, a gallop bob, a
winner's slam. No axes, no gridlines, no numbers on the track. If it reads as
data-viz it has failed (`references/brand.md`, AI Slop Test).

Worked example (illustrative, not a drafted question):
> "Four movies opened in summer 1994. Which one made the most money by the
> end of the year?" Contenders: The Lion King · Forrest Gump · True Lies ·
> Speed. Ten beats of weekly gross. Lion King bolts early, Gump grinds it
> down and passes it around beat 7. **Forrest Gump.** (Whether that is the
> real outcome is the host's homework — the renderer just draws the data.)

## Architecture decision (resolved)

Two patterns exist for a new shiny format:

- **Pattern A — own top-level `slide.type`** with its own `SLIDE_COMPONENTS`
  entry, rendered outside `QuestionSlide.jsx`: `grid`, `venn`, `flip-em-down`.
- **Pattern B — stays `slide.type: 'question'`**, dispatched inside
  `QuestionSlide.jsx` on `shinyInputSchema.type`: wager, list, matching,
  order, choice, bendle.

**Pattern A.** Same reasoning that resolved Flip 'Em Down!, plus one more:

1. **The staged-reveal blocker is already solved, by Flip 'Em Down!, in
   Pattern A.** This morning's Flip 'Em Down! spec found that the shared
   stepping system (`isConcurrentShiny`/`revealStepCount` in
   `shinySeries.js`, `computeNextStep` in `slideStepping.js`) only does
   cumulative per-press reveal for text-type `parts[]`. Flip 'Em Down!
   sidestepped it with a **local step field on the slide's own data**
   (`data.elimStep`, 0–3), advanced by its own "Next Hint" button in
   `LiveMode.jsx` (line ~1197), reset on fresh entry by `withEntryState()` in
   `slideStepping.js` (line ~181), synced through the ordinary
   `updateSlide` → Realtime path. That shipped today (`e9925b5..af1d9fa`).
   A race is the same class of thing — one host-triggered local state
   change that the TV renders as a staged animation — so it copies that
   exact mechanism. Nothing in the shared stepping system is touched.

2. **The race owns the whole canvas.** `QuestionSlide.jsx`'s `StandardQuestion`
   layout (badge, question text, caption sites, media split) does not apply
   to four lanes and a finish post. Pattern B components still live inside
   that file's dispatcher and inherit its assumptions; `flip-em-down` and
   `venn` show that a full-canvas fixed design is cleaner as its own type.

3. **No phone mechanic.** Pattern B's real payload is `PHONE_MECHANICS`
   (lock/reveal/results fields, `phone_answers`, per-type lock handlers in
   `LiveMode.jsx`). This format has none of that — teams write on paper. Nothing
   in that table is added.

What Pattern A costs, every site enumerated (all verified against the
`flip-em-down` wiring at `af1d9fa`, `grep -rn "flip-em-down" client/src`):

| Site | Change |
|---|---|
| `shiny_formats` row (DB, seeded by hand like Flip's Task 1) | `input_schema: { type: 'race' }` |
| `lib/shinyWizardKinds.jsx` | `FIXED_SHAPE_KINDS.race = { hasOwnControls: false, buildSlideData: buildRaceSlide }` |
| `display/slides/RaceSlide.jsx` (new) | the renderer |
| `display/SlideRenderer.jsx` | `SLIDE_COMPONENTS['horse-race']`, and add `'horse-race'` to the opacity-neutralize list at line ~268 (fixed opaque design — same reason `flip-em-down` is there) |
| `views/Display.jsx` | add `'horse-race'` to `FULL_BLEED_SLIDE_TYPES` (line 101) |
| `host/RoundSidebar.jsx` line ~65, `views/Host.jsx` line ~335 | label fallback, same one-liner Flip has |
| `host/SlideEditor.jsx` | `RaceEditor` (sibling of `ElimEditor`, line ~2501) + dispatch at line ~259 |
| `host/LiveMode.jsx` | "🏁 Start Race" / "↺ Reset" buttons, same block shape as Flip's Next Hint (line ~1197) |
| `lib/slideStepping.js` `withEntryState()` | reset `raceStartedAt` to `null` on fresh entry, gated on `!protectInProgress`, exactly like the `elimStep` reset at line ~187 |
| `lib/questionRows.js` | `case 'horse-race'` archive row (see Archive below) |
| `views/Join.jsx` `SlideBody` | `case 'horse-race'` (see Phones below) |

**Do NOT mount `ShinyGroupAnnounce`.** `FlipEmDownSlide.jsx` at `af1d9fa` still
imports `../ShinyGroupAnnounce.jsx`, but that file was deleted in `9be7685`
("redundant ShinyGroupAnnounce corner-banner is gone") — the announce beat is
the separate `shiny-title` slide `AddSlideWizard`'s `addShiny()` prepends. A
fix to Flip's import is staged in the working tree by another session as of
this writing; the new renderer must not repeat the import.

## Data model

`shiny_formats` row: `{ name: "And They're Off!", icon: '🏇',
input_schema: { type: 'race' } }`. Fixed shape — always 4 contenders. Beat
count is per-slide, not per-format.

Slide `data` (stamped blank by `buildRaceSlide`, filled in `RaceEditor`):

```js
{
  questionNumber, questionLabel, questionMode: 'shiny', isShiny: true,
  shinyFormatId, shinyFormatName, shinyFormatIcon,
  text: 'Which of these four made the most money by the end of 1994?',
  contenders: [                       // exactly 4, fixed order = lane order top→bottom
    { id, name: 'The Lion King', imageUrl: null },   // imageUrl optional (poster/headshot chip)
    { id, name: 'Forrest Gump',  imageUrl: null },
    { id, name: 'True Lies',     imageUrl: null },
    { id, name: 'Speed',         imageUrl: null },
  ],
  beats: [                            // 2–20 entries, each = one step of the race
    { label: 'Week 1',  values: [40.9, 24.5, 25.9, 14.5] },   // values[i] ↔ contenders[i], per-beat increment
    { label: 'Week 2',  values: [34.2, 31.1, 20.8, 12.4] },
    // …
  ],
  raceStartedAt: null,                // epoch ms once the host starts the race; null = at the gate
  answer: 'Forrest Gump',             // derived by RaceEditor = leader's name after the last beat; feeds the A-key overlay + archive
}
```

Rules:

- `values` are **per-beat increments** (that week's gross). The renderer sums
  them into running totals; a horse's position at beat *k* is its running
  total through beat *k*. That is what makes it a race to a line — progress
  is monotonic, lead changes are real, and the horse with the biggest final
  total is the one that crosses. Absolute-mode data (chart position, poll
  share) is out of scope; see Open Questions.
- Values must be non-negative numbers. Editor rejects blanks/negatives per
  cell with an inline warning; the renderer treats a missing cell as `0`.
- `answer` is **derived, not typed.** `RaceEditor` recomputes it on every
  `beats`/`contenders` edit and writes it into `data.answer`. There is no
  second typed answer field — today's Hues and Cues spec records the
  2026-09-06 production bug from two controls writing the same answer. A
  final-beat tie leaves `answer` empty and shows a warning (below).
- `raceStartedAt` is the **only** live-state field. Named for what it holds
  (a timestamp) rather than a boolean, so the display can seek — see Seek
  below. Deliberately not `elimStep`/`currentPart`/`wagerRevealed` — each of
  those names is load-bearing for a different mechanism.
- No `introDone`, no `parts[]`, no `shinyDisplay` — checked
  `buildElimSlide`/`buildVennSlide` in `shinyWizardKinds.jsx`; own-type
  formats carry none of them.

Beat count guidance (a live-pace constraint, not a hard rule in code): the
editor defaults to 10 beats and allows 2–20. At the renderer's 700 ms per
beat, 10 beats is 7 s of racing + a ~1.5 s finish moment; 20 beats is 14 s +
1.5 s. Both well under a minute of TV time. Anything past 20 is a chart
pretending to be a race; the editor caps it.

## Display: `RaceSlide.jsx` (new, `display/slides/`)

### Layout (1920×1080 stage, full-bleed)

- Background `theme.colors.shinyBg`, the fixed-gold ✨ badge top-left and the
  gold glow burst on mount — copy `FlipEmDownSlide.jsx` lines 71–79 verbatim
  for shiny-signal consistency (`SHINY_GOLD`/`SHINY_GOLD_GLOW` from
  `lib/shinyGold.js`, never re-hardcoded).
- Question text (`data.text`) in a top band, `theme.fonts.display`, fitted
  with `fitToBox` from `lib/autoFitText.js` (same as every fixed-region
  slide). Present because phones show the same text; skipped if blank.
- **One oval track, four concentric lanes** (real racetrack shape, not
  parallel straight lanes). The track is a single ellipse centered in the
  middle ~62% of the stage; lane *i* (0 = innermost, contender order from
  `data.contenders`) is a smaller ellipse than lane *i+1*, each lane a fixed
  radial gap apart. Track surface is a flat `linear-gradient` ring
  (`theme.colors.bgDeep` toward transparent, no hard edges, per
  `references/themes.md` rule 6) with a faint rail stroke per lane boundary.
  A label chip for each contender (name in `theme.fonts.display`, optional
  `imageUrl` thumbnail) sits outside the outer lane, positioned near that
  lane's starting point, connected to the sprite by a short leader line —
  labels do not ride the track (they'd rotate upside-down on the back
  stretch).
- **Per-lane wrapper = that lane's bounding box**, the same "percent is
  right in both real DOM and the scaled preview" trick the straight-lane
  draft used, generalised to two axes: lane *i*'s wrapper is
  `position: absolute; inset: 0; margin: auto; width: ${2×rx_i}%; height:
  ${2×ry_i}%` — a box centered on the shared track center, sized to exactly
  that lane's ellipse bounding box, where `rx_i`/`ry_i` are percentages of
  the track container. The sprite is centered inside the wrapper (`position:
  absolute; top: 50%; left: 50%`). A sprite at lap fraction *f* (0 at the
  start/finish line, 1 = one full lap) sits at angle `θ(f) = -90° - f×360°`
  (start at the top of the ellipse, run counter-clockwise, the racing
  convention) and its transform is
  `translate(calc(cos(θ)×50%), calc(sin(θ)×50%))` — 50% of the *wrapper's
  own* width/height is exactly `rx_i`/`ry_i`, so this needs no pixel math
  and no `getBoundingClientRect`, identical in the TV render and inside
  `SlideCanvasEditor`'s `transform: scale(k)` preview.
- **Facing direction:** the horse-and-jockey sprite art faces right (running
  pose). On the top half of the ellipse (`sin θ < 0`, moving right-to-left
  as counter-clockwise motion crosses the top) it renders mirrored
  (`scaleX(-1)`); on the bottom half it renders as-drawn. This flips exactly
  twice per lap, at the two points where the path crosses horizontal — bake
  it into the same per-beat keyframe stop as the position transform, don't
  compute it live.
- **Finish line** at the start point (top of the ellipse, `θ = -90°`): a
  radial bar in `SHINY_GOLD` crossing all four lanes with a checkered
  flag pattern drawn via `repeating-conic-gradient` (a checker, not the
  banned `repeating-linear-gradient` diagonal stripes). Static, no
  animation. Because every lane starts and finishes at this same angle,
  the finish line reads correctly for all four lanes without per-lane
  offset math.
- Beat caption bottom-center: the current beat's `label` ("Week 6"), in
  `theme.fonts.body`. Updates once per beat, not per frame (see Timeline).
- Safe-area note: Critical Rule 6 (keep the centre 60%×45% clear) governs
  *ambient* layers under question text. Fixed-design content slides
  (`grid`, `venn`, `flip-em-down`) fill the centre by design, and so does
  this one. The persistent chrome — `QuestionCounter` top-right,
  `BaynesWatermark` bottom-right — is mounted by `Display.jsx` and stays.

### Sprites

Ben asked for sprites, not bars, so this is the one real asset question.
`references/brand.md` bans hand-drawn SVG illustrations ("real assets or
nothing"); `references/themes.md` bans copyrighted characters; and
`concepts/OBJECT-RENDERING-PROTOCOL.md` (2026-07-26 addendum) requires any
generated figurative element to be flat/icon register, palette-clamped, and
to pass the "doesn't look AI-generated" bar. The plan:

- **Four repo assets** at `public/race/horse-1.png … horse-4.png` (Vite
  `publicDir` is repo-root `public/`, same place `drum-roll.mp3` and
  `baynes-logo.svg` live): a horse-and-jockey side profile, running pose,
  transparent background, ~400×300 px source, the same drawing in four
  jockey-silk colours. Generated via Recraft in `icon` style, background
  removed, palette snapped to four fixed silk colours chosen for contrast
  on every `shinyBg` (the same fixed-signal reasoning `TIER_TINT` in
  `ShinyWagerQuestion.jsx` uses — silks are a race signal, not a theme
  colour). Same pipeline as the `/apples` cutouts
  (`reference_apple_photo_recipe`: real reference → `create_style` →
  raster → `remove_bg` → tight crop).
- **Two frames per horse** would make a real gallop; **one frame plus a
  transform bob** (below) is the lazy version and is what this spec commits
  to. Upgrade to a 2-frame sprite swap only if the bob reads flat on the
  TV — two stacked `<img>`s toggling `opacity` with a `steps(2)` keyframe,
  still GPU-only (never `background-position`, which is a banned animated
  property).
- Lane *i* always uses `horse-{i+1}.png`. No per-slide sprite choice.
- **Build placeholder:** until the four PNGs pass Ben's eye, the renderer
  uses the `🐎` glyph at the same box size so every other part of the
  feature can be built and reviewed. The glyph is explicitly *not* the
  ship state.

### Timeline and motion (GPU-only, off the main thread)

The whole race is **CSS `@keyframes`, generated per slide from the data and
injected via `<style>`** — the same injected-keyframe pattern every bespoke
ambient in `ParticleBackground.jsx` already uses. No `rAF`, no per-frame React
state, no Framer Motion on the lanes.

- For lane *i*, compute running totals `T_i[k]` for beats `k = 1..N`, then
  the lap fraction `f_i[k] = T_i[k] / max_j T_j[N]`. The divisor is the
  **final running total of the eventual winner** — one number for the whole
  race — so the winner's fraction reaches exactly `1` (one full lap, crossing
  the finish line) and no lead ever visually resets. (This is the "normalise
  against the max across the whole series, not per beat" requirement,
  unchanged from the straight-track draft — only the fraction's meaning
  changed, from "% along a straight" to "% of one lap".)
- Convert each stop's fraction to an angle: `θ_i[k] = -90 - f_i[k] × 360`
  (degrees). Emit one keyframe block per lane: stop `0%` at
  `translate(calc(cos(-90deg) × 50%), calc(sin(-90deg) × 50%)) scaleX(1)`
  (the gate position, top of the ellipse), then stop `(k / N) × 100%` at
  `translate(calc(cos(θ_i[k]) × 50%), calc(sin(θ_i[k]) × 50%))
  scaleX(${sin(θ_i[k]) < 0 ? -1 : 1})` for each beat — CSS `calc()` with
  `cos()`/`sin()` trig functions (Baseline 2023, fine for the show's
  fixed browser) takes the angle directly, no JS-side trig-to-percent
  conversion needed in the generated string beyond computing `θ_i[k]`
  itself. Each segment gets `animation-timing-function:
  cubic-bezier(0.4, 0, 0.2, 1)` (`EASE_BAR`'s value — generated CSS text
  can't import the JS array, same as the Tailwind className case noted in
  `SKILL.md`), so each beat reads as a surge-and-settle rather than a
  constant-speed slide. Duration `N × BEAT_MS` with `BEAT_MS = 700`,
  `fill-mode: forwards`.
- Base transform rule: the wrapper's inline `transform` is the gate position
  (`f = 0`, top of the ellipse) normally — the running animation overrides
  it — and the lane's final position (`f = f_i[N]`) only under reduced
  motion, where the animation is `none` and the base transform is what
  shows. Spell this out in code — getting it backwards puts every horse at
  the finish before the race starts.
- Gallop bob: a second, shared keyframe on the sprite's inner wrapper —
  `translateY(0) → translateY(-6px) → translateY(0)` at ~280 ms, `infinite`
  while running, with per-lane `animation-delay` offsets from a prime-number
  stagger so the four never bob in sync (`references/themes.md` timing
  floors). Stops at finish.
- Beat caption: one `setInterval(BEAT_MS)` that increments a `beat` state
  from `floor(elapsed / BEAT_MS)` (see Seek) up to N, cleared on
  finish/unmount. One React update per beat — the sanctioned
  loop-boundary exception in `references/themes.md` rule 4, not continuous
  per-frame state.
- **Finish moment:** listen for `animationend` on the winner's lane
  (`e.animationName` guard — the bob keyframe on the child bubbles too; see
  the Hard-Won Fixes "guard every animationiteration listener" note, which
  applies to `animationend` identically). On fire: winner lane label chip
  scales `1 → 1.06` with a gold ring (`0 0 0 3px SHINY_GOLD` static
  `box-shadow`, same as Flip's confirmed card), the other three lanes drop to
  `opacity 0.55`, and the winner's name slams into the bottom band
  (`EASE_DROP`, `initial { y: 40, opacity: 0 }`, 320 ms — Framer Motion is
  fine here, it is a one-shot, not the race). Hold until the host advances.
- `prefers-reduced-motion`: `animation: none !important` on every lane and
  bob; sprites render at their **final** `f_i[N]` positions immediately, the
  winner treatment applies immediately with opacity-only entrance, the beat
  caption shows the last label. The race is skipped, the standings are not.
  (Critical Rule 3; `useReducedMotion()` for the Framer one-shot, the media
  query for the CSS.)

### Seek (why `raceStartedAt` is a timestamp)

On mount, `elapsed = Date.now() - raceStartedAt`. Every race keyframe gets
`animation-delay: -${elapsed}ms` — a negative delay starts a CSS animation
partway through with no JS seeking. So a TV reload, a Realtime reconnect, or
a host preview opened mid-race lands on the right frame, and `elapsed ≥
total` renders straight into the finished state (set `beat = N`, apply the
winner treatment, no listener needed). Host laptop and TVs are one machine
over HDMI (`SKILL.md` Physical Setup), so there is no clock skew to
arbitrate; a second `/display` on another device would be at most a
network-latency fraction of a beat off.

`raceStartedAt: null` renders the gate: all four sprites at `translateX(0)`,
caption "At the gate", no bob. That is also what Build Mode's
`SlideCanvasEditor` preview shows, since it renders the real
`SlideRenderer` tree and nothing sets the timestamp there.

### Transition and backdrop

`SlideRenderer.jsx`: add `'horse-race'` to the opacity-neutralize list (line
~268) so the fixed `shinyBg` design never fades the ring world through. It
already takes the `shiny` entrance variants by `isShiny`. `Display.jsx`: add
to `FULL_BLEED_SLIDE_TYPES` so `StageFrame` renders it at scale 1.

## Host control (Live Mode)

One button block in `LiveMode.jsx`'s nav bar, gated on
`currentSlide?.type === 'horse-race'`, same tier and same shape as Flip's
Next Hint block (line ~1197):

- **"🏁 Start Race"** — `actions.updateSlide(id, { data: { ...data,
  raceStartedAt: Date.now() } })`. Disabled once set.
- **"↺ Reset"** — writes `raceStartedAt: null`. Enabled once set. For the
  "wait, we weren't watching" case. Cheap, and it is the only recovery path
  short of leaving and re-entering the slide.

**Not the Stream Deck A key.** All four keys are spoken for (`SKILL.md`
Physical Setup). The A key keeps its ordinary meaning on this slide: the
generic `AnswerRevealOverlay` in `Display.jsx` (line ~511) reads
`resolveShinyPart(data).answer` — the derived winner's name — and is **not**
added to the `isWagerShiny` suppression check. It is the grading check after
the race, the same way Flip 'Em Down!'s spoken answer is. A premature A
press does spoil the winner; that is true of every paper question in the
show and is a host discipline matter, not something to gate in code.

Order of a live run: Next onto the slide (gate state) → host reads the
question, teams write → "🏁 Start Race" → race plays, finish holds → A key
for the answer card (optional) → Next.

`withEntryState()` clears `raceStartedAt` on fresh forward entry (gated on
`!protectInProgress`, exactly the `elimStep` block at `slideStepping.js`
line ~181), so a rehearsal's finished race never bleeds into the real show.
Backing into the slide or jumping in from the Go Live picker preserves it.

**RT-1 landmine applies.** `raceStartedAt` rides inside `slides` jsonb, so
this is a `slides` write, not a flag-only column — the payload always
carries `slides`. Nothing new here, but the plan must not "optimise" it into
a separate column without reading the RT-1 note in `SKILL.md` first.

## Host authoring: `RaceEditor` in `SlideEditor.jsx`

Sibling of `ElimEditor` (line ~2501), dispatched at line ~259 on
`slide.type === 'horse-race'`. Right rail stays content-only (hard rule).

- **Question text** — one `TextArea` → `data.text`.
- **Contenders** — 4 fixed rows: name `TextInput` + `MediaUpload`
  (`accept="image"`, optional). Copy `ElimEditor`'s `uploadItemPhoto` shape
  including its `result?.url` unwrap — `onMediaUpload` resolves to
  `{url, type, filename}`, not a bare URL (a real bug Flip hit).
- **Beats table** — `NumberInput` for beat count (2–20, default 10; growing
  appends blank rows, shrinking truncates with a confirm if the dropped
  rows have data). Below it a grid: one row per beat with a `label`
  `TextInput` (placeholder "Week 1") and 4 numeric `TextInput`s in contender
  order. Column headers are the contender names, live.
- **Paste from spreadsheet** — a single textarea above the table: paste
  N rows × 4 (or 5, label first) tab/comma-separated numbers, click Apply,
  it fills the table. Run `cleanPastedText()` from `lib/cleanPaste.js` on
  the raw paste first (it already strips Word/Docs artifacts). This is how
  Ben will actually enter ten weeks of four numbers; the cell grid is for
  corrections.
- **Winner line** (read-only, always visible): "🏆 Forrest Gump wins by
  $12.4 — Lion King leads beats 1–6, Gump takes it at beat 7". Computed from
  the same running-total math the renderer uses (extract it to
  `lib/raceMath.js` so editor and renderer cannot disagree — the same
  single-source-of-truth pattern `wagerScoring.js`/`choiceScoring.js`
  follow). Writes `data.answer` on every change.
- **Warnings** (amber, inline, never blocking save — matches Flip's
  survivor-count pattern): final-beat tie ("Two contenders tie — the race
  has no winner, fix the data"; `answer` cleared); any blank/negative cell;
  fewer than 2 beats; a contender with no name; a beat where nobody moves
  (all zeros — "this beat is a dead frame").
- **No "Preview race" button in the editor.** The canvas preview shows the
  gate state; the race is verified in `/display?preview=true` or by Go
  Live on a test show. See Open Questions.

`buildRaceSlide(ctx)` in `shinyWizardKinds.jsx` stamps 4 blank contenders
(`nanoid(6)` ids), 10 blank beats, `raceStartedAt: null`, `text` from the
wizard's question field, `answer: ''`. `hasOwnControls: false` — the wizard
goes straight from picking the format to creating the slide, same as Flip.
The wizard's shared Answer field is required for fixed-shape formats
(`sharedAnswerRequired`, `AddSlideWizard.jsx` line ~431); for this format
that typed answer is discarded because the editor derives it — the plan
should either hide the wizard's answer field for `shinyFmtType === 'race'`
(the `bendle` gate at line ~424 is the precedent) or keep it as a
harmless pre-fill that the first editor edit overwrites. Hiding it is
cleaner; either is acceptable.

## Phones (`/join`)

`Join.jsx` `SlideBody` falls to the `default` branch for unknown types,
which for a slide with `text` shows the text and otherwise "Look up at the
screen 👀". Add `case 'horse-race'` modelled on the `venn` case (line ~765):
question text, then the four contender names as a plain list — the pick
list a team needs while writing. Nothing about the race, no values, no
winner, before or after (`/join` is a reference device, not a performance
screen; and the values would let a team compute the answer). `SlideContent`'s
`bare` check is `slide.type === 'question'`-gated so this type gets the
normal `ShrinkToFit` wrapper for free.

## Scoring

Plain pick-one-of-4 paper answer. Ben grades it by walking the room and
enters points via `ScoreboardModal` Quick Entry like any regular question.
No `PHONE_MECHANICS` entry, no `phone_answers` rows, no `*_scoring.js`, no
lock/reveal fields, no results snapshot. The only scoring-adjacent code is
the derived `data.answer` for the A-key overlay and the archive.

## Archive (`lib/questionRows.js`)

`case 'horse-race'`: `type: 'shiny'`, `text: data.text`, `answer:
data.answer`, `is_shiny: true`, `shiny_type: 'race'`, `shiny_format_name`,
`questions_data: { contenders, beats }` (the `questions` table has no media
column; `imageUrl`s ride inside `questions_data` as strings and are not
otherwise preserved — same limitation as every other shiny archive row).
Return `null` when both text and answer are blank, as the other cases do.

## Known pre-existing gap, flagged not fixed

`lib/questionNumbering.js` line 41 and `AddSlideWizard.jsx` line 190 count
only `question`/`pixelate-series`/`grid` when numbering questions in a
round. `venn` and `flip-em-down` are already skipped, so a round with Q1,
Q2, a Venn, then Q3 numbers the last one Q3 rather than Q4. `horse-race`
inherits that gap. Fixing it means adding the own-type formats to both
lists (and `nonBonusQ` at line 190) — a small, separate change that touches
existing shows' numbering, so it is out of this spec's scope and needs its
own sign-off.

## Tests (unit, vitest — `scripts/ship.sh` runs the suite as a deploy gate)

- `lib/raceMath.test.js`: running totals; fraction normalisation uses the
  winner's final total (winner's last fraction is exactly `1`, and a mid-race
  leader's fraction never exceeds `1`); leader-per-beat sequence for the
  winner-line copy; tie → `winner: null`; missing cells read as `0`.
- `display/slides/RaceSlide.test.jsx` (pattern: `FlipEmDownSlide.test.jsx`):
  gate state renders four wrappers at `translateX(0%)` and no bob; a
  `raceStartedAt` in the past beyond total duration renders the finished
  state (winner treatment present, caption = last label) without waiting;
  generated keyframe text contains `N + 1` stops per lane; reduced-motion
  renders final positions with `animation: none`.
- `slideStepping.test.js`: `withEntryState` clears `raceStartedAt` on fresh
  entry and preserves it with `protectInProgress`.

## Open questions for Ben (sign off before planning)

1. **Sprite source.** Recraft-generated 4-silk horse-and-jockey PNGs per
   `OBJECT-RENDERING-PROTOCOL.md`, or something else (Ben-photo heads on
   horses, à la `BattleshipDuel.jsx`'s `HEAD_IMG`)? The `🐎` glyph is the build
   placeholder only. This is the one item that blocks the *finished* look
   but not the build.
2. **Cumulative only?** This spec sums per-beat increments (box office,
   sales, votes tallied). Data that is already a standing (chart position,
   poll share, standings points) would need an "absolute" mode where the
   track is normalised to the series max and the winner is whoever is ahead
   at the last beat, not whoever reaches the post. Left out — say if a real
   question needs it and it becomes a one-flag addition in `raceMath.js`.
3. **Beat pace.** 700 ms per beat, 10 beats default. Faster feels like a
   sprint, slower gives the room time to react to each lead change. Tunable
   constant; pick after seeing it on the TV.
4. **Values on screen?** Spec shows none on the track (not a chart). One
   option is the winner's final total in the finish slam ("$329.7M").
   Requires a per-slide unit/format field. Left out until asked.
5. **Reset button.** Keep it, or is Prev+Next (which re-enters the slide and
   clears `raceStartedAt` via `withEntryState`) enough? Prev+Next is free;
   the button is ~10 lines.
6. **Editor preview.** No in-editor race playback. If authoring without
   seeing it run hurts, the cheapest add is a "▶ Preview" button that sets a
   *local-only* timestamp on the data passed to `SlideCanvasEditor`'s
   preview (never saved). Skipped for now.
7. **Question-numbering gap** above — fix now alongside this, or leave?
