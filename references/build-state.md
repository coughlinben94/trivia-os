# references/build-state.md — Current Build State

**Read this at the start of every session** before touching any code. It tells you what's done, what's next, and what's broken.

---

## Completed (as of June 27, 2026)

**Steps 1–9 of build order — all complete.**

### Infrastructure
- Vite + React + Tailwind scaffold, Supabase client, env vars wired, vercel.json SPA rewrite
- Supabase schema: `shows`, `teams`, `team_scores`, `questions` tables, Realtime enabled
- `ticker_messages jsonb` column added to `shows` (run `ALTER TABLE shows ADD COLUMN IF NOT EXISTS ticker_messages jsonb DEFAULT '[]'::jsonb;` if missing)

### `/host` Build Mode
- `useShow.js` — full show CRUD, normalizeShow, Realtime subscription, all actions
- `ShowManager.jsx` — show list, create/load/duplicate/delete
- `BuildMode.jsx` — slide builder layout, mode switching (wizard/editing)
- `RoundSidebar.jsx` — round list, slide list per round, add round
- `SlideEditor.jsx` — per-slide editing panel; semantic `label`/`htmlFor` on all fields (a11y)
- `AddSlideWizard.jsx` — 4-step guided slide creation
- `FormatLibrary.jsx` + `useShinyFormats.js` — shiny format manager, 8 seed formats
- `HostHeader.jsx` — title edit, theme picker trigger, copy join link, Ticker button, Formats button, Go Live
- `TickerMessageManager.jsx` — modal editor for pre-show ticker messages (one per line, live preview, save to Supabase)
- `ThemePicker.jsx` / `ThemePickerModal.jsx` — theme selection, syncs to Supabase
- `MediaUpload.jsx`, `HostPhotoLibrary.jsx` — media upload UI

### `/host` Live Mode
- `LiveMode.jsx` — pure control surface: prev/next, slide counter, scoreboard toggle
- `ScorePanel.jsx` — fuzzy search (Fuse.js), score input, hold-to-confirm, reveal toggle
- Host → Display sync via Supabase Realtime
- **Live theme swap during show** (Step 11 ✓): `theme_id` Realtime propagation + LiveMode picker — theme changes during a show update all surfaces instantly
- **Connection-loss banner**: `HostReconnectingBanner` at HostInner level — operator sees "Connection lost — your changes may not be saving. Reconnecting…" on `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED`; mirrors Join's pattern

### `/display`
- `Display.jsx` — full routing waterfall (loading → null → preview → live → pre-show)
- `PreShowScreen` — QR code, team ticker (always visible), ambient, Baynes watermark, Ben photo (bottom-left)
- `SlideRenderer.jsx` — routes to per-type slide components; houses full transition system (9 named transitions + Random + reduced-motion crossfade fallback; `assemble` defined but NOT in picker — see Remaining)
- All 10 slide types implemented: `TitleSlide`, `RoundIntroSlide`, `QuestionSlide`, `GradingBreakSlide`, `ScoreboardRevealSlide`, `CustomSlide`, `StateOfUnionSlide`, `MultiQuestionSlide`, `PixelateSeriesSlide`, `PylRevealSlide`
- `ParticleBackground.jsx` — 29 GPU-accelerated ambient components, 3-layer architecture, full audit June 2026
- `BaynesWatermark.jsx`, `QuestionCounter.jsx`, `WaveformBars.jsx`
- `FrameRegistry.js` (`TransitionRegistry.js` removed — dead code)
- `ThemeCanvas.jsx`, `ThemeForeground.jsx` — wired, scene: null (future use)
- Display routing fix: PreShowScreen shows when `is_live && current_slide_id === null`

### `/join`
- `Join.jsx` — complete rewrite with full phase machine: `loading → register → waiting → live → no-show`
- Session recovery via localStorage (`trivia-os:team:${showId}`)
- Scoreboard bottom sheet: 72dvh, `--ease-drawer`, staggered rows, animated score bars
- Reconnecting banner on `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED`
- No forward button — teams are followers only
- BenPhoto at top of registration screen (100px)
- Connection status tracked; forward-attempt, back-nav, and app-exit alerts to host panel
- All three alert types implemented as toasts in `Host.jsx`
- **Powerup hardened**: double-tap guard + full error handling; honest init/leaderboard error+loading states
- **Cross-theme contrast floor**: top-bar labels use `highlight` (not `accent`) — 4 dark-accent themes were invisible; team-name opacity raised to 95% (`f2`); score opacity floor at 55% (`8c`)

### Powerup System
- Host definition in Build Mode via powerups array
- Phone invocation on /join with confirmation dialog
- `powerup_used` written to teams table; host panel red alert toast

### Transition System (Step 13 ✓)
- 9 named per-slide transitions live: dissolve, emerge, zoom, punch, drop, descend, sink, settle, loom — plus Random
- Assignable per-slide via SlideEditor picker (`<optgroup>` grouped select)
- Resolved in `SlideRenderer.jsx`; reduced-motion collapses all to `dissolve` crossfade
- `assemble` (10th) defined in SlideRenderer but NOT in picker — needs slide children wired as `motion` children for child-stagger to function

