---
name: trivia-os
description: Core blueprint for Trivia OS — a real-time trivia night platform for Baynes Apple Valley. Read this every session. Detailed specs live in references/ — load them only when working on that specific area.
---

# Trivia OS — SKILL.md
> Core blueprint. Read every session. Detailed specs are in `references/` — load only what you need for the current task.

---

## 0. How to Use This Skill

**Read this entire file before writing any code.** Then load the relevant reference file for your task.

### Reading Order

| Step | What to read | When |
|---|---|---|
| **Always first** | This file (all sections) | Every session |
| **Before any feature work** | `references/build-state.md` | Every session — know what's done and what's next |
| **Before slide work** | `references/slides.md` | Building/modifying any slide type, SlideRenderer.jsx, transitions |
| **Before theme/ambient work** | `references/themes.md` | Adding themes, modifying ParticleBackground.jsx, theme picker |
| **Before any display-view component** | `references/brand.md` | Every display component — design is never a one-time read |
| **Before any animation code** | `references/brand.md` | Easing curves, spring configs, motion philosophy |
| **Before /join, scoring, powerups, media** | `references/features.md` | Working on those specific features |

### The Three Rules

1. **Architecture first, beauty always.** The server must be solid. The display must be stunning. Both are required.
2. **The design sections are not decoration.** `references/brand.md` contains specific hex codes, easing curves, spring configs, and quality commands. Use them exactly.
3. **Follow the build order.** `references/build-state.md` tracks what's done. Don't skip ahead.

**The design layer is not optional.** The crowd sees `/display` on multiple large TVs in a dark bar at a weekly event people genuinely love. A technically correct but visually generic implementation is a failure.

---

## 1. What This Is

Trivia OS is a real-time, multi-screen trivia night platform built for weekly pub trivia at Baynes Apple Valley. It replaces PowerPoint and Excel entirely. Deployed on Vercel with Supabase as the real-time and database layer. Teams connect via any browser by scanning a QR code.

**Four views:**
- `/host` — Host control panel (laptop, light mode, on extended display — NOT on the TVs)
- `/display` — The show screen (fullscreen browser, HDMI to the TVs)
- `/join` — Team phones (one per team, via QR code)
- `/scores` — Optional dedicated scoreboard view (secondary TV if available)

**Controlled via:** Elgato Stream Deck mobile app on iPad (keyboard shortcuts), mouse/trackpad for score input and slide building, touch on team phones.

---

## 2. Tech Stack + File Structure

```
/trivia-os
  /client/src
    /views
      Host.jsx
      Display.jsx         ← PreShowScreen defined inline (lines 14-182)
      Join.jsx
      Scores.jsx
      AmbientAudit.jsx    ← dev-only theme preview tool
    /components
      /display
        ParticleBackground.jsx   ← 21 unique ambient components, GPU-only
        SlideRenderer.jsx
        ThemeCanvas.jsx          ← wired but scene: null on all themes (future use)
        ThemeForeground.jsx      ← wired but scene: null on all themes (future use)
        BaynesWatermark.jsx
        QuestionCounter.jsx
        WaveformBars.jsx
        /slides/                 ← one file per slide type
          TitleSlide.jsx
          RoundIntroSlide.jsx
          QuestionSlide.jsx
          GradingBreakSlide.jsx
          ScoreboardRevealSlide.jsx
          CustomSlide.jsx
          StateOfUnionSlide.jsx
          MultiQuestionSlide.jsx
          PixelateSeriesSlide.jsx
          PylRevealSlide.jsx
        /frames/
          FrameRegistry.js
        /transitions/
          TransitionRegistry.js
      /host
        BuildMode.jsx
        LiveMode.jsx             ← pure control surface, no slide preview
        HostHeader.jsx
        ScorePanel.jsx
        ShowManager.jsx
        SlideEditor.jsx
        RoundSidebar.jsx
        AddSlideWizard.jsx       ← 4-step guided slide creation
        FormatLibrary.jsx        ← shiny format manager
        HostPhotoLibrary.jsx
        MediaUpload.jsx
        ThemePicker.jsx
        ThemePickerModal.jsx
        TickerMessageManager.jsx ← pre-show ticker message editor
      /shared
        ThemeProvider.jsx
        BenPhoto.jsx             ← circle img, size prop, handles loading/fallback
    /hooks
      useShow.js                 ← all show CRUD + Supabase realtime
      useShinyFormats.js
      useBenPhotos.js            ← fetches /api/ben-photos → { photos, randomPhoto, loading }
    /lib
      supabase.js
    /themes
      index.js                   ← 21 themes, getTheme(id) helper
  /api
    ben-photos.js                ← Vercel serverless: reads /public/ben/, returns URL array
  /public
    /ben/                        ← Ben photos, auto-served at /ben/[filename]
    /fonts/                      ← Handters.woff2, Roquen.woff2
  vercel.json                    ← SPA rewrite + API function config
  vite.config.js                 ← root: 'client', publicDir: '../public'
```

