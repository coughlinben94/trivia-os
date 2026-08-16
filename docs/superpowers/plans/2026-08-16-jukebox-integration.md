# Jukebox Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the trivia-jukebox's actual functionality (turntable LiveScreen, album-gradient canvas, Spotify Web Playback SDK + PKCE OAuth, song library/sets/trim editing, shuffle) into trivia-os so a grading break plays music in the same tab with no cross-app navigation — plus a standing "Music Library" management section in the host dashboard.

**Architecture:** The jukebox is ported as a self-contained subtree at `client/src/jukebox/` with its internal file structure preserved byte-for-byte wherever possible (only 3 surgical adaptations to `Jukebox.jsx`). It surfaces in two places: (1) a full-screen **overlay** in `Display.jsx` — NOT a new slide type — mounted when the live slide is a `grading-break`, and (2) a new `/music` host route (PIN-gated) that renders the same `Jukebox` component as a library manager. `jukebox_state` in Supabase stays exactly where and what it is — zero data migration.

**Tech Stack:** React 18 / Framer Motion 10 / Tailwind 3 (trivia-os's stack — the ported code is compatible, see Compatibility Notes), Spotify Web Playback SDK, `sharp` (new dep, for `api/palette.js`), Supabase JS (existing client).

**Branch:** `feat/jukebox-integration` (worktree `.worktrees/jukebox-integration`, based on `origin/main` @ `7d4d9ba`). Do NOT push or merge to main — Ben reviews first.

**Source repo (read-only reference):** `/Users/bencoughlin/Projects/baynes-trivia/trivia-jukebox` — per its own hard rule it is stable; nothing in this plan modifies it. All `cp` commands below copy FROM it.

---

## Part A — Decisions (argued, not asserted)

### A1. Overlay, not a new slide type

The jukebox playback surface mounts as a full-screen overlay in `Display.jsx`, keyed off `currentSlide?.type === 'grading-break'` + local activation state. Reasons:

1. **Full-bleed visual.** Slides render inside `StageFrame` (85% viewport, clipped) over `ParticleBackground`. The jukebox LiveScreen is a `fixed inset-0 bg-black` scene with its own canvas gradient — inside StageFrame it would be letterboxed with the ambient theme leaking around the edges. In its own app it is already an overlay (`z-50` over the library UI); the port is nearly 1:1.
2. **Zero show-data changes.** No 16th slide type, no AddSlideWizard card, no RoundSidebar icon, no SLIDE_ANIMATIONS entry, no schema change. Every existing show with `grading-break` slides works unchanged on night one.
3. **Critical Rule 1 preserved.** `ParticleBackground` never re-mounts — the overlay covers it; the slide underneath stays mounted.
4. **Slide-position semantics unchanged.** The show sits ON the grading-break slide for the whole break (today it does too — the browser just isn't looking at it). Stream Deck flow, Go Live picker, scoreboard `S` key are all untouched.
5. **SDK lifecycle is per-break, matching today.** Today every break is a full page load of the jukebox app (SDK cold init each time, ~1–2s, absorbed by the entrance animation's own preload). Mounting `Jukebox` per overlay activation reproduces exactly that — no new persistent-player machinery to design or debug.

### A2. OAuth / session

- **PKCE flow ports as-is.** `lib/spotify.js` is copied byte-identical except `REDIRECT_URI`. The refresh mechanism is **pure localStorage + client-side `fetch` to `accounts.spotify.com/api/token`** — no cookies anywhere — so the iframe-era failure class (third-party-cookie-blocked silent refresh) structurally cannot recur in trivia-os's top-level context.
- **Multi-hour robustness is the same code that already survives real shows:** `getToken()` refreshes 60s before expiry; the SDK's `getOAuthToken` callback routes through `getToken()` (covers Spotify's ~1h token expiry mid-show); `playTrack` force-refreshes and retries once on 401; `refreshToken()` has a 6s hard timeout so a stalled refresh degrades to a caught failure, surfaced on the LiveScreen error line (also ported). None of this is modified.
- **Session locality:** tokens are per-origin localStorage. The MacBook runs both `/host` and `/display` in the same Chrome profile → **one** "Connect Spotify" (done at `/music`) covers both surfaces, same as the host PIN session. The standalone app's tokens don't transfer (different origin) — one-time reconnect on the new origin.
- **Redirect route:** new tiny `/spotify-callback` route does the code exchange and bounces to `sessionStorage.oauth_return` (default `/music`). Keeps `Display.jsx` free of OAuth code.
- **Same Spotify Developer app** (same `VITE_SPOTIFY_CLIENT_ID`) — same Premium account, no new app registration.
- **One-active-device caveat (document, don't code):** Spotify plays on one device at a time. Previewing a trim at `/music` while the display overlay is mid-song would steal the stream — identical constraint to today (single account). Don't scrub songs during a live break.

### A3. `jukebox_state` — zero migration (verified against live data)

Inspected live (project `qwtbgusqfoypvehnungr`, 2026-08-16): one `singleton` row, ~31KB `sets` JSONB, 5 sets — Main Library **160 songs / 121 trimmed**, Guilty Pleasure / Country / WTF / Rock (0 songs each), `updated_at` today. RLS verified from `pg_policy`: **anon may SELECT, and INSERT/UPDATE the `singleton` row** — trivia-os's own anon client can read/write it with zero policy changes.

Both apps already point at this same project (`VITE_JUKEBOX_SUPABASE_URL` in trivia-os == its own `VITE_SUPABASE_URL` since the 2026-08-07 migration). The port therefore uses **trivia-os's existing supabase client** via a one-line re-export shim (Task 2), and the table, its shape, every song, and every trim point carry over because **nothing moves**. All of `Jukebox.jsx`'s write-safety machinery (Guard 1/2/3, `last_writer` echo detection, stash-merge, delta replay) ports untouched, so trivia-os and the still-deployed standalone app (and QuickAdd on Ben's phone) remain safe concurrent writers — the exact multi-writer situation those guards were built for and already survive nightly.

### A4. What stays external / what does NOT move

- **`trivia-jukebox.vercel.app` stays deployed and untouched.** Three standing jobs: (1) **QuickAdd `/add`** — Ben's own daily phone tool for adding songs; it keeps working against the same table with zero changes; the new `/music` page is an *addition*, not a replacement. (2) **Zero-code live fallback:** if the in-app jukebox misbehaves on show night, Ben opens `trivia-jukebox.vercel.app` manually exactly like today, and Display's `?from=jukebox` return path (kept intact) still does the advance-and-final-break-jump on the way back. (3) The gradient **tuning board's** authoritative home (it also gets ported as a free rider — see Task 4 — but the standalone one keeps working).
- **`api/palette.js` also stays on the jukebox deployment** (QuickAdd/standalone need it); trivia-os gets its own copy because `usePalette` fetches relative `/api/palette`.
- **Not ported:** `QuickAdd.jsx`, `public/flip-test.html`, the jukebox's `App.jsx` (its token-gate logic is reborn as `SpotifyConnectGate` + `/spotify-callback`).
- **localStorage `trivia_played_v1`** (per-night no-repeat history) is per-origin — the first integrated show starts with a clean history. Per-night data; acceptable.

### A5. Final-break auto-jump preserved

Today the "last grading break auto-closes the show" logic lives in Display's `?from=jukebox` load path. It is extracted into `advanceAfterBreak()` (same logic, same `advance_show` SECURITY DEFINER RPC — the one nav write anon may perform) and called by the overlay's `b`-hold exit. The `?from=jukebox` path calls the same function (fallback round-trips keep working). Host pressing ArrowRight from `/host` during a break does a plain `+1`, same as every other slide — no host-side special case needed.

### A6. Compatibility notes (checked, not assumed)

- **React 19→18, Framer Motion 12→10:** every FM API the ported components use (`motion`, `useAnimation`, `controls.start/set`, springs) exists identically in FM10. `Jukebox.jsx`, `Player.jsx`, `SongDetailModal.jsx` use no FM at all. No `use()` / React-19-only APIs anywhere in the ported set.
- **Tailwind 4→3:** the jukebox's `@theme` tokens and custom CSS are recreated as Tailwind-3 config colors + a plain CSS file (Task 1). Non-scale opacity modifiers used by the ported markup (`/7`, `/15`, `/18`, `/35`) are added to the `opacity` scale.
- **Vite 8→5:** no Vite-8-specific syntax in the ported files. Bonus: the jukebox's "local dev broken on Vite 8" rule does not apply in trivia-os — but Spotify OAuth still blocks Playwright, so playback verification stays manual (A7).
- **`sharp` on Vercel:** already proven — same package, same platform, on the jukebox deployment.

### A7. Verification constraints

Spotify OAuth blocks automation browsers (jukebox hard rule). All playback/OAuth verification is **manual, on a deployed URL**. `vercel dev` locally serves `/api/palette`; plain `vite` does not. The Spotify redirect URI must match exactly, so testing before merge requires temporarily adding the branch's stable Vercel preview alias to the Spotify dashboard (Task 7 spells this out).

---

## Part B — Ben's manual steps (outside code)

1. **Spotify Developer Dashboard** (developer.spotify.com → the existing "Trivia Jukebox" app → Settings → Redirect URIs) — add:
   - `https://trivia-os.vercel.app/spotify-callback`
   - `http://127.0.0.1:5173/spotify-callback` (local dev)
   - *(temporarily, for pre-merge testing)* `https://trivia-os-git-feat-jukebox-integration-<team-slug>.vercel.app/spotify-callback` — exact alias comes from the first preview deploy; remove after merge.
2. **One-time Spotify connect** in the show-night Chrome profile: open `/music`, click Connect Spotify, approve. (Also once in any other browser he wants to manage the library from.)
3. **Nothing on Supabase.** No dashboard changes, no data steps.
4. *(Optional, can be done by an agent with Vercel access instead)* add `VITE_SPOTIFY_CLIENT_ID` env var to the trivia-os Vercel project — same value as the jukebox project's.

---

## Part C — File map (locked; every task uses these exact paths)

```
client/src/jukebox/                      ← new subtree, internal structure mirrors the jukebox repo
  lib/
    supabase.js        ← NEW 1-line shim re-exporting trivia-os's client (everything else imports '../lib/supabase' unchanged)
    spotify.js         ← copy, REDIRECT_URI edited (only edit)
    track.js           ← copy, byte-identical
    shuffle.js         ← copy, byte-identical
    fade.js            ← copy, byte-identical
    playedStore.js     ← copy, byte-identical
    gradientTuning.js  ← copy, byte-identical
    paletteDefaults.js ← copy, byte-identical
  hooks/
    useSpotifyPlayer.js ← copy, byte-identical
    usePalette.js       ← copy, byte-identical
  components/
    AlbumGradientMesh.jsx ← copy, BYTE-IDENTICAL — hard rule, do not touch the rendering algorithm
    LiveScreen.jsx        ← copy, byte-identical
    ScrubberControls.jsx  ← copy, byte-identical
    SongDetailModal.jsx   ← copy, byte-identical
    GradientColorPicker.jsx ← copy, byte-identical
    Player.jsx            ← copy, byte-identical
    TestScreen.jsx        ← copy, byte-identical (ported so Jukebox.jsx needs zero Tune-related edits)
    TuningBoard.jsx       ← copy, byte-identical
    Jukebox.jsx           ← copy + exactly 3 adaptations (Task 4)
  SpotifyConnectGate.jsx  ← NEW (logic lifted from jukebox App.jsx)
  jukebox.css             ← NEW (tokens/keyframes/scrubber from jukebox src/index.css)
  shuffle.test.js, track.test.js, fade.test.js ← copied tests (import paths adjusted)

client/src/views/
  Music.jsx             ← NEW  (/music host page)
  SpotifyCallback.jsx   ← NEW  (/spotify-callback)
  Display.jsx           ← MODIFY (break overlay + advanceAfterBreak extraction)

client/src/components/display/
  JukeboxBreakOverlay.jsx ← NEW (thin wrapper: fixed inset-0 z-[70] + token check + <Jukebox/>)
  slides/GradingBreakSlide.jsx ← MODIFY (delete navigation timer/keys — becomes pure visual)

client/src/App.jsx      ← MODIFY (2 routes)
client/src/components/host/BuildMode.jsx ← MODIFY (Music Library dashboard tile)
client/index.html       ← MODIFY (Spotify SDK script)
tailwind.config.js      ← MODIFY (colors + opacity steps)
package.json            ← MODIFY (sharp)
api/palette.js          ← NEW (copy, one import path edited)
.env.local              ← MODIFY (VITE_SPOTIFY_CLIENT_ID)
```

Task dependency graph (parallelizable groups):

```
T1 (foundation)  T2 (lib+hooks)  T3 (components)   ← all three independent, run in parallel
        └──────────┬──────────────┘
                  T4 (Jukebox.jsx + connect gate + callback route; first full build gate)
                   ├── T5 (/music + dashboard tile)     ← T5 ∥ T6
                   └── T6 (display break overlay)
                          └── T7 (deploy + manual live verification)
```

---

### Task 1: Foundation — deps, SDK script, Tailwind tokens, jukebox.css, palette API, env

**Files:**
- Modify: `package.json`, `client/index.html`, `tailwind.config.js`, `.env.local`
- Create: `client/src/jukebox/jukebox.css`, `api/palette.js`

- [ ] **Step 1: Add `sharp` dependency**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.worktrees/jukebox-integration
npm install sharp@^0.35.2
```

- [ ] **Step 2: Spotify SDK script in `client/index.html`**

Add before `</body>`, after the existing `<script type="module" src="/src/main.jsx"></script>`:

```html
    <script>window.onSpotifyWebPlaybackSDKReady = function() {}</script>
    <script async src="https://sdk.scdn.co/spotify-player.js"></script>
```

(The stub prevents the SDK's "onSpotifyWebPlaybackSDKReady is not defined" error on routes that never mount the player; `useSpotifyPlayer` overwrites it when it inits. Same pattern as the jukebox's own `index.html`.)

- [ ] **Step 3: Tailwind tokens**

In `tailwind.config.js`, inside `theme.extend`:

```js
      colors: {
        baynes: { /* …existing, unchanged… */ },
        // Jukebox port palette (mirrors trivia-jukebox src/index.css @theme)
        base:             '#0b0d16',
        surface:          '#10131f',
        'surface-inset':  '#0c0e18',
        'surface-raised': '#1a1e30',
        accent:           '#7b8cff',
        'accent-hover':   '#94a3ff',
        ink:              '#ffffff',
        'ink-muted':      'rgb(255 255 255 / 0.55)',
      },
      opacity: {
        7: '0.07', 15: '0.15', 18: '0.18', 35: '0.35',
      },
```

(These names are checked non-colliding — trivia-os's config only defines `baynes.*`. The opacity steps cover the ported markup's non-default `/7 /15 /18 /35` modifiers.)

- [ ] **Step 4: Create `client/src/jukebox/jukebox.css`**

Contents — a scoped port of `trivia-jukebox/src/index.css` minus the Tailwind import (trivia-os has its own). Copy verbatim from the source file: everything from `@keyframes fade-up` to the end of the `.player-scrubber` block, PLUS a `:root` block defining the one CSS variable the components read inline:

```css
/* Ported from trivia-jukebox src/index.css — keyframes, entrance utilities,
   and the scrubber styling the jukebox components depend on. Tokens live in
   tailwind.config.js; --color-accent is also needed as a raw CSS var because
   SongDetailModal/Player build inline linear-gradients from it. */
:root {
  --color-accent: #7b8cff;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
}
```

then append, unmodified, from `/Users/bencoughlin/Projects/baynes-trivia/trivia-jukebox/src/index.css`: the `fade-up`, `fade-in`, `equalizer`, `live-spin`, `platter-shimmer` keyframes, the `.animate-fade-up` / `.animate-fade-in` utilities (with their `prefers-reduced-motion` block), and the entire `.player-scrubber` section. Import it once in `client/src/main.jsx` after the existing CSS import:

```js
import './jukebox/jukebox.css'
```

- [ ] **Step 5: `api/palette.js`**

```bash
mkdir -p api
cp /Users/bencoughlin/Projects/baynes-trivia/trivia-jukebox/api/palette.js api/palette.js
```

Edit line 2's import from `'../src/lib/paletteDefaults.js'` to:

```js
import { resolvePaletteConfig } from '../client/src/jukebox/lib/paletteDefaults.js';
```

(This file compiles standalone as a Vercel serverless function; the import target lands in Task 2 — fine, `api/` is not part of the Vite client build.)

- [ ] **Step 6: Env var**

Append to `.env.local` (value: copy from `/Users/bencoughlin/Projects/baynes-trivia/trivia-jukebox/.env.local`'s `VITE_SPOTIFY_CLIENT_ID`):

```
VITE_SPOTIFY_CLIENT_ID=<same value as the jukebox repo's .env.local>
```

Also add the same var to the trivia-os Vercel project (via `vercel env add` with the stored token, or leave for Ben — Part B item 4).

- [ ] **Step 7: Build check + commit**

```bash
npm run build   # expected: exit 0 (jukebox.css import target exists, nothing else references new code yet)
git add package.json package-lock.json client/index.html tailwind.config.js client/src/jukebox/jukebox.css client/src/main.jsx api/palette.js
git commit -m "jukebox: foundation — sharp dep, SDK script, tailwind tokens, jukebox.css, palette API"
```

(`.env.local` is gitignored — do not commit it.)

---

### Task 2: Port lib + hooks (pure code) + tests

**Files:**
- Create: `client/src/jukebox/lib/{supabase,spotify,track,shuffle,fade,playedStore,gradientTuning,paletteDefaults}.js`
- Create: `client/src/jukebox/hooks/{useSpotifyPlayer,usePalette}.js`
- Test: `client/src/jukebox/{shuffle,track,fade}.test.js`

- [ ] **Step 1: Copy files byte-identical**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.worktrees/jukebox-integration
SRC=/Users/bencoughlin/Projects/baynes-trivia/trivia-jukebox
mkdir -p client/src/jukebox/lib client/src/jukebox/hooks
cp $SRC/src/lib/{spotify.js,track.js,shuffle.js,fade.js,playedStore.js,gradientTuning.js,paletteDefaults.js} client/src/jukebox/lib/
cp $SRC/src/hooks/{useSpotifyPlayer.js,usePalette.js} client/src/jukebox/hooks/
```

- [ ] **Step 2: The supabase shim** — create `client/src/jukebox/lib/supabase.js`:

```js
// The ported jukebox code imports '../lib/supabase' exactly as it did in its
// own repo. jukebox_state lives in the SAME Supabase project trivia-os uses
// (qwtbgusqfoypvehnungr, RLS: anon read/write on the singleton row), so this
// is a re-export of trivia-os's own client — one client, one realtime socket,
// zero data migration.
export { supabase } from '../../lib/supabase.js'
```

- [ ] **Step 3: The single `spotify.js` edit** — replace lines 2–4:

```js
const REDIRECT_URI = import.meta.env.DEV
  ? 'http://127.0.0.1:5173/spotify-callback'
  : `${window.location.origin}/spotify-callback`
```

(`window.location.origin` keeps the Vercel preview alias working during Task 7 testing without a code change; production resolves to `https://trivia-os.vercel.app/spotify-callback`. Everything else in the file — PKCE, refresh with 6s timeout, token storage keys — stays byte-identical; this is the multi-hour-session refresh path that already survives real shows.)

- [ ] **Step 4: Copy the pure-logic tests** (trivia-os vitest is `environment: 'node'`, include glob `client/src/**/*.test.js`):

```bash
cp $SRC/src/test/{shuffle.test.js,track.test.js,fade.test.js} client/src/jukebox/
```

Edit each copied test's import path: `'../lib/shuffle'` → `'./lib/shuffle.js'` (same pattern for `track`, `fade`).

- [ ] **Step 5: Run tests + build + commit**

```bash
npm run test:unit   # expected: prior suites + the 3 new ones all pass
npm run build       # expected: exit 0
git add client/src/jukebox
git commit -m "jukebox: port lib + hooks byte-identical (spotify.js redirect-URI edit only) + logic tests"
```

- [ ] **Step 6: Byte-identity audit** (proves the no-refactor rule was followed):

```bash
for f in track.js shuffle.js fade.js playedStore.js gradientTuning.js paletteDefaults.js; do
  diff -q $SRC/src/lib/$f client/src/jukebox/lib/$f; done
for f in useSpotifyPlayer.js usePalette.js; do
  diff -q $SRC/src/hooks/$f client/src/jukebox/hooks/$f; done
```

Expected: no output (identical). Only `spotify.js` may differ, and only in the REDIRECT_URI lines (`diff $SRC/src/lib/spotify.js client/src/jukebox/lib/spotify.js` shows exactly that hunk).

---

### Task 3: Port visual components (byte-identical)

**Files:**
- Create: `client/src/jukebox/components/{AlbumGradientMesh,LiveScreen,ScrubberControls,SongDetailModal,GradientColorPicker,Player,TestScreen,TuningBoard}.jsx`

- [ ] **Step 1: Copy**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.worktrees/jukebox-integration
SRC=/Users/bencoughlin/Projects/baynes-trivia/trivia-jukebox
mkdir -p client/src/jukebox/components
cp $SRC/src/components/{AlbumGradientMesh.jsx,LiveScreen.jsx,ScrubberControls.jsx,SongDetailModal.jsx,GradientColorPicker.jsx,Player.jsx,TestScreen.jsx,TuningBoard.jsx} client/src/jukebox/components/
```

No edits. Internal imports (`../hooks/usePalette`, `../lib/track`, `./AlbumGradientMesh`, `framer-motion`) all resolve because the subtree mirrors the source structure and FM10 provides every API used. **`AlbumGradientMesh.jsx` is explicitly hands-off** — five hours / eight commits of tuning; the byte-identity audit below is the enforcement.

- [ ] **Step 2: Build + audit + commit**

```bash
npm run build   # expected: exit 0
for f in AlbumGradientMesh LiveScreen ScrubberControls SongDetailModal GradientColorPicker Player TestScreen TuningBoard; do
  diff -q $SRC/src/components/$f.jsx client/src/jukebox/components/$f.jsx; done
# expected: no output
git add client/src/jukebox/components
git commit -m "jukebox: port visual components byte-identical (AlbumGradientMesh untouched per hard rule)"
```

---

### Task 4: Port `Jukebox.jsx` (3 adaptations) + SpotifyConnectGate + /spotify-callback

**Depends on:** Tasks 1–3.

**Files:**
- Create: `client/src/jukebox/components/Jukebox.jsx` (copy + 3 edits)
- Create: `client/src/jukebox/SpotifyConnectGate.jsx`
- Create: `client/src/views/SpotifyCallback.jsx`
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Copy Jukebox.jsx**

```bash
cp /Users/bencoughlin/Projects/baynes-trivia/trivia-jukebox/src/components/Jukebox.jsx client/src/jukebox/components/Jukebox.jsx
```

- [ ] **Step 2: Adaptation 1 — props.** Change the component signature (line 71):

```js
// initialLib (trivia-os port): replaces the standalone app's ?lib= URL param —
// Display's break overlay passes the grading-break slide's jukeboxLib here.
// onExitToShow: replaces the 'b'-hold full-page navigation back to trivia-os —
// the overlay passes a callback that advances the show instead. Both absent on
// the /music manager page, which restores the original standalone behavior
// minus the handoff.
export default function Jukebox({ onLogout, initialLib, onExitToShow }) {
```

- [ ] **Step 3: Adaptation 2 — lib source.** In the "?lib= URL param handler" effect (~line 619), replace exactly these lines:

```js
    let lib = new URLSearchParams(window.location.search).get('lib')

    const strip = () => {
      const u = new URL(window.location)
      u.searchParams.delete('lib')
      window.history.replaceState({}, '', u.pathname + (u.search || ''))
    }
```

with:

```js
    // trivia-os port: the lib now arrives as a prop from the break overlay,
    // not a URL param, so there is no URL state to strip — strip() is kept as
    // a no-op so every downstream call site stays byte-identical.
    let lib = initialLib ?? null
    const strip = () => {}
```

and update the effect's dependency comment line (the `}, [syncDone])` stays — `initialLib` is fixed for the life of a mount, same as a URL param was for the life of a page load; the `libParamHandledRef` guard already enforces run-once).

- [ ] **Step 4: Adaptation 3 — the `b`-hold handoff.** In the keydown effect (~line 1185), replace:

```js
          await flushPendingWrite()
          window.location.href = 'https://trivia-os.vercel.app/display?from=jukebox'
```

with:

```js
          await flushPendingWrite()
          // trivia-os port: same tab now — hand control back to the show via
          // the overlay's callback (which advances the slide) instead of a
          // full-page navigation. No-op on the /music manager page.
          onExitToShow?.()
```

and add `onExitToShow` to that effect's dependency array: `}, [modalTrack, flushPendingWrite, isPlaying, showLive, handleStop, onExitToShow])`. Additionally, guard the whole `if (e.key === 'b')` block so the manager page ignores it:

```js
      if (e.key === 'b' && onExitToShow) {
```

**No other edits to Jukebox.jsx.** Everything else — the Supabase sync guards, entrance/transition wiring, playedStore, unscrubbed view, Tune button/TestScreen — ports verbatim.

- [ ] **Step 5: `client/src/jukebox/SpotifyConnectGate.jsx`** — the token gate, lifted from jukebox `App.jsx` (dropping its /add branch):

```jsx
import { useEffect, useState } from 'react'
import { login, handleCallback, getToken } from './lib/spotify.js'

// Wraps any jukebox surface: resolves the stored Spotify session (refreshing
// if stale), or shows the Connect button. `returnTo` is stashed so the
// /spotify-callback route can restore the page the user started from.
// `renderDisconnected` lets the display overlay show a quiet banner instead
// of a login prompt on the live TV.
export default function SpotifyConnectGate({ children, returnTo = '/music', renderDisconnected = null }) {
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getToken().then(setToken).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="w-5 h-5 border-[1.5px] border-white/10 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (!token) {
    if (renderDisconnected) return renderDisconnected
    return (
      <div className="min-h-screen bg-base text-white flex flex-col items-center justify-center gap-8">
        <div className="text-center space-y-2">
          <div className="text-5xl mb-4">🎵</div>
          <h1 className="text-2xl font-semibold tracking-tight">Music Library</h1>
          <p className="text-sm text-white/60">Connect Spotify to manage songs and play breaks</p>
        </div>
        <button
          onClick={() => { sessionStorage.setItem('oauth_return', returnTo); login() }}
          className="bg-accent hover:bg-accent-hover text-black text-sm font-semibold px-7 py-3 rounded-full transition-all duration-150 active:scale-[0.97]"
        >
          Connect Spotify
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    )
  }

  return children
}

// Synchronous check for callers that must not render a login UI (the display
// overlay): a stored refresh token means getToken() can mint access tokens.
export function hasSpotifySession() {
  return !!localStorage.getItem('spotify_refresh_token')
}
```

(`handleCallback` import is unused here — remove it; the callback lives in the route below.)

- [ ] **Step 6: `client/src/views/SpotifyCallback.jsx`:**

```jsx
import { useEffect, useState } from 'react'
import { handleCallback } from '../jukebox/lib/spotify.js'

// Spotify PKCE redirect lands here (?code=...). Exchange, then bounce back to
// wherever auth started (stashed by SpotifyConnectGate). Registered on the
// Spotify app as <origin>/spotify-callback.
export default function SpotifyCallback() {
  const [error, setError] = useState(null)

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')
    if (!code) { window.location.replace('/music'); return }
    handleCallback(code)
      .then(() => {
        const returnTo = sessionStorage.getItem('oauth_return') ?? '/music'
        sessionStorage.removeItem('oauth_return')
        window.location.replace(returnTo)
      })
      .catch(err => { console.error('[SpotifyCallback]', err); setError('Spotify login failed — go back and try again.') })
  }, [])

  return (
    <div className="min-h-screen bg-base text-white flex items-center justify-center">
      {error
        ? <p className="text-sm text-red-400">{error}</p>
        : <div className="w-5 h-5 border-[1.5px] border-white/10 border-t-accent rounded-full animate-spin" />}
    </div>
  )
}
```

- [ ] **Step 7: Route in `client/src/App.jsx`:**

```js
const SpotifyCallback = lazy(() => import('./views/SpotifyCallback.jsx'))
// …
<Route path="/spotify-callback" element={<SpotifyCallback />} />
```

- [ ] **Step 8: Build + commit**

```bash
npm run build   # expected: exit 0
git add client/src/jukebox client/src/views/SpotifyCallback.jsx client/src/App.jsx
git commit -m "jukebox: port Jukebox.jsx (initialLib/onExitToShow adaptations) + Spotify connect gate + callback route"
```

---

### Task 5: `/music` host page + dashboard tile

**Depends on:** Task 4. Parallel-safe with Task 6.

**Files:**
- Create: `client/src/views/Music.jsx`
- Modify: `client/src/App.jsx`, `client/src/components/host/BuildMode.jsx`

This is the standing offline-prep space (the "Question Database, but for music"): add songs via Spotify search, organize sets, trim in/out points, gradient overrides — all of which is `Jukebox.jsx`'s existing library UI, already desktop-first (it's the exact UI Ben uses on the laptop today). QuickAdd on his phone is unaffected and remains the mobile path.

- [ ] **Step 1: `client/src/views/Music.jsx`:**

```jsx
import HostPinGate from '../components/host/HostPinGate.jsx'
import SpotifyConnectGate from '../jukebox/SpotifyConnectGate.jsx'
import Jukebox from '../jukebox/components/Jukebox.jsx'
import { logout } from '../jukebox/lib/spotify.js'

