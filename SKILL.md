---
name: trivia-os
description: Complete blueprint for building Trivia OS — a custom real-time trivia night management system for Baynes Apple Valley. Use this skill whenever building, extending, or modifying any part of Trivia OS including the host panel, display view, team join experience, scoreboard, slide builder, animations, theme system, Stream Deck integration, scoring, powerups, or Jukebox integration. Read this entire document before writing any code — it contains the full architecture, data schema, slide types, animation specs, brand identity, and design philosophy. Every decision about how Trivia OS looks, behaves, and feels is documented here.
---

# Trivia OS — SKILL.md
> The complete blueprint for building Trivia OS, a custom trivia night management system for Baynes Apple Valley. Read this entire document before writing any code. Every architectural, design, and interaction decision is documented here.

---

## 0. How to Use This Skill

**Read this entire document before writing a single line of code.** This is not optional. Trivia OS has tightly coupled architecture, design, and animation systems — skipping sections produces code that technically works but fails as a product.

### Reading Order

| Step | Sections | When |
|---|---|---|
| **1. Always first** | 0, 1, 2, 3 | Every session — architecture and schema |
| **2. Before any feature** | Relevant section from 4–17 | Before building that feature |
| **3. Before any display-view code** | 19, 20, 21, 22, 23, 27 | Every time — design is never a one-time read |
| **4. Before any animation** | 5, 20 | Every time — easing curves and timing are exact |
| **5. Before any Baynes visual** | 21, 22, 23 | Every time — brand is non-negotiable |
| **6. Before shipping any component** | 27 (Impeccable) | Run polish/audit commands before marking done |

### The Three Rules

1. **Architecture first, beauty always.** The server must be solid. The display must be stunning. Both are required.
2. **The design sections are not decoration.** Sections 19–23 and 27 contain specific hex codes, easing curves, spring configs, font names, and quality commands. Use them exactly. Do not substitute.
3. **Follow Section 18 build order.** Do not skip ahead. Each step depends on the previous.

**The design layer is not optional.** Trivia OS is a performance product. The crowd sees the /display view on multiple large TVs in a dark bar at a weekly event that people genuinely love. Every visual decision must reflect the Baynes Apple Valley brand and the energy of a live show. A technically correct but visually generic implementation is a failure.

---

## 1. What This Is

Trivia OS is a real-time, multi-screen trivia night platform built for weekly pub trivia at Baynes Apple Valley. It replaces PowerPoint and Excel entirely. It is deployed on Vercel with Supabase as the real-time and database layer. Teams connect via any browser on any device by visiting the live Vercel URL.

**It has four views:**
- `/host` — Host control panel (laptop, light mode, on extended display — NOT on the TVs)
- `/display` — The show screen (fullscreen browser window, HDMI to the TVs)
- `/join` — Team phones (one per team, via QR code)
- `/scores` — Optional dedicated scoreboard view (secondary TV if available)

**It is controlled primarily via:**
- Elgato Stream Deck mobile app on iPad (keyboard shortcuts)
- Mouse/trackpad on the host laptop for score input and slide building
- Touch on team phones for registration and powerup invocation

---

## 2. Tech Stack

```
/trivia-os
  /src
    /views
      Host.jsx
      Display.jsx
      Join.jsx
      Scores.jsx
    /components
      /host
        SlideBuilder.jsx
        RoundManager.jsx
        ScorePanel.jsx
        PowerupManager.jsx
        StreamDeckListener.jsx
      /display
        SlideRenderer.jsx
        transitions/
        animations/
      /shared
        ThemeProvider.jsx
        QRCode.jsx
    /hooks
      useShow.js          # Supabase CRUD + realtime subscription
      useTheme.js
      useKeyboardShortcuts.js
    /lib
      supabase.js         # Supabase client singleton
    /themes
      index.js            # All 10 themes + custom theme support
    App.jsx
    main.jsx
  /public
    baynes-logo.svg
  .env.local              # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
  vercel.json             # SPA rewrite rule
  package.json
  vite.config.js
```

**No `/server` folder. No Express. No Socket.io. No local file storage.**
Everything is React + Supabase. The "server" is Supabase.

**Dependencies:**
- `@supabase/supabase-js` — real-time sync + database
- `react` + `vite` — frontend
- `tailwindcss` — layout and host panel UI only
- `framer-motion` — all slide animations and transitions
- `fuse.js` — fuzzy team name search for score input
- `nanoid` — unique IDs for slides, teams, shows
- `qrcode.react` — QR code component for /join URL

**Deployment:**
- Frontend + API routes: Vercel
- Real-time + Database: Supabase (project: baynes-trivia)
- File uploads: Vercel Blob or local `/public/uploads` in dev

**Supabase project:** `baynes-trivia`
- Use Supabase Realtime to broadcast all state changes
- Use Supabase DB to persist show data and question archive
- All screens subscribe to relevant Supabase Realtime channels
- No Socket.io. No Render. No persistent server.

---

## 3. Show Data Schema

A "show" is a single trivia night. It is stored as a row in the Supabase `shows` table. Slides, rounds, and powerups are stored as JSONB arrays on the show row. Teams and scores are in separate tables. See Section 10 for the full SQL schema.

```json
{
  "id": "show_abc123",
  "title": "Trivia Night — June 22",
  "date": "2025-06-22",
  "theme": "midnight-galaxy",
  "createdAt": "2025-06-22T18:00:00Z",
  "updatedAt": "2025-06-22T19:30:00Z",

  "powerups": [
    {
      "id": "pu_1",
      "name": "Double Down",
      "description": "Double your points on this question",
      "icon": "⚡"
    }
  ],

  "teams": [
    {
      "id": "team_abc",
      "name": "Quiz Khalifa",
      "registeredAt": "2025-06-22T19:00:00Z",
      "color": "#f5c842",
      "scores": [0, 0, 0, 0, 0],
      "totalScore": 0,
      "powerupUsed": false,
      "powerupUsedOn": null
    }
  ],

  "rounds": [
    {
      "id": "round_1",
      "number": 1,
      "title": "Round 1",
      "subtitle": "Fight!",
      "type": "standard",
      "slides": ["slide_id_1", "slide_id_2"]
    }
  ],

  "slides": [
    {
      "id": "slide_abc",
      "type": "title",
      "roundId": null,
      "order": 0,
      "data": {
        "title": "Baynes Apple Valley",
        "subtitle": "Trivia Night"
      }
    },
    {
      "id": "slide_def",
      "type": "round-intro",
      "roundId": "round_1",
      "order": 1,
      "data": {
        "roundNumber": 1,
        "roundTitle": "Round 1",
        "subtitle": "Fight!"
      }
    },
    {
      "id": "slide_ghi",
      "type": "question",
      "roundId": "round_1",
      "order": 2,
      "data": {
        "questionNumber": 1,
        "questionLabel": "Q1",
        "text": "Full question text here...",
        "isShiny": false,
        "shinyType": null,
        "mediaUrl": null,
        "mediaType": null,
        "isSeries": false,
        "seriesLabel": null,
        "seriesTheme": null,
        "hostPhotoUrl": null,
        "hostPhotoPosition": null
      }
    },
    {
      "id": "slide_jkl",
      "type": "question",
      "roundId": "round_1",
      "order": 4,
      "data": {
        "questionNumber": 3,
        "questionLabel": "Q3",
        "text": "Name the character in this image.",
        "isShiny": true,
        "shinyType": "visual",
        "mediaUrl": "/uploads/q3-image.jpg",
        "mediaType": "image/jpeg",
        "isSeries": false,
        "seriesLabel": null,
        "seriesTheme": null
      }
    },
    {
      "id": "slide_mno",
      "type": "question",
      "roundId": "round_1",
      "order": 8,
      "data": {
        "questionNumber": 6,
        "questionLabel": "Q6a",
        "text": "Name the movie from this clip.",
        "isShiny": true,
        "shinyType": "audio",
        "mediaUrl": "/uploads/q6a-audio.mp3",
        "mediaType": "audio/mpeg",
        "isSeries": true,
        "seriesLabel": "6a",
        "seriesTheme": "Name That Movie"
      }
    },
    {
      "id": "slide_pqr",
      "type": "grading-break",
      "roundId": "round_1",
      "order": 10,
      "data": {
        "message": "Sit back and enjoy each other's company while Ben grades papers 😊",
        "backLinkSlideId": "slide_ghi"
      }
    },
    {
      "id": "slide_stu",
      "type": "scoreboard-reveal",
      "roundId": null,
      "order": 11,
      "data": {
        "afterRound": 1,
        "title": "After Round 1"
      }
    }
  ],

  "showState": {
    "currentSlideId": "slide_abc",
    "currentSlideIndex": 0,
    "isLive": false,
    "scoreboardVisible": false,
    "activeRoundId": null
  }
}
```