**No `/server`. No Express. No Socket.io. No Render.**
Everything is React + Supabase. The "server" is Supabase + Vercel API routes.

**Dependencies:** `@supabase/supabase-js`, `react`, `vite`, `tailwindcss`, `framer-motion`, `fuse.js`, `nanoid`, `qrcode`

**Deployment:** Vercel (frontend + API) + Supabase project `baynes-trivia`

---

## 3. Show Data Schema

A show is one trivia night — one row in `shows`. Slides, rounds, powerups are JSONB arrays. Teams and scores are in separate tables (full SQL in Section 8).

**Key `shows` fields:**
- `id`, `title`, `date`, `theme_id`
- `slides jsonb` — ordered array of slide objects
- `rounds jsonb` — round metadata
- `powerups jsonb` — powerup definitions
- `current_slide_id text` — null until first advance
- `current_slide_index integer`
- `is_live boolean`
- `scoreboard_visible boolean`
- `scores_revealed boolean` — separate from scoreboard_visible; controls /join leaderboard
- `ticker_messages jsonb` — pre-show ticker strings (editable in TickerMessageManager)

**Slide object shape:**
```json
{
  "id": "slide_abc",
  "type": "question",
  "roundId": "round_1",
  "order": 2,
  "data": {
    "questionNumber": 1,
    "questionLabel": "Q1",
    "text": "Full question text...",
    "isShiny": false,
    "shinyType": null,
    "mediaUrl": null,
    "mediaType": null,
    "isSeries": false,
    "seriesLabel": null,
    "seriesTheme": null,
    "hostPhotoUrl": null,
    "hostPhotoPosition": null,
    "audioGainDb": null
  }
}
```

`audioGainDb` — computed at upload time by `analyzeAudioGain()` (`client/src/lib/audioNormalize.js`). Target RMS: −20 dBFS, peak ceiling: −1 dBFS, clamped to ±12 dB. Applied via a Web Audio GainNode on the display side. `null` or missing → unity gain (backwards compatible).

Full slide type specs → `references/slides.md`

---

## 4. Display Routing Logic

**This is the most bug-prone area. Follow this exactly — it has been a source of rework.**

`Display.jsx` decides what to render via this waterfall:

```
loading === true
  → black loading screen (spinner)

show === null
  → purple fallback ("No show" text)

searchParams.get('preview') === 'true'
  → PreviewSlide (ambient background + "PREVIEW MODE" label)

show.is_live && show.current_slide_id !== null
  → DisplayInner (full slide renderer, transitions, question counter)

everything else  ← includes: not live, OR live but no slide advanced yet
  → PreShowScreen (QR code, team ticker, ambient background, Baynes watermark)
```

**The critical case:** PreShowScreen shows when `is_live=true` but `current_slide_id=null`. This is intentional — the host goes live to unlock team registration on /join, but the TV stays on the pre-show screen until they advance to the first slide.

**PreShowScreen ticker behavior:**
- `teams.length < 5` → scrolls `show.ticker_messages` (or default copy if empty)
- `teams.length >= 5` → switches to scrolling team names

---

## 5. Build Order

Steps 1–9 complete as of June 24, 2026. See `references/build-state.md` for detailed status and known issues.

| # | Step | Status |
|---|------|--------|
| 1 | Vite + React + Tailwind scaffold | ✅ Done |
| 2 | Supabase schema | ✅ Done |
| 3 | `/host` Build Mode | ✅ Done |
| 4 | `/display` — slide renderer, all types, transitions, themes | ✅ Done |
| 5 | Host → Display Supabase Realtime sync | ✅ Done |
| 6 | `/host` Live Mode | ✅ Done |
| 7 | Score panel | ✅ Done |
| 8 | `/join` phone view | ✅ Done |
| 9 | Powerup system | ✅ Done |
| 10 | Show library (my shows, export/import) | ⬜ Next |
| 11 | Theme switcher live during show | ⬜ |
| 12 | Jukebox integration | ⬜ |
| 13 | Polish pass (Impeccable audit, mobile, transitions) | ⬜ |

---

## 6. Design Principles

These apply to every surface. Full philosophy with implementation detail → `references/brand.md`.

