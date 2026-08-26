# Shiny Question Suite Rebuild — Design

Date: 2026-08-25
Status: design in review with Ben, not yet planned or built.

## Goal

Tonight's live show (2026-08-25) hit a cascade of shiny-question bugs, several traced
to the creation flow in `AddSlideWizard.jsx`. The live-blocking ones are fixed; this
spec is the rebuild Ben asked for afterward — his words: "completely on the wrong
page" compared to PowerPoint, and "this is a full full full rebuild." Scope is
**the shiny suite specifically** — the flow from picking a format to a finished,
correctly-shaped shiny question — described here as one complete project, not a
staged patch series.

The target flow, in Ben's own framing: pick a format → that's the main slide (the
shiny title card) → type how many **assets** come after it ("if i type in 3, it adds
three subslides" — 1 title + 3 assets) → on the **same popup**, answer one question:
are these assets tied together shown one at a time, tied together shown all at once,
or separate questions. That's the whole creation surface. Everything else (per-asset
text, answers, media) is filled in afterward in the slide editor, where it already
lives today.

("Asset" is the word for what the current code and UI variously call subslides,
parts, slots, and slides-after-the-title — Ben: "change word slides to assets."
The persisted field name stays `data.parts[]`; "assets" is the concept and the UI
copy. Used consistently below.)

### What's broken today

**UX:** the wizard's shiny details step is a branch tree the host can't predict.
Which inputs appear depends on `isConcurrentFmt` / `isImageFmt` /
`isQuestionSeriesFmt` / `hasAssetPreset` / `supportsMultiPart` / `batchMode`
(`AddSlideWizard.jsx:408-431`) — six flags computed from the format's
`input_schema`, most of them invisible to the host at pick time. Two different
number inputs ("How many parts on this question?" line 595, "How many subslides?"
line 651) appear or vanish based on flags the host never set knowingly. The same
conceptual choice — tied together vs separate — is only offered for image/concurrent
formats (the `batchMode` toggle, line 553-576), not for audio/video/text/list
formats at all.

**The single most load-bearing bug — the preset lock.** A format created with a
fixed asset count (`shiny_formats.input_schema.slots`) silently *hides* the count
input entirely (`!hasAssetPreset &&` gates at lines 593 and 649) and hard-overrides
whatever the host wants (`AddSlideWizard.jsx:216-218` and `:306` —
`totalSlots = hasAssetPreset ? fmtAssetPreset : ...`). Tonight a host stared at a
value he could not change and had no idea why. In this rebuild the preset becomes a
pre-filled **default** the host can always edit — the smallest, most load-bearing
single fix in this document, shipped as part of the one rebuild, not split out.

**Technical debt the council's code-verified review found:**

- The sequential-vs-concurrent decision is duplicated: `isConcurrentTextShiny()`
  exists in `shinySeries.js:109-111`, but `QuestionSlide.jsx`'s dispatcher restates
  the same condition inline (`QuestionSlide.jsx:1321` — `data.shinyInputSchema?.type
  === 'text' && data.shinyInputSchema?.concurrent === true && ...`) instead of
  calling it. `slideStepping.js`'s `revealStepCount` (lines 39-43) calls the real
  function. Two of three sites agree by luck.