---

## 4. Slide Types

Every slide has a `type` field. The `/display` view renders based on this type. The host builder creates slides of each type.

### `title`
- Show opener
- Baynes Apple Valley logo centered
- Subtitle: "Trivia Night — [Date]"
- Ambient looping background animation (particles or slow gradient)
- Theme-colored

### `round-intro`
- Dramatic animated card that SLAMS in
- Round number first (large, bold, counts up or flashes)
- Round title slams in underneath
- Optional subtitle (e.g. "Fight!" or "It did not went well.")
- Exit animation before next slide
- Duration: ~2.5 seconds total, then host advances manually

### `question`
- The workhorse slide — most slides are this type
- **Always shows:** persistent question counter (top-right corner, e.g. "Q3 · R1")
- **Always shows:** Baynes logo watermark (bottom-right, 20% opacity)
- **Question number badge:** large circle, top-left, theme accent color
- **Question text:** large, centered, high contrast — minimum readable at 20ft
- **isShiny = false:** dark background, clean text layout
- **isShiny = true, shinyType = "visual":** layout depends on image — full bleed if landscape, split if portrait; question text overlaid or alongside
- **isShiny = true, shinyType = "audio":** animated waveform visualization, track name/label, PLAY button controlled from host panel
- **isSeries = true:** series theme banner across top (e.g. "Name That Movie"), series label badge (6a/6b/6c), question counter reflects position in series

### `swing-round-intro`
- Special round intro for Round 3 (swing/theme round)
- Reveals the round theme dramatically
- More theatrical than standard round intro
- Theme-specific treatment defined per week

### `grading-break`
- Full screen interstitial
- Custom message (usually "Ben is grading papers")
- Animated — subtle looping background
- **Back button:** "↩ Back to Q1" — jumps host to first question of that round
- Trivia Jukebox integration note: this is when music plays (handled by separate Jukebox app)

### `scoreboard-reveal`
- Teams animate in from bottom, staggered
- Leader gets gold crown + glow effect
- Score bars animate width from 0 to final value
- Rank numbers appear with bounce
- Toggle: host can show/hide this on `/display` from scoreboard panel
- Teams can always see scores on `/join` once revealed

### `custom`
- Freeform slide for special weeks (theme weeks, bonus rounds, etc.)
- Host can add title, body text, and optionally an image
- No fixed layout — fills the screen

---

## 5. Slide Transitions

All transitions use Framer Motion. Each slide type has a defined entry and exit animation. Transitions are snappy and punchy — not slow fades.

```js
// Transition timing constants
const TRANSITION_FAST = 0.18      // question-to-question
const TRANSITION_MEDIUM = 0.28    // question-to-grading-break
const TRANSITION_DRAMATIC = 0.5   // anything involving round-intro
const TRANSITION_SCOREBOARD = 0.4 // scoreboard reveal

// Easing
const EASE_SNAP = [0.22, 1, 0.36, 1]       // fast out, snap to rest
const EASE_OVERSHOOT = [0.34, 1.56, 0.64, 1] // slight overshoot for slam-in
const EASE_SMOOTH = [0.4, 0, 0.2, 1]         // smooth in-out
```

### Per slide-type transitions:

| From → To | Entry Animation | Exit Animation | Duration |
|---|---|---|---|
| Any → `question` | Slide in from right | Slide out to left | FAST |
| Any → `round-intro` | Zoom burst from center | Zoom out + fade | DRAMATIC |
| Any → `grading-break` | Fade through black | — | MEDIUM |
| Any → `scoreboard-reveal` | Rows stagger up from bottom | Fade out | SCOREBOARD |
| `question` → prev `question` (back nav) | Slide in from LEFT | Slide out to RIGHT | FAST |
| Any → shiny `question` (visual) | Scale up from center + flash | Slide out | MEDIUM |
| Any → shiny `question` (audio) | Waveform animates in | Slide out | MEDIUM |

### Round intro slam animation:
```
1. Black screen (instant)
2. Round number scales from 400% → 100% with EASE_OVERSHOOT (0.3s)
3. Round title slides up from below (0.2s delay, 0.25s duration)
4. Subtitle fades in (0.1s delay after title, 0.2s duration)
5. Hold for host to advance
```

### Shiny slide entry (visual):
```
1. Flash frame (white, 1 frame)
2. Image scales from 110% → 100% (0.3s, EASE_SNAP)
3. Gold particle burst (CSS animation, 0.5s, fades out)
4. Question text slides up from bottom (0.15s delay, 0.2s)
```

### Shiny slide entry (audio):
```
1. Dark background slides in from right (FAST)
2. Waveform bars animate in sequentially (stagger 0.02s each)
3. Play button pulses (CSS animation, continuous until played)
4. On play: waveform animates actively while audio plays
```

### Scoreboard reveal sequence:
```
1. Title "🏆 Leaderboard" fades in (0.3s)
2. Rows animate up from below, staggered 0.08s each (bottom rank first)
3. Score bars expand from 0 to value (0.6s, EASE_SMOOTH, after row appears)
4. Leader row: gold glow pulses in (0.2s delay after bar completes)
5. Crown emoji drops in from above leader (bounce, 0.3s)
```

---

## 6. Question Counter

A persistent element that lives on every question slide in the top-right corner of `/display`.

```
Format: Q{number} · R{round}
Example: Q3 · R1
Series: Q6a · R1
```

- Font: bold, small, uppercase, letter-spaced
- Color: theme accent, 70% opacity
- Never animates — always present, instant update
- Position: top-right, 20px from edge
- On non-question slides: hidden

---

## 7. The Host Panel (`/host`)

**General:**
- Light mode UI (white/gray background — host is in a dark bar and needs to see clearly)
- Tailwind for layout
- Lives on the extended display — separate from the TV output
- Optimized for quick eyes-down, eyes-up use during a live show

**Layout — two modes:**

### Build Mode (pre-show)
```
┌─────────────────────────────────────────────────────┐
│  TRIVIA OS          [Show Title]        [Go Live →] │
├──────────────┬──────────────────────────────────────┤
│              │                                      │
│  ROUND LIST  │         SLIDE BUILDER                │
│  (sidebar)   │                                      │
│              │  [ Round selector ]                  │
│  + Add Round │  [ Question # ] [ Shiny toggle ]     │
│              │  [ Question text — large textarea ]  │
│  R1 ▼        │  [ Media upload — drag & drop ]      │
│    Q1        │  [ Series toggle + label + theme ]   │
│    Q2        │                                      │
│    ✨ Q3     │  [ Add Slide ] [ Preview ]           │
│    Q4        │                                      │
│  R2 ▼        │                                      │
│    ...       │                                      │
│              │                                      │
│  + Add Round │                                      │
└──────────────┴──────────────────────────────────────┘
```