// Standing music-library manager — the ported jukebox's library UI (sets
// sidebar, song grid, Spotify search, SongDetailModal trim editor) as a host
// dashboard page. PIN gate is consistency/UX (jukebox_state RLS is anon-
// writable by design — QuickAdd depends on that). No initialLib/onExitToShow:
// this surface never auto-plays and never drives the show.
export default function Music() {
  return (
    <HostPinGate>
      <SpotifyConnectGate returnTo="/music">
        <Jukebox onLogout={() => window.location.reload()} />
      </SpotifyConnectGate>
    </HostPinGate>
  )
}
```

- [ ] **Step 2: Route in `client/src/App.jsx`:**

```js
const Music = lazy(() => import('./views/Music.jsx'))
// …
<Route path="/music" element={<Music />} />
```

- [ ] **Step 3: Dashboard tile in `BuildMode.jsx`** — three touch points, following the existing `database`/`shows` external-page pattern exactly:

In `defaultRestStateBoxOrder()` (line ~110), append `'music'`:

```js
    'theme', 'swing', 'pyl', 'shiny', 'database', 'ticker', 'data', 'shows', 'music',
```

In `CARD_STYLE` (line ~66), add:

```js
  'music':         'bg-gradient-to-br from-indigo-50 to-purple-100 border-indigo-200 hover:border-indigo-400',
