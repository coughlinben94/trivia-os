---
name: trivia-os
description: Trivia OS — real-time trivia-night platform for Baynes Apple Valley (React + Vite + Supabase Realtime; 21 ambient themes, 10 slide types). Use this skill whenever working on Trivia OS or anything under ~/Projects/trivia-os — the host build/live control surface, the /display TV renderer, /join phones, slides, rounds, scoring, powerups, the ambient ParticleBackground themes, or display transitions/animations. Read this plus its references before any display/theme/animation work, even on casual asks.
---

# Trivia OS — Developer Skill

> Real-time trivia night management platform. Replaces PowerPoint + Excel entirely. Four views: /host (build + control), /display (TV), /join (phones), /scores (optional scoreboard). Read this + all references before building anything display-facing.

**Repo:** `~/Projects/trivia-os`  
**Stack:** React 18, Vite, Tailwind, Framer Motion 10, Supabase JS, Fuse.js, nanoid  
**Deploy:** `git push` → Vercel auto-deploys  
**Live:** https://trivia-os.vercel.app  
**Project skill:** `.claude/skills/trivia-os/` (symlinks to repo root SKILL.md + references/)

---

## Read Order (mandatory before any display/theme/animation work)

1. `SKILL.md` (this file)
2. `references/slides.md` — all 10 slide types + data schemas
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

---

## Routes

| Route | Purpose |
|---|---|
| `/host` | Build Mode (pre-show) → Live Mode (during show) |
| `/display` | TV fullscreen — PreShowScreen or slide renderer |
| `/join` | Team phones — register, follow show, scoreboard, powerups |
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
    Host.jsx              — switches between BuildMode and LiveMode
    Display.jsx           — routing logic + PreShowScreen
    Join.jsx              — team phone phase machine (loading→register→waiting→live)
  components/
    host/
      BuildMode.jsx       — slide builder UI (wizard + editor modes)
      LiveMode.jsx        — control surface during show (text-only, no preview)
      AddSlideWizard.jsx  — 4-step guided slide creation
      AddRoundWizard.jsx  — NEW: 3-type round picker (Normal/Swing/PYL) before round creation
      SlideEditor.jsx     — per-slide editing panel
      RoundSidebar.jsx    — round/slide navigation tree
      ScorePanel.jsx      — fuzzy search + score input + reveal toggle
      ShowManager.jsx     — show CRUD (list, create, load, duplicate, export, import)
      ThemePicker.jsx     — theme selection
      FormatLibrary.jsx   — 8 shiny format seeds
    display/
      ParticleBackground.jsx  — 21 GPU-only ambient themes (NEVER re-mounts)
      SlideRenderer.jsx       — routes slide.type → component + manages transitions
      TitleSlide.jsx, RoundIntroSlide.jsx, QuestionSlide.jsx, GradingBreakSlide.jsx
      ScoreboardRevealSlide.jsx, CustomSlide.jsx, MultiQuestionSlide.jsx
      PixelateSeriesSlide.jsx, PylRevealSlide.jsx, StateOfUnionSlide.jsx
      QuestionCounter.jsx, BaynesWatermark.jsx, WaveformBars.jsx
  hooks/
    useShow.js            — ALL show state, Supabase Realtime, CRUD actions (master hook)
  themes/
    index.js              — THEMES array (21), getTheme(id), DEFAULT_THEME_ID