### Live Mode (during show)
```
┌─────────────────────────────────────────────────────┐
│  ◀ PREV    Q3 · R1 · Slide 8/42    NEXT ▶   [SCORE]│
├─────────────────────────────────────────────────────┤
│                                                     │
│  CURRENT SLIDE PREVIEW (small, read-only)           │
│                                                     │
├─────────────────────────────────────────────────────┤
│  UPCOMING:  Q4 text preview...   Q5 text preview... │
└─────────────────────────────────────────────────────┘
```

**Score Panel (slide-out from right):**
- Triggered by [SCORE] button or keyboard shortcut
- Fuzzy search input at top (Fuse.js) — type partial team name
- Matching team highlights instantly
- Score input: numeric field + [+] confirm
- Running total shown per team
- [Reveal Scores] button — pushes scoreboard to `/display`
- [Hide Scores] button
- All teams listed with current total

---

## 8. Stream Deck Integration

The iPad Stream Deck app sends keyboard shortcuts. The `/host` view listens for these globally via `useKeyboardShortcuts` hook.

```js
// Default keyboard shortcut map
const STREAM_DECK_SHORTCUTS = {
  'ArrowRight':     'NEXT_SLIDE',
  'ArrowLeft':      'PREV_SLIDE',
  'ArrowUp':        'VOLUME_UP',       // system volume via host
  'ArrowDown':      'VOLUME_DOWN',
  'Space':          'PLAY_AUDIO',      // plays audio on current shiny slide
  'KeyS':           'TOGGLE_SCOREBOARD',
  'KeyR':           'REVEAL_SCORES',
  'KeyT':           'TRIGGER_SPECIAL', // reserved for custom special events
  'KeyJ':           'TOGGLE_JUKEBOX',  // signal to Trivia Jukebox app
}
```

- All shortcuts are configurable by the host in settings
- Stream Deck button labels should match the action names above
- The `TRIGGER_SPECIAL` key is reserved and can be mapped to any custom server-side event
- Shortcuts only fire when the host panel is focused — no accidental triggers

---

## 9. Theme System

Themes are defined in `/client/src/themes/index.js`. The active theme is stored in show JSON and in localStorage. Changing theme during a show updates `/display` in real time via Socket.io.

```js
// Theme shape
{
  id: 'midnight-galaxy',
  name: 'Midnight Galaxy',
  colors: {
    bg:          '#2b1e3e',   // slide background
    bgDeep:      '#1e1530',   // question slide background (darker)
    accent:      '#4a4e8f',   // badge backgrounds, bars
    highlight:   '#a490c2',   // titles, counter, key text
    text:        '#e6e6fa',   // body text
    textMuted:   '#9988bb',   // watermark, secondary text
    shinyBg:     '#3d2060',   // shiny slide background
    shinyAccent: '#c9a0ff',   // shiny slide highlight color
  },
  fonts: {
    display: 'Handters',      // round titles, big numbers — Baynes brand font
    body:    'Roquen',        // question text — Baynes supporting font
    ui:      'Inter',         // counter, labels, host panel
    displayFallback: 'Anton', // fallback until Handters.woff2 is in /public/fonts/
    bodyFallback:    'Inter', // fallback until Roquen.woff2 is in /public/fonts/
  },
  particles: {
    color: '#a490c2',
    count: 40,
  },
  roundIntro: {
    numberColor: '#a490c2',
    titleColor:  '#e6e6fa',
    bgColor:     '#2b1e3e',
  }
}
```

**All 10 themes are pre-loaded.** Theme colors are the primary palette for the /display view. Baynes Apple Valley brand colors (Section 21) appear as watermarks and accents on top of the theme — they never override the theme entirely. Theme switcher (already built) feeds into this system. When host selects a theme, a `THEME_CHANGED` Socket.io event fires and all connected views update.

---

## 10. Supabase Realtime Event Map

All real-time communication uses Supabase Realtime. The `shows` table row is the single source of truth for show state. All screens subscribe to changes on their show's row and relevant tables.

### Supabase Realtime Channels

**Channel: `show:{showId}`**
All screens subscribe to this channel. Broadcasts when the show state row changes.

```
// What triggers a broadcast        // What changed in the DB
Host advances slide              →  shows.current_slide_id
Host toggles scoreboard          →  shows.scoreboard_visible
Host reveals scores              →  shows.scores_revealed
Host changes theme               →  shows.theme_id
Host triggers special event      →  shows.special_event (ephemeral)
Host plays audio                 →  shows.audio_playing (ephemeral)
```

**Channel: `teams:{showId}`**
All screens subscribe. Broadcasts when any team row changes.

```
Team registers                   →  INSERT on teams table
Team invokes powerup             →  teams.powerup_used = true
Team score updated               →  team_scores row updated
Team went back (alert to host)   →  teams.last_action = 'went_back'
Team left app (alert to host)    →  teams.is_connected = false
```

### Supabase SQL Schema

Run this in the Supabase SQL editor on the `baynes-trivia` project:

```sql
-- Shows table (one row = one trivia night)
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
  special_event jsonb default null
);

-- Teams table (one row per team per show)
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

-- Team scores table (one row per team per round)
create table team_scores (
  id text primary key,
  show_id text references shows(id) on delete cascade,
  team_id text references teams(id) on delete cascade,
  round_index integer not null,
  score integer default 0,
  updated_at timestamptz default now(),
  unique(team_id, round_index)
);

-- Question archive (personal reference library — not used during show)
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

-- Enable Realtime on the tables that need live sync
alter publication supabase_realtime add table shows;
alter publication supabase_realtime add table teams;
alter publication supabase_realtime add table team_scores;
```

### Client Subscription Pattern

```js
// Every screen subscribes on mount
const channel = supabase
  .channel(`show:${showId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'shows',
    filter: `id=eq.${showId}`
  }, (payload) => {
    // Update local state with payload.new
  })
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'teams',
    filter: `show_id=eq.${showId}`
  }, (payload) => {
    // Handle team changes
  })
  .subscribe()

// Cleanup on unmount
return () => supabase.removeChannel(channel)
```

### Host Actions → DB Updates

Instead of emitting Socket.io events, the host panel writes directly to Supabase. Realtime broadcasts the change to all subscribers automatically.

```js
// Next slide
await supabase
  .from('shows')
  .update({ current_slide_id: nextSlide.id, current_slide_index: nextIndex })
  .eq('id', showId)

// Reveal scoreboard
await supabase
  .from('shows')
  .update({ scoreboard_visible: true })
  .eq('id', showId)

// Update team score
await supabase
  .from('team_scores')
  .upsert({ team_id, show_id, round_index, score, updated_at: new Date() })

// Team registers (from /join)
await supabase
  .from('teams')
  .insert({ id: nanoid(), show_id: showId, name: teamName })