```

In `restBoxContent` (line ~609), add:

```js
                      music:    { icon: '🎵', name: 'Music Library', desc: 'Jukebox songs, sets & trim points', styleKey: 'music', onClick: () => window.open('/music', '_blank') },
```

(The stored-order merge in `loadRestStateBoxOrder()` already appends unknown new ids, so Ben's saved grid order picks the tile up automatically.)

- [ ] **Step 4: Build + commit**

```bash
npm run build   # expected: exit 0
git add client/src/views/Music.jsx client/src/App.jsx client/src/components/host/BuildMode.jsx
git commit -m "jukebox: /music host page (PIN + Spotify gates) + Music Library dashboard tile"
```

---

### Task 6: Display break overlay

**Depends on:** Task 4. Parallel-safe with Task 5.

**Files:**
- Create: `client/src/components/display/JukeboxBreakOverlay.jsx`
- Modify: `client/src/views/Display.jsx`
- Modify: `client/src/components/display/slides/GradingBreakSlide.jsx`

- [ ] **Step 1: `JukeboxBreakOverlay.jsx`:**

```jsx
import Jukebox from '../../jukebox/components/Jukebox.jsx'
import { hasSpotifySession } from '../../jukebox/SpotifyConnectGate.jsx'

// Full-screen music layer for grading breaks — an OVERLAY over the live
// grading-break slide, not a slide type (see the 2026-08-16 jukebox plan §A1).
// Mounts the ported Jukebox with initialLib, which reuses the exact same
// auto-shuffle flow the standalone app's ?lib= handoff ran: sync jukebox_state,
// select the set, shuffle, open LiveScreen with the turntable entrance.
// The 'b'-hold inside Jukebox fires onExit (Display advances the show).
// Escape inside LiveScreen falls back to the library UI on the TV — identical
// to today's standalone behavior on the same screen.
//
// If Spotify was never connected in this browser, render a quiet host-facing
// banner instead of a login prompt on the live TV — the break simply stays on
// the grading-break slide, and the show is not blocked.
export default function JukeboxBreakOverlay({ lib, onExit }) {
  if (!hasSpotifySession()) {
    return (
      <div className="fixed left-1/2 -translate-x-1/2 z-[70] pointer-events-none" style={{ bottom: 24 }}>
        <span className="text-xs font-semibold text-white/80 bg-black/70 border border-white/15 px-4 py-2 rounded-full">
          🎵 Spotify not connected — open /music on the host laptop to connect
        </span>
      </div>
    )
  }
  return (
    <div className="fixed inset-0 z-[70] bg-black">
      <Jukebox initialLib={lib} onExitToShow={onExit} onLogout={() => {}} />
    </div>
  )
}
```

- [ ] **Step 2: Extract `advanceAfterBreak` in `Display.jsx`.** Add above the `Display` component (module scope), lifted verbatim from the existing `?from=jukebox` block:

```js
// The one display-side nav write. Same logic the ?from=jukebox return path has
// always run: normally +1, but if the show's last slide is a winner-reveal and
// no grading breaks remain, jump straight to it (hands-off show close — see
// SKILL.md "Final Break"). Returns {advanced, next, nextSlide, denied}.
async function advanceAfterBreak(showRow) {
  const sorted = [...(showRow.slides ?? [])].sort((a, b) => a.order - b.order)
  const cur = showRow.current_slide_index ?? 0
  const lastSlideIsWinner = sorted[sorted.length - 1]?.type === 'winner-reveal'
  const noMoreGradingBreaks = !sorted.slice(cur + 1).some(s => s.type === 'grading-break')
  const next = (lastSlideIsWinner && noMoreGradingBreaks)
    ? sorted.length - 1
    : Math.min(cur + 1, sorted.length - 1)
  if (next <= cur) return { advanced: false, denied: false }
  const nextSlide = sorted[next]
  const { data: advanced, error } = await supabase.rpc('advance_show', {
    p_show_id: showRow.id,
    p_slide_id: nextSlide?.id ?? null,
    p_slide_index: next,
  })
  if (error || advanced !== true) {
    console.error('[Display] break advance denied:', error ?? '0 rows')
    return { advanced: false, denied: true }
  }
  return { advanced: true, next, nextSlide, denied: false }
}
```

Rewrite the existing `?from=jukebox` block inside `load()` to call it (behavior-identical — keeps the manual-fallback round trip working):

```js
        if (searchParams.get('from') === 'jukebox') {
          const res = await advanceAfterBreak(data)
          if (res.denied) setNavDenied(true)
          else if (res.advanced) {
            setNavDenied(false)
            data = { ...data, current_slide_index: res.next, current_slide_id: res.nextSlide?.id ?? null }
          }
          const url = new URL(window.location.href)
          url.searchParams.delete('from')
          window.history.replaceState({}, '', url.toString())
        }