- **The display view is a performance.** Every pixel on the TVs is part of the show. Game show, not slideshow.
- **The host panel is a tool.** Fast, clear, no surprises. Light mode. The host is multitasking in a dark loud bar.
- **Team phones are minimal.** Fast load, cheap phones, never distract from the live experience.
- **Animations serve the moment.** Round intros are dramatic. Question slides are snappy. Never animate for its own sake.
- **The theme drives everything visual.** Colors, particles, glow — all from the active theme. Swapping a theme should feel like a different show.
- **Baynes is always present, never dominant.** The logo watermark is a signature, not a billboard.
- **Fail gracefully.** Phone disconnects, show goes on. Never crash the host panel during a live show.

---

## 7. The Three Non-Negotiables

These rules have caused the most rework. They are never negotiable.

**1. Background never moves.**
`<ParticleBackground>` never re-mounts on slide changes. It persists for the entire session. Slide transitions animate content only — the ambient layer is locked. Never add `key` props that cause re-mount. Never conditionally render it.

**2. GPU-only animations.**
Every `@keyframes` in every ambient component *animates* ONLY `transform` and/or `opacity` — never `width`, `height`, `background-position`, `color`, `box-shadow`, `filter`, or any layout property. (A *static* `box-shadow`/`filter` for softness is fine; the ban is on animating them.) This keeps all 21 ambient themes at 60fps on a TV.

**3. No clip-art in ambient.**
The world is conveyed through light, color, and motion. A theme's defined **anchor** may be a soft glowing form (a soft-edged sun disc, or soft SVG aurora curtains — `northern-lights` already does this) when legibility demands it, kept soft and reading as light. No hard pictorial icons, characters, or objects. Anchor rule + detail → `references/themes.md`.

Full ambient architecture → `references/themes.md`

---

## 8. Supabase Schema + Realtime

### SQL Schema

```sql
create table shows (
  id text primary key,
  title text not null,
  date date,
  theme_id text default 'midnight-galaxy',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  slides jsonb default '[]'::jsonb,
  rounds jsonb default '[]'::jsonb,
  powerups jsonb default '[]'::jsonb,
  current_slide_id text,
  current_slide_index integer default 0,
  is_live boolean default false,
  scoreboard_visible boolean default false,
  scores_revealed boolean default false,
  audio_playing jsonb default null,
  special_event jsonb default null,
  ticker_messages jsonb default '[]'::jsonb
);

create table teams (
  id text primary key,
  show_id text references shows(id) on delete cascade,
  name text not null,
  color text,
  registered_at timestamptz default now(),
  powerup_used boolean default false,
  powerup_used_on text,
  is_connected boolean default true,
  last_action text,
  last_action_at timestamptz
);

create table team_scores (
  id text primary key,
  show_id text references shows(id) on delete cascade,
  team_id text references teams(id) on delete cascade,
  round_index integer not null,
  score integer default 0,
  updated_at timestamptz default now(),
  unique(team_id, round_index)
);

create table questions (
  id text primary key,
  text text not null,
  answer text,
  category text,
  round_type text,
  is_shiny boolean default false,
  shiny_type text,
  notes text,
  used_on date[],
  created_at timestamptz default now()
);

alter publication supabase_realtime add table shows;
alter publication supabase_realtime add table teams;
alter publication supabase_realtime add table team_scores;
```

### Client Subscription Pattern

```js
const channel = supabase
  .channel(`show:${showId}`)
  .on('postgres_changes', {
    event: '*', schema: 'public', table: 'shows',
    filter: `id=eq.${showId}`
  }, (payload) => { /* update local state with payload.new */ })
  .on('postgres_changes', {
    event: '*', schema: 'public', table: 'teams',
    filter: `show_id=eq.${showId}`
  }, (payload) => { /* handle team changes */ })
  .subscribe()

return () => supabase.removeChannel(channel)
```

### Host Actions → DB Updates

```js
// Advance slide
await supabase.from('shows')
  .update({ current_slide_id: nextSlide.id, current_slide_index: nextIndex })
  .eq('id', showId)

// Reveal scoreboard
await supabase.from('shows').update({ scoreboard_visible: true }).eq('id', showId)

// Update team score
await supabase.from('team_scores')
  .upsert({ team_id, show_id, round_index, score, updated_at: new Date() })

// Team registers (from /join)
await supabase.from('teams').insert({ id: nanoid(), show_id: showId, name: teamName })
```

---

*Detailed specs:*
- Slide types + transitions → `references/slides.md`
- Theme system + 21 ambients → `references/themes.md`
- Brand, design philosophy, Emil principles, Impeccable → `references/brand.md`
- /join, scoring, powerups, media, Jukebox → `references/features.md`
- Current build state, known issues, next steps → `references/build-state.md`
