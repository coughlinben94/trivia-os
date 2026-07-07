# references/slides.md — Slide Types, Transitions, Animations

**Read before:** building any new slide type, modifying transitions, working on `SlideRenderer.jsx` or any file in `/slides/`, building `AddSlideWizard` steps.

---

## Slide Types

Every slide has a `type` field. SlideRenderer routes to the correct component. The host builder creates slides of each type via AddSlideWizard.

### `title`
Show opener.
- Baynes Apple Valley logo centered
- Subtitle: "Trivia Night — [Date]"
- Ambient looping background (theme drives everything)
- Implemented: `TitleSlide.jsx`

### `state-of-union`
The actual opener slide based on the PowerPoint deck analysis. Ben photo large + "State Of The Union" text. High gravitas irony. Implemented: `StateOfUnionSlide.jsx`

### `round-intro`
Dramatic animated card that SLAMS in.
- Round number first (large, bold)
- Round title slams in underneath
- Optional subtitle (e.g. "Fight!" or "It did not went well.")
- Exit animation before next slide
- Duration: ~2.5s total, then host advances manually
- Implemented: `RoundIntroSlide.jsx`

### `question`
The workhorse — most slides are this type.
- **Always shows:** question counter (top-right, Q3 · R1)
- **Always shows:** Baynes logo watermark (bottom-right, 18% opacity)
- **Question number badge:** large circle, top-left, theme accent color
- **Question text:** large, centered, high contrast — minimum readable at 20ft
- `isShiny = false` — dark background, clean text layout
- `isShiny = true, shinyType = "visual"` — full bleed if landscape, split if portrait; question text overlaid or alongside
- `isShiny = true, shinyType = "audio"` — animated waveform, track label, PLAY button controlled from host panel
- `isSeries = true` — series theme banner across top, series label badge (6a/6b/6c)
- Implemented: `QuestionSlide.jsx`

