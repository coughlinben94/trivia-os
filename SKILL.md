---
name: trivia-os
description: Trivia OS — real-time trivia-night platform for Baynes Apple Valley (React + Vite + Supabase Realtime; 21 ambient themes with per-show font/color overrides, 15 slide types including automated Winner Reveal, full scoreboard system). Use this skill whenever working on Trivia OS or anything under ~/Projects/trivia-os — the host build/live control surface, the /display TV renderer, /join phones, slides, rounds, scoring, powerups, the ambient ParticleBackground themes, theme overrides, or display transitions/animations. Read this plus its references before any display/theme/animation work, even on casual asks.
---

# Trivia OS — Developer Skill

> Real-time trivia night management platform. Replaces PowerPoint + Excel entirely. Four views: /host (build + control), /display (TV), /join (phones), /shows (dashboard + scoreboard history). Read this + all references before building anything display-facing.

**Repo:** `~/Projects/trivia-os`  
**Stack:** React 18, Vite, Tailwind, Framer Motion 10, Supabase JS, Fuse.js, nanoid  
**Deploy:** `git push` → Vercel auto-deploys  
**Live:** https://trivia-os.vercel.app  
**Project skill:** `.claude/skills/trivia-os/` (symlinks to repo root SKILL.md + references/)

**Shipped 2026-06-30:** per-show theme font/color overrides + custom font upload (see Theme System), Winner Reveal slide + Final Break auto-close (see Slide Types), Go Live picker (jump to any slide accordion), answer-reveal overlay (Stream Deck A key), shiny-question sidebar/series improvements, full scoreboard system (admin modal, Quick Entry, TV overlay, phone drawer, ShowDetail history). See each section below for details.

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

---

## Routes

| Route | Purpose |
|---|---|
| `/host` | Build Mode (pre-show) → Live Mode (during show) |
| `/display` | TV fullscreen — PreShowScreen or slide renderer |
| `/join` | Team phones — register, follow show, scoreboard, powerups |
| `/shows` | Show library + ShowDetail (scoreboard history) |
| `/scores` | Optional secondary scoreboard display |
| `/ambient` | Dev-only theme previewer (not in prod routing) |

