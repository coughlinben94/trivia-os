# references/features.md — /join, Scoring, Powerups, Media, Host Panel, Jukebox

**Read before:** working on /join, score panel, powerup system, media uploads, Stream Deck integration, host panel layout, Jukebox integration, show library, scoreboard system, key constraints.

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
│ TRIVIA OS  [Show Title]  Score  Preview  Export  [Go Live →] │
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

Header buttons: Score (→ ScoreboardModal), Preview (→ /display?preview=true), Export (→ JSON), Go Live →

### Live Mode Layout (during show)

Live Mode is a **pure control surface** — no slide preview rendered. Focus on control clarity.

```
┌─────────────────────────────────────────────────────┐
│  ◀ PREV    Q3 · R1 · Slide 8/42    NEXT ▶   [📊 Score] [End Live]│
├─────────────────────────────────────────────────────┤
│  [current slide info — text only, no renderer]      │
│  UPCOMING: Q4 preview...  Q5 preview...             │
└─────────────────────────────────────────────────────┘
```

"📊 Score" button in nav turns green when the TV scoreboard overlay is active.

**Score Panel (slide-out from right — OLD per-round system):**
- Fuzzy search input at top (Fuse.js, threshold 0.3)
- Matching team highlights instantly
- Score input: numeric field + hold-to-confirm button
- Running total shown per team
- [Reveal Scores] / [Hide Scores] toggle — pushes to /display and /join
- All teams listed with current total, sorted by score descending

**Score Button → ScoreboardModal (NEW admin scoreboard):**
- Available in both Build Mode (HostHeader) and Live Mode
- Opens full-screen admin scoreboard backed by `scoreboard_teams` table
- See Scoreboard System section below

---

## Stream Deck Integration

The iPad Stream Deck app sends keyboard shortcuts. `/host` listens globally via `useKeyboardShortcuts` hook.

```js
const STREAM_DECK_SHORTCUTS = {
  'ArrowRight': 'NEXT_SLIDE',
  'ArrowLeft':  'PREV_SLIDE',
  'ArrowUp':    'VOLUME_UP',         // system volume via host
  'ArrowDown':  'VOLUME_DOWN',
  'Space':      'PLAY_AUDIO',        // plays audio on current shiny slide
  'KeyA':       'TOGGLE_ANSWER',     // answer overlay on QuestionSlide (reveal/hide)
  'KeyS':       'TOGGLE_SCOREBOARD', // TV scoreboard overlay (ScoreboardOverlay on /display)
  'KeyR':       'REVEAL_SCORES',     // per-round scores revealed on /join
  'KeyT':       'TRIGGER_SPECIAL',   // reserved
  'KeyJ':       'TOGGLE_JUKEBOX',    // signal to Trivia Jukebox
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
- Bottom bar: team's own score (always visible) / 📊 button (scoreboard drawer) / powerup icon

**Forward attempt failsafe:** If somehow triggered, write `last_action: 'tried_to_advance'` to teams table. Host gets red toast: "⚠️ [Team] tried to skip ahead." — stays until manually dismissed.

**Back navigation:** write `last_action: 'went_back'`. Amber toast, auto-dismisses after 6s.

**App exit:** visibilitychange event → write `is_connected: false`. Gray toast, auto-dismisses after 6s.

### Scoreboard Drawer (ScoresDrawer)

Opened by 📊 button in both WaitingScreen and LiveView.

- **Data source:** `scoreboard_teams` table for the current show (NOT `team_scores`)
- Bottom sheet, slides up from bottom; easing: `cubic-bezier(0.32, 0.72, 0, 1)` (--ease-drawer), ~320ms
- `y: '100%'` → `y: 0` on open
- Player's own team row highlighted in gold (`#f5c842` border), case-insensitive name match against registration name
- Swipe down to dismiss (momentum-based, velocity threshold 0.11)
- Fetches fresh from Supabase on each open (no stale cache)

Note: the OLD per-round scoreboard reveal (from `team_scores`, visible when `scores_revealed = true`) is separate — this drawer shows the admin `scoreboard_teams` data at any time.

### Reconnecting Banner

Shows on `CHANNEL_ERROR`, `TIMED_OUT`, or `CLOSED` connection status. Animates in from top. Auto-resolves when Supabase reconnects.

---

## Scoreboard System (ScoreboardModal — shipped 2026-06-30)

Replaces the Excel scoreboard. Two Supabase tables serve two different purposes:

| Table | Used by | Purpose |
|---|---|---|
| `team_scores` | ScorePanel (old) | Per-round scores, revealed to players |
| `scoreboard_teams` | ScoreboardModal (new) | Admin scoreboard, Quick Entry, TV overlay |

### ScoreboardModal (admin)

