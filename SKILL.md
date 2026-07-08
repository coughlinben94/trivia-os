---
name: trivia-os
description: Trivia OS — real-time trivia-night platform for Baynes Apple Valley (React + Vite + Supabase Realtime; 21 ambient themes with per-show font/color overrides, 15 slide types including automated Winner Reveal, full scoreboard system). Use this skill whenever working on Trivia OS or anything under ~/Projects/baynes-trivia/trivia-os — the host build/live control surface, the /display TV renderer, /join phones, slides, rounds, scoring, powerups, the ambient ParticleBackground themes, theme overrides, or display transitions/animations. Read this plus its references before any display/theme/animation work, even on casual asks.
---

# Trivia OS — Developer Skill

> Real-time trivia night management platform. Replaces PowerPoint + Excel entirely. Four views: /host (build + control), /display (TV), /join (phones), /shows (dashboard + scoreboard history). Read this + all references before building anything display-facing.

**Repo:** `~/Projects/baynes-trivia/trivia-os`  
**Stack:** React 18, Vite, Tailwind, Framer Motion 10, Supabase JS, Fuse.js, nanoid  
**Deploy:** `git push` → Vercel auto-deploys  
**Live:** https://trivia-os.vercel.app  
**Project skill:** `.claude/skills/trivia-os/` (symlinks to repo root SKILL.md + references/)

**Shipped 2026-06-30:** per-show theme font/color overrides + custom font upload (see Theme System), Winner Reveal slide + Final Break auto-close (see Slide Types), Go Live picker (jump to any slide accordion), answer-reveal overlay (Stream Deck A key), shiny-question sidebar/series improvements, full scoreboard system (admin modal, Quick Entry, TV overlay, phone drawer, ShowDetail history). See each section below for details.

**Shipped 2026-07-05:** freeform overlay editor — text/image boxes any slide can carry (`data.overlays`), placed/dragged/resized/rotated in Build Mode, rendered on `/display` by a universal `OverlayLayer.jsx`. Replaces the old `data.elements`/`SlideElements.jsx` system. See "Overlay System" in `references/slides.md` for the full model and the coordinate law — read it before touching `SlideCanvasEditor.jsx`, `OverlayLayer.jsx`, or `SlideRenderer.jsx`.

**Shipped 2026-07-06:** persistent design toolbar filling the strip above the slide canvas in `SlideCanvasEditor.jsx` (the "✏️ Design" toggle; layout mode auto-on). Four groups — History (undo/redo, `Cmd/Ctrl+Z`/`⇧`, snapshots on discrete ops + gesture-end), Insert (Text / Image / **Ben Photo** picker over `getHostPhotos()`), Text (font incl. Theme-font + the 4 presets, size, bold, italic, shadow, align, theme-palette swatches + free color picker — edits the selected overlay or, with nothing selected, sets next-box defaults), and Arrange (front/back/duplicate/delete). The old floating per-overlay toolbar was removed — the top strip is the single editing grammar. **The right rail stays strictly slide content** (hard constraint from Ben). Commits `6afc9c9..bdedf61`, branch `feat/slide-design-toolbar`. Snap guides + one-click centering (branch `feat/canvas-snap-guides`, commits `b7e1c23`/`1a5d06e`/`211b06c`): dragging an overlay snaps to canvas center (x/y 50%) and to other overlays' edges/centers at a ~1% threshold, per-axis independent, with a dashed guide line drawn through the engaged axis; `Alt/Option` held disables snapping. A snapped drag commits the *exact* value (centered stores `50.000`, not eyeball-close). Center H / Center V buttons live in the Arrange group.

**Multiple sessions on this repo:** Ben sometimes runs more than one Claude Code session against this same working directory (not separate worktrees) at once. If you see unexpected commits, a branch pointer that moved, or files staged that you didn't touch — that's very likely the other session, not corruption. Check `git log`/`git status`/`git stash list` before assuming something broke, and don't force a branch switch or destructive git op without confirming with Ben first. Nothing has been lost doing this so far because every agent that hit ambiguous state stopped and asked rather than guessed — keep doing that.

---

## Read Order (mandatory before any display/theme/animation work)

1. `SKILL.md` (this file)
2. `references/slides.md` — all slide types + data schemas
3. `references/build-state.md` — BuildMode state machine
4. `references/brand.md` — visual identity, typography, colors
5. `references/themes.md` — 21 ambient themes, theme object shape
6. `references/ambient-design-law.md` — GPU-only animation rules, 3-layer architecture
7. `references/features.md` — full feature inventory
8. Then: `emilkowal-animations` + `emil-design-eng` skills before any Framer Motion work

---

## Critical Rules

1. **ParticleBackground never re-mounts** — it lives OUTSIDE AnimatePresence in DisplayInner. Never add a `key` prop that causes it to unmount. It persists for the entire show session and re-renders only when `theme` prop changes.
2. **GPU-only animations** — every `@keyframes` animates ONLY `transform` and `opacity`. Never animate `width`, `height`, `color`, `box-shadow`, `filter`, or layout properties. Static filter/shadow is fine.
3. **Reduced-motion coverage** — every animated element must have a `prefers-reduced-motion: reduce` guard. Pattern: `.el-anim { animation: none !important }`.
4. **No Socket.io, no Express** — Supabase Realtime only. All sync via `supabase.channel().on('postgres_changes', ...)`.
5. **Design is not optional** — `/display` is a performance on TVs in a dark bar. Generic UI = failure. The display must feel like a custom venue experience.
6. **Center safe-area:** keep the middle 60% width × 45% height of the display clear for question text. Ambient elements live in corners and edges.
7. **Supabase project:** always confirm you're using `qwtbgusqfoypvehnungr` (Baynes Trivia), NOT `dreggwinegtirxxanntv` (Baynes Business Suite). Wrong project caused a `scoreboard_teams` 404 in production — verify `.env.local` before running any migrations.
8. **Overlay layer is additive only** — the 15 slide renderers in `display/slides/` are never made editable and never gain a per-type overlay mount. `OverlayLayer.jsx` is mounted exactly once, generically, by `SlideRenderer.jsx`. Overlay position/size are always percent of canvas width/height (fontSize percent of height) — never pixels. See "Overlay System" in `references/slides.md`.
9. **Snap guides are editor-only chrome.** Guide lines and snap logic live exclusively in `SlideCanvasEditor.jsx`. They never touch `OverlayLayer.jsx`, the 15 slide renderers, or the persisted `data.overlays` shape (zero new fields). Guides render only in the editor, never on `/display`. The guide color is a fixed high-contrast dashed magenta with a dark halo — deliberately NOT a theme token, because the canvas background varies across all 21 themes. The region-transform system (`data._regionTransforms`) is excluded from snapping — it has a separate, deferred pixel-law issue (RG-1) and must not gain snap behavior.

