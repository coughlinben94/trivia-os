# references/build-state.md — Current Build State

**Read this at the start of every session** before touching any code. It tells you what's done, what's next, and what's broken.

---

## Completed (as of June 30, 2026, + July 2026 additions noted inline below)

**All original build steps complete + significant new features shipped.** July 2026 additions not yet folded into a fresh date stamp: `grid` slide (shiny Color Schemes), `team-picker`/`team-preview` slides, freeform `data.overlays` canvas system via `OverlayLayer.jsx` (superseded the earlier `SlideElements.jsx`/`data.elements`), PYL Picker (Cards/Boxing/Chest) replacing Random 2, measure-to-fit text sizing (`autoFitText.js`, retired the old tier tables), 9-bespoke/12-gradient theme split. See git log for exact commits — this file lags reality, cross-check before trusting a "not yet built" claim below.

### Infrastructure
- Vite + React + Tailwind scaffold, Supabase client, env vars wired, vercel.json SPA rewrite
- Supabase schema: `shows`, `teams`, `team_scores`, `questions`, `scoreboard_teams` tables, Realtime enabled
- `ticker_messages jsonb` column, `theme_overrides jsonb`, `answer_reveal boolean` added to `shows`
- Storage buckets created: `trivia-show-media`, `trivia-host-photos`, `trivia-fonts` (all public, anon insert)
- `questions` table RLS: public SELECT, anon INSERT, service_role ALL

### `/host` Build Mode
- `useShow.js` — full show CRUD, normalizeShow, Realtime subscription, all actions (spread pattern — never a hand-curated object)
- `ShowManager.jsx` — show list, create/load/duplicate/delete
- `BuildMode.jsx` — slide builder layout, mode switching (wizard/editing); onOpenScoreboard prop
- `RoundSidebar.jsx` — accordion sidebar (all rounds start collapsed); drag-and-drop rewrite; direction-based reorder; divider lines between all sections (i > 0 segment-level + slideIdx > 0 within multi-slide general segments)
- `SlideEditor.jsx` — per-slide editing panel; GradingBreakEditor has "Final Break" toggle
- `AddSlideWizard.jsx` — 4-step guided slide creation + shiny 3-step wizard
- `FormatLibrary.jsx` + `useShinyFormats.js` — shiny format manager, 8 seed formats
- `HostHeader.jsx` — title edit, copy join link, Score button, Preview, Export, Go Live
- `TickerMessageManager.jsx` — modal editor for pre-show ticker messages
- `ThemePickerModal.jsx` + `ThemeCustomizeControls.jsx` — theme selection + per-show font/color customization
- `ScoreboardModal.jsx` — admin scoreboard (TeamTable + QuickEntry), backed by `scoreboard_teams`

### `/host` Live Mode
- `LiveMode.jsx` — control surface: prev/next, slide counter, scoreboard toggle (📊 Score button, green when active), S hotkey, A hotkey
- `ScorePanel.jsx` — fuzzy search (Fuse.js), score input, hold-to-confirm, reveal toggle
- Host → Display sync via Supabase Realtime
- **Live theme swap during show:** `theme_id` Realtime propagation — theme changes during a show update all surfaces instantly
- **Connection-loss banner:** `HostReconnectingBanner` at HostInner level

### GoLivePicker (Host.jsx)
- Accordion structure matching the left sidebar
- Rounds collapsed by default; click header to expand
- "Start from beginning" button + jump-to-any-slide picker

### `/display`
- `Display.jsx` — full routing waterfall; jukebox-return Final Break jump; renders `ScoreboardOverlay` at `z-[60]` when `scoreboardVisible` true
- `PreShowScreen` — QR code, ambient, Baynes watermark, Ben photo (the ticker editor was removed as dead code — see TICK-1; no render site ever existed for it)
- `SlideRenderer.jsx` — routes to per-type components; 10 named transitions (incl. `assemble`) + Random + reduced-motion crossfade
- 15 slide types in `SLIDE_COMPONENTS`: TitleSlide, RoundIntroSlide (also `swing-round-intro`), QuestionSlide, GradingBreakSlide, ScoreboardRevealSlide, CustomSlide, StateOfUnionSlide, MultiQuestionSlide, PixelateSeriesSlide, PylRevealSlide, WinnerRevealSlide, GridSlide, TeamPreviewSlide, TeamPickerSlide — see `references/slides.md`
- `ParticleBackground.jsx` — 9 bespoke ambient scenes + 12 shared BreathingGradient themes (July 2026 rework, see `references/themes.md`), 3-layer architecture
- Answer reveal overlay on QuestionSlide (A key / `answer_reveal` flag)

### Winner Reveal + Final Break (shipped 2026-06-30)
- `WinnerRevealSlide.jsx` — pre-recorded `/drum-roll.mp3` via `<audio>` → canvas confetti → winner name pop-in
- Final Break is fully automatic (no editor checkbox): jukebox return jumps to the last slide when it's a `winner-reveal` type AND no `grading-break` slides remain after the current position — see SKILL.md's Final Break section for the exact rule and its one edge-case caveat
- `Host.jsx` auto-fires `saveResults()` when winner-reveal slide goes live

### Per-show Theme Overrides (shipped 2026-06-30)
- `ThemeCustomizeControls.jsx` — font dropdown (4 presets), custom font upload (.woff2/.woff/.ttf/.otf, 5MB), 2 color pickers (text, textMuted)
- `ThemeProvider.jsx` merge chokepoint — `applyOverrides(baseTheme, overrides)` covers all slides automatically
- Storage: `shows.theme_overrides jsonb`, custom fonts in `trivia-fonts` bucket
- CSS Font Loading API (`new FontFace(...).load()`) with useRef cleanup on unmount