```

---

## 11. The `/join` Phone View

**Registration flow:**
1. Team scans QR code → lands on `/join`
2. Prompted to enter team name (large input, mobile-optimized)
3. Submitted → INSERT to `teams` table in Supabase → host panel receives via Realtime subscription
4. Team sees waiting screen until show goes live

**During the show:**
- Shows current slide content (text only for question slides — no heavy animations on phones)
- Question counter visible (Q3 · R1)
- Round name visible
- Can scroll back to previous questions — but CANNOT go forward past current
- **Forward navigation gate:** `current_slide_index` from Supabase is the single source of truth. The forward/next button on the phone is disabled whenever `teamViewedIndex >= show.current_slide_index`. This is enforced in the UI — the button is not just hidden, it is disabled and visually grayed out so teams know the boundary exists.
- **Cannot be bypassed:** the gate is based on the Supabase value, not local state. Even if a team refreshes or rejoins, they cannot jump ahead.
- **Failsafe — forward attempt:** if a team somehow triggers forward navigation past the gate, write `last_action: 'tried_to_advance'` to the teams table. Host panel receives a red toast: "⚠️ [Team Name] tried to skip ahead."
- **Failsafe — back navigation:** if team navigates back to a previous slide, write `last_action: 'went_back'` to the teams table. Host panel receives an amber toast: "↩ [Team Name] went back to Q{n}."
- **Failsafe — app exit:** if team's browser loses focus or closes, write `is_connected: false` to teams table. Host panel receives a gray toast: "📵 [Team Name] left the app."
- All three alerts are dismissible toasts on the host panel. Back and exit alerts auto-dismiss after 6 seconds. Forward-attempt alerts stay until manually dismissed — the host needs to see that one.
- Powerup button: always visible, grayed out once used, shows powerup name and icon

**Score visibility:**
- Scores hidden until host reveals them
- When revealed: animated leaderboard appears on phone too
- Teams always see their own score (bottom of screen, persistent)

---

## 12. Powerup System

Host defines powerups before the show in Build Mode. Up to 3 powerups per night.

```js
// Powerup definition
{
  id: 'pu_1',
  name: 'Double Down',
  description: 'Double your points on this question.',
  icon: '⚡',
  effect: 'manual'   // 'manual' = host decides what happens; system just logs it
}
```

**All powerups are `effect: 'manual'`** — the system logs the invocation and alerts the host, but the host decides whether and how to honor it. This is intentional — keeps the host in control.

**When invoked:**
1. Team taps powerup button on `/join`
2. Confirmation dialog: "Use your [Double Down] powerup? This cannot be undone."
3. On confirm: `TEAM_INVOKE_POWERUP` fires
4. Server marks team's `powerupUsed: true`
5. Host panel: red alert banner "⚡ Quiz Khalifa just used Double Down!"
6. Button on team phone becomes permanently grayed out with "Used ✓"
7. No automatic display-screen event (host decides if they want to announce it)

---

## 13. Scoring System

**Data model:** each team has a `scores` array, one entry per round.
```js
scores: [80, 60, 0, 0, 0]  // round 1: 80pts, round 2: 60pts, etc.
totalScore: 140             // always computed, never stored directly
```

**Score input flow (host):**
1. Open score panel (slide-out)
2. Type partial team name in fuzzy search field (Fuse.js, threshold 0.3)
3. Matching teams highlight in real time
4. Click team → round score input appears
5. Enter score → confirm → `HOST_UPDATE_SCORE` fires
6. Server updates show JSON + broadcasts `SCORES_UPDATED`
7. All views update

**Score display:**
- Host panel: always visible, sorted by total descending
- `/display`: only when host reveals (scoreboard-reveal slide or toggle)
- `/join`: team's own score always visible, full leaderboard when revealed

---

## 14. Media Handling

Images and audio are uploaded via the slide builder in Build Mode.

**Photo Library (Ben Photos):**
- A dedicated "Host Photos" section in the host panel
- Host can upload personal photos (candid, funny, reaction shots) to a reusable library
- Any slide can have a host photo assigned via a "Add Ben Photo" picker
- Grading break slides default to showing a random host photo if the library is non-empty
- Stored in `/uploads/[showId]/host-photos/`
- Supported formats: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- See Section 22 for display rules and philosophy

**Upload:**
- Drag and drop onto the slide builder media zone, or click to browse
- Multer handles upload, stores in `/uploads/[showId]/[filename]`
- Server returns the URL, stored in slide data as `mediaUrl`
- Supported: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.mp3`, `.wav`, `.m4a`, `.ogg`

**Image display rules (isShiny = true, shinyType = "visual"):**
- Landscape image (width > height): full bleed, question text overlaid at bottom with gradient scrim
- Portrait image (height > width): image left 50%, question text right 50%
- Square image: full bleed, question text overlaid
- Host can override layout if needed

**Audio playback:**
- Audio does NOT autoplay — host triggers from panel or Stream Deck (Space)
- Animated waveform on display while playing (CSS bars, randomized heights, theme accent color)
- Host can replay, no limit
- Volume controlled via system volume (Stream Deck Up/Down arrows)

---

## 15. Persistence & Backup

**Three-layer persistence:**

1. **Autosave to local JSON** — server writes `/shows/[showId].json` every time show state changes (debounced 500ms)
2. **Browser localStorage** — client caches current show ID and theme for recovery if page refreshes
3. **Export** — host can download the full show JSON from the host panel at any time. Import restores a show from a `.json` file.

**Show library:**
- Host panel has a "My Shows" screen listing all saved shows
- Can load, duplicate, or delete shows
- Show from last trivia night is always pinned at top

---

## 16. Baynes Apple Valley Branding

See **Section 21** for the complete brand identity spec including colors, typography, logo placement, and tone. Section 21 is the single source of truth for all Baynes branding decisions.

Quick reference:
- **Logo file:** `/public/baynes-logo.svg`
- **Display watermark:** bottom-right, 20% opacity, theme text color — every slide
- **Round intros:** logo centered above title, 40% opacity
- **Host panel:** full color logo, top-left nav
- **Never:** full-color logo on the display view — theme drives the color

---

## 17. Trivia Jukebox Integration

Trivia Jukebox is a separate React/Vite/Spotify app running at a different port. It plays music during grading breaks.

**Integration points:**
- Trivia Jukebox is deployed at `https://trivia-jukebox.vercel.app`
- Stream Deck `KeyJ` shortcut triggers `TOGGLE_JUKEBOX` keyboard shortcut in the host panel
- Host panel makes a fetch call to the Jukebox app's API endpoint to play/pause
- No deep integration needed — just a play/pause toggle signal
- Trivia OS does not control Jukebox track selection
- During grading breaks the host manually triggers the Jukebox via Stream Deck

---

## 18. Build Order

Build in this exact order. Do not skip ahead.

1. **Vite + React + Tailwind scaffold** — project structure from Section 2, Supabase client in `/src/lib/supabase.js`, env vars wired, vercel.json SPA rewrite rule
2. **Supabase schema** — run SQL from Section 10 in baynes-trivia project, verify all 4 tables exist, Realtime enabled
3. **`/host` Build Mode** — slide builder, round manager, media upload to Supabase Storage, show save/load via Supabase, `useShow` hook
4. **`/display` view** — slide renderer, all slide types from Section 4, all transitions from Section 5, theme system from Section 9, question counter from Section 6. Read Sections 19, 20, 21, 22, 23 first.
5. **Host → Display sync** — Supabase Realtime subscriptions, keyboard shortcuts, Stream Deck listener
6. **`/host` Live Mode** — minimal prev/next UI, slide preview strip, mode switching
7. **Score panel** — fuzzy search (Fuse.js), score input, reveal toggle, Supabase upsert
8. **`/join` view** — team registration, QR code, slide follow, forward gate (Section 11), alerts
9. **Powerup system** — host definition, phone invocation, Supabase alerts
10. **Show library** — my shows screen, export as JSON backup, import from JSON
11. **Theme switcher integration** — wire existing theme switcher into ThemeProvider
12. **Jukebox integration** — Stream Deck KeyJ → fetch to trivia-jukebox.vercel.app
13. **Polish pass** — Impeccable audit (Section 27), animations, transitions, mobile optimization

---

## 19. Design Principles