---

## Routes

| Route | Purpose |
|---|---|
| `/host` | Build Mode (pre-show) → Live Mode (during show) |
| `/display` | TV fullscreen — PreShowScreen or slide renderer |
| `/join` | Team phones — register, follow show, scoreboard, powerups |
| `/shows` | Show library + ShowDetail (scoreboard history) |
| `/questions` | Question Archive (Question Database) — cross-show browse/search/edit/delete, behind `<HostPinGate>` |
| `/questions/add` | Bulk "Add Questions" input (Question/Swing Round/PYL tiles), behind `<HostPinGate>` |
| `/scores` | Optional secondary scoreboard display |
| `/ambient` | Dev-only theme previewer (not in prod routing) |

**Display routing logic:**
```
show=null            → purple fallback screen
?preview=true        → PreviewSlide (debug label)
is_live && current_slide_id === null → PreShowScreen (QR + teams)
is_live && current_slide_id !== null → DisplayInner (full slide renderer)
```

---

## Host Access

`HostPinGate.jsx` locks writes behind a 4-digit PIN. The PIN itself is never checked client-side:

1. Host types the PIN; the client calls the `verify-host-pin` Supabase Edge Function with it.
2. The function hashes and compares the PIN server-side, and on success elevates the current anonymous session's `app_metadata` (via the service-role key) to set `host_verified: true`.
3. RLS policies on `shows`, `team_scores`, `scoreboard_teams`, `shiny_formats`, and `questions` check `auth.jwt() -> 'app_metadata' ->> 'host_verified' = true` on every write — the PIN never touches these tables directly, the JWT claim does.
4. Supabase Auth persists the resulting session in localStorage, so the PIN is only needed once per browser until that session is cleared.

**What's actually gated:** `/questions`, `/questions/add`, and — once a show is loaded — the inner BuildMode/LiveMode view at `/host`. The initial `/host` **ShowPicker** screen (before any show is loaded) renders *outside* `HostPinGate` — verified live: attempting to create a show from an unauthenticated session there fails with a 42501 RLS error rather than being blocked by a PIN prompt first, because `HostPinGate` only wraps the code path taken once `show` is non-null (`Host.jsx`). Authenticating via any gated route (e.g. `/questions`) satisfies the gate everywhere else too, since it's the same underlying Supabase Auth session for the origin, not a per-route check.

---

## Key Components

