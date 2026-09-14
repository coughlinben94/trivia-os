# "Flip 'Em Down!" (working name — Ben confirmed concept, not the name) — Shiny Format Spec

Date: 2026-09-14
Status: design, not yet planned or built. Name still open — candidates: Sift Happens!,
Process of Elim-A-Nation!, Down to One!, Cross 'Em Off!.

## Concept (Ben's confirmed shape, 2026-09-14)

Guess Who?, compressed to one paper answer. **8 celebrity faces** on screen at once.
Three hints, each read one at a time — first hint drops 3–4 faces, second hint drops
down to one or two, third hint confirms one — then the host **gives the answer
out loud** as its own beat, separate from the visual narrowing. Teams write the name
before that last beat; the spoken answer is the grading check, same as every other
question type. Passes the paper-test: one written answer, static slides, nothing
interactive. Still works with the pictures covered (names alone survive the same
elimination logic) — per Phase 3 check 5, that's what gives it "soul" beyond parade.

Fixed at 8 items / 3 hints (not a host-editable count) — narrower and punchier than
the original Guess Who? board, and it matches the brand's 20-ft-legibility bar
better than a literal 12-count homage would.

Worked example (illustrative only, not a real drafted question):
> 8 comedy-film faces on screen. Hint 1: "SNL cast member." — 4 left.
> Hint 2: "Born in Illinois." — 1 left. Hint 3 (spoken, not a filter):
> "He played the Ghostbuster who never wanted to be there." **Bill Murray.**

## Architecture decision (2026-09-14, resolved)

Two existing patterns for a new shiny format:

- **Grid/Venn pattern** — own top-level `slide.type`, own `SLIDE_COMPONENTS` entry,
  rendered outside `QuestionSlide.jsx` entirely.
- **Everything-else pattern** (Wager, Matching, Order, Choice, Bendle) — stays
  `slide.type: 'question'`, dispatches inside `QuestionSlide.jsx` via
  `shinyInputSchema.type`.

**Going with Grid/Venn's shape** (own component), but explicitly **not** reusing
`isConcurrentShiny`/`revealStepCount` — checked, and that stepping system only does
cumulative per-press reveal for `shinyInputSchema.type === 'text'`
(`shinySeried.js`'s own comment: media-concurrent shows every asset at once, "no
per-press reveal: exactly one state"). Bolting Elimination onto it would need a
third branch in `isConcurrentShiny`, `isConcurrentMediaShiny`, `revealStepCount`,
and `QuestionSlide.jsx`'s dispatcher — real new plumbing across the shared shiny
system, the kind of change every other format's stepping depends on staying stable.

**Real reuse target: Wager's own pattern.** `ShinyWagerQuestion.jsx` doesn't touch
the global Next-press step counter at all — it reads its own boolean,
`data.wagerRevealed`, flipped by a host control, synced through the same
`updateSlide`/realtime path every slide already uses. Elimination copies this
exactly: a local `data.elimStep` (0–3) instead of a boolean, advanced by its own
host control. Fully isolated from the shared shiny-stepping system — nothing else
in the codebase can regress from adding it.

## Data model

`shiny_formats` row: `input_schema: { type: 'elimination', slots: 8, sequential: false }`.
Fixed shape — 8 items, 3 hints, not host-editable counts (unlike `grid`'s
`gridCols`/`gridRows`). `FIXED_SHAPE_KINDS.elimination` in `shinyWizardKinds.jsx`
needs no `extraControls` at all — creation just stamps the blank 8-item/3-hint
shape, simpler than `grid`/`venn`/`bendle`'s own registry entries.

Slide `data`:
```js
{
  questionNumber, questionLabel, questionMode: 'shiny', isShiny: true,
  shinyFormatId, shinyFormatName, shinyFormatIcon,
  items: [{ id, label, imageUrl }],   // exactly 8, authored in SlideEditor
  hints: [                             // exactly 3, own step field, NOT data.parts
    { text: 'SNL cast member.', survivors: ['id3','id7','id9','id11'] },  // 8 → 4
    { text: 'Born in Illinois.', survivors: ['id9'] },                    // 4 → 1
    { text: 'He played the Ghostbuster who never wanted to be there.' }, // spoken only, no survivors field — nothing left to narrow
  ],
  elimStep: 0,   // 0 = grid only, 1 = hint 1 shown+applied, 2 = hint 2, 3 = hint 3 (caption only)
  answer: 'Bill Murray',   // plain text, feeds the standard answer-reveal overlay (A key)
}
```
No `introDone` field — checked `AddSlideWizard.jsx`'s `addShiny()` wrapper (every shiny
creation path goes through it): the announce card is a real, separate `shiny-title`
slide it auto-prepends, not a swap-state flag on the content slide. Grid/Venn don't
carry `introDone` either, confirmed from their own source, not just the (stale)
project SKILL.md, which still describes the pre-2026-09-01 `ShinyIntroScreen`-inside-
the-slide design.

