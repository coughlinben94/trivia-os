# references/features.md — /join, Scoring, Powerups, Media, Host Panel, Jukebox

**Read before:** working on /join, score panel, powerup system, media uploads, Stream Deck integration, host panel layout, Jukebox integration, show library, key constraints.

---

## The Host Panel (`/host`)

**General:**
- Light mode UI (white/gray — host is in a dark bar and needs to see clearly)
- Tailwind for layout
- Lives on extended display — separate from the TV output
- Optimized for quick eyes-down, eyes-up use during a live show

### Build Mode Layout (pre-show)

```
┌─────────────────────────────────────────────────────┐
│ TRIVIA OS  [Show Title]  📺 Ticker  ✨ Formats  [Go Live →] │
├──────────────┬──────────────────────────────────────┤
│              │                                      │
│  ROUND LIST  │       SLIDE BUILDER / WIZARD         │
│  (sidebar)   │                                      │
│              │  [ AddSlideWizard — 4-step flow ]    │
│  + Add Round │  or                                  │
│              │  [ SlideEditor — editing a slide ]   │
│  R1 ▼        │                                      │
│    Q1        │                                      │
│    Q2        │                                      │
│    ✨ Q3     │                                      │
│    Q4        │                                      │
│  R2 ▼        │                                      │
│    ...       │                                      │
└──────────────┴──────────────────────────────────────┘
```

### Live Mode Layout (during show)

Live Mode is a **pure control surface** — no slide preview rendered. Focus on control clarity.

```
┌─────────────────────────────────────────────────────┐
│  ◀ PREV    Q3 · R1 · Slide 8/42    NEXT ▶   [SCORE]│
├─────────────────────────────────────────────────────┤
│  [current slide info — text only, no renderer]      │
│  UPCOMING: Q4 preview...  Q5 preview...             │
└─────────────────────────────────────────────────────┘
```

**Score Panel (slide-out from right):**
- Fuzzy search input at top (Fuse.js, threshold 0.3)
- Matching team highlights instantly
- Score input: numeric field + hold-to-confirm button
- Running total shown per team
- [Reveal Scores] / [Hide Scores] toggle — pushes to /display and /join
- All teams listed with current total, sorted by score descending

---

## Stream Deck Integration

The iPad Stream Deck app sends keyboard shortcuts. `/host` listens globally via `useKeyboardShortcuts` hook.

```js
const STREAM_DECK_SHORTCUTS = {
  'ArrowRight': 'NEXT_SLIDE',
  'ArrowLeft':  'PREV_SLIDE',
  'ArrowUp':    'VOLUME_UP',       // system volume via host
  'ArrowDown':  'VOLUME_DOWN',
  'Space':      'PLAY_AUDIO',      // plays audio on current shiny slide
  'KeyS':       'TOGGLE_SCOREBOARD',
  'KeyR':       'REVEAL_SCORES',
  'KeyT':       'TRIGGER_SPECIAL', // reserved
  'KeyJ':       'TOGGLE_JUKEBOX',  // signal to Trivia Jukebox
}
```

- All shortcuts are configurable
- Shortcuts only fire when host panel is focused — no accidental triggers
- **No animation on the host panel when shortcuts fire.** The display responds with animation — the host panel updates instantly.

---

## The `/join` Phone View

**Implemented.** Full phase machine as of June 24, 2026.

### Phase Machine

```
loading → register → waiting → live → no-show
```

- **loading:** spinner, dark screen, querying Supabase
- **register:** team name form (if no stored team). BenPhoto at top, DM Sans, theme-colored
- **waiting:** "You're in. Trivia starts soon." Breathe pulse animation. Shows team count.
- **live:** follows the show. Shows current slide content. Scoreboard sheet on demand.
- **no-show:** show not found or not yet started

### Session Recovery

Stored in localStorage: `trivia-os:team:${showId}` → `{ id, name, color, showId }`

On mount: check localStorage → validate stored team against DB → restore `waiting` or `live` phase without re-registering. If team no longer exists in DB, clear storage and show registration form.

### Registration

1. Team scans QR code → `/join?show=${showId}`
2. Large input (56px height), mobile-optimized, theme-colored
3. Submit → INSERT to `teams` table → `waiting` phase
4. Host receives new team via Realtime subscription → toast on host panel

### During Show (live phase)

- Shows current slide text (no heavy animations on phones)
- Question counter visible (Q3 · R1)
- **No forward navigation.** Teams are followers only. There is no forward button anywhere.
- Bottom bar: team's own score (always visible) / Scores pill (tappable only when `scores_revealed`) / powerup icon

**Forward attempt failsafe:** If somehow triggered, write `last_action: 'tried_to_advance'` to teams table. Host gets red toast: "⚠️ [Team] tried to skip ahead." — stays until manually dismissed.

**Back navigation:** write `last_action: 'went_back'`. Amber toast, auto-dismisses after 6s.

**App exit:** visibilitychange event → write `is_connected: false`. Gray toast, auto-dismisses after 6s.

### Scoreboard Bottom Sheet