- **Latent grouping bug:** `isShinySeriesSibling` (`shinySeries.js:119-125`) groups
  sibling slides on `roundId + shinyFormatId + seriesTheme` — and `seriesTheme` is
  stamped as the *format's name* (`AddSlideWizard.jsx:256`). Two separate runs of
  the same format in the same round are therefore indistinguishable and silently
  merge into one group: the second run's intro beat gets skipped
  (`computeNextStep`'s `skipIntro`, `slideStepping.js:502`) and the sidebar
  collapses both runs into one row (`RoundSidebar.jsx:18-29`). Nobody has hit this
  live yet only because nobody has run the same format twice in one round.
- Creation-time branching bakes the *rendering* decision into the slide's **type**:
  a non-concurrent image format with N>1 assets becomes a `grid` slide
  (`AddSlideWizard.jsx:265-279`) with the `columns[][]` shape, while the same
  format concurrent becomes a `question` slide with `parts[]`. Same host intent,
  two permanent shapes, chosen by format flags at creation and unchangeable after.

## Non-goals

- **Not the whole slide builder.** Round intros, custom slides, pre-show, PYL,
  grading breaks, team-picker — untouched. Only the shiny path through
  `AddSlideWizard` and what it produces.
- **Not `questionSeries`.** Shared-answer vs per-asset-answer scoring semantics
  (`input_schema.questionSeries`, `AddSlideWizard.jsx:196`, `FormatLibrary.jsx:
  204-217`) is an orthogonal knob and stays exactly as it is.
- **Not the phone-scored mechanics.** Matching, wager, order, venn keep their flat
  data shapes, lock/reveal ceremonies, and `slideStepping.js` handling unchanged.
- **Not a data migration — ever.** Old shows keep rendering exactly as they do
  today, forever, through legacy read paths (detailed per-field below). This is a
  live production app with weekly shows and no mid-show rollback; "no backfill, no
  rewrite" is a hard constraint of this design, not a preference.
- **GridSlide is not eliminated.** `grid` remains a first-class slide type with its
  own editor and renderer — it is also used by non-shiny grid formats (the "Color
  Schemes" style formats, `SKILL.md` slide-type table). The rebuild stops *choosing*
  it via format-type branching at creation; it does not delete it.

## The new creation flow

Pick format (unchanged picker, `AddSlideWizard.jsx:824-900`) → **one popup**, the
same popup for every asset-capable format regardless of media type:

1. **Round selector** — unchanged.
2. **"How many assets?"** — one number input, min 1, max 20. Pre-filled from the
   format's `input_schema.slots` when it has one, **always editable**. Helper copy:
   *"The title card is automatic — this is how many assets come after it."* Ben's
   count semantics hold exactly: the title card is never a counted item; typing 3
   means title + 3 assets. (In the data this is clean because the title card is the
   existing `ShinyIntroScreen` beat gated on `data.introDone`, not a slide — 3
   assets is literally `parts.length === 3` or 3 sibling slides.)
3. **Relationship — one 3-way segmented choice**, shown whenever assets ≥ 2 (with
   1 asset the three answers are identical, so the control hides and 'sequential'
   is stamped):
   - **Tied together — one at a time** (`sequential`): ONE slide, `data.parts[N]`,
     Next steps through assets. Today's multi-part series behavior.
   - **Tied together — all at once** (`concurrent`): ONE slide, `data.parts[N]`,
     everything on screen together. Today's `ShinyConcurrentQuestion` behavior for
     text; the GridSlide adapter (below) for media.
   - **Separate questions** (`separate`): N literal sibling slides, each its own
     Q-number, sidebar row, Next-press, phone submission, and score. Today's
     `batchMode === 'many'` path, now offered for every format, and stamped with a
     `shinyGroupId` (below).
4. **Question text / Answer** — shown for the two tied modes (they store at slide
   level: `data.text`/`data.answer`; `resolveShinyPart` already falls back
   `part.answer || data.answer`, `shinySeries.js:25`, so a slide-level answer works
   with zero renderer changes). Hidden for `separate` — N distinct questions can't
   share one typed answer; those slides start blank and are filled in the editor,
   exactly as the current batch path does (`AddSlideWizard.jsx:220-224`).

Ben chose the 3-way ask explicitly ("ask each time, as a 3rd choice") over
hardcoding one display mode per format — so the popup always asks, and the format
can only pre-select, never decide.

**Fixed-shape formats skip steps 2-3 visibly, not via hidden branching.** Formats
whose mechanic has no variable asset count — `matching`, `wager`, `order` (the
current `FLAT_SHAPE_TYPES`, `AddSlideWizard.jsx:422`), plus `venn` (fixed 3+3 cast,
lines 171-190) and `grid` (its own cols×rows pickers, lines 682-703) — get the same
popup minus the count and relationship controls, keeping whatever bespoke inputs
they already have. The popup simply doesn't ask what doesn't apply; there is no
mode where the host wonders why an input is missing, because the missing inputs
are the whole point of a fixed-shape format.

**What gets deleted:** `batchMode`, the mutually-exclusive one/many toggle and its
2026-08-25 incident workaround (`AddSlideWizard.jsx:60-77`), the two competing
count inputs, the `isImageFmt`-vs-`isConcurrentFmt` fork in `handleCreate`
(lines 192-296 collapse to one path keyed off the relationship choice), and the
`hasAssetPreset` input-hiding gates. `slideCount`/`assetCount` become one count +
one relationship.

## Data model

### Today's shapes (all stay readable forever)

```js
// Flat single-asset shiny (the majority of existing questions)
data: { isShiny: true, shinyFormatId, shinyFormatName, shinyFormatIcon,
        shinyInputSchema, shinyType, introDone, text, answer, mediaSlots: [] }

// Multi-asset one-slide series (sequential today)
data: { ...same, isSeries: true, seriesTheme: '<format name>', currentPart: 0,
        parts: [{ label, text, answer, mediaSlots }] }

// Concurrent text series — same shape, gated by
// shinyInputSchema: { type: 'text', concurrent: true }

// Separate-siblings run — N slides, each isSeries: true + shared seriesTheme
// (the heuristic isShinySeriesSibling groups them)

// Non-concurrent image, N assets — a *grid* slide:
data: { ...shiny fields, columns: [[{ color, mediaUrl }]], intraGap, interGap,
        columnLabels, text, answer }
```

```sql
shiny_formats { id text PK, name, icon, description,
                input_schema jsonb }  -- { type, slots, concurrent, questionSeries,
                                      --   seriesEnabled, columnLabels, ... }
```

### Added by this rebuild

```js
// On any tied-together multi-asset slide (new creations only):
data.shinyDisplay: 'sequential' | 'concurrent'
// The ONE field that drives both the TV renderer choice and Next/Prev step
// math, replacing "read the format's input_schema flags at render time."

// On every slide of a separate-questions run (new creations only):
data.shinyGroupId: '<uuid, stamped once at creation, identical across the run>'
// nanoid is already a dependency — same id style as shiny_formats ids.
```

```js
// shiny_formats.input_schema — semantics change, no schema change:
slots: 4            // now a DEFAULT that pre-fills the asset-count input;
                    // never hides it, never overrides the host's typed value
defaultDisplay: 'sequential' | 'concurrent' | 'separate'   // optional, new:
                    // pre-selects the relationship control; legacy
                    // `concurrent: true` reads as defaultDisplay 'concurrent'
```

### Read-only-legacy-forever

- `shinyInputSchema.concurrent === true` on `type: 'text'` slides with no
  `shinyDisplay` → treated as `shinyDisplay: 'concurrent'` (via the gate function
  below). Never rewritten on the slide.
- `columns[][]` grid slides created by the old image path → render via `GridSlide`
  exactly as today. Never converted to `parts`.
- Sibling runs without `shinyGroupId` → grouped by the existing heuristic
  (fallback path in `isShinySeriesSibling`). Never backfilled.
- Flat single-asset questions → untouched; `resolveShinyPart`'s non-parts branch
  (`shinySeries.js:50-66`) already handles them.

Nothing is written to any existing row. The compatibility layer is entirely in the
read path, concentrated in the gate function and `isShinySeriesSibling`.

## Gate-function consolidation

`isConcurrentTextShiny` (`shinySeries.js:109-111`) generalizes to:

```js
// shinySeries.js — THE one place "is this slide concurrent" is decided.
export function isConcurrentShiny(data) {
  if (data.shinyDisplay) return data.shinyDisplay === 'concurrent'
  // Legacy gate, verbatim from isConcurrentTextShiny — text-only on purpose:
  // legacy image-series formats also set concurrent: true and must keep their
  // one-at-a-time treatment (see QuestionSlide.jsx:1318-1320's comment).
  return data.shinyInputSchema?.type === 'text' && data.shinyInputSchema?.concurrent === true
}
```

Callers, all switched to this one function:

- `slideStepping.js:39-43` `revealStepCount` — currently the only true caller of
  `isConcurrentTextShiny`; the `groups + 1` off-by-one law (concurrent counts
  *revealed* groups, 0 = nothing revealed) carries over unchanged for concurrent
  text. Concurrent **media** gets `stepCount = 1` (all tiles shown at once, one
  shared answer — no per-press reveal; see the adapter section and Open Questions).
- `QuestionSlide.jsx:1321` — the inline restatement in `ShinyContent`'s dispatch is
  deleted and replaced with the gate call. This is the duplicated condition that
  motivated the consolidation.
- The new `AddSlideWizard` popup (to decide which shape to write) and
  `SlideEditor`'s display-mode toggle (below) read/write `shinyDisplay` directly.

`isShinySeriesSibling` (`shinySeries.js:119-125`) gains the groupId preference:

```js
export function isShinySeriesSibling(a, b) {
  const ad = a?.data, bd = b?.data
  if (!ad?.isShiny || !bd?.isShiny) return false
  // New creations: exact, collision-proof.
  if (ad.shinyGroupId || bd.shinyGroupId) return ad.shinyGroupId === bd.shinyGroupId
  // Legacy rows: the existing heuristic, unchanged. Known ceiling: two runs of
  // the same format in the same round merge (skipped intro beat, collapsed
  // sidebar row) — accepted for old shows, impossible for new ones.
  if (!ad.isSeries || !bd.isSeries) return false
  if (a.roundId !== b.roundId) return false
  if (!ad.shinyFormatId || ad.shinyFormatId !== bd.shinyFormatId) return false
  return !!ad.seriesTheme && ad.seriesTheme === bd.seriesTheme
}
```

Every downstream consumer — `seriesGroupIndices`, `reorderWithinRound`
(`shinySeries.js:136-171`), `RoundSidebar.jsx`'s `groupSeriesRuns` (lines 18-29),
and the four `slideStepping.js` call sites (skip-intro at 502, closing-beat peek at
486, Prev sibling guard at 563, entry state) — get the fix for free through this
one function. No caller changes.

## Concurrent-with-media: the GridSlide adapter

"All at once" with image assets means N images on screen together — which is
exactly what `GridSlide`'s renderer already draws (`GridSlide.jsx:30-119`:
column layout, tile sizing math, entrance stagger, bottom-scrim caption via
`useFitToBox`, shiny gold treatment, the `ShinyIntroScreen` gate). The rebuild
reuses that drawing code as a **target fed from `parts` data** instead of writing
a new renderer:

- `GridContent` (currently module-private in `GridSlide.jsx:30`) is exported.
- One pure adapter, next to the other shape-resolvers in `shinySeries.js`:

  ```js
  // parts → the columns[][] view GridContent draws. N assets → N columns × 1 row,
  // matching what the old creation path baked (AddSlideWizard.jsx:266).
  export function partsToGridView(data) {
    return {
      columns: data.parts.map(p => [{ color: null, mediaUrl: p.mediaSlots?.[0]?.url ?? null }]),
      columnLabels: false, intraGap: 0, interGap: 84,
      text: data.text, answer: data.answer,
    }
  }
  ```

- `QuestionSlide.jsx`'s `ShinyContent` dispatcher gains one branch: media assets +
  `isConcurrentShiny(data)` + `parts.length > 1` → render `GridContent` with the
  adapted view. It sits above the visual-shiny branch (`QuestionSlide.jsx:1295`)
  so concurrent wins over the one-at-a-time visual treatment.

Editing stays in the existing parts editor (`SlideEditor.jsx` — per-part media
slots, the drop-N-files-grow-N-parts path at lines 560-576). There is **no second
grid-tile editor** for these slides; the `grid` slide type's own `GridEditor`
(`SlideEditor.jsx:234`) continues to serve real `grid` slides only.

The slide stays `type: 'question'` with `parts[]` — the rendering choice is a
`shinyDisplay` read at render time, not a shape decision frozen at creation. The
host can flip a question between one-at-a-time and all-at-once after creation
without recreating it (editor toggle, below) — impossible today because the old
path committed to `type: 'grid'`.

## File-by-file impact

**`client/src/components/host/AddSlideWizard.jsx`** — the bulk of the work.
`handleCreate`'s shiny branches (lines 144-340) collapse: grid (145-169) and venn
(171-190) keep their bespoke creation blocks; matching/wager/order keep the flat
shape; everything else flows through one path — count N + relationship →
`sequential`/`concurrent` write one `question` slide with `parts[N]` +
`shinyDisplay` (+ `shinyGroupId` unnecessary — one slide); `separate` writes N
sibling `question` slides each with `shinyGroupId` (media formats no longer forced
through `type: 'grid'`; the adapter renders them). The details-step JSX (520-733)
becomes: round → count (always visible, preset pre-filled) → 3-way relationship →
conditional Q/A fields. Deleted: `batchMode`/`slideCount` state (60-77), the
one/many toggle (553-576), the `isImageFmt || isConcurrentFmt` render fork
(545-717), the preset-hides-input gates (593, 649), and derived flags
`isConcurrentFmt`/`isImageFmt`/`hasAssetPreset`-as-lock (408-424). Kept:
`formatAlreadyIntroducedThisRound` (121-122), first-sibling-only `introDone`
baking (246), `insertAfterSlideId`, `archiveQuestion` calls, question numbering.

**`client/src/lib/shinySeries.js`** — `isConcurrentShiny` replaces
`isConcurrentTextShiny` (109-111; old name deleted, both callers updated —
`slideStepping.js:24` import and the test file). `isShinySeriesSibling` gets the
groupId preference (119-125). `partsToGridView` added. `resolveShinyPart`
unchanged — it is already shape-agnostic, which is why `/join` needs nothing.

**`client/src/lib/slideStepping.js`** — `revealStepCount` (39-43): concurrent
text keeps `groups + 1`; concurrent media returns 1; sequential keeps `groups`.
Everything else — `computeNextStep`/`computePrevStep`, closing beat, entry state,
lock phases — reads through the same functions it already reads through and needs
no changes beyond the import rename.

**`client/src/components/display/slides/QuestionSlide.jsx`** — dispatch cleanup:
line 1321's inline condition → `isConcurrentShiny(data)`; new concurrent-media →
`GridContent` branch. `ShinyConcurrentQuestion` (974-1130) unchanged — it already
renders off `parts` + `currentPart` + `groupSize` and neither knows nor cares what
gated it.

**`client/src/components/display/slides/GridSlide.jsx`** — export `GridContent`
(line 30). No rendering changes; real `grid` slides render exactly as before.

**`client/src/components/host/SlideEditor.jsx`** — the parts editor already does
the per-asset work (parts CRUD 498-590, per-part media, bulk paste, drop-to-grow).
Two changes: (1) copy sweep — "part"/"subslide" → "asset" in labels ("+ Add
asset"); (2) a small display-mode toggle (one-at-a-time / all-at-once) writing
`shinyDisplay`, shown on multi-asset tied slides — the post-creation escape hatch
the frozen-at-creation shapes never allowed. The legacy "Part of a Series" toggle
(957-969, gated on `schema.seriesEnabled`) stays for legacy formats but is
redundant for new creations, which arrive already multi-asset.

**`client/src/components/host/RoundSidebar.jsx`** — no logic changes.
`groupSeriesRuns` (18-29) and drag-as-unit already route through
`isShinySeriesSibling`/`reorderWithinRound` and inherit the groupId fix.
`shinySiblingLabel` (13-16) and `slideLabel` (50-63) work as-is.

**`client/src/views/Join.jsx`** — no data-shape changes; it already reads every
shiny shape through `resolveShinyPart` (line 549) with its own `localPart`
back-stepping (1089-1147). One real gap: **concurrent-with-media has never been
exercised on a phone** — `resolveShinyPart` will hand `/join` asset media one part
at a time while the TV shows all N at once. Needs an explicit decision (Open
Questions) and a live rehearsal before any real show, not just unit tests.

**`client/src/components/host/FormatLibrary.jsx`** — "Number of assets" (146-166)
copy updates to say *default*, host can always change it per-use. "Concurrent
slides?" toggle (168-194): its slots-nulling side effect (186) goes away (slots is
just a default now, safe to coexist); the toggle itself persists as
`defaultDisplay: 'concurrent'` sugar or is replaced by a small 3-way default
selector. "Question series?" (204-217) untouched (out of scope). "Series enabled"
audio-only toggle (222-235) stays for legacy formats.

**Tests** — `shinySeries.test.js`: `isConcurrentShiny` (new field, legacy
fallback, media-vs-text), `isShinySeriesSibling` (groupId match/mismatch/mixed
legacy, and a regression test for the two-runs-same-format-same-round case),
`partsToGridView`. `slideStepping.test.js`: `revealStepCount` under
`shinyDisplay` (sequential N, concurrent text N+1, concurrent media 1), and the
existing stepping suites re-run against `shinyDisplay`-shaped slides.

## Implementation notes (internal build order, one project)

Ben was explicit this ships as one rebuild — this ordering is engineering
sequencing inside that one project, not a proposal to ship pieces separately:

1. `shinySeries.js` + `slideStepping.js` + tests (gate, sibling groupId, adapter,
   step counts) — pure functions, fully unit-testable before any UI moves.
2. `QuestionSlide.jsx` dispatch + `GridSlide.jsx` export — renderers read the new
   field; legacy slides still render identically (snapshot the legacy paths).
3. `AddSlideWizard.jsx` rebuild — the new popup, writing the new shapes. The
   preset-becomes-default fix lands here as a consequence of the collapse, not a
   separate patch.
4. `SlideEditor.jsx` toggle + copy sweep, `FormatLibrary.jsx` copy/default.
5. Rehearsal pass on real hardware: TV + two phones, one show containing a legacy
   grid slide, a legacy concurrent-text slide, and one of each new shape —
   sequential, concurrent text, concurrent media, separate run — stepped forward
   AND backward through, including the closing beat.

## Risks

- **Concurrent media on phones is unrehearsed.** The TV side reuses proven
  GridSlide drawing; the `/join` side has never shown a concurrent media question.
  Whatever the answer to the open question below, it must be verified on real
  phones at a rehearsal before a live show — this is the one genuinely new
  render-surface combination in the rebuild.
- **Editable presets can be fat-fingered.** The preset used to be un-overridable;
  now a host can absent-mindedly change "4" to "1" on a format whose mechanic
  assumes 4. Mitigation: the input arrives pre-filled (not blank) with a visible
  "format default: 4" hint when the value diverges; the existing 1-20 clamp stays.
  Accepted trade — the lock caused a real live incident tonight; the fat-finger is
  hypothetical and self-evident in the editor preview.
- **Legacy render paths must stay byte-identical.** Any regression here hits a
  live bar show with no rollback. The step-1 unit tests plus step-5 rehearsal
  with legacy slides in the same show are the guard; the compatibility surface is
  deliberately concentrated in two functions to keep it auditable.
- **`updateSlide` write discipline** — the editor's new `shinyDisplay` toggle goes
  through the existing debounced-and-serialized `updateSlide` path (`useShow.js`,
  commit `84d0021`'s chained-promise rule). No new save mechanism.

## Open questions for Ben

1. **Concurrent media on the TV: any per-press reveal?** This spec says all tiles
   appear together (entrance stagger only), one shared answer, no Next-stepping
   inside the slide — "one at a time" is what sequential is for. If you instead
   want tiles to *build up* one per Next press, `revealStepCount` and the adapter
   both support it cheaply, but say so now — it changes what a Next press does live.
2. **Concurrent media on phones:** show all N asset images in a scrollable stack
   on `/join`, or just the question text + "look at the TV"? Recommend the
   stack — but it's the unrehearsed surface either way (Risk 1).
3. **Converting separate ↔ tied after creation** is not offered (structurally it's
   a merge/split of real slides, not a field flip like sequential ↔ concurrent).
   Acceptable to delete-and-recreate for that case, or does it come up often
   enough to want a real convert action later?
4. **FormatLibrary default relationship:** worth a visible 3-way "default"
   selector on the format, or is the count default plus the popup's ask-each-time
   enough? Spec assumes the minimal version (legacy `concurrent` maps to a
   default; no new format UI required).

Status: design in review with Ben, not yet planned or built.