`survivors` on a hint is the running set after that hint applies (intersection with
the prior hint's survivors, computed live in the editor, not by the host at
showtime) — not a delta. Hint 1 must narrow 8→a handful, hint 2 must narrow that
down to exactly 1 (enforced at author time). Hint 3 has no `survivors` at all — it's
spoken flavor, a caption change only, not a filter, so there's nothing to validate.

Named `hints[]`/`elimStep` rather than `parts[]`/`currentPart` deliberately — those
names are load-bearing elsewhere (`isConcurrentShiny`, `revealStepCount`, the
generic multi-part stepping system). Reusing the names without reusing the actual
mechanism is how two systems silently drift into disagreeing about what a field
means; a distinct name for a distinct mechanism.

## Host build flow

1. Pick the format in `AddSlideWizard` → shiny title card auto-created (existing
   path, no change) → wizard stamps the blank 8-item/3-hint shape directly, no count
   controls to show.
2. Everything else fills in afterward in `SlideEditor`, same pattern as every other
   shiny format (Grid/Venn/Bendle all do this already).

## New editor: `ElimEditor.jsx` (sibling of `GridEditor.jsx`)

- Exactly 8 item slots: image picker (reuse the existing media-upload control from
  `SlideCanvasEditor`'s Insert group / `GridEditor`'s per-cell picker, required —
  this format is faces, not text tiles) + name/label.
- Exactly 3 hint slots. Hints 1–2: text input + a checkbox grid (8 items × "survives
  this hint"). Live validation line under each: `"4 survive"` / `"✓ 1 survivor —
  locked"` / `"⚠ 0 survivors — this hint is too strict"` / `"⚠ 3 survivors — tighten
  it, hint 2 has to land on exactly 1"`. Hint 3: plain text only, no checkboxes — it's
  the spoken flavor clue that precedes the host giving the answer, editor just shows
  the locked survivor's name/photo next to it for the host's own reference.

## Display: `FlipEmDownSlide.jsx` (new, `display/slides/`)

- No intro beat inside this component — the announce card is the separate,
  auto-prepended `shiny-title` slide every shiny format gets (confirmed in
  `AddSlideWizard.jsx`'s `addShiny()`), same as Grid/Venn.
- Grid of the 8 `items` (CSS grid, 4×2) — reuse `GridSlide`'s grid layout as the
  starting point rather than a new grid system.
- Hints render as a compact stacked caption list (top or bottom band, out of the
  center 60%×45% safe area per Critical Rule 6) — max 3 lines, so no legibility
  concern at fixed count.
- `elimStep` 0→1 (hint 1 fires): items NOT in `hints[0].survivors` get a "flipped
  down" treatment — `transform: scale(.92) rotateY(6deg)` + `opacity: .25` (+ static
  `filter: grayscale(1)`, allowed since it's an end state, not an animated property —
  Critical Rule 2). Animate only `transform`/`opacity`, `EASE_OUT`, ~220ms, per
  `references/brand.md`'s timing table. `prefers-reduced-motion` guard: opacity-only,
  no scale/rotate.
- `elimStep` 1→2 (hint 2 fires): same treatment applied to whatever hint 1 left
  standing that isn't in `hints[1].survivors` — down to the one confirmed card,
  which gets a small "confirmed" look (border glow, `scale(1.04)`).
- `elimStep` 2→3 (hint 3 fires): purely a caption change — the spoken flavor clue
  appears, board doesn't move. This is the beat where the host says the clue and
  teams finalize their written guess.
- Answer: the host then speaks the name out loud as its own moment and triggers the
  standard Stream Deck **A** answer-reveal overlay, showing `data.answer` as text —
  same generic overlay every question type uses (`Display.jsx`'s
  `AnswerRevealOverlay`, confirmed slide-type-agnostic).

**Host control for `elimStep` — correction (checked further):** `wagerRevealed`
isn't a standalone host toggle — it's flipped automatically as a side effect of
`PHONE_MECHANICS`' tier-lock flow (`slideStepping.js:377`, `LiveMode.jsx`'s
lock/reveal handling), which exists to gate MatchingBoard/WagerBoard phone
interactivity. Elimination has no phone component at all, so that system doesn't
apply — copying it would import unrelated lock/reveal plumbing for nothing.

Simplest real fix: one plain "Next Hint →" button in `LiveMode.jsx`'s live nav bar
(same tier as the existing 📊 Score / 📱 QR buttons — not a Stream Deck hotkey, all
4 Stream Deck keys are already spoken for), calling
`actions.updateSlide(slideId, { elimStep: current + 1 })` directly. No lock system,
no phone board, no new registry entry — the smallest possible host control for a
field only the host ever changes.

## Open questions for Ben

1. Final name.
2. Hint 1 — "3-4 go down" means 4-5 survive, not a fixed number. Does the checkbox
   validator enforce a range (e.g. hint 1 must leave 3-5 survivors) or just flag
   any count and trust the host's judgment? Leaning toward a soft warning only
   (`"7 survive — hint 1 usually narrows further"`), never a hard block, since a
   real subject might not split cleanly.
3. Always real celebrity photos, or does a themed instance (movie characters,
   athletes, cartoon faces) ever swap the well while keeping the mechanic — and if
   so does the format name need to stay well-agnostic?