These apply to every surface of the app.

- **The display view is a performance.** Every pixel on the TVs is part of the show. It should feel like a game show, not a slideshow.
- **The host panel is a tool.** Fast, clear, no surprises. Light mode. Big tap targets. The host is multitasking in a loud, dark bar.
- **Team phones are minimal.** They load fast, work on cheap phones, and never distract from the live experience.
- **Animations serve the moment.** Round intros are dramatic because a new round IS dramatic. Question slides are snappy because pace matters. Don't animate for animation's sake.
- **The theme drives everything visual.** Colors, particles, glow effects, font weights — all derived from the active theme. Swapping a theme should feel like a completely different show.
- **Baynes is always present, never dominant.** The logo watermark is a signature, not a billboard.
- **Fail gracefully.** If a phone disconnects, the show goes on. If a file is missing, the slide renders without it. Never crash the host panel during a live show.

---

## 20. Emil Design Engineering Principles

These principles govern every animation, interaction, and motion decision in Trivia OS. Read this before writing any animation code.

### The Core Rule: Unseen details compound

Most details users never consciously notice. That is the point. When a transition feels exactly right, the crowd doesn't think "great animation" — they just feel the energy of the show. The aggregate of invisible correctness creates an experience people love without knowing why.

### Animation Decision Framework

Before writing any animation, answer in order:

**1. Should this animate at all?**

| Frequency | Decision |
|---|---|
| Every slide advance (100+ times/night) | No animation on the control itself. Only on the display output. |
| Occasional (score panel open, scoreboard reveal) | Standard animation |
| Rare/ceremonial (round intro, shiny slide entry, powerup invocation) | Full dramatic treatment |

Stream Deck button presses on the host panel: **no animation**. The host presses next 80+ times a night. The display view responds with animation — the host panel just updates instantly.

**2. What easing?**

```css
/* All Trivia OS easing curves */
--ease-snap:      cubic-bezier(0.23, 1, 0.32, 1);     /* slide transitions, snappy entries */
--ease-overshoot: cubic-bezier(0.34, 1.56, 0.64, 1);  /* round intro slam, badge bounce */
--ease-drawer:    cubic-bezier(0.32, 0.72, 0, 1);      /* score panel slide-out */
--ease-smooth:    cubic-bezier(0.4, 0, 0.2, 1);        /* scoreboard bar expansion */
--ease-out:       cubic-bezier(0.23, 1, 0.32, 1);      /* default for all UI entries */
```

**Never use `ease-in` for UI animations.** It starts slow — the exact moment the user is watching most closely. `ease-out` at 180ms feels faster than `ease-in` at 180ms.

**3. How fast?**

| Element | Duration |
|---|---|
| Slide transition (question → question) | 160-180ms |
| Score panel slide-out | 220ms |
| Round intro slam | 300ms entry, hold until advanced |
| Scoreboard row stagger | 80ms per row |
| Scoreboard bar expansion | 600ms |
| Shiny slide entry flash | 1 frame (16ms) |
| Shiny scale-in | 280ms |
| Button press feedback | 120ms |
| Toast alert (host panel) | 180ms in, 140ms out |
| Powerup alert | 200ms in, 160ms out |

**Rule: UI animations (host panel) stay under 200ms. Display animations can be longer because they serve the performance, not the operator.**

### Specific Implementation Rules

**Slide transitions — never animate from scale(0)**
```js
// Wrong — appears from nowhere
initial: { scale: 0, opacity: 0 }

// Right — has visible shape even entering
initial: { scale: 0.96, opacity: 0, x: '100%' }
animate: { scale: 1, opacity: 1, x: 0 }
```

**Round intro — overshoot spring for the slam:**
```js
// Round number slams in with overshoot
initial: { scale: 3.5, opacity: 0 }
animate: { scale: 1, opacity: 1 }
transition: { type: 'spring', duration: 0.4, bounce: 0.25 }

// Title slides up after
initial: { y: 60, opacity: 0 }
animate: { y: 0, opacity: 1 }
transition: { delay: 0.25, duration: 0.28, ease: [0.23, 1, 0.32, 1] }
```

**Scoreboard rows — stagger from bottom up:**
```js
// Stagger: 70ms between rows, bottom rank appears first
// Each row: translateY(24px) → 0, opacity 0 → 1, 220ms ease-out
// Score bar: width 0 → final%, 600ms ease-smooth, delayed 120ms after row
// Leader glow: pulses in 200ms after bar completes
// Crown: spring drop from above, bounce: 0.3
```

**Score panel (drawer) — iOS-feel:**
```js
// Uses --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)
// Slides in from right, 220ms
// Backdrop: opacity 0 → 0.4, 180ms ease-out
// On close: 160ms ease-in (faster exit than entry)
```

**Shiny slide entry:**
```css
/* Flash frame — pure CSS, off main thread */
@keyframes shiny-flash {
  0%   { opacity: 1; }
  8%   { opacity: 0; }
  100% { opacity: 0; }
}
.shiny-flash {
  background: white;
  animation: shiny-flash 200ms ease-out forwards;
}
```
```js
// Then image/content scales in
initial: { scale: 1.08, opacity: 0 }
animate: { scale: 1, opacity: 1 }
transition: { delay: 0.05, duration: 0.28, ease: [0.23, 1, 0.32, 1] }

// Gold particles: CSS animation, 500ms, fades out — never JS
```

**Waveform (audio shiny slides) — CSS, not JS:**
```css
/* CSS bars stay smooth even when main thread is busy loading audio */
@keyframes waveform-bar {
  0%, 100% { transform: scaleY(0.2); }
  50%       { transform: scaleY(1); }
}
.bar { animation: waveform-bar 800ms ease-in-out infinite; }
.bar:nth-child(2) { animation-delay: 80ms; }
.bar:nth-child(3) { animation-delay: 160ms; }
/* etc. */
```

**Host panel buttons — always feel responsive:**
```css
.host-button {
  transition: transform 120ms ease-out, background 100ms ease;
}
.host-button:active {
  transform: scale(0.97);
}
```

**Score input confirm button — hold-to-confirm pattern:**
```css
/* Slow press (deliberate), fast release (system responding) */
.confirm-overlay {
  clip-path: inset(0 100% 0 0);
  transition: clip-path 200ms ease-out; /* release: fast */
}
.confirm-button:active .confirm-overlay {
  clip-path: inset(0 0 0 0);
  transition: clip-path 1.2s linear; /* press: deliberate */
}
```

**Powerup alert toast (host panel):**
```js
// Asymmetric: enters with energy, exits fast
enter: { y: -8, opacity: 0 } → { y: 0, opacity: 1 }, 200ms ease-out
exit:  { opacity: 0 }, 140ms ease-in
// Red background, team name bold, powerup icon large
// Auto-dismisses after 6 seconds
```

**Team-went-back alert (host panel):**
```js
// Same as powerup alert but amber/yellow color
// Stays until manually dismissed — host needs to see this
```

### Performance Rules

**Only animate `transform` and `opacity` on the display view.** These run on the GPU. Never animate `width`, `height`, `padding`, or `margin` — they trigger layout recalculation.

**Use CSS animations for predetermined display effects** (waveform, particles, looping backgrounds). CSS runs off the main thread and stays smooth even when audio is loading.

**Framer Motion hardware acceleration:**
```jsx
// NOT hardware accelerated — drops frames under load
<motion.div animate={{ x: 100 }} />

// Hardware accelerated — use this on /display
<motion.div animate={{ transform: 'translateX(100px)' }} />
```

**Touch device hover states on /join:**
```css
@media (hover: hover) and (pointer: fine) {
  .powerup-button:hover {
    transform: scale(1.03);
  }
}
/* No hover animation on phones — they fire on tap, not hover */
```