Opened via "Score" button in HostHeader (available in both BuildMode and LiveMode).

- `deriveRoundCols(show)` — auto-detects column labels from `show.slides`: `swing-round-intro` → "SW", `pyl-reveal` → "PYL", else `R${round.number}`. Always adds `bonus` → "?"
- Team table: two-column layout, editable score cells, group-hover delete button
- Add team, Sort by total, Random 2 (highlights 2 random teams yellow), Clear all
- Debounced 500ms Supabase upsert on score change
- Score keys in `scores` JSONB: `r_${round.id}` per round, `"bonus"` for mystery column

### Quick Entry (⚡ mode)

Button in ScoreboardModal — replicates the Excel VBA macro flow.

**3-step loop:**
1. **Team:** type partial name → substring/case-insensitive match → auto-advance if 1 result, disambiguation buttons if multiple
2. **Round:** type 1–5 (→ R1–R5), SW, PYL, M or ? (→ bonus). Also accepts nth-column numeric fallback
3. **Score:** type number → Enter → saves → flash confirmation → loops back to team step

Input is focus-trapped at each step; Enter advances. Green indicator when active.

### TV Overlay (ScoreboardOverlay)

`S` hotkey in LiveMode toggles `show.showState.scoreboardVisible` via `actions.setScoreboardVisible(bool)`. The "📊 Score" button in the nav bar turns green when overlay is active.

`Display.jsx` renders `<ScoreboardOverlay>` at `z-[60]` (above slide content) when `scoreboardVisible` is true.

Visual: full-screen `rgba(0,0,0,0.92)` + dual radial gradient glow, Boogaloo font header, gold/silver/bronze medal emojis, Framer Motion staggered row entrance (60ms per row), two-column layout for >8 teams.

### ShowDetail History

`/shows/:id` page renders a "📊 Final Scoreboard" section — fetches `scoreboard_teams` for that show, shows ranked list with medals, round columns, totals. Falls back to legacy `final_scores` JSONB if no `scoreboard_teams` rows exist.

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

## Scoring System (Old — per-round, `team_scores` table)

**Data model:** `team_scores` table, one row per team per round.
- Score input is **additive per round** — host enters round total after grading, not per question
- Running total is computed from `team_scores` rows, never stored directly

**Score input flow (ScorePanel):**
1. Open score panel (slide-out or keyboard shortcut)
2. Type partial team name in fuzzy search (Fuse.js, threshold 0.3)
3. Matching teams highlight in real time
4. Click team → round score input appears
5. Enter score → hold-to-confirm button → upsert to `team_scores`
6. All views update via Realtime

**Score visibility (ScorePanel system):**
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
- Files stored in Supabase Storage (`trivia-show-media` bucket)
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

---

## Trivia Jukebox Integration

Trivia Jukebox is a separate React/Vite/Spotify app at `https://trivia-jukebox.vercel.app`. Plays music during grading breaks.

**Grading break → Jukebox:** After ~10s on the grading break slide (Space/ArrowRight skips), `transitionToJukebox` runs `window.location.href = 'https://trivia-jukebox.vercel.app'`.

**Jukebox → back:** Jukebox's `b` keydown handler navigates to `trivia-os.vercel.app/display?from=jukebox`. Display.jsx detects `from=jukebox`, reads `isFinalBreak` off the current slide — if true, jumps `current_slide_index` to `sorted.length - 1` (last slide = winner-reveal); otherwise advances by 1. Param stripped via `history.replaceState`.

**No iframe.** Spotify refuses iframe embedding. Full-page navigation is the only integration path.

---

## Key Constraints

- **Internet required.** Supabase is cloud-hosted. Venue WiFi is sufficient — data volume is tiny.
- **QR code points to live Vercel URL.** Works on any network — no IP address needed.
- **One show "active" at a time.** `is_live` flag on `shows` marks the active show.
- **Team names are unique per show.** Duplicate names rejected with friendly error.
- **Score input is per round, not per question.** ScorePanel enters round total after grading.
- **Audio files < 50MB.** Enforce on upload with clear error.
- **The `/display` view should be opened in a separate browser window** (not tab) and fullscreened. Host panel on extended display, display view on the TV-connected display.
- **Powerups are host-defined and host-honored.** System never auto-applies effects.
- **Question archive (`questions` table) is read-only during shows.** Ben's personal reference only.
- **Supabase project:** `qwtbgusqfoypvehnungr` (Baynes Trivia). NOT `dreggwinegtirxxanntv` (Baynes Business Suite). Running migrations on the wrong project caused a `scoreboard_teams` 404 — verify `.env.local` before any schema work.
- **Supabase env vars:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — set in Vercel dashboard and `.env.local` for dev.