```
client/src/
  views/
    Host.jsx              — switches between BuildMode and LiveMode; owns the curated
                             `actions = { ...showApi }` object passed to both;
                             also owns GoLivePicker accordion + ScoreboardModal state
    Display.jsx           — routing logic + PreShowScreen; jukebox-return Final Break jump;
                             renders ScoreboardOverlay at z-[60] when scoreboardVisible
    Join.jsx              — team phone phase machine (loading→register→waiting→live);
                             has ScoresDrawer bottom sheet (📊 button)
    ShowDetail.jsx        — per-show history page; renders "📊 Final Scoreboard" section
                             from scoreboard_teams, falls back to final_scores JSONB
    Questions.jsx         — Question Archive (/questions); wrapped in <HostPinGate>; 3-across
                             card grid (question truncates >200 chars with Show more/less,
                             answer always visible below), search/type/show/**Regular**
                             (type==='regular' && !is_bonus — the only filter with no matching
                             per-card badge until 2026-07-05) filters, inline edit + two-step
                             Delete (mirrors SlideEditor's confirm pattern). A single "+ Add
                             Questions" banner links out to /questions/add — the bulk-input
                             tiles used to live inline here, moved to their own page.
    AddQuestions.jsx      — /questions/add; wrapped in <HostPinGate>; 3 gradient tiles
                             (centered icon/title/desc, reusing BuildMode's CARD_STYLE
                             classes for 'question'/'swing'/'pyl' so it reads as the same
                             visual system as the dashboard) that reveal
                             DatabaseAddPanels.jsx's matching panel — writes straight to
                             `questions` with show_id/show_title/show_date null, no
                             slide/show involved
  components/
    host/
      DatabaseAddPanels.jsx — QuestionInputPanel/SwingInputPanel/PylInputPanel; same 3 input
                             flows as the host dashboard (AddSlideWizard's Question split-view,
                             SwingRoundWizard, PYLWizard) but stripped of all round/show
                             plumbing — archives directly via archiveQuestion(s), no slide
                             created. Kept visually identical (same tile styling, same
                             step flow) for consistency, per product-register affordance rules.
      BuildMode.jsx       — slide builder UI (wizard + editor modes)
      LiveMode.jsx        — control surface during show; S hotkey toggles scoreboard overlay;
                             "📊 Score" button in nav turns green when overlay is active
      AddSlideWizard.jsx  — guided slide creation (TYPE_CARDS icons must match
                             RoundSidebar's SLIDE_TYPE_META — the only other type→icon
                             map; SlideEditor has none, it branches on slide.type for
                             forms only. This has drifted twice: an early 'title' vs
                             'round-intro' swap, and 'title'/'state-of-union' both 🇺🇸
                             until 2026-07-07 gave 'title' its own 📢.)
      AddRoundWizard.jsx  — 3-type round picker (Normal/Swing/PYL) before round creation
      SlideEditor.jsx     — per-slide editing panel; left side mounts SlideCanvasEditor,
                             right side is the type-specific content sidebar (no manual
                             "Final Break" control — the jukebox-return jump is fully
                             automatic, see Final Break below)
      SlideCanvasEditor.jsx — scaled live canvas (renders the real SlideRenderer/OverlayLayer
                             tree at `transform: scale(k)` — WYSIWYG by construction, not a
                             lookalike). Owns TWO independent systems on one DOM scaffold:
                             region editing (pre-existing, drags a slide's own built-in text
                             fields via `data._regionTransforms`) and overlay editing (this
                             feature, freeform text/image boxes via `data.overlays`, gated
                             behind the "✏️ Edit layout" toggle). The persistent design toolbar
                             (above the canvas, "✏️ Design" toggle) is the only design surface —
                             undo/redo, insert (text/image/Ben Photo), font/size/color/bold/
                             italic/shadow/align, and z-order/duplicate/delete all live here,
                             acting on the selected overlay or setting next-box defaults. The
                             right rail is content-only by hard rule — never add design controls
                             to it. See references/slides.md.
                             Font-target boundary: the toolbar's font controls style OVERLAY text
                             boxes only. A slide's own built-in text reads `theme.fonts.display`
                             and is changed in Theme (the per-show font override), NOT the toolbar
                             — never wire the toolbar to `theme.fonts.display`, or per-show
                             overrides break. The target chip makes the active target visible:
                             amber "New text box" = styling applies to the next box you insert
                             (next-box defaults); indigo "Selected text" = it applies to the
                             selected overlay.
                             ToolbarPopover (inline in this file — NOT a separate
                             ToolbarPopover.jsx) is the reusable popover primitive for the
                             toolbar: portal-based, right-edge-clamped, pointerdown-safe (OV-1)
                             and capture-Escape (OV-3) by construction. Reuse it for any new
                             toolbar popover rather than rolling a new one — a hand-rolled popover
                             re-opens both landmines.
                             Known limit (documented, not a regression): below ~1300px window
                             width the Text group's trailing controls clip inside their track
                             rather than scrolling; the ⋯ overflow / Arrange / History controls
                             stay reachable.
      RoundSidebar.jsx    — round/slide navigation tree; shows shinyFormatName, groups series;
                             divider lines between every section (i > 0 segment-level +
                             slideIdx > 0 within general segments for multi-slide sections)
      ScorePanel.jsx      — fuzzy search + score input + reveal toggle
      ScoreboardModal.jsx — admin scoreboard popup (Score button in HostHeader);
                             TeamTable + QuickEntry components; debounced Supabase upsert
      ShowLibrary.jsx     — show CRUD modal opened from HostHeader (list, load, duplicate,
                             delete with two-step confirm, export, import); new-show creation
                             happens on the separate pre-load ShowPicker screen, not here
                             (`ShowManager.jsx` is dead — no import/render site anywhere)
      HostHeader.jsx      — "Score" button → opens ScoreboardModal; "Preview", "Export",
                             "Go Live →" buttons
      ThemePickerModal.jsx — theme selection + live preview
      ThemeCustomizeControls.jsx — font dropdown/upload + 2 color pickers, extracted
                             from ThemePickerModal.jsx for size
      FormatLibrary.jsx   — 8 shiny format seeds
    shared/
      ThemeProvider.jsx   — theme context; SINGLE merge chokepoint for per-show
                             theme_overrides (applyOverrides()); also registers
                             uploaded custom fonts at runtime via the CSS Font
                             Loading API, with cleanup on font change/unmount
    display/
      ParticleBackground.jsx  — 21 GPU-only ambient themes: 9 keep a bespoke
                                 scene, 12 render the shared BreathingGradient
                                 engine instead (July 2026 rework; see
                                 references/themes.md). NEVER re-mounts
      SlideRenderer.jsx       — routes slide.type → component + manages transitions;
                                 mounts OverlayLayer once, universally, after the slide
                                 component, inside the same transition container
      OverlayLayer.jsx        — dumb, type-agnostic renderer for freeform text/image
                                 overlays (data.overlays). Zero interactivity under every
                                 condition — this is the WYSIWYG ground truth SlideCanvasEditor's
                                 preview also renders. See references/slides.md.
      ShinyIntroScreen.jsx    — shared standalone announce beat ("✨ Format Name" + optional
                                 host photo + optional data.introSubtitle line, e.g. "Dog
                                 Edition") shown before ANY isShiny slide's content, gated on
                                 `data.introDone`. Used by both QuestionSlide.jsx (question type)
                                 and GridSlide.jsx (grid type) — extracted 2026-07-05 so grid
                                 slides get the same intro beat questions already had. GridSlide
                                 had to split into a thin dispatcher + GridContent child to gate
                                 on introDone without violating rules-of-hooks (the intro
                                 early-return can't precede hooks used later in the render).
      ScoreboardOverlay.jsx   — full-screen dark overlay (rgba 0,0,0,0.92) + dual radial
                                 gradient glow; Boogaloo font; gold/silver/bronze medals;
                                 staggered Framer Motion rows (60ms intervals); two-column
                                 layout for >8 teams; triggered by showState.scoreboardVisible
      TitleSlide.jsx, RoundIntroSlide.jsx, QuestionSlide.jsx, GradingBreakSlide.jsx
      ScoreboardRevealSlide.jsx, CustomSlide.jsx, MultiQuestionSlide.jsx
      PixelateSeriesSlide.jsx, PylRevealSlide.jsx, StateOfUnionSlide.jsx
      WinnerRevealSlide.jsx   — drum roll (pre-recorded MP3) → confetti (canvas) → winner pop-in
      QuestionCounter.jsx, BaynesWatermark.jsx, WaveformBars.jsx
  hooks/
    useShow.js            — ALL show state, Supabase Realtime, CRUD actions (master hook)
  themes/
    index.js              — THEMES array (21), getTheme(id), DEFAULT_THEME_ID
```