**Respect reduced motion:**
```jsx
const shouldReduceMotion = useReducedMotion();
// If true: opacity transitions only, no transform-based movement
// Never zero animations — fade-only is fine and aids comprehension
```

### Spring Configurations (Framer Motion)

```js
// Round intro number slam
{ type: 'spring', duration: 0.4, bounce: 0.25 }

// Question number badge bounce
{ type: 'spring', duration: 0.3, bounce: 0.2 }

// Scoreboard crown drop
{ type: 'spring', duration: 0.5, bounce: 0.3 }

// Score panel drawer open
{ type: 'spring', duration: 0.35, bounce: 0.0 }  // no bounce on drawers

// Powerup button confirm
{ type: 'spring', duration: 0.25, bounce: 0.15 }
```

### Cohesion Rule

Every animation in Trivia OS must match the energy of the moment it serves:
- **Round intros:** theatrical, weighty, dramatic — the crowd needs to feel it
- **Question slides:** snappy and immediate — pace matters, don't waste 400ms
- **Scoreboard:** ceremonial but legible — stagger gives people time to find their team
- **Host panel:** invisible — tools that feel good without calling attention to themselves
- **Team phones:** minimal — they're a reference device, not a performance screen

If an animation makes the host panel feel slower, remove it. If an animation makes the display feel cheaper, remove it. If an animation makes the crowd react, keep it.

---

## 21. Baynes Apple Valley Brand Identity

Every visual surface of Trivia OS — the display view, the host panel, the join screen — carries the Baynes Apple Valley identity. This is not a generic trivia app. It is Baynes Trivia Night. The brand must be present and felt.

### Brand Colors

| Name | Hex | Usage in Trivia OS |
|---|---|---|
| Deep Forest Green | `#004000` | Primary brand color — logo, round intro accents, grading break backgrounds |
| Apple Red | `#e02020` | Shiny slide accent, powerup alerts, special event highlights |
| Orchard Green | `#60a000` | Secondary accent — question counter, watermark tint |
| Bright Leaf | `#60c000` | Leaf/nature details, small decorative elements |
| Cream | `#f5f0e8` | Text on dark backgrounds, light overlays |

**Never use all colors at once.** Per design surface: 2–3 colors max. The weekly theme drives the primary palette — Baynes colors appear as accents and watermarks, not as overrides.

### Typography

**Display font: Handters** — the Baynes brand hero font. Used for all large display text: round titles, scoreboard headers, question number badges, title slide, shiny round title cards. Handters carries the personality of the show.

**Supporting font: Roquen** — the Baynes secondary font. Used for question text body, round subtitles, grading break messages, team names on scoreboard, score labels.

**Font loading** — drop files into `/public/fonts/` and add to `index.css`:
```css
@font-face {
  font-family: 'Handters';
  src: url('/fonts/Handters.woff2') format('woff2'),
       url('/fonts/Handters.woff') format('woff');
  font-weight: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Roquen';
  src: url('/fonts/Roquen.woff2') format('woff2'),
       url('/fonts/Roquen.woff') format('woff');
  font-weight: normal;
  font-display: swap;
}
```

**Fallbacks:** Anton (display), Inter (body/ui) — active until font files are added.

**Body/question text:** Inter or system sans — clean, highly legible, optimized for reading at distance on a TV screen.

**Host panel:** System UI — fast rendering, no flash of unstyled text, always readable.

**Never use thin or geometric serifs on the display view.** The crowd is in a dark bar, often drinking. Legibility at 20 feet beats elegance every time.

### Logo Placement

- `/display` — bottom-right watermark, 18% opacity, theme text color (not full-color). Always present on every slide.
- Round intro slides — centered above round title, 35% opacity, slightly more prominent.
- Host panel — full-color logo top-left nav bar.
- `/join` — top of registration screen, cream/white variant.

**The Baynes logo character (farmer sitting on a red apple, raising a cider glass) is the soul of the brand.** When designing any Baynes-adjacent graphic, the energy of that character — playful, hardworking, celebratory — should inform every choice.

### Brand Tone

- Warm and welcoming — never corporate, never cold
- Confident but not arrogant — craft pride without pretension
- A little bit funny — the host's personality is part of the show (see Section 22)
- Michigan orchard energy — genuine, grounded, seasonal

---

## 22. The Host Personality & Ben Photos

The host of Trivia Night at Baynes Apple Valley is Ben Coughlin. His personality is intentionally woven into the show and is a core part of why people love it. **The crowd makes fun of him. In the best way. This is a feature, not a bug.**

### The Photo Slides

Throughout the deck, Ben's own photos appear — on grading break slides, round transition slides, and interstitial moments. These are intentional. The crowd loves reacting to them. They break up the seriousness of hard questions and remind everyone this is a community event, not a game show.

**In Trivia OS, Ben photos are a slide type and an asset.**

- The host can upload photos of himself (or others) into a "Photo Library" in the host panel
- Any slide can have a photo assigned to it
- Grading break slides default to showing a Ben photo if one exists
- Round intro slides can optionally feature a photo as a background or inset

**Photo display style:**
- Never formal or polished — the charm is in the candid, slightly ridiculous quality
- Large, centered or full-bleed with the round text overlaid
- Optional: slight vignette around edges to blend with the theme background
- The photo should feel like it was thrown in there on purpose, because it was

### Host Voice in UI Copy

All copy in the app — grading break messages, waiting screens, registration prompts — should sound like Ben wrote it. Warm, funny, self-deprecating. Examples from the existing deck:

- *"Now, please sit back, relax, and enjoy each other's company as Ben grades papers 😊"*
- *"This ain't just your momma's trivia…."*
- *"Have fun, and don't yell at me, I'm not a professional trivia writer! lol"*
- *"Ben loves you, truly. You guys make my week, every single time we do this silly thing."*

**The app should feel like he built it himself.** Because he did.

---

## 23. Visual Design Philosophy — "Midnight Orchard"

Before writing any display-view CSS or component, internalize this philosophy. It is the aesthetic DNA of Trivia OS's `/display` view.

### The Philosophy

**Midnight Orchard** is the collision of two worlds: the raw warmth of a working Michigan apple orchard at harvest time, and the electric darkness of a late-night game show. It is what happens when you take a cidery taproom and turn the lights down, turn the TVs up, and hand a crowd of regulars a pencil and a scorecard.

**Form and space:** Bold geometry dominates. Questions occupy the screen like headlines — large, unambiguous, commanding. Negative space is not empty; it is breathing room for a crowd reading from across a bar. Every element knows its place and stays there. No clutter. No decoration for decoration's sake.

**Color and material:** The active weekly theme provides the primary palette. Baynes brand colors appear as watermarks and accents — Deep Forest Green and Apple Red woven into the fabric of every slide without overpowering the theme. Dark backgrounds are the default; light is used only for emphasis. Think: a projector in a dark room, a fire pit at night, the glow of a tap handle.

**Scale and rhythm:** The question number badge is large and confident — it lands before the text, orienting the crowd instantly. The question text is massive. Supporting elements (round name, counter, watermark) are whisper-quiet. The hierarchy is unambiguous at 20 feet.

**Transition as punctuation:** Slide transitions are not decoration — they are the visual equivalent of a page turn, a dramatic pause, a spotlight shifting. Round intros slam in. Questions snap. The scoreboard reveals itself like a curtain rising. Motion serves the moment or it is removed.

**The host's presence:** Ben's photos are compositionally intentional. They are placed with the same care as any other element — large enough to read, positioned to contrast with the text, chosen for maximum comic or emotional impact. They are not clip art. They are part of the show.

