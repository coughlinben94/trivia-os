# references/build-state.md — Current Build State

**Read this at the start of every session** before touching any code. It tells you what's done, what's next, and what's broken.

---

## Completed (as of June 24, 2026)

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
- `SlideEditor.jsx` — per-slide editing panel
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

### `/display`
- `Display.jsx` — full routing waterfall (loading → null → preview → live → pre-show)
- `PreShowScreen` — QR code, team ticker (always visible), ambient, Baynes watermark, Ben photo (bottom-left)
- `SlideRenderer.jsx` — routes to per-type slide components
- All 10 slide types implemented: `TitleSlide`, `RoundIntroSlide`, `QuestionSlide`, `GradingBreakSlide`, `ScoreboardRevealSlide`, `CustomSlide`, `StateOfUnionSlide`, `MultiQuestionSlide`, `PixelateSeriesSlide`, `PylRevealSlide`
- `ParticleBackground.jsx` — 29 GPU-accelerated ambient components, 3-layer architecture, full audit June 2026
- `BaynesWatermark.jsx`, `QuestionCounter.jsx`, `WaveformBars.jsx`
- `TransitionRegistry.js`, `FrameRegistry.js`
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

### Powerup System
- Host definition in Build Mode via powerups array
- Phone invocation on /join with confirmation dialog
- `powerup_used` written to teams table; host panel red alert toast

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
| 11 | **Theme switcher live during show** | Theme picker is built but needs live-mode wire-up in LiveMode.jsx |
| 12 | **Jukebox integration** | Stream Deck KeyJ → fetch to trivia-jukebox.vercel.app play/pause API |
| 13 | **Polish pass** | Impeccable audit (`$impeccable polish`), mobile optimization for /join, transition polish, font loading (Handters/Roquen declared in index.css but not yet used) |

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
2. Decide: Step 10 (show library) or Step 11 (theme switcher live) based on current priority
3. For Step 10: Start in `ShowManager.jsx` — it likely has a show list already; check what export/import support exists in `useShow.js`
4. For Step 11: Start in `LiveMode.jsx` — add a theme picker trigger that writes `theme_id` to Supabase; `Display.jsx` already subscribes to that field

Before building: read `references/build-state.md` (this file) + the relevant reference file for the feature. Always.