**Every headline/display-font string in `client/src/components/display/slides/*.jsx` reads `theme.fonts.display`, not a hardcoded `'Boogaloo'`** (fixed 2026-06-30 — this is what makes per-show font overrides actually work on slide content). `Display.jsx`'s `PreShowScreen` title also reads it, and **body text reads `theme.fonts.body`** the same way. Finding 3 (2026-07-07) swept the last pure hardcodes — the PreShow team-count number (was `'Boogaloo'`) plus the `'DM Sans'` labels in `views/Display.jsx`, `ScoreboardOverlay`, and `TeamPreviewSlide` — all now route through the theme fonts, keeping the original family only as a fallback (`'${theme.fonts.body}', 'DM Sans', sans-serif`). If you add a new slide/display component with text, use `theme.fonts.display`/`theme.fonts.body` from the start — don't hardcode a font family, or per-show overrides silently no-op on it. (`/join` and host-panel chrome are intentionally out of this scope — they're not theme-driven display surfaces.)

---

## Round Types (AddRoundWizard.jsx)

```js
const ROUND_TYPES = [
  { id: 'normal', label: 'Normal Round', icon: '🥊', needsNumber: true,  titleTemplate: 'Round {n}' },
  { id: 'swing',  label: 'Swing Round',  icon: '🎷', needsNumber: false, title: 'Swing Round' },
  { id: 'pyl',    label: 'Press Your Luck!', icon: '🎰', needsNumber: false, title: 'Press Your Luck!' },
]
```

Round object stamped: `{ roundType, roundNumber?, subtitle, title }`

---

## Slide Types

15 types in `SlideRenderer.SLIDE_COMPONENTS`:

| Type | Component | Key data fields |
|---|---|---|
| `title` | TitleSlide | title, subtitle |
| `state-of-union` | StateOfUnionSlide | text, hostPhotoUrl |
| `round-intro` | RoundIntroSlide | roundNumber, roundTitle, subtitle, roundType, hostPhotoUrl |
| `swing-round-intro` | RoundIntroSlide | same component as round-intro, swing variant |
| `question` | QuestionSlide | questionNumber, text, isShiny, shinyType, shinyFormatName, mediaUrl, mediaType, audioGainDb |
| `grading-break` | GradingBreakSlide | message, jukeboxLib, backLinkSlideId (jukebox return auto-detects the show's final grading break — see Final Break) |
| `scoreboard-reveal` | ScoreboardRevealSlide | auto-computed from team_scores |
| `custom` | CustomSlide | title, body, imageUrl, layout |
| `multi-question` | MultiQuestionSlide | questions: [{number, text}] |
| `pixelate-series` | PixelateSeriesSlide | stages: [{imageUrl, opacity}] |
| `pyl-reveal` | PylRevealSlide | answers: [{text, revealed}], points |
| `grid` | GridSlide | columns [[{color?,mediaUrl?}]], intraGap, interGap, columnLabels, text, answer, introDone, introSubtitle — shiny "Color Schemes"/concurrent-image formats; host picks columns/rows in AddSlideWizard, tiles + answer filled in SlideEditor GridEditor; image wins over color; carries isShiny (fixed-gold), needs SlideRenderer opacity-neutralize; gets the same ShinyIntroScreen beat as `question` (2026-07-05) |
| `team-preview` | TeamPreviewSlide | none — live-queries `teams` for the show on mount ("Team List": scrolling display of registered team names) |
| `team-picker` | TeamPickerSlide | openingText?, closingText?, parts, currentPart — "Team Intro": fixed black/starfield warp ceremony (background + stars always black/gray regardless of theme; only text stays theme-linked) |
| `winner-reveal` | WinnerRevealSlide | none — computes winner live from `teams`/`team_scores` on mount |

**Shiny subtypes:** `shinyType: 'visual'` (image full-bleed or split) | `shinyType: 'audio'` (waveform bars, PLAY button, Web Audio gain) | `shinyInputSchema.type === 'list'` → `ShinyListQuestion` (bulleted list from `data.listItems: [{text, points}]`, optional point badges — added 2026-07-05; the host editor's `ShinyListBuilder` had existed for a while but nothing ever rendered `listItems` on `/display` until this fix, via new `isListShiny()` in `shinySeries.js`). Anything isShiny that's none of the above falls through to plain `StandardQuestion` (e.g. text-based formats like "First, Second, or Third"). Series-type shiny questions (`isSeries: true`) group as one lead slide + hidden `slotIndex`-ordered siblings in RoundSidebar; drag-reorder carries the whole group as one atomic unit.

**`seriesEnabled` vs `slots` — two independent knobs on a shiny format's `input_schema`.** `slots` (set once, at format-creation time in FormatLibrary) controls a FIXED multi-part shape assigned automatically when the host picks that format in AddSlideWizard (`isMultiSlot = totalSlots > 1`). `seriesEnabled: true` is a separate, orthogonal flag that unlocks a "Part of a Series" toggle in SlideEditor AFTER creation — flipping it converts a flat single-slot question into `data.parts[]` and reveals "+ Add part" for an unbounded number of parts. This is the actual mechanism behind "ask however many you want" formats (pre-existing "Hear! Me! Roar!"; "First, Second, or Third" reuses it for text). `FormatLibrary.jsx`'s create/edit UI only exposes the `seriesEnabled` toggle when `type === 'audio'` — for other types it currently has to be set directly in the DB (a latent UI gap, not fixed).

**Winner Reveal** (shipped 2026-06-30) — add via the 🏆/🥇 card in AddSlideWizard, put it as the literal last slide. On mount: plays a pre-recorded `/drum-roll.mp3` via an HTML5 `<audio>` element (reveal fires on `onended`; a failed load or blocked autoplay falls back to a 2s timeout so the reveal never hangs), or a `useReducedMotion`-gated 1.2s instant skip → winner name pops in full-size with canvas confetti raining from the top → points subtitle fades in 350ms later. Combine with the automatic **Final Break** detection (below) for a fully hands-off show close.

**Final Break** — fully automatic, no per-slide toggle exists (an earlier design used a manual `isFinalBreak` checkbox; it was replaced with auto-detection and this doc wasn't updated until the 2026-07-05 audit). On jukebox return, `Display.jsx` checks two things: is the show's literal last slide a `winner-reveal`, and are there no more `grading-break` slides remaining after the current position? If both are true, it jumps straight to `sorted.length - 1` (the last slide); otherwise it does the normal `current + 1` (clamped). This means the *last* grading break in a show automatically closes it out — nothing to remember to check on a specific slide. One consequence worth knowing: any non-grading-break slide placed between the last grading break and the winner-reveal slide gets silently skipped by the jump, since only "any grading breaks left?" is checked, not "is winner-reveal the very next slide." `Host.jsx` auto-fires `saveResults()` the instant the winner-reveal slide becomes live — no manual "Save Results" button anymore (it was removed from HostHeader).

---

## Scoreboard System (shipped 2026-06-30)

The scoreboard system replaces the Excel scoreboard. Four surfaces:

### 1. Admin Modal (ScoreboardModal.jsx)
- Opened by "Score" button in HostHeader (BuildMode and LiveMode)
- `deriveRoundCols(show)` — reads `show.slides`: `swing-round-intro` slide → "SW", `pyl-reveal` → "PYL", else `R${round.number}`. Always adds `bonus` → "?"
- `computeTotal(scores, cols)` — sums all JSONB score values for a team
- `addStats(teams, cols)` — adds `_total` and `_place` with tie-aware ranking
- Score cells are editable in-place; debounced 500ms Supabase upsert
- Add team, delete team (group-hover delete button), Sort by total, Clear all
- **PYL Picker:** 🎴 Cards / 🥊 Boxing / 📦 Chest buttons — full-screen animated random-team-picker (`CardPick.jsx`, `BoxingRing.jsx`, `ChestDuel.jsx` in `display/slides/`, reused here), picks one random team from `teamsWithStats`, shows a themed selection animation, then highlights the winner in the table. Replaced the old "Random 2 (highlight 2 yellow)" behavior.

**Quick Entry mode (⚡ button):** replicates the Excel VBA macro flow
1. **Team step:** type partial name → substring/case-insensitive match → auto-advance if 1 match, disambiguation buttons if multiple
2. **Round step:** type 1–5 (R1–R5), SW, PYL, M or ? (→ bonus column). Also accepts nth-column numeric fallback
3. **Score step:** type number → Enter → saves → flashes confirmation → loops back to team step
- Input is focus-trapped at each step; Enter advances; real-time display of matched team/round

### 2. TV Overlay (ScoreboardOverlay.jsx)
- `S` hotkey in LiveMode → `actions.setScoreboardVisible(!show.showState.scoreboardVisible)`
- "📊 Score" button in LiveMode nav bar turns green when overlay is active
- `Display.jsx` renders `<ScoreboardOverlay>` at `z-[60]` (above slide content) when `scoreboardVisible` is true
- Visual: full-screen `rgba(0,0,0,0.92)` + dual radial gradient glow, Boogaloo font header, gold/silver/bronze medal emojis, Framer Motion staggered row entrance (60ms per row), two-column layout auto-triggers for >8 teams

### 3. Phone Scoreboard (Join.jsx — ScoresDrawer)
- 📊 button on both WaitingScreen and LiveView on `/join`
- Bottom sheet drawer, slides up; fetches `scoreboard_teams` fresh on each open
- Player's own team row highlighted in gold (`#f5c842` border) via case-insensitive name match against team registration name

### 4. ShowDetail History (ShowDetail.jsx)
- `/shows/:id` page includes "📊 Final Scoreboard" section
- Fetches `scoreboard_teams` for that show from Supabase
- Renders ranked list with gold/silver/bronze medals, per-round scores, total
- Falls back to legacy `final_scores` JSONB if no `scoreboard_teams` rows exist (backward-compat for pre-scoreboard shows)

### scoreboard_teams table
```sql
scoreboard_teams {
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id     text NOT NULL,
  name        text NOT NULL,
  scores      jsonb NOT NULL DEFAULT '{}',  -- keys: "r_${round.id}", "bonus"
  sort_order  integer,
  created_at  timestamptz DEFAULT now()
}
-- RLS: SELECT is public; INSERT/UPDATE/DELETE require the host_verified JWT
-- claim, same pattern as shows/team_scores/shiny_formats/questions (verified
-- live against pg_policies — this table is NOT allow_all despite older notes)
```

Score key format: `r_${round.id}` for each round, `"bonus"` for the "?" mystery column. Values are numbers.

---

## useShow.js — Key Actions

```js
const { show, loading } = useShow()
```

`Host.jsx` passes `actions = { ...showApi }` (a full spread, not a hand-curated list — fixed 2026-06-30 after `uploadFont` went missing from a manually-maintained object and crashed on click; don't reintroduce a curated list here) to `BuildMode`/`LiveMode`.

```js
// Show CRUD
actions.createShow(title, date, themeId)
actions.loadShow(id)
actions.listShows()       // → [{ id, title, date, updatedAt, slideCount, roundCount }]
actions.exportShow() / actions.exportShowById(id)
actions.importShow(json)  // → new show from JSON
actions.duplicateShow(id)
actions.deleteShow(id) / actions.unloadShow()
actions.updateShowMeta({ title, date, theme, themeOverrides })

// Slide CRUD
actions.addSiblingSlides(afterSlideId, slidesData)   // the only slide-creation primitive —
                                                      // AddSlideWizard wraps even a single new
                                                      // slide as a one-element array through this;
                                                      // also how a shiny series adds its parts
actions.updateSlide(id, patch)  // debounced 600ms — writes are SERIALIZED (see note below)
actions.deleteSlide(id)
actions.reorderSlides(newOrder)

// Round CRUD
actions.addRound(data)      // data = { roundType, roundNumber?, subtitle, title }
actions.updateRound(id, patch)
actions.deleteRound(id)     // also deletes all slides in the round
actions.reorderRounds(newOrder)

// Powerups
actions.addPowerup(...) / actions.deletePowerup(id)

// Media / fonts (Supabase Storage — see Storage Buckets below)
actions.uploadMedia(file, isHostPhoto?)
actions.uploadFont(file)   // .woff2/.woff/.ttf/.otf, 5MB cap → { familyName, url }
actions.getHostPhotos()

// Live control
actions.goLive() / actions.goLiveFrom(slideIndex)   // Go Live picker — jump straight to any slide
actions.nextSlide() / actions.prevSlide()
actions.setScoreboardVisible(bool)  // S hotkey in LiveMode; triggers ScoreboardOverlay on /display
actions.setAnswerReveal(bool)       // Stream Deck A key — answer overlay on QuestionSlide
actions.setScoresRevealed(bool)     // Stream Deck R key — per-round scores revealed on /join
actions.updateRoundScore(...)
actions.saveResults()               // aggregates team_scores → final_scores + player_count;
                                     // auto-fires once when winner-reveal slide goes live
```

**`updateSlide`'s debounced write is serialized, not just debounced — this matters for any new debounced-save path.** The 600ms `setTimeout` only coalesces calls that land inside the same window; calls spaced further apart (e.g. drag an overlay, pause, rotate it, pause, recolor it — completely normal host behavior) each schedule their own write. Early on this fired each as an independent, concurrent Supabase `UPDATE`, with no guarantee the one that *finishes* last is the one that was *scheduled* last — an earlier write resolving after a later one silently overwrote newer data with older, even though every request returned 204. Fixed (commit `84d0021`) by chaining each write onto a `slidesSaveChainRef` promise so they always complete in schedule order. If you add another debounced-save field to `useShow.js` beyond `slides`, give it the same chained-promise treatment, not a bare `clearTimeout`+`setTimeout`.

**Overlay editor has four interaction landmines — every one made the feature look *broken* or *absent*, and every one recurs the same way.** (1) **Focus-steal (OV-1):** any toolbar button or contenteditable-adjacent control MUST `preventDefault()` on `pointerdown`. Without it, clicking the button blurs an in-progress inline text edit → blur commits an empty box → the box self-deletes. A single missing `preventDefault` on the text-create path once made the *entire* overlay feature look unbuilt ("click does nothing"). (2) **Discrete-op state (OV-2):** create/delete/duplicate must use the functional `setState` form; the render-closure form writes a stale array and resurrects a just-deleted overlay (observed persisting to Supabase as an empty-text ghost). (3) **Escape scope (OV-3):** an inline edit's Escape/Enter handler must `stopPropagation()` — otherwise Escape bubbles out and unmounts the whole `SlideEditor` mid-edit. (4) **Verify against the stage, not the viewport:** an overlay stored at `x:37 y:42` reads as `38.9/43.2` measured against the browser viewport — that gap is pure 16:9 letterboxing, NOT drift. Measured against the stage element (`getBoundingClientRect` on the overlay node vs the stage node), stored and rendered percent match exactly. Any "overlay position is off on the TV" report must be re-measured stage-relative before it's believed.

**Realtime:** subscribes to `shows` table, `id=eq.${showId}` — all display/join surfaces auto-update. **RT-1 landmine (P0):** Supabase Realtime omits unchanged TOASTed columns from UPDATE payloads — and every real show's `slides` jsonb is TOASTed (>~2KB). So a lightweight write (e.g. `answer_reveal` or `scoreboard_visible` only) delivers a row with NO `slides` key. `setShow(payload.new)` full-replace then nulls `currentSlide` → **blank TV** (and blank phones). `/display` and `/join` MUST merge the payload onto prior state, preserving any key absent from it — never full-replace. The host side (`useShow.js`) already merges; that's why it was immune. This is invisible to code-reading — it lives in Supabase's replication behavior, not the code's logic — so any new Realtime-synced field needs the same merge discipline.

**Two independent show-shape implementations.** `Display.jsx` maintains its own show state (spreads raw Supabase rows directly) separately from `useShow.js`'s `normalizeShow()` (used by Host/Build/LiveMode). They drift independently: a new DB column must be threaded through BOTH by hand — `normalizeShow()` does not auto-map new columns. (Example: `audio_playing` survives on Display's raw-spread object but is absent from `normalizeShow()`'s output, so nothing Host-side can read it.)

---

## Supabase Schema

Project: **Baynes Trivia**, id `qwtbgusqfoypvehnungr`. **Do not confuse with `dreggwinegtirxxanntv` (Baynes Business Suite)** — this mistake caused a scoreboard 404 in production.

```sql
shows { id, title, date, theme_id, slides jsonb, rounds jsonb, powerups jsonb,
        current_slide_id, current_slide_index, is_live, scoreboard_visible,
        scores_revealed, ticker_messages jsonb, audio_playing jsonb,
        special_event jsonb,
        theme_overrides jsonb NOT NULL DEFAULT '{}',   -- per-show font/color, see Theme System
        answer_reveal boolean,                          -- Stream Deck A key overlay state
        player_count integer, final_scores jsonb }       -- written by saveResults()

teams { id, show_id, name, color, registered_at, powerup_used, powerup_used_on,
        is_connected, last_action, last_action_at }

team_scores { id, show_id, team_id, round_index, score, unique(team_id, round_index) }

questions { id serial PK, type NOT NULL CHECK ('regular'|'shiny'|'swing'|'pyl'|'bonus'),
            text, answer, category, round_type CHECK ('normal'|'swing'|'pyl') NULL ok,
            used_on date[] NOT NULL DEFAULT '{}', is_bonus bool DEFAULT false,
            is_shiny bool DEFAULT false, shiny_type, shiny_format_name,
            questions_data jsonb, display_order int DEFAULT 0, shiny_style_id (dead),
            show_id, show_title, show_date, created_at timestamptz DEFAULT now() }
  -- the cross-show question ARCHIVE (Question Database, /questions) — text/answer only,
  -- no media_url column exists, so image/audio shiny content is never preserved here,
  -- only its text+answer. type: 'regular' | 'shiny' | 'pyl' | 'swing'. questions_data
  -- (swing only) is an array of {text, answer}. shiny_style_id is a dead legacy int
  -- column, unrelated to the current text-id shiny_formats scheme — ignore it.
  -- category (free-text), round_type, and used_on[] (play-date history for reuse
  -- analysis — an array; the single show_date pair is separate) were added 2026-07-06
  -- (migration questions_category_roundtype_usedon) BEFORE bulk entry began. The
  -- /questions/add panels set all three via STICKY fields (category combobox suggesting
  -- existing values, Normal/Swing/PYL segmented picker, optional played-on date) that
  -- survive saves and panel switches — state lives in AddQuestions.jsx. Swing/PYL
  -- panels stamp their round_type automatically. Cmd/Ctrl+Enter saves from inside a
  -- question textarea; Enter saves from the answer field; a beforeunload guard arms
  -- while any entry text is unsaved. The archive's inline edit also covers category.
  -- RLS (2026-07-05): SELECT is public; INSERT/UPDATE/DELETE all require
  -- auth.jwt() -> 'app_metadata' ->> 'host_verified' = true (see HostPinGate.jsx) —
  -- any page that writes here MUST be wrapped in <HostPinGate>, including /questions
  -- itself (it wasn't, until the RLS gap below was found).
  -- Written by: `archiveQuestion(s)` (client/src/lib/archiveQuestion.js), called from
  -- AddSlideWizard.jsx's real show-creation path (regular/shiny/grid) and from
  -- BuildMode.jsx's handleSwingAdd/handlePYLAdd. Also written directly, with no show
  -- attached (show_id/show_title/show_date null), by the "Add Questions" panels on
  -- /questions/add (client/src/components/host/DatabaseAddPanels.jsx) — same 3 flows
  -- (Question/Swing/PYL) as the host dashboard, minus all round/show plumbing, for
  -- bulk-uploading past-show trivia without creating a slide.

shiny_formats { id text PK ('fmt_'+nanoid8), name, icon, description,
                input_schema jsonb: { type, slots, sequential, seriesEnabled, hasPoints, labels, columnLabels } }
  -- the REAL shiny-format system — created/edited entirely in-app via "✨ Add Shiny"
  -- (FormatLibrary.jsx + useShinyFormats.js). The old shinyFormatDictionary.js/
  -- shinyStampers.js (SHINY_FORMATS/LAYOUTS/stampSlides) were dead code from an
  -- earlier design (superseded 2026-06-30) and were DELETED 2026-07-07 — don't
  -- recreate that pattern for new formats.

scoreboard_teams { id uuid PK, show_id text, name text, scores jsonb DEFAULT '{}',
                   sort_order int, created_at timestamptz }
  -- scores keys: "r_${round.id}" per round, "bonus" for mystery column
  -- RLS: SELECT public; INSERT/UPDATE/DELETE require the host_verified JWT
  -- claim (verified live against pg_policies) — same pattern as every other
  -- write-gated table, NOT allow_all
```

**Storage buckets** (all `public: true`, "public read" SELECT + "anon insert" INSERT policies on `storage.objects` scoped per `bucket_id` — this is the precedent pattern, copy it for any new bucket):
- `trivia-show-media` — question/slide images, audio
- `trivia-host-photos` — Ben photos (`/public/ben/` API route also exists, separate from Storage)
- `trivia-fonts` — custom uploaded display fonts (see Theme System)

**Note:** all 3 buckets did not exist at all until 2026-06-30 (zero buckets, zero RLS policies existed in this project before then, despite `uploadMedia`/`getHostPhotos` code referencing them) — they were created as a byproduct of building the font-upload feature. If Storage uploads ever 404 again, check `storage.buckets` first before assuming a code bug.

---

## Display View Architecture

**ParticleBackground:**
- Mounts once in DisplayInner, OUTSIDE AnimatePresence
- 3-layer: atmosphere (gradient washes) + mid glow (accent) + accent detail
- One named focal anchor (sun, moon, neon sign, SVG, sprite)
- At least one drifter with real `translate` motion
- Center 60% × 45% kept clear for content
- Colors from `theme.colors`; re-renders only on theme change

**Transitions (10 named + random):** dissolve, emerge, zoom, punch, drop, descend, sink, settle, loom, assemble — all selectable in `SlideEditor`'s transition picker. `assemble` is defined as a minimal instant-appear/fade-exit (no child-stagger yet — see build-state.md Remaining).

**Easing curves (canonical):** all Framer Motion easing imports come from `client/src/lib/easings.js` — never redeclare curves locally.

| Export | Value | Use |
|---|---|---|
| `EASE_OUT` | `[0.23, 1, 0.32, 1]` | standard enters |
| `EASE_EXIT` | `[0.33, 1, 0.68, 1]` | exits |
| `EASE_DROP` | `[0.25, 1, 0.25, 1]` | weighted lands |
| `EASE_BAR` | `[0.4, 0, 0.2, 1]` | score/progress bars |
| `EASE_PANEL` | `[0.32, 0.72, 0, 1]` | drawers/sheets |

Old names `EASE_SNAP`/`EASE_QUINT`/`EASE_QUART`/`EASE_CUBIC`/`EASE_DRAWER` are retired — don't reintroduce them. Tailwind arbitrary-value className strings still hardcode the raw cubic-bezier literal (a className string can't import JS).

Score/progress bars animate `transform: scaleX()` with `transformOrigin: 'left center'` inside a clipping wrapper — never animate `width` (also covered by Critical Rule 2, GPU-only animations).

Slide components with spatial motion (x/y/scale/rotate) must gate the offsets behind `useReducedMotion()`.

---

## Text Sizing (measure-to-fit)

All host-typed text on `/display` auto-sizes by MEASURING rendered glyph width, not counting characters. One system, `client/src/lib/autoFitText.js`:

- `fitToBox(text, {family, boxW, boxH, floorPx, ceilPx, maxLines, lineHeight})` — binary-searches the largest px size that fits a FIXED region. Used by the 6 fixed-region slides (StateOfUnion, GradingBreak, Custom, Question:94, RoundIntro, WinnerReveal) via per-surface `*_BOX` consts.
- `useFitToBox(ref, text, opts)` — same, but ResizeObserves a container whose width comes from layout. Used by caption sites (Pixelate, Grid, Question:231/269).
- `useFitListToBox(ref, items, {...rowInset})` — UNIFORM size across all rows of a list so the whole list fits its container; sizes the longest item to the per-row height budget. Used by MultiQuestion + PylReveal. `rowInset` subtracts the number-column/badge/padding width per row.

Per-surface intent lives in `*_FLOOR`/`*_CEIL` (rem) + `*_BOX` consts. There are NO tier tables — char-count sizing (`autoFitClamp`/`*_TIERS`) was deleted 2026-07-03.

**Gotchas:**
- `family` passed to any fit fn MUST match what the element actually renders, or it measures the wrong glyphs. Two surfaces (Custom, RoundIntro) render `system-ui` (no inline font, inherits global `body{}`), NOT a theme font. `PylReveal` migrated to `theme.fonts.body` in commit `4b07415` (2026-07-05) and is no longer on this list — confirm no other surface has silently drifted before trusting this count again. If you ever give Custom/RoundIntro a theme font, update the fit-call `family` in the same edit.
- Fit measures via canvas BEFORE web fonts load → fallback metrics. Every consumer guards with `document.fonts.ready` (fixed-region: a `fontsReady` state; hooks: built in). Don't remove it.
- All 21 themes currently ship the same fonts (Boogaloo display / DM Sans body). The per-theme font override exists but is unused.

---

## Physical Setup

- **MacBook (host):** `/host` on laptop screen (light mode, 1920px)
- **TV(s):** `/display` fullscreen on HDMI output (OREI HD18-EX165-K 1×8 splitter → 3 TVs)
- **macOS:** Extended display mode — laptop ≠ TV
- **Stream Deck:** ArrowRight/Left (advance/back), A (answer reveal), S (scoreboard overlay toggle), R (reveal scores) — all handled inline in `LiveMode.jsx`'s `handleKeyDown`, no separate hook. Audio play is NOT stream-deck-bound; it's an on-display PLAY button (`QuestionSlide.jsx`). Volume is system-level, not app-bound.
- **Phones:** `/join?show=${showId}` via QR code on PreShowScreen

---

## Theme System

21 themes in `/themes/index.js`. Theme object:
```js
{
  id, name,
  colors: { bg, bgDeep, accent, highlight, text, textMuted, shinyBg, shinyAccent },
  vignette: { r, g, b, strength },
  fonts: { display, body, ui },
  scene: { background: null, foreground: null } // future
}
```

`getTheme(id)` falls back to `DEFAULT_THEME_ID` (`'pure-michigan'`) if not found. All three fallback paths in the codebase — `getTheme`'s own fallback, `useShow.js`'s show-load default, and `normalizeShow`'s import default — resolve through this single constant, not three separate IDs.

21 themes: pure-michigan ★, midnight-galaxy ✓, autumn-harvest ★, northern-lights, medieval-tavern, sunset-boulevard ✓, retro-arcade, sand-dune-chill ✓, halloween ✓, jazz-club, dive-bar, sonora-balloons ✓ (renamed from rooftop-party), christmas-eve, drive-in-movie, western-showdown, under-the-sea ✓, neon-tokyo, firefly-summer, wine-cellar, meteor-shower ✓, eighties-night. (★ = confirmed-good exemplar, ✓ = bland-pass rework shipped, ⟳ = in progress, unmarked = still on the bland-pass queue — **these markers apply only to the 9 BESPOKE themes**; `jazz-club`/`drive-in-movie`/`firefly-summer` lost their old ✓/★ status when their bespoke scene retired to the shared BreathingGradient in the July 2026 rework. See `references/themes.md` for the full law/recipe + the bespoke/gradient Path column. **Verify this list against `git log` per-theme before trusting it** — it drifted out of sync with reality once already this project.)

### Per-show theme overrides (shipped 2026-06-30)

A host can customize one specific show's display font and text colors from `ThemePickerModal.jsx`'s "Customize" row — **without touching the shared theme definition** other shows using that theme still see the unmodified original.

- **Storage:** `shows.theme_overrides jsonb`, shape `{ fonts: { display, displayUrl? }, colors: { text, textMuted } }`. Empty `{}` for every show that's never touched this (the default, verified no-observable-side-effect for existing shows).
- **Merge chokepoint:** `ThemeProvider.jsx`'s `applyOverrides(baseTheme, overrides)` — spreads `overrides.fonts`/`overrides.colors` on top of the base theme's. Every `<ThemeProvider showThemeId={...} overrides={show.themeOverrides}>` call site that has a REAL show (not the `/display?demo=1` synthetic one) must pass `overrides` — currently that's `Host.jsx` and 2 of `Display.jsx`'s 3 call sites (the demo one intentionally doesn't).
- **Font presets:** Boogaloo, Handters, Roquen, DM Sans (the 4 fonts actually registered — 2 via `@font-face` in `index.css`, 1 Google-Fonts-loaded, 1 build default). Picking a preset explicitly clears any leftover `displayUrl` from an earlier custom upload (`displayUrl: undefined`) — don't drop that clear, it prevents a preset font silently rendering with a stale custom font file.
- **Custom font upload:** `useShow.js`'s `uploadFont(file)` → `trivia-fonts` bucket → `{ familyName: 'Custom-${nanoid(8)}', url }`. `ThemeProvider.jsx` registers it at runtime via the CSS Font Loading API (`new FontFace(...).load().then(loaded => document.fonts.add(loaded))`), with a `useRef`-tracked cleanup (`document.fonts.delete()`) on font change/unmount so switching shows in one browser tab doesn't leak `FontFace` objects forever. Failed loads `console.warn` rather than throw — a bad upload must never crash the live TV display.
- **Where it's wired:** every slide's headline text already reads `theme.fonts.display` (not hardcoded — see Key Components above), so a font override just works on slide content, the pre-show title, and Build Mode's own preview once `ThemeProvider` gets `overrides`.