### `grading-break`
Full-screen interstitial between rounds.
- Custom message (default: "Ben is grading papers")
- Animated subtle looping background
- **Back button:** "↩ Back to Q1" — jumps host to first question of that round (`backLinkSlideId` in data)
- **Final Break** (fully automatic, no per-slide field or checkbox — an earlier manual `isFinalBreak` design was replaced with auto-detection; see Jukebox handoff below for the real logic).
- Ben photo shown (thumbnail, lower-left corner)
- **Jukebox handoff (nav mechanism):** full-page navigation, NOT iframe and NOT postMessage (Spotify refuses iframe embedding; theme can't cross origins). After the phase-1 message (~10s; Space/ArrowRight skips it, which is what the Stream Deck Next key sends), `transitionToJukebox` runs `window.location.href = 'https://trivia-jukebox.vercel.app'`. Return is manual: the Jukebox's `b` keydown handler navigates to `trivia-os.vercel.app/display?from=jukebox`; Display.jsx detects `from=jukebox` and auto-detects whether this is the show's final grading break — if the show's last slide is type `winner-reveal` AND no `grading-break` slides remain after the current position, it jumps `current_slide_index` straight to `sorted.length - 1`; otherwise advances by 1 as before (clamped, `next>cur` guard) — then strips the param via `history.replaceState`. (No per-slide flag is involved — this is structural detection off the slide list, not a stored field.)
- Implemented: `GradingBreakSlide.jsx`

### `scoreboard-reveal`
- Teams animate in from bottom, staggered
- Leader gets gold crown + glow effect
- Score bars animate width 0 → final value
- Rank numbers appear with bounce
- Host can show/hide from score panel
- Implemented: `ScoreboardRevealSlide.jsx`

### `custom`
Freeform slide. Title, body text, optional image. No fixed layout. Implemented: `CustomSlide.jsx`

### `multi-question`
A single slide containing a numbered list of questions (used for LEGO round, Flipped Questions). No per-question navigation — whole slide is one unit. Implemented: `MultiQuestionSlide.jsx`

### `pixelate-series`
A single question spanning multiple slides, each showing a progressively clearer version of the same image. 3 stages typical. Host advances through stages manually. Same question number across all stages. Implemented: `PixelateSeriesSlide.jsx`

### `pyl-reveal`
Press Your Luck answer reveal. Shows a list with some items filled in, some blank, plus a running point value. Each host advance fills in the next item. Needs "reveal stages" support. Implemented: `PylRevealSlide.jsx`

### `grid`
Shiny "Color Schemes" format. Host picks column/row count in AddSlideWizard; tiles (color and/or image, image wins) filled in `SlideEditor`'s GridEditor. `data`: `columns` (array of column arrays of `{color?, mediaUrl?}`), `intraGap`, `interGap`, `columnLabels`, `text`. Carries `isShiny` (fixed-gold treatment); `SlideRenderer` neutralizes its transition opacity to a constant 1 (same as `team-picker`/`state-of-union`) so the fixed layout never flashes the raw theme color. Implemented: `GridSlide.jsx`.

### `team-picker`
"Team Intro" — cinematic warp-speed one-by-one team name reveal (fixed black/starfield background regardless of show theme; text stays theme-linked). Steps through `[intro, ...teams, outro, landed]` via `data.parts`, baked once by `useShow.js`'s `bakeTeamPickerParts`. No host-editable content fields — teams come from the `teams` table. Like `grid`/`state-of-union`, its transition opacity is neutralized in `SlideRenderer` so the fixed design never shows the theme through it. Implemented: `TeamPickerSlide.jsx`.

### `team-preview`
"Team List" — shows all registered team names on screen at once, queried live from `teams` for `show.id`. No editable data fields. Hidden from the main AddSlideWizard type grid (`hidden: true` in TYPE_CARDS) — added via other flows. Implemented: `TeamPreviewSlide.jsx`.

### `winner-reveal`
Shipped 2026-06-30. The automated show-closer — no editable data fields, computes everything live on mount.
- "And the winner is…" fades in (0.55s ease-out)
- Pre-recorded `/drum-roll.mp3` plays via an HTML5 `<audio>` element; reveal fires on `onended` (a failed load or blocked autoplay falls back to a 2s timeout so the reveal never hangs). `useReducedMotion` skips straight to reveal after 1.2s instead of playing it.
- Queries `teams` + `team_scores` for `show.id`, sums scores per team, picks the highest total as winner
- Winner name pops in at full size (`clamp(4rem, 11vw, 10rem)`, theme highlight color, text-shadow glow) with canvas confetti (220 particles, physics-based fall + rotation, fades after 2.5s)
- Points subtitle fades in 350ms after the name
- Uses `theme.fonts.display`/`theme.colors.highlight`/`theme.colors.accent` — respects per-show theme overrides like every other slide
- Meant to be the literal last slide in the show — paired with the automatic **Final Break** detection on the last grading break (see above), the whole close is hands-off with no host button press needed
- `Host.jsx` auto-fires `saveResults()` (writes `final_scores` + `player_count` to the show row) the instant this slide becomes the live slide
- Implemented: `WinnerRevealSlide.jsx`

---

## AddSlideWizard Flow

4-step guided flow in `AddSlideWizard.jsx`:

1. **Choose type** — grid of slide type options with icons and descriptions
2. **Set round** — select which round this slide belongs to (or "No round" for title/scoreboard)
3. **Fill content** — type-specific fields (question text, shiny toggles, media upload, series config)
4. **Review + Add** — preview summary, confirm

The wizard remembers `roundId` context when opened from RoundSidebar so step 2 is pre-filled.

---

## Overlay System (freeform layer, all 15 slide types)

Shipped 2026-07-05. Any slide's `data` may carry an `overlays` array — freeform text/image boxes the host places, drags, resizes, and rotates in Build Mode, composited on top of the normal slide content on `/display`. Replaces the earlier `data.elements`/`SlideElements.jsx` system (removed) — that system made per-slide-type mounts of an element renderer; this one is a single universal layer.

**Two components, non-negotiable split:**
- `display/OverlayLayer.jsx` — dumb, type-agnostic renderer. Props: `overlays`, `theme`. Zero interactivity, zero edit affordances, under every condition — this exact component's output is what `/display` shows, which is what makes the Build Mode preview a WYSIWYG guarantee rather than a lookalike.
- `host/SlideCanvasEditor.jsx` — the Build Mode editing surface. Its preview renders the literal `SlideRenderer` (which mounts `OverlayLayer`) inside a `transform: scale(k)` wrapper sized to the panel — the small preview and the 1920×1080 `/display` render are the *same tree*, not two implementations kept in sync by hand.

**Mount point:** `SlideRenderer.jsx` mounts `<OverlayLayer overlays={slide.data?.overlays} theme={theme} />` once, inside the slide's `motion.div` transition container, after `<SlideComponent>` — type-agnostic, no per-type branch. It rides that slide's enter/exit transition for free. **The 15 slide renderers themselves are never touched or made editable** — the overlay layer is strictly additive. Do not regress this by re-introducing per-slide-type overlay mounts.

**Coordinate law (never store pixels):** `x`/`w` are percent of canvas *width*; `y` and `fontSize` are percent of canvas *height*. `OverlayLayer` renders `fontSize` in `cqh` (container query height units) against a `containerType: 'size'` wrapper, so the percent-of-height math holds identically at a 220px preview thumbnail or a fullscreen TV with no JS measurement. Any pixel value anywhere in an overlay object is a bug.

**Data shape** (per overlay, in `slide.data.overlays[]`): `{ id, kind: 'text'|'image', x, y, w, rotation, z, ...kind-specific }`. Text carries `text, fontFamily ('display'|'body'|literal), fontSize, color (hex or 'text'/'accent'/'highlight' token), align, weight`. Image carries `mediaUrl`. `fontFamily`/`color` tokens resolve through the active theme; anything else passes through literally. Overlay text does NOT go through `autoFitText` — the host chose the size.

**Persistence:** plain JSONB, no schema change. `overlays` is optional everywhere — absent/`[]` behaves exactly like a slide with no overlay key. `exportShow`/`importShow`/`duplicateShow` all pass `slides` through generically (no per-field allowlist in `useShow.js`), so overlays round-trip for free. Overlay `id`s are scoped per-slide (nanoid) — nothing keys on global uniqueness, so duplicated shows are safe.

**Editor internals worth knowing before touching `SlideCanvasEditor.jsx`:** it also owns the pre-existing, separate *region* editing system (making a slide's own built-in fields like title/question text draggable — `data._regionTransforms`) verbatim, unchanged, on the same scaled canvas. Region editing and overlay editing are independent features sharing one DOM scaffold; don't conflate them. All overlay pointer-gesture math (drag/resize/rotate) divides screen-px deltas by the live scaled canvas size (`scaledW`/`scaledH`) to get back to percent — that division is the classic failure mode this file gets right once, in the gesture handlers, rather than per-caller.

---

## Slide Transitions

All transitions use Framer Motion. Transitions are snappy and punchy — not slow fades. See `TransitionRegistry.js` for the routing table.

### Timing Constants

```js
const TRANSITION_FAST      = 0.18   // question-to-question
const TRANSITION_MEDIUM    = 0.28   // question-to-grading-break
const TRANSITION_DRAMATIC  = 0.5    // anything involving round-intro
const TRANSITION_SCOREBOARD = 0.4   // scoreboard reveal
```

### Easing Curves

**Canonical source:** `client/src/lib/easings.js` — never redeclare curves locally. Full table in `SKILL.md`.
```js
EASE_OUT   = [0.23, 1, 0.32, 1]   // standard enters
EASE_EXIT  = [0.33, 1, 0.68, 1]   // exits
EASE_DROP  = [0.25, 1, 0.25, 1]   // weighted lands (round intro slam, badge bounce)
EASE_BAR   = [0.4, 0, 0.2, 1]     // score/progress bars, scoreboard bar expansion
EASE_PANEL = [0.32, 0.72, 0, 1]   // drawers/sheets, score panel slide-out
```
Old CSS custom-property names (`--ease-snap`, `--ease-overshoot`, `--ease-drawer`, `--ease-smooth`) are retired — they don't exist in the codebase anymore.

### Per Slide-Type Transitions

| From → To | Entry | Exit | Duration |
|---|---|---|---|
| Any → `question` | Slide in from right | Slide out to left | FAST |
| Any → `round-intro` | Zoom burst from center | Zoom out + fade | DRAMATIC |
| Any → `grading-break` | Fade through black | — | MEDIUM |
| Any → `scoreboard-reveal` | Rows stagger up from bottom | Fade out | SCOREBOARD |
| `question` → prev (back nav) | Slide in from LEFT | Slide out to RIGHT | FAST |
| Any → shiny visual | Scale up from center + flash | Slide out | MEDIUM |
| Any → shiny audio | Waveform animates in | Slide out | MEDIUM |

### Round Intro Slam Sequence

```
1. Black screen (instant)
2. Round number: scale 400% → 100%, EASE_OVERSHOOT, 0.3s
3. Round title: slides up from below, 0.2s delay, 0.25s duration
4. Subtitle: fades in, 0.1s delay after title, 0.2s duration
5. Hold until host advances manually
```

### Shiny Entry — Visual

```
1. Flash frame (white, 1 frame, CSS animation — off main thread)
2. Image: scale 110% → 100%, 0.3s, EASE_OUT
3. Gold particle burst (CSS animation, 0.5s, fades out)
4. Question text: slides up from bottom, 0.15s delay, 0.2s
```

```css
@keyframes shinyFlash {
  0%   { opacity: 1; }
  8%   { opacity: 0; }
  100% { opacity: 0; }
}
.shiny-flash { background: white; animation: shinyFlash 200ms ease-out forwards; }
```

```js
// Image/content scales in after flash
initial: { scale: 1.08, opacity: 0 }
animate: { scale: 1, opacity: 1 }
transition: { delay: 0.05, duration: 0.28, ease: [0.23, 1, 0.32, 1] }
```

### Shiny Entry — Audio

```
1. Dark background slides in from right (FAST)
2. Waveform bars animate in sequentially (stagger 0.02s each)
3. Play button pulses (CSS animation, continuous until played)
4. On play: waveform animates actively while audio plays
```

```css
/* CSS bars — off main thread, stays smooth during audio load */
@keyframes waveform-bar {
  0%, 100% { transform: scaleY(0.2); }
  50%       { transform: scaleY(1); }
}
.bar { animation: waveform-bar 800ms ease-in-out infinite; }
.bar:nth-child(2) { animation-delay: 80ms; }
.bar:nth-child(3) { animation-delay: 160ms; }
/* etc. */
```

### Scoreboard Reveal Sequence

```
1. Title "🏆 Leaderboard" fades in (0.3s)
2. Rows animate up from below, staggered 80ms each (bottom rank first)
3. Score bars expand 0 → value (600ms, EASE_BAR, 120ms delay after row)
4. Leader row: gold glow pulses in (200ms delay after bar completes)
5. Crown emoji: spring drop from above, bounce: 0.3
```

---

## Spring Configurations (Framer Motion)

```js
// Round intro number slam
{ type: 'spring', duration: 0.4, bounce: 0.25 }

// Question number badge bounce
{ type: 'spring', duration: 0.3, bounce: 0.2 }

// Scoreboard crown drop
{ type: 'spring', duration: 0.5, bounce: 0.3 }

// Score panel drawer open (no bounce on drawers)
{ type: 'spring', duration: 0.35, bounce: 0.0 }

// Powerup button confirm
{ type: 'spring', duration: 0.25, bounce: 0.15 }
```

---

## Question Counter

Persistent element on every question slide, top-right corner of `/display`.

```
Format: Q{number} · R{round}
Example: Q3 · R1
Series:  Q6a · R1
```

- Font: bold, small, uppercase, letter-spaced, theme accent at 70% opacity
- Never animates — always present, instant update
- Position: top-right, 20px from edge
- Hidden on non-question slides

---

## Reference Deck Analysis — Patterns from Ben's PowerPoint

These are ground truth from the actual 99-slide deck. Treat as authoritative.

### Slide Distribution (99 slides)
- Title/opener: 1 (State Of The Union graphic + Ben photo)
- Rules: 2 slides
- Training Wheels mechanic: 1 slide
- Round intros: 5 (always Ben photo + round name + punchy subtitle)
- Questions (text only): ~28
- Questions (visual — full image): ~32 (celebrity IDs, mythical characters, pixelated, LEGO)
- Shiny round title cards: 6 (yellow bg + Ben + round theme title)
- Audio question slides: 6 (R3 Swing Round — just "1. 8-Bit", speaker icon, nothing else)
- PYL answer reveal slides: 4 (progressive list, +40/+20 point values)
- Grading break slides: 5 (one per round, same message, Ben photo thumbnail, back navigation link)
- Bonus slides: 3
- Closer: 1

### Critical Patterns

**Shiny round title card is its own slide type.** Not just a round intro — a mid-round reveal announcing the special format BEFORE questions. Yellow bg (theme-colored in Trivia OS), large bold handwritten text, Ben photo (small, lower-left, comedic), retro button icon. Pure dramatic reveal, no question content.

**Back navigation is consistent.** Every grading break has "Click here to go back to Round X, Question 1" — this is the `backLinkSlideId` field in grading-break slide data.

**Ben photo size varies intentionally:**
- Grading breaks: tiny thumbnail (~15% slide width, bottom-left)
- Round intros: medium (30–40%, offset)
- Shiny round titles: medium-small (20–25%, lower-left)
- Emotional slides (R5 "Ben loves you"): NO photo — text only. The absence is the joke.

**Audio slides are extremely minimal.** Just "1. 8-Bit" + speaker icon. The audio IS the question. The waveform animation fills the visual space.

**Pixelate round (R5, Q3):** Three progressively de-pixelated versions of one image across three consecutive slides. Single question, multiple reveal stages → `pixelate-series` type.

**PYL (Press Your Luck):** Progressive answer reveals per slide advance, running point value (+40, +20). → `pyl-reveal` type.

**LEGO round (Those Sneaky Bricks):** Six questions on a single slide. → `multi-question` type.

**Flipped Questions sub-round:** Answers given, teams guess the question. Standard question slide, question text just written in reverse format.

**Bill Nye round:** Scientific description of a celebrity, teams name them. 5–7 word questions. The shiny title card sets up all context — question slides need zero setup.

### Ben Photo Styles (for photo library categorization)
- Formal/dressed up (suit, bow tie) — "State Of The Union" opener, high gravitas irony
- Casual reaction shots — mid-sentence, relaxed, most common
- Group shots — social, warm (Round 5)
- Vintage/old photos — nostalgia factor
- Cutout on colored background (PNG transparent bg) — most common format

### UX Copy Voice — Verbatim from Deck
Match this register in all app copy:
- *"This ain't just your mommas trivia…."*
- *"Whatever the quizmaster says, goes…"*
- *"Try to adhere from phone usage, cheating is not acceptable… we will throw your phone in the river"*
- *"Have fun, and don't yell at me, I'm not a professional trivia writer! lol"*
- *"Now, please sit back, relax, and enjoy each others company as Ben grades papers 😊"*
- *"It did not went well."* (Round 2 subtitle — intentional grammar error, beloved)
- *"Ben loves you, truly. You guys make my week, every single time we do this silly thing."*
- *"That concludes trivia! Hang out to see the correct answers and who takes home the gold! Or not, it's all good… We love you!"*