**Craftsmanship standard:** Every slide must look like it was designed — not generated. Margins are deliberate. Type is sized for legibility at distance, not for visual balance at arm's length. Color combinations are tested against dark bar conditions, not a bright monitor. The crowd should look at the screen and feel like someone who loves this thing built it for them. Because they did.

### Applying the Philosophy

When building any display-view component:
1. **Start with the content** — what does the crowd need to see, and in what order?
2. **Strip everything that doesn't serve that** — every decoration must earn its place
3. **Apply the active theme** — colors, fonts, particle effects from the theme definition
4. **Add Baynes accents** — watermark logo, subtle brand color references
5. **Test the motion** — does this transition serve the moment, or is it just movement?
6. **Ask: would this look good on a TV in a dark bar?** — if yes, ship it

---

## 24. Skill Structure Notes (for future updates)

This SKILL.md follows progressive disclosure principles:

- **Sections 0–3:** Always read first. Architecture doesn't change.
- **Sections 4–17:** Read the relevant section when building that feature.
- **Sections 19–23:** Read before any design or animation work.

**When adding new features:**
1. Add the feature spec to the relevant section (or create a new numbered section)
2. Update the build order in Section 18 if needed
3. Update the Socket.io event map in Section 10 for any new real-time events
4. Update the show JSON schema in Section 3 for any new data fields

**When Claude Code asks for clarification on anything design-related**, the answer lives in Sections 19–23 and 27. Read those before asking.

### Design Plugin Integrations

The following design plugins are available and should be invoked at the appropriate build stages:

**`design:design-handoff`** — Use when any display-view component is considered complete.
Generates a developer spec sheet covering: layout measurements, design tokens, component props, interaction states, animation timing, responsive breakpoints, and edge cases. Run this on:
- The question slide component (Section 4)
- The round intro component (Section 4)
- The scoreboard reveal component (Section 4)
- The shiny slide component (Section 4)
- The score panel drawer (Section 7)
- The /join phone view (Section 11)
The output spec should be saved alongside the component file for reference.

**`design:ux-copy`** — Use when writing any user-facing text in the app.
All copy must sound like Ben wrote it — warm, funny, self-deprecating (see Section 22). Run this plugin when writing:
- Grading break messages
- Team registration prompts on /join
- Waiting screen copy ("Trivia starts soon...")
- Powerup confirmation dialogs
- Score input empty states
- Error messages
- The /join "you can't go forward" message when a team tries to skip ahead
Reference the voice examples in Section 22 as the style guide input.

**`design:design-critique`** — Use before marking any display-view component done.
Run a structured critique pass on usability, visual hierarchy, and consistency against these criteria:
- Readable at 20 feet on a TV in a dark bar
- Theme colors applied correctly (Section 9 + Section 21)
- Baynes logo watermark present and correctly positioned (Section 16)
- Question counter visible on all question slide types (Section 6)
- Emil animation principles followed (Section 20)