### Animation, A11y & Polish (Impeccable audit closed June 27, 2026)
- **NN#1 fully closed**: inner `ParticleBackground` removed from both `QuestionSlide` and `TitleSlide`; PB lives exclusively at DisplayInner level, outside `AnimatePresence` — never remounts during slide transitions
- **DM Sans 600/700 loaded**: Google Fonts URL updated to include real weights; browser was synthesizing bold from 500, causing stroke artifacts on Android
- **Reduced-motion coverage complete** (raw CSS animations now suppressed):
  - `ParticleBackground.jsx`: `ambientFlicker`, `ambientNeonBuzz` (highest epilepsy risk), `ambientBreathe` frozen to `--lo` resting opacity
  - `index.css`: `gradingGlow`, `playPulse`, `waveformBar`, `waveformIdle` all frozen
  - `Join.jsx` WaitingScreen: `breathePulse` dot gated on `pref` variable
- **RoundIntro slam gated**: `scale: 3.5 → 1` spring (`bounce: 0.25`) falls back to opacity dissolve when `useReducedMotion()` is true
- **PreShow text**: "Scan to join" 0.75rem → 1.1rem; "teams in" 1rem → 1.25rem (TV legibility at 10ft)
- **GPU cleanup**: dead `TransitionRegistry.js` + `EASE_OVERSHOOT` removed; PixelateSeries stage-dots are opacity-based; ScoreboardReveal leader glow already GPU-safe (static `boxShadow` on opacity-animated layer — no change needed)

### Pre-Show Ticker
- Always visible on PreShowScreen (never conditional)
- Custom messages via `TickerMessageManager` (stored in `shows.ticker_messages`)
- Switches to team names when `teams.length >= 5`
- Falls back to hardcoded copy when no custom messages set
- Repeat formula ensures full 1920px width fill at all message lengths

### Ben Photo System
- `/public/ben/` — 21 photos loaded (removebg PNGs + design exports)
- `api/ben-photos.js` — Vercel serverless, reads `/public/ben/`, returns URL array; `includeFiles` configured
- `useBenPhotos.js` — fetches on mount, stable `randomPhoto` (won't re-roll on re-render)
- `BenPhoto.jsx` — circle img, size prop, returns null while loading/if no photos
- `vite.config.js` — `publicDir: '../public'` so images copy to `dist/ben/` on build

### 29 Themes
- Full ambient audit completed June 23, 2026 — all themes rewritten or validated
- 3-layer architecture enforced: base + mid + accent
- Opacity recalibrated for TV at bar distance (no layer below rgba 0.25)
- Tinted vignette system on all 29 themes
- All GPU-only (transform + opacity only)
- `AmbientAudit.jsx` — dev tool for cycling themes with screenshots

---

## Remaining

| # | Step | Notes |
|---|------|-------|
| 10 | **Show library** | My shows screen, JSON export/import, duplicate, delete. ShowManager.jsx exists but may need enhancement. |
| 12 | **Jukebox integration** | Stream Deck KeyJ → fetch to trivia-jukebox.vercel.app play/pause API |
| — | **`assemble` transition** | 10th transition — defined in SlideRenderer but NOT in the picker. Needs slide child-elements wired as `motion` children for child-stagger to work. |
| — | **Cross-repo: pre-show library handoff** | Trivia OS appends `?lib=<name>` to Jukebox handoff nav; Jukebox reads it, auto-selects + shuffles that named library, default-safe when absent. Jukebox-side first. |
| — | **Profiling-dependent P2s** | MeteorShower 200-node DOM field + `/join` `backdrop-filter: blur()` on cheap Androids — both need real-hardware profiling before deciding if there's a problem. NOT blind-fix items. |

---

## Known Issues

- **`baynes-ops` skill** — referenced in `CLAUDE.md` but not yet written. Not blocking anything.
- **Scheduler Vercel DATABASE_URL broken** — as of June 23, 2026. Fix before any scheduler prod deploy. Not blocking trivia-os.
- **`StateOfUnionSlide.jsx`** — slide type exists in the file tree but may not be fully spec'd in SlideEditor or AddSlideWizard. Check before using.
- **`ThemeCanvas.jsx` / `ThemeForeground.jsx`** — wired but `scene: null` on all 29 themes. Future use. Do not add ambient logic here.
- **Handters + Roquen fonts** — `.woff2` files exist in `/public/fonts/` but `@font-face` declarations may not be in `index.css`. Brand typography is currently Boogaloo + DM Sans as fallbacks.
- **`baynes-logo.svg`** — referenced in `NoShowScreen` and some components but the file doesn't exist in `dist/`. Broken img renders as nothing (acceptable for now).
- **`AmbientAudit.jsx`** — dev tool, not routed in prod. Verify it's excluded from main bundle or gated.
- **SKILL.md** — refactored from 1,634 lines into this structure on June 24, 2026.

---

## Next Session Starting Point

1. Read this file
2. Decide: Step 10 (show library) or Step 12 (Jukebox integration) — both are independent
3. For Step 10: Start in `ShowManager.jsx` — show list + CRUD exists; verify JSON export/import in `useShow.js`
4. For Step 12: Wire Stream Deck KeyJ to `trivia-jukebox.vercel.app` play/pause API — check Jukebox API surface first
5. Cross-repo handoff (whenever ready): implement `?lib=<name>` param on Jukebox side — reads URL param on mount, auto-selects + shuffles that named library, default-safe when absent

Before building: read `references/build-state.md` (this file) + the relevant reference file for the feature. Always.