```

- [ ] **Step 3: Break activation state in `DisplayInner`.** Change the signature to `function DisplayInner({ show, direction, onBreakAdvance })`, and add the import at the top of `Display.jsx`:

```js
import JukeboxBreakOverlay from '../components/display/JukeboxBreakOverlay.jsx'
```

`DisplayInner` already computes `currentSlide`. Add inside it:

```js
  const [breakActive, setBreakActive] = useState(false)
  const isBreakSlide = currentSlide?.type === 'grading-break'

  // Auto-open: same 10s countdown GradingBreakSlide used to run before
  // navigating away; Space/ArrowRight skip the wait (also unchanged from the
  // old slide behavior — those keys were already claimed by the break slide,
  // and RLS-D-1's "no keyboard nav on /display" removal explicitly carved
  // this handler out as the exception).
  useEffect(() => {
    if (!isBreakSlide) { setBreakActive(false); return }
    const timer = setTimeout(() => setBreakActive(true), 10000)
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault()
        clearTimeout(timer)
        setBreakActive(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(timer); window.removeEventListener('keydown', onKey) }
    // currentSlide?.id in deps: a second consecutive grading-break slide
    // re-arms the timer.
  }, [isBreakSlide, currentSlide?.id])
```

Note the skip-keys listener must not fire once `breakActive` is true (Jukebox owns Space then). Guard: register it only while `!breakActive` — add `breakActive` to the deps and `if (breakActive) return` before `addEventListener`.

Render, after `<BaynesWatermark />`:

```jsx
      {breakActive && isBreakSlide && (
        <JukeboxBreakOverlay
          lib={currentSlide?.data?.jukeboxLib ?? 'random'}
          onExit={onBreakAdvance}
        />
      )}