**`design:accessibility-review`** — Run on the /join phone view specifically.
Teams use any device, any screen size, in a dark noisy bar. WCAG 2.1 AA minimum. Focus on:
- Touch target sizes (minimum 44x44px)
- Color contrast (dark bar = phones often at low brightness)
- The powerup button (one tap, no accidental triggers)
- Score visibility (team's own score always legible)

---

## 25. Key Constraints & Notes

- **Hosted on Vercel.** Frontend is a Vite/React app deployed to Vercel. No local server needed.
- **Real-time via Supabase Realtime.** All live sync (slide changes, scores, team registration) goes through the `baynes-trivia` Supabase project. No Socket.io. No Render.
- **Internet required.** The show requires an internet connection since Supabase is cloud-hosted. Venue WiFi is sufficient — the data volume is tiny.
- **QR code for `/join`** points to the live Vercel URL (e.g. `https://trivia-os.vercel.app/join`). No IP address needed — works on any network.
- **One show is "active" at a time.** The `is_live` flag on the shows table marks the active show. All screens query for the live show on mount.
- **Team names are unique per show.** Duplicate names are rejected with a friendly error.
- **Score input is additive per round, not per question.** Host enters a team's round total after grading. Running total computed from `team_scores` table.
- **Audio files should be < 50MB.** Enforce this on upload with a clear error message.
- **The `/display` view should be opened in a separate browser window** (not tab) and fullscreened. The host panel is on the extended display, display view is on the primary (TV-connected) display.
- **Powerups are host-defined and host-honored.** The system never automatically applies powerup effects. The host decides.
- **Question archive (`questions` table) is read-only during shows.** It exists for Ben's personal reference only — not used by the show builder or any live feature.
- **Supabase environment variables:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — set in Vercel dashboard and `.env.local` for dev.

---

## 26. Reference Deck Analysis — Observed Patterns from Existing PowerPoint

This section documents patterns observed in Ben's actual trivia deck (99 slides). Claude Code should treat these as ground truth for how the show actually runs, not assumptions.

### Slide Type Distribution (99 slides)
- **Title/opener:** 1 slide (Life Is Good Today graphic + "State Of The Union" with Ben photo)
- **Rules:** 2 slides (Rules header + bulleted rules text)
- **Training Wheels:** 1 special mechanic slide with interactive button
- **Round intros:** 5 slides (one per round — always with Ben photo + round name + punchy subtitle)
- **Question slides (text only):** ~28 slides
- **Question slides (visual — full image):** ~32 slides (celebrity IDs, mythical characters, pixelated images, LEGO characters)
- **Shiny round title cards:** 6 slides (yellow bg + Ben + round theme title: "Not So Different You and I", "Did You Tape the Instructions?", "Name That Mythical Character", "If Every Celebrity Was Bill Nye", "Pixelate", "Redemption")
- **Audio question slides:** 6 slides (R3 Swing Round — just "1. 8-Bit", "2. Bluegrass" etc with speaker icon)
- **PYL answer reveal slides:** 4 slides (progressive list reveals showing +40, +20 etc)
- **Grading break slides:** 5 slides (one per round, always same message, always has Ben photo thumbnail and back navigation link)
- **Bonus slides:** 3 slides (header + 2 questions)
- **Closer:** 1 slide

### Critical Observed Patterns

**The "shiny round" title card is its own distinct slide type.** It's not just a round intro — it's a mid-round reveal that announces the special question format BEFORE showing the questions. It has:
- Yellow background (becomes theme-colored in Trivia OS)
- Large bold handwritten-style text with the round name
- Ben's photo (small, lower-left corner — intentionally comedic placement)
- A retro telephone/button icon (the "Staples easy button" style graphic — this is a recurring motif)
- No question content — purely a dramatic reveal

**The back navigation pattern is consistent.** Every grading break slide has "Click Here to go back to round X, question 1" as a hyperlink. This is the original version of what we're building as the back-navigation feature in Section 11. It's used after every round.

**Ben's photo size varies intentionally by slide type:**
- Grading breaks: tiny thumbnail (bottom-left corner, ~15% of slide width)
- Round intros: medium (30-40% of slide, offset)
- Shiny round titles: medium-small (20-25%, lower left)
- Emotional slides (R5 "Ben loves you"): no photo — text only. The absence of the photo is the joke.

**The "Redemption" slide (Slide 53) is a placeholder/separator.** Just the word "Redemption" centered on white. In Trivia OS this becomes a sub-round-intro slide type — a mid-round divider between PYL sub-categories.

**Audio question slides are extremely minimal.** Just the number and style ("1. 8-Bit"), a speaker icon top-left, and nothing else. The audio IS the question. The slide is a label, not content. In Trivia OS the waveform animation fills this space.

**The Pixelate round (R5, Q3):** Three progressively de-pixelated versions of the same image across three consecutive slides. This is a unique slide mechanic — a single "question" that spans multiple slides. In Trivia OS this needs to be a slide series type where the same question ID can have multiple reveal stages.

**The PYL (Press Your Luck) round uses progressive answer reveals.** Each slide adds one more answer to the list, with a running point value shown (+40, +20). This means PYL questions need a "reveal stages" mechanic — similar to Pixelate but for text lists.

**The Bill Nye round format:** Question is a Bill Nye-style scientific description of a celebrity. Teams answer with the celebrity's name. Questions are extremely short (5-7 words: "6. The Cleavage Fairy"). The shiny title card does all the setup — the question slides themselves need zero context.

**The "Flipped Questions" sub-round:** Answers are given, teams guess the question. The answers shown are deliberately long and weird. This is another format that works with the standard question slide — no special handling needed, the question text is just written in reverse-format.

**The LEGO round (Those Sneaky Bricks):** Six questions on a single slide. This is the only time multiple questions live on one slide. In Trivia OS, this becomes a "multi-question slide" type — one slide with a numbered list, no per-question navigation.

### Ben Photo Inventory Notes

Observed photo styles across the deck:
- **Formal/dressed up** (suit, bow tie) — used for "State Of The Union" opener. High gravitas irony.
- **Casual reaction shots** — mid-sentence, looking at camera, relaxed. Most common.
- **Group shots** — Round 5 intro has Ben with friends. Social, warm.
- **Vintage/old photos** — implied by some older-looking images. Nostalgia factor.
- **Cutout on colored background** — most common format. PNG with transparent bg placed on yellow.

The photo library in Section 14 should support categorizing photos by "mood" or "use" so Ben can quickly find the right one when building a grading break or round intro.

### Copy Voice Reference — Exact Lines from Deck

These are verbatim examples of Ben's voice. UX copy throughout the app should match this register:

- *"This ain't just your mommas trivia…."*
- *"Whatever the quizmaster says, goes…"*
- *"Try to adhere from phone usage, cheating is not acceptable… we will throw your phone in the river"*
- *"Have fun, and don't yell at me, I'm not a professional trivia writer! lol"*
- *"Now, please sit back, relax, and enjoy each others company as Ben grades papers 😊"*
- *"It did not went well."* (Round 2 subtitle — intentional grammar error, beloved by the crowd)
- *"Before we begin… Just want to reiterate thank you for being here tonight! We truly love and appreciate you all."*
- *"Ben loves you, truly. You guys make my week, every single time we do this silly thing."*
- *"That concludes trivia! Hang out to see the correct answers and who takes home the gold! Or not, it's all good… We love you!"*

### Additional Slide Types to Add to Section 4

Based on this analysis, two slide types need to be added that weren't in the original spec:

**`pixelate-series`** — A single question that spans multiple slides, each showing a progressively clearer version of the same image. 3 stages typical. Host advances through stages manually. Same question number across all stages.

**`multi-question`** — A single slide containing a numbered list of questions (like the LEGO round and Flipped Questions). No per-question navigation — the whole slide is one unit. Used when a sub-round has 6 short questions that are better read together than navigated separately.

**`pyl-reveal`** — Press Your Luck answer reveal slide. Shows a list with some items filled in and some blank, plus a running point value. Each advance from the host fills in the next item. Needs "reveal stages" support similar to pixelate-series.

---

## 27. Impeccable Design System Integration

Trivia OS uses the **Impeccable** design engineering skill (`pbakaus/impeccable`) for production-grade frontend quality. This is not optional polish — it is part of the build process.

### What Impeccable Does

Impeccable is a suite of commands that catch and fix the exact class of AI-generated UI defects that make interfaces look generic. For Trivia OS, which runs on TVs in a dark bar and must look genuinely stunning, this matters enormously.

### Required Commands by Build Stage

**After building any /display view component:**
```
$impeccable polish [component]
```
Runs a final quality pass. Catches contrast failures, overflow, spacing inconsistencies, motion issues.

**After building the /host panel:**
```
$impeccable audit [component]
```
Technical quality checks: accessibility, responsive behavior, touch targets, color contrast at low brightness (dark bar conditions).

**After building /join phone view:**
```
$impeccable adapt [component]
```
Adapts for all device sizes and screen densities. Team phones are unknown devices — must work on everything.

**If any component looks bland or generic:**
```
$impeccable bolder [component]
```
Amplifies safe or bland designs. The display view especially must never look like a default template.

**For all UX copy (grading breaks, registration, alerts):**
```
$impeccable clarify [component]
```
Improves labels, error messages, and microcopy. Use alongside design:ux-copy (Section 24) and Ben's voice guide (Section 22).

**For the scoreboard and round intro animations:**
```
$impeccable animate [component]
```
Ensures motion is intentional, easing curves are correct, and reduced motion is respected.

**For the theme system:**
```
$impeccable colorize [component]
```
Validates color strategy per theme. Ensures contrast, intentional palette use, no AI color defaults.

### Absolute Bans — Enforced by Impeccable

These are automatically flagged. Never let them into the codebase:

- **Side-stripe borders** — no `border-left` accent lines on cards or panels
- **Gradient text** — `background-clip: text` with gradient is banned entirely
- **Ghost-card pattern** — never pair `border: 1px solid` + `box-shadow` with blur ≥ 16px on the same element
- **Over-rounded corners** — cards max at 12–16px border-radius. Never 24px+ on cards
- **Cream/sand/beige backgrounds** — the warm-neutral AI default. The display view is dark. The host panel is clean white or cool gray. Never warm tinted neutrals.
- **Uppercase tracked eyebrows on every section** — one deliberate use is voice, everywhere is AI grammar
- **Numbered section markers (01/02/03)** as default scaffolding
- **Hand-drawn SVG illustrations** — never. Use real assets or nothing.
- **Diagonal stripe backgrounds** — `repeating-linear-gradient` stripes are banned
- **Identical card grids** — same-size icon+heading+text cards repeated endlessly

### Display View Specific Rules (from Impeccable)

- Body text contrast ≥ 4.5:1 against background — critical for TV viewing at distance
- Display heading letter-spacing floor: ≥ -0.04em — tighter makes letters touch
- Hero text ceiling: clamp() max ≤ 6rem — above that it's shouting
- Use `text-wrap: balance` on round titles and question numbers
- Motion must have `@media (prefers-reduced-motion: reduce)` alternative — always
- Never gate content visibility on a class-triggered transition — content must be visible by default
- Z-index scale: dropdown(100) → sticky(200) → modal-backdrop(300) → modal(400) → toast(500) → tooltip(600). Never arbitrary 999 or 9999.

### Color Strategy for Trivia OS

Per Impeccable's color strategy framework, Trivia OS `/display` view uses **"Drenched"** — the surface IS the color. The active theme's background color dominates 70%+ of the screen. This is intentional and correct for a TV show environment.

The `/host` panel uses **"Restrained"** — tinted neutrals + one accent. Light mode, functional, minimal distraction.

The `/join` phone view uses **"Committed"** — theme accent color carries 30–60% of the surface, but legibility always wins over aesthetics.

### The AI Slop Test

Before shipping any component, ask: "Could someone look at this and say 'AI made that' without doubt?" If yes, it has failed. Run `$impeccable bolder` or `$impeccable polish` until the answer is no.

Specific Trivia OS failure modes to watch for:
- The display view looks like a generic dark dashboard
- Round intro animations use default ease instead of the specified overshoot spring
- The scoreboard looks like a data table instead of a game show leaderboard
- The /join view looks like a generic form instead of a trivia night experience
- Ben's photo slides look like an afterthought instead of an intentional comedic moment