### Scoreboard System (shipped 2026-06-30)
- `ScoreboardModal.jsx` — admin modal, Quick Entry (3-step VBA macro replica), debounced upsert
- `ScoreboardOverlay.jsx` — TV full-screen overlay, staggered Framer Motion rows, medals
- `Join.jsx` ScoresDrawer — phone bottom sheet, player's own team highlighted gold
- `ShowDetail.jsx` — final standings section with medals + round breakdown

### `/join`
- `Join.jsx` — complete phase machine: `loading → register → waiting → live → no-show`
- Session recovery via localStorage
- ScoresDrawer bottom sheet (📊 button, fetches `scoreboard_teams`)
- Reconnecting banner on CHANNEL_ERROR / TIMED_OUT / CLOSED
- No forward button — teams are followers only
- All host-alert toasts (tried_to_advance, went_back, left_app, used_powerup)
- Cross-theme contrast floor on top-bar labels

### `/shows` Show Library + ShowDetail
- `ShowManager.jsx` / Show library route — list, create/load/duplicate/delete/export/import
- `ShowDetail.jsx` — per-show history, "📊 Final Scoreboard" section from `scoreboard_teams`

### Powerup System
- Host definition in Build Mode
- Phone invocation on /join with confirmation dialog + double-tap guard
- Host panel red alert toast

### Transition System
- 9 named per-slide transitions: dissolve, emerge, zoom, punch, drop, descend, sink, settle, loom + Random
- Assignable per-slide via SlideEditor picker
- Reduced-motion collapses all to `dissolve` crossfade
- `assemble` defined in SlideRenderer but NOT in picker (needs child-stagger wiring)

### Animation, A11y & Polish
- Reduced-motion coverage on all animated elements
- GPU-only animations everywhere in ParticleBackground
- DM Sans 600/700 properly loaded
- PreShow text legibility pass for TV at 10ft

### Shiny Question System
- 3-step shiny wizard in AddSlideWizard (pick format → details form → SlideEditor)
- Formats live in the Supabase `shiny_formats` table, created/edited entirely in-app via "✨ Add Shiny" (`FormatLibrary.jsx` + `useShinyFormats.js`). `shinyFormatDictionary.js`/`shinyStampers.js` are DEAD CODE (superseded 2026-06-30) — don't read or extend them, see SKILL.md's Shiny Format System section.
- Series-type shiny questions grouped atomically in RoundSidebar
- Every shiny slide (question AND grid) gets a shared `ShinyIntroScreen` beat before content, gated on `data.introDone`, with an optional per-instance `data.introSubtitle` line (2026-07-05)

### 21 Ambient Themes
- July 2026 rework split them into 9 bespoke (hand-built scene) + 12 shared BreathingGradient themes. Per-theme bland-pass status, anchors/drifters, and the bespoke/gradient split live in `references/themes.md` now — don't duplicate that tracking here, it drifts.
- 3-layer architecture enforced; GPU-only; tinted vignette system

---

## Remaining

| # | Step | Notes |
|---|------|-------|
| — | **Data tab integration** | User mentioned: "data needs to be fed to the data tab so i can keep track of the variables we decided on" — `scoreboard_teams` data → Data slide type. Not yet designed or built. |
| — | **`assemble` transition child-stagger** | Selectable in the picker now, but its definition is still a minimal instant-appear/fade-exit — no actual child-element stagger wired yet. |
| — | **Ambient bland-pass tracking** | Moved to `references/themes.md` — check there per-theme, not here. |
| — | **Profiling-dependent P2s** | MeteorShower 200-node DOM field + /join `backdrop-filter: blur()` on cheap Androids — both need real-hardware profiling before deciding if there's a problem. NOT blind-fix items. |
| — | **Scoreboard TV overlay + phone drawer Playwright verification** | Built by subagents 2026-06-30 — verify current status before assuming still untested; several commits have touched these surfaces since. |

---

## Known Issues

- **`ThemeCanvas.jsx` / `ThemeForeground.jsx`** — wired but `scene: null` (background/foreground) on all 21 themes; a `cssClass` field now also exists on `scene`. Future use.
- **`baynes-logo.svg`** — file doesn't exist anywhere in `client/public/`, not just `dist/`. Referenced in `BaynesWatermark.jsx` (every slide), `RoundIntroSlide.jsx`, and `Join.jsx` (top-of-form + NoShowScreen) — all render nothing/broken-img rather than the logo. Bigger surface area than previously noted; still acceptable-for-now per Ben, but worth knowing it's not just one screen.
- **`AmbientAudit.jsx`** / **`GradientAudit.jsx`** — dev tools, routed at `/ambient` and `/gradient` respectively (`App.jsx`). They ARE reachable in prod — the safety net is that both are `lazy()`-imported, so neither ships in the main bundle.

---

## Next Session Starting Point

1. Read this file
2. Pick from Remaining table above
3. Before building: read the relevant reference file for the feature
4. Before any animation work: read `emilkowal-animations` + `emil-design-eng` skills

**For ambient work:** use `git log --oneline --all -- ParticleBackground.jsx` per-theme to confirm status before assuming any theme is done or undone. Memory can drift.

**For scoreboard work:** Supabase project is `qwtbgusqfoypvehnungr`. Verify `.env.local` before any migrations.