- `AnimatePresence` + `motion.div`
- Height: 72dvh, `border-radius: 20px 20px 0 0`
- Easing: `cubic-bezier(0.32, 0.72, 0, 1)` (--ease-drawer), 320ms
- `y: '100%'` → `y: 0` on open
- Staggered rows: `delay: 0.055 * i`
- Score bars animate `width: 0 → barPct%`, 400ms ease-smooth
- Swipe down to dismiss (momentum-based, velocity threshold 0.11)

### Reconnecting Banner

Shows on `CHANNEL_ERROR`, `TIMED_OUT`, or `CLOSED` connection status. Animates in from top. Auto-resolves when Supabase reconnects.

---

## Powerup System

Host defines powerups before the show in Build Mode. Up to 3 powerups per night.

```js
{
  id: 'pu_1',
  name: 'Double Down',
  description: 'Double your points on this question.',
  icon: '⚡',
  effect: 'manual'  // all powerups are manual — system logs, host decides
}
```

**All powerups are `effect: 'manual'`.** The system logs the invocation and alerts the host, but the host decides whether and how to honor it. Keeps the host in control.

**Invocation flow:**
1. Team taps powerup button on /join
2. Confirmation dialog: "Use your [Double Down] powerup? This cannot be undone."
3. On confirm: `powerup_used: true` written to teams table
4. Host panel: red alert banner "⚡ [Team] just used Double Down!" — stays until dismissed
5. Button on team phone: permanently grayed out with "Used ✓"
6. No automatic /display event — host decides if they want to announce it

---

## Scoring System

**Data model:** `team_scores` table, one row per team per round.
- Score input is **additive per round** — host enters round total after grading, not per question
- Running total is computed from `team_scores` rows, never stored directly

**Score input flow:**
1. Open score panel (slide-out or keyboard shortcut)
2. Type partial team name in fuzzy search (Fuse.js, threshold 0.3)
3. Matching teams highlight in real time
4. Click team → round score input appears
5. Enter score → hold-to-confirm button → upsert to `team_scores`
6. All views update via Realtime

**Score visibility:**
- Host panel: always visible, sorted descending
- `/display`: only when host reveals (scoreboard-reveal slide or toggle)
- `/join`: team's own score always visible; full leaderboard only when `scores_revealed = true`

---

## Media Handling

### Ben Photo Library

Managed via `HostPhotoLibrary.jsx`. Host can upload photos to a reusable library. Any slide can have a photo assigned. Grading break slides default to a Ben photo if the library is non-empty. See `references/brand.md` for photo philosophy and display rules.

### Media Upload (Slides)

- Drag and drop onto slide builder media zone, or click to browse
- `MediaUpload.jsx` handles the upload UI
- Files stored in Supabase Storage (or `/uploads/` in dev)
- Server returns URL, stored in `slide.data.mediaUrl`
- Supported: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.mp3`, `.wav`, `.m4a`, `.ogg`
- Audio files: enforce < 50MB with a clear error message

### Image Display Rules (isShiny visual)

- Landscape image (width > height): full bleed, question text overlaid at bottom with gradient scrim
- Portrait image (height > width): image left 50%, question text right 50%
- Square: full bleed, question text overlaid
- Host can override layout if needed

### Audio Playback

- Audio does NOT autoplay — host triggers from panel or Stream Deck (Space)
- Animated waveform on display while playing (CSS bars, randomized heights, theme accent color)
- Host can replay, no limit
- Volume controlled via system volume (Stream Deck Up/Down arrows)

---

## Persistence & Backup

**Show persistence:**
1. **Supabase** — all show data lives in `shows` table, real-time sync
2. **Browser localStorage** — client caches current show ID and theme for recovery on page refresh
3. **Export** — host can download full show JSON from host panel at any time; import restores from `.json` file

**Show library** (Step 10, not yet built):
- "My Shows" screen in ShowManager listing all saved shows
- Can load, duplicate, or delete shows
- Last night's show pinned at top

---

## Trivia Jukebox Integration

Trivia Jukebox is a separate React/Vite/Spotify app at `https://trivia-jukebox.vercel.app`. Plays music during grading breaks.

**Integration:**
- Stream Deck `KeyJ` → `TOGGLE_JUKEBOX` event in host panel
- Host panel makes a fetch call to Jukebox's play/pause API endpoint
- No deep integration — just a play/pause toggle signal
- Trivia OS does not control track selection
- Host manually triggers during grading breaks via Stream Deck

---

## Key Constraints

- **Internet required.** Supabase is cloud-hosted. Venue WiFi is sufficient — data volume is tiny.
- **QR code points to live Vercel URL.** Works on any network — no IP address needed.
- **One show "active" at a time.** `is_live` flag on `shows` marks the active show.
- **Team names are unique per show.** Duplicate names rejected with friendly error.
- **Score input is per round, not per question.** Host enters round total after grading.
- **Audio files < 50MB.** Enforce on upload with clear error.
- **The `/display` view should be opened in a separate browser window** (not tab) and fullscreened. Host panel on extended display, display view on the TV-connected display.
- **Powerups are host-defined and host-honored.** System never auto-applies effects.
- **Question archive (`questions` table) is read-only during shows.** Ben's personal reference only.
- **Supabase env vars:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — set in Vercel dashboard and `.env.local` for dev.