```

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

10 types in `SlideRenderer.SLIDE_COMPONENTS`:

| Type | Component | Key data fields |
|---|---|---|
| `title` | TitleSlide | title, subtitle |
| `state-of-union` | StateOfUnionSlide | text, hostPhotoUrl |
| `round-intro` | RoundIntroSlide | roundNumber, roundTitle, subtitle, roundType, hostPhotoUrl |
| `question` | QuestionSlide | questionNumber, text, isShiny, shinyType, mediaUrl, mediaType, audioGainDb |
| `grading-break` | GradingBreakSlide | message, jukeboxLib, backLinkSlideId |
| `scoreboard-reveal` | ScoreboardRevealSlide | auto-computed from team_scores |
| `custom` | CustomSlide | title, body, imageUrl, layout |
| `multi-question` | MultiQuestionSlide | questions: [{number, text}] |
| `pixelate-series` | PixelateSeriesSlide | stages: [{imageUrl, opacity}] |
| `pyl-reveal` | PylRevealSlide | answers: [{text, revealed}], points |

**Shiny subtypes:** `shinyType: 'visual'` (image full-bleed or split) | `shinyType: 'audio'` (waveform bars, PLAY button, Web Audio gain)

---

## useShow.js — Key Actions

```js
const { show, loading } = useShow()
const actions = { ... }

// Show CRUD
actions.createShow(title, date, themeId)
actions.loadShow(id)
actions.listShows()       // → [{ id, title, date, updatedAt, slideCount, roundCount }]
actions.exportShow()      // → downloads JSON
actions.importShow(json)  // → new show from JSON
actions.duplicateShow(id)
actions.deleteShow(id)
actions.updateShowMeta({ title, date, theme })

// Slide CRUD
actions.addSlide(type, data)
actions.updateSlide(id, patch)
actions.deleteSlide(id)
actions.reorderSlides(newOrder)

// Round CRUD
actions.addRound(data)      // data = { roundType, roundNumber?, subtitle, title }
actions.updateRound(id, patch)
actions.deleteRound(id)     // also deletes all slides in the round

// Live control
actions.setLive(true/false)
actions.advanceSlide()
actions.previousSlide()
actions.toggleScoreboard()
actions.toggleScoresRevealed()
```

**Realtime:** subscribes to `shows` table, `id=eq.${showId}` — all display/join surfaces auto-update.

---

## Supabase Schema

```sql
shows { id, title, date, theme_id, slides jsonb, rounds jsonb, powerups jsonb,
        current_slide_id, current_slide_index, is_live, scoreboard_visible,
        scores_revealed, ticker_messages jsonb, audio_playing jsonb }

teams { id, show_id, name, color, registered_at, powerup_used, powerup_used_on,
        is_connected, last_action, last_action_at }

team_scores { id, show_id, team_id, round_index, score, unique(team_id, round_index) }

questions { id, text, answer, category, round_type, is_shiny, shiny_type, used_on date[] }
```

---

## Display View Architecture

**ParticleBackground:**
- Mounts once in DisplayInner, OUTSIDE AnimatePresence
- 3-layer: atmosphere (gradient washes) + mid glow (accent) + accent detail
- One named focal anchor (sun, moon, neon sign, SVG, sprite)
- At least one drifter with real `translate` motion
- Center 60% × 45% kept clear for content
- Colors from `theme.colors`; re-renders only on theme change

**Transitions (9 named + random):** dissolve, emerge, zoom, punch, drop, descend, sink, settle, loom (assemble is planned)

**Easing constants:**
```js
EASE_QUINT = [0.22, 1, 0.36, 1]  // standard ease-out
EASE_QUART = [0.25, 1, 0.25, 1]  // hard land
EASE_CUBIC = [0.33, 1, 0.68, 1]  // gentle
```

---

## Physical Setup

- **MacBook (host):** `/host` on laptop screen (light mode, 1920px)
- **TV(s):** `/display` fullscreen on HDMI output (OREI HD18-EX165-K 1×8 splitter → 3 TVs)
- **macOS:** Extended display mode — laptop ≠ TV
- **Stream Deck:** ArrowRight/Left (advance/back), Space (audio play), S (scoreboard), R (reveal scores)
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

`getTheme(id)` falls back to `midnight-galaxy` if not found.

21 themes: pure-michigan, midnight-galaxy, autumn-harvest, northern-lights, medieval-tavern, sunset-boulevard, retro-arcade, sand-dune-chill, halloween, jazz-club, dive-bar, rooftop-party, christmas-eve, drive-in-movie, western-showdown, under-the-sea, neon-tokyo, firefly-summer, wine-cellar, meteor-shower, eighties-night