**Display routing logic:**
```
show=null            → purple fallback screen
?preview=true        → PreviewSlide (debug label)
is_live && current_slide_id === null → PreShowScreen (QR + ticker + teams)
is_live && current_slide_id !== null → DisplayInner (full slide renderer)
```

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
  components/
    host/
      BuildMode.jsx       — slide builder UI (wizard + editor modes)
      LiveMode.jsx        — control surface during show; S hotkey toggles scoreboard overlay;
                             "📊 Score" button in nav turns green when overlay is active
      AddSlideWizard.jsx  — guided slide creation (TYPE_CARDS icons must match
                             RoundSidebar/SlideEditor's SLIDE_TYPE_META — this drifted
                             once already, e.g. 'title' vs 'round-intro' emoji swap)
      AddRoundWizard.jsx  — 3-type round picker (Normal/Swing/PYL) before round creation
      SlideEditor.jsx     — per-slide editing panel; GradingBreakEditor has "Final Break" toggle
      RoundSidebar.jsx    — round/slide navigation tree; shows shinyFormatName, groups series;
                             divider lines between every section (i > 0 segment-level +
                             slideIdx > 0 within general segments for multi-slide sections)
      ScorePanel.jsx      — fuzzy search + score input + reveal toggle
      ScoreboardModal.jsx — admin scoreboard popup (Score button in HostHeader);
                             TeamTable + QuickEntry components; debounced Supabase upsert
      ShowManager.jsx     — show CRUD (list, create, load, duplicate, export, import)
      HostHeader.jsx      — "Score" button → opens ScoreboardModal; "Preview", "Export",
                             "Go Live →" buttons
      ThemePickerModal.jsx — theme selection + live preview; THIS is the real one (a
                             legacy unused `ThemePicker.jsx` also exists, don't build on it)
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
      SlideRenderer.jsx       — routes slide.type → component + manages transitions
      ScoreboardOverlay.jsx   — full-screen dark overlay (rgba 0,0,0,0.92) + dual radial
                                 gradient glow; Boogaloo font; gold/silver/bronze medals;
                                 staggered Framer Motion rows (60ms intervals); two-column
                                 layout for >8 teams; triggered by showState.scoreboardVisible
      TitleSlide.jsx, RoundIntroSlide.jsx, QuestionSlide.jsx, GradingBreakSlide.jsx
      ScoreboardRevealSlide.jsx, CustomSlide.jsx, MultiQuestionSlide.jsx
      PixelateSeriesSlide.jsx, PylRevealSlide.jsx, StateOfUnionSlide.jsx
      WinnerRevealSlide.jsx   — drum roll (Web Audio) → confetti (canvas) → winner pop-in
      QuestionCounter.jsx, BaynesWatermark.jsx, WaveformBars.jsx
  hooks/
    useShow.js            — ALL show state, Supabase Realtime, CRUD actions (master hook)
  themes/
    index.js              — THEMES array (21), getTheme(id), DEFAULT_THEME_ID
```

**Every headline/display-font string in `client/src/components/display/slides/*.jsx` reads `theme.fonts.display`, not a hardcoded `'Boogaloo'`** (fixed 2026-06-30 — this is what makes per-show font overrides actually work on slide content). `Display.jsx`'s `PreShowScreen` title also reads it. If you add a new slide component with headline text, use `theme.fonts.display` from the start — don't hardcode a font family.

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
| `grading-break` | GradingBreakSlide | message, jukeboxLib, backLinkSlideId, **isFinalBreak** (jukebox return jumps to last slide instead of +1) |
| `scoreboard-reveal` | ScoreboardRevealSlide | auto-computed from team_scores |
| `custom` | CustomSlide | title, body, imageUrl, layout |
| `multi-question` | MultiQuestionSlide | questions: [{number, text}] |
| `pixelate-series` | PixelateSeriesSlide | stages: [{imageUrl, opacity}] |
| `pyl-reveal` | PylRevealSlide | answers: [{text, revealed}], points |
| `grid` | GridSlide | columns [[{color?,mediaUrl?}]], intraGap, interGap, columnLabels, text — shiny "Color Schemes"; host picks columns/rows in AddSlideWizard, tiles filled in SlideEditor GridEditor; image wins over color; carries isShiny (fixed-gold), needs SlideRenderer opacity-neutralize |
| `team-preview` | TeamPreviewSlide | none — live-queries `teams` for the show on mount ("Team List": scrolling display of registered team names) |
| `team-picker` | TeamPickerSlide | openingText?, closingText?, parts, currentPart — "Team Intro": fixed black/starfield warp ceremony (background + stars always black/gray regardless of theme; only text stays theme-linked) |
| `winner-reveal` | WinnerRevealSlide | none — computes winner live from `teams`/`team_scores` on mount |

**Shiny subtypes:** `shinyType: 'visual'` (image full-bleed or split) | `shinyType: 'audio'` (waveform bars, PLAY button, Web Audio gain). Series-type shiny questions (`isSeries: true`) group as one lead slide + hidden `slotIndex`-ordered siblings in RoundSidebar; drag-reorder carries the whole group as one atomic unit.

**Winner Reveal** (shipped 2026-06-30) — add via the 🏆/🥇 card in AddSlideWizard, put it as the literal last slide. On mount: 3s synthesized Web Audio drum roll (accelerating snare hits → finale, or a `useReducedMotion`-gated instant skip) → winner name pops in full-size with canvas confetti raining from the top → points subtitle fades in 350ms later. Combine with the **Final Break** toggle (below) for a fully hands-off show close.

**Final Break** — a checkbox on a `grading-break` slide's editor (`isFinalBreak` in slide data). When the host is live and the Jukebox sends them back from THAT specific grading break, `Display.jsx` reads `isFinalBreak` and jumps straight to `sorted.length - 1` (the last slide) instead of the normal `current + 1`. Every other grading break without the toggle still does +1. `Host.jsx` auto-fires `saveResults()` the instant the winner-reveal slide becomes live — no manual "Save Results" button anymore (it was removed from HostHeader).

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
-- RLS: allow_all policy (anon read+write)
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
actions.addSlide(type, data)
actions.addSiblingSlides(...)   // shiny series
actions.updateSlide(id, patch)
actions.deleteSlide(id)
actions.reorderSlides(newOrder)

// Round CRUD
actions.addRound(data)      // data = { roundType, roundNumber?, subtitle, title }
actions.updateRound(id, patch)
actions.deleteRound(id)     // also deletes all slides in the round
actions.reorderRounds(newOrder)

// Powerups / ticker
actions.addPowerup(...) / actions.deletePowerup(id)
actions.updateTickerMessages(msgs)

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

**Realtime:** subscribes to `shows` table, `id=eq.${showId}` — all display/join surfaces auto-update.

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

questions { id, text, answer, category, round_type, is_shiny, shiny_type, used_on date[] }

shiny_formats { ... }  -- 6 seeded formats

scoreboard_teams { id uuid PK, show_id text, name text, scores jsonb DEFAULT '{}',
                   sort_order int, created_at timestamptz }
  -- scores keys: "r_${round.id}" per round, "bonus" for mystery column
  -- RLS: allow_all policy (anon read+write)
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
- `family` passed to any fit fn MUST match what the element actually renders, or it measures the wrong glyphs. Three surfaces (Custom, RoundIntro, PylReveal) render `system-ui` (no inline font, inherits global `body{}`), NOT a theme font. If you ever give them a theme font, update the fit-call `family` in the same edit.
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

`getTheme(id)` falls back to `midnight-galaxy` if not found. (Three slightly different fallback theme IDs exist across the codebase — `getTheme`'s own fallback, `DEFAULT_THEME_ID`, and `normalizeShow`'s fallback — currently all resolve to compatible values but haven't been unified; worth knowing if a "wrong default theme" bug ever shows up.)

21 themes: pure-michigan ★, midnight-galaxy, autumn-harvest ★, northern-lights, medieval-tavern, sunset-boulevard ✓, retro-arcade, sand-dune-chill ✓, halloween, jazz-club, dive-bar, sonora-balloons ✓ (renamed from rooftop-party), christmas-eve, drive-in-movie, western-showdown, under-the-sea, neon-tokyo, firefly-summer, wine-cellar, meteor-shower, eighties-night. (★ = confirmed-good exemplar, ✓ = bland-pass rework shipped, ⟳ = in progress, unmarked = still on the bland-pass queue — **these markers apply only to the 9 BESPOKE themes**; `jazz-club`/`drive-in-movie`/`firefly-summer` lost their old ✓/★ status when their bespoke scene retired to the shared BreathingGradient in the July 2026 rework. See `references/themes.md` for the full law/recipe + the bespoke/gradient Path column. **Verify this list against `git log` per-theme before trusting it** — it drifted out of sync with reality once already this project.)

### Per-show theme overrides (shipped 2026-06-30)

A host can customize one specific show's display font and text colors from `ThemePickerModal.jsx`'s "Customize" row — **without touching the shared theme definition** other shows using that theme still see the unmodified original.

- **Storage:** `shows.theme_overrides jsonb`, shape `{ fonts: { display, displayUrl? }, colors: { text, textMuted } }`. Empty `{}` for every show that's never touched this (the default, verified no-observable-side-effect for existing shows).
- **Merge chokepoint:** `ThemeProvider.jsx`'s `applyOverrides(baseTheme, overrides)` — spreads `overrides.fonts`/`overrides.colors` on top of the base theme's. Every `<ThemeProvider showThemeId={...} overrides={show.themeOverrides}>` call site that has a REAL show (not the `/display?demo=1` synthetic one) must pass `overrides` — currently that's `Host.jsx` and 2 of `Display.jsx`'s 3 call sites (the demo one intentionally doesn't).
- **Font presets:** Boogaloo, Handters, Roquen, DM Sans (the 4 fonts actually registered — 2 via `@font-face` in `index.css`, 1 Google-Fonts-loaded, 1 build default). Picking a preset explicitly clears any leftover `displayUrl` from an earlier custom upload (`displayUrl: undefined`) — don't drop that clear, it prevents a preset font silently rendering with a stale custom font file.
- **Custom font upload:** `useShow.js`'s `uploadFont(file)` → `trivia-fonts` bucket → `{ familyName: 'Custom-${nanoid(8)}', url }`. `ThemeProvider.jsx` registers it at runtime via the CSS Font Loading API (`new FontFace(...).load().then(loaded => document.fonts.add(loaded))`), with a `useRef`-tracked cleanup (`document.fonts.delete()`) on font change/unmount so switching shows in one browser tab doesn't leak `FontFace` objects forever. Failed loads `console.warn` rather than throw — a bad upload must never crash the live TV display.
- **Where it's wired:** every slide's headline text already reads `theme.fonts.display` (not hardcoded — see Key Components above), so a font override just works on slide content, the pre-show title, and Build Mode's own preview once `ThemeProvider` gets `overrides`.