```

Teardown on external advance is automatic: the host advancing from `/host` changes `currentSlide.type`, the effect's `setBreakActive(false)` unmounts the overlay, and `useSpotifyPlayer`'s cleanup (`player.disconnect()`) stops audio. `// ponytail: unmount-disconnect cuts audio without a fade on host-side advance; the b-hold path (the normal gesture) keeps the full exit animation + fade. Add a pre-unmount fade only if Ben ever advances breaks from /host in practice.`

- [ ] **Step 4: Wire `onBreakAdvance` in `Display`.** In the root `Display` component:

```js
  async function handleBreakAdvance() {
    // Jukebox has already run its exit animation + fade + flushed pending
    // Supabase writes before calling this (its 'b'-hold path awaits
    // EXIT_TOTAL_MS + flushPendingWrite). Advance the show; the realtime
    // UPDATE flips currentSlide, which unmounts the overlay.
    const res = await advanceAfterBreak(show)
    if (res.denied) setNavDenied(true)
  }
```

Pass it down: `<DisplayInner show={show} direction={direction} onBreakAdvance={handleBreakAdvance} />` (both the live call site and — with a no-op `() => {}` — the demo call site, so the prop is always defined).

- [ ] **Step 5: Guard Display's `f` fullscreen hotkey against the overlay's inputs.** The jukebox library UI (reachable on the TV via Escape, same as today's standalone) contains text inputs; `/display` previously had none, so its `onKey` handler has no target check. In `Display.jsx`'s fullscreen effect, add as the first line of `onKey`:

```js
      if (e.target.closest?.('input, textarea, [contenteditable]')) return
```

- [ ] **Step 6: Gut `GradingBreakSlide.jsx`'s navigation.** Delete `transitionToJukebox`, `autoTimerRef`, and both effects (the 10s auto-navigate and the Space/ArrowRight handler) — lines 25–51 of the current file. Keep everything else (glow, reading-well, host photo, fitted message). Also delete the now-unused `useEffect`/`useRef` imports if nothing else in the file uses them (`useState`/`useEffect` are still used by `fontsReady` — keep those; drop only `useRef`). The slide is now pure visual; Display owns the break lifecycle.

- [ ] **Step 7: Build + commit**

```bash
npm run build   # expected: exit 0
git add client/src/components/display/JukeboxBreakOverlay.jsx client/src/views/Display.jsx client/src/components/display/slides/GradingBreakSlide.jsx
git commit -m "jukebox: grading-break overlay on /display — in-app playback, b-hold advances via advance_show, slide loses navigation"
```

---

### Task 7: Deploy + manual live verification (Spotify blocks automation — human/browser protocol)

**Depends on:** Tasks 5 + 6 complete on the branch.

- [ ] **Step 1: Push branch → Vercel preview.** (Pushing the FEATURE BRANCH for a preview deploy is required for OAuth testing and allowed; merging/pushing main is NOT.) Record the stable branch alias (`trivia-os-git-feat-jukebox-integration-….vercel.app`). Confirm `VITE_SPOTIFY_CLIENT_ID` is set in the Vercel project env (Preview scope included).

- [ ] **Step 2: Ben (or operator with Spotify dashboard access): add `https://<branch-alias>/spotify-callback` to the Spotify app's redirect URIs** (Part B item 1). Without this, testing cannot proceed — coordinate before dispatching a verification agent.

- [ ] **Step 3: `/api/palette` smoke:** `curl 'https://<branch-alias>/api/palette?url=<any album art URL from Spotify CDN>&pv=9'` → expected: JSON with `colors` array (2 hex strings) + `weights`. Failure here means the `sharp`/Vercel function setup in Task 1 needs fixing before anything visual will look right.

- [ ] **Step 4: `/music` checks (manual, real browser):**
  - PIN gate → Connect Spotify → OAuth round-trips back to `/music`.
  - Library loads: **5 sets, Main Library 160 songs** (the live data — if counts differ wildly, STOP and investigate before any write).
  - Open a song → trim editor: preview plays from In, respects Out, Set In/Out saves; verify the write landed by reloading and via the standalone app showing the same values (proves shared-table round-trip).
  - Add a throwaway song from search, then delete it. Confirm QuickAdd on a phone still works afterward.
  - Shuffle-play from `/music` → turntable entrance, gradient background, song-to-song transition, spacebar stop.
- [ ] **Step 5: `/display` break checks (manual):** load a test show (NOT a real show row) with a grading break (`jukeboxLib` set) + winner-reveal last slide. Go live from `/host`; advance to the break on the `/display` tab:
  - 10s → overlay mounts → entrance plays → audio fades in at the trim in-point.
  - Space during the countdown skips the wait.
  - Trimmed song fades out at its out-point and auto-advances to the next song.
  - Hold `b` ≥500ms → exit animation → show advances (mid-show break: +1; final break: jumps to winner-reveal — test both).
  - Advance from `/host` mid-song → overlay tears down, audio stops, next slide renders.
  - With Spotify disconnected (clear localStorage in a fresh profile): break shows the "Spotify not connected" banner, show not blocked, host can advance normally.
- [ ] **Step 6: Regression sweep:** standalone `trivia-jukebox.vercel.app` still plays; QuickAdd still adds; `jukebox_state` row intact (re-run the Task-7-Step-4 count check); trivia-os `/host` grading-break editor's library dropdown still lists the 5 sets; a non-break slide show runs normally end to end.
- [ ] **Step 7: Report results to Ben with the branch name. Do not merge.** After merge (Ben's call), the production redirect URI (`https://trivia-os.vercel.app/spotify-callback`) takes over and the preview-alias URI can be removed from the Spotify dashboard.

---

## Self-review notes

- **Spec coverage:** overlay-vs-slide argued (A1); OAuth + dashboard steps (A2, Part B); port inventory (Part C, T2–T4); `jukebox_state` zero-migration confirmed against live data + RLS (A3); standalone-app/QuickAdd fate decided (A4); host-dashboard management space is its own task (T5); data continuity (A3 + T7 Step 4 count check); sequencing/parallelism (Part C graph).
- **Known ceilings (deliberate):** host-side advance mid-song cuts audio without fade (T6 Step 3 ponytail note); played-history resets once on origin change (A4); tuning board ported but unadvertised (rides along to keep Jukebox.jsx edits at exactly 3).
- **Not done on purpose:** no persistent Display-level SDK player (per-break mount matches today's behavior); no host-`/host` playback controls (display keyboard keeps today's muscle memory — add later if asked); no RLS tightening on `jukebox_state` (QuickAdd depends on anon writes; flagged, not changed).
