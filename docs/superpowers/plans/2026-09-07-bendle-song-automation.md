# Bendle Song Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Ben pick a song from Spotify's catalog inside the Bendle admin panel and have the rest of the prep pipeline — pull audio, split into 4 stems, upload, mark ready — happen automatically on a machine he already runs, with zero file handling on his end.

**Architecture:** `bendle_songs` gains a status column (`requested` → `processing` → `ready`/`failed`). The browser side (`BendleAdmin.jsx`) gets a Spotify search box (backed by two new Vercel functions doing the Client Credentials flow — search needs no user login) that inserts a `requested` row. A Python worker running as a `launchd` service on `bens-server` (already always-on for Kingo, reachable via Tailscale) polls for `requested` rows, runs `yt-dlp` then `demucs`, uploads the 4 stems to the existing `trivia-show-media` bucket, and flips the row to `ready` or `failed` with a plain-English reason. This is a prep-time pipeline — it never touches the live show path, matching the existing rule in the original Bendle design doc that stem separation must not run inside the live app itself.

**Tech Stack:** Existing (React/Vite/Supabase/Vercel). New: 2 Node Vercel functions (`api/`), Python 3 + `yt-dlp` + `demucs` + `ffmpeg` on bens-server, `launchd`.

**Spec:** `docs/superpowers/specs/2026-09-04-bendle-layered-audio-question-design.md` (original Bendle design — this plan extends its "Content pipeline" section, doesn't replace it: manual upload stays as a fallback path with zero code changes). No separate spec doc was written for this automation piece — scope was settled via a live architecture review (Fable 5.1 second-opinion, in-session) plus direct requirements from Ben; this plan doc carries the requirements that would otherwise live in a spec.

## Global Constraints

- Supabase project is **`qwtbgusqfoypvehnungr`** (Baynes Trivia) — never `dreggwinegtirxxanntv`.
- `bendle_songs` RLS: INSERT/UPDATE/DELETE require the `host_verified` JWT claim (browser-side writes go through `HostPinGate`'s session); the worker uses the Supabase **service role key**, which bypasses RLS entirely — no policy changes needed.
- No secret ever goes in a `VITE_`-prefixed env var (ships to the browser bundle) or in `~/.zshrc`. Server-only secrets go in a plain `.env` (gitignored) — same pattern as the existing `VERCEL_AUTOMATION_BYPASS_SECRET` in `~/Projects/davos/.env`... on bens-server this becomes `worker/bendle/.env`.
- $0 new recurring cost: no new hosted service, no new subscription. Everything runs on infra/software Ben already has (bens-server, free OSS tools, the Spotify app already registered for the jukebox, existing Supabase/Vercel plans).
- Low volume (a handful of songs/month) — a 30s poll loop is correct; no queue system, no webhooks.
- Any step that installs new software on bens-server (a production machine running Kingo) or applies a migration to the live Supabase project is a checkpoint — confirm with Ben before running it, don't just execute silently.

---

## Prerequisite (blocks Task 3 — Ben must do this, or ask me to drive it in Chrome)

The jukebox integration already registered a Spotify Developer app (`VITE_SPOTIFY_CLIENT_ID` exists in Vercel env, uses PKCE — no secret needed for that flow). Client Credentials search needs the **Client Secret** for that *same* app (no new app to create):

1. Log into https://developer.spotify.com/dashboard
2. Open the existing app (the one tied to the jukebox's Client ID)
3. Settings → copy the **Client Secret**
4. Hand it to whoever runs Task 3, to be stored as `SPOTIFY_CLIENT_SECRET` in Vercel (Production + Preview + Development), NOT `VITE_`-prefixed.

---

### Task 1: Migration — status pipeline on `bendle_songs`

**Files:**
- Create: `supabase/migrations/20260907120000_bendle_songs_status_pipeline.sql`
- Test: manual verification via `execute_sql` (schema change, not unit-testable)

**Interfaces:**
- Produces: `bendle_songs.status` (`'requested' | 'processing' | 'ready' | 'failed'`, default `'ready'` so the existing manual-upload path in `BendleAdmin.jsx` needs zero changes), `error_text`, `spotify_id`, `artist`, `artwork_url`. `drums_url`/`bass_url`/`other_url`/`vocals_url` become nullable (a `requested` row has none yet).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260907120000_bendle_songs_status_pipeline.sql
alter table public.bendle_songs
  alter column drums_url drop not null,
  alter column bass_url drop not null,
  alter column other_url drop not null,
  alter column vocals_url drop not null,
  add column status text not null default 'ready'
    check (status in ('requested', 'processing', 'ready', 'failed')),
  add column error_text text,
  add column spotify_id text,
  add column artist text,
  add column artwork_url text;

-- Without this, Task 5's realtime subscription connects successfully but
-- receives nothing — only scoreboard_teams is in this publication today
-- (see 20260816170000_scoreboard_teams_realtime.sql), and Postgres changes
-- to a table outside the publication are silently invisible to `.channel()`
-- subscribers, not an error.
alter publication supabase_realtime add table public.bendle_songs;
```

- [ ] **Step 2: Apply it via Supabase MCP**

Use `mcp__supabase__apply_migration` with `project_id: qwtbgusqfoypvehnungr`, `name: bendle_songs_status_pipeline`, and the SQL above. **Checkpoint: confirm with Ben before applying — this touches the live Baynes Trivia project.**

- [ ] **Step 3: Verify**

Run via `mcp__supabase__execute_sql`:
```sql
select column_name, is_nullable, column_default
from information_schema.columns
where table_name = 'bendle_songs' and table_schema = 'public'
order by ordinal_position;
```
Expected: `status` present, `not null`, default `'ready'`; `drums_url`/`bass_url`/`other_url`/`vocals_url` show `is_nullable = 'YES'`.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/baynes-trivia/trivia-os
git add supabase/migrations/20260907120000_bendle_songs_status_pipeline.sql
git commit -m "feat: add status pipeline columns to bendle_songs"
```

---

### Task 2: Guard the slide-attach song pickers

**Why this task exists:** `AddSlideWizard.jsx` and `SlideEditor.jsx` both query every row in `bendle_songs` with no status filter, to let a host attach a song to a question slide. Once `requested`/`processing`/`failed` rows can exist, a host could attach an unfinished song to a live slide. This must ship in the same task as Task 1's migration — never let the two states (new column exists, but pickers don't filter on it) go live independently.

**Files:**
- Modify: `client/src/components/host/AddSlideWizard.jsx:117`
- Modify: `client/src/components/host/SlideEditor.jsx:1974`
- Test: `client/src/components/host/AddSlideWizard.test.jsx` (existing file — add a case)

**Interfaces:**
- Consumes: `bendle_songs.status` from Task 1.

**Note:** the real mock in `AddSlideWizard.test.jsx:13-21` is a plain object literal (`vi.mock('../../lib/supabase.js', () => ({ supabase: { from: () => ({ select: () => ({ order: () => Promise.resolve(...) }) }) } }))`), not `vi.fn()` spies — there is nothing to call `.mockReturnValueOnce` on. Adding `.eq()` to the component's real query without updating this mock chain breaks the EXISTING `bendle song gate` test (`TypeError: select(...).eq is not a function`), since the component would call a method the mock doesn't provide. Step 1 below updates the mock chain itself rather than adding a spy.

- [ ] **Step 1: Update the existing mock chain and write the failing assertion**

In `client/src/components/host/AddSlideWizard.test.jsx`, change the mock (lines 13-21) to add an `eq` link with a spy so the call can be asserted, keeping the same resolved shape the existing `bendle song gate` describe block already depends on:

```js
const bendleEqSpy = vi.fn(() => ({
  order: () => Promise.resolve({ data: [{ id: 'song_1', title: 'Test Song', answer: 'Test Song', aliases: [] }] }),
}))
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: bendleEqSpy,
      }),
    }),
  },
}))
```

Then add, in the `bendle song gate` describe block:
```js
it('only queries ready bendle songs for the picker', () => {
  expect(bendleEqSpy).toHaveBeenCalledWith('status', 'ready')
})
```

- [ ] **Step 2: Run tests to verify the new one fails and the existing gate test still passes against old code**

Run: `npm run test:unit -- AddSlideWizard.test.jsx`
Expected: the new assertion FAILs (`bendleEqSpy` never called — current query has no `.eq`); the pre-existing `bendle song gate` tests still PASS against the updated mock (confirms the mock-shape change alone didn't break them before the component change).

- [ ] **Step 3: Fix both query sites**

`AddSlideWizard.jsx:117`, change:
```js
supabase.from('bendle_songs').select('id, title, answer, aliases').order('title')
```
to:
```js
supabase.from('bendle_songs').select('id, title, answer, aliases').eq('status', 'ready').order('title')
```

`SlideEditor.jsx:1974`, same change (identical query, same fix).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- AddSlideWizard.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/host/AddSlideWizard.jsx client/src/components/host/SlideEditor.jsx client/src/components/host/AddSlideWizard.test.jsx
git commit -m "fix: only offer ready songs in the Bendle slide picker"
```

---

### Task 3: Spotify search backend (2 Vercel functions)

**Files:**
- Create: `api/_lib/spotify-token.js`
- Create: `api/spotify-search.js`
- Test: manual (Vercel functions in this repo have no existing unit-test harness — `api/ben-photos.js`/`api/palette.js` are untested; follow that precedent, verify via `vercel dev` + curl instead)

**Interfaces:**
- Produces: `GET /api/spotify-search?q=<text>` (requires `Authorization: Bearer <supabase access token>` from a host-verified session) → `{ tracks: [{ spotifyId, title, artist, artworkUrl }] }` (max 10 results).
- Consumes: `SPOTIFY_CLIENT_ID` (already in Vercel env, but read here WITHOUT the `VITE_` prefix requirement — server functions can read the `VITE_SPOTIFY_CLIENT_ID` var directly, it's just also exposed to the client; that's fine, the ID is not secret) and new `SPOTIFY_CLIENT_SECRET` (Prerequisite above).

**Note on file location:** every `.js` file directly under `api/` becomes its own deployed route. `api/spotify-token.js` has no default-exported handler (it's a helper the search endpoint imports), so it can't live at the top level of `api/` — Vercel's build convention skips anything under an underscore-prefixed folder, so it goes in `api/_lib/` instead, same as `api/ben-photos.js`/`api/palette.js` stay real routes because they DO export a default handler.

**Note on the auth gate:** an unauthenticated public search endpoint shares the jukebox's Spotify app quota (rate-limited per app in a rolling window) — a scraper hitting `/api/spotify-search` could 429 the jukebox mid-show. Every other write to `bendle_songs` already requires the `host_verified` JWT claim (`HostPinGate.jsx:13`, `session?.user?.app_metadata?.host_verified === true`); this endpoint checks the same claim by verifying the caller's Supabase access token server-side.

- [ ] **Step 1: Token fetcher**

```js
// api/_lib/spotify-token.js
let cached = null // { token, expiresAt } — module-scope cache survives warm Vercel invocations

export async function getSpotifyToken() {
  if (cached && cached.expiresAt > Date.now()) return cached.token

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(
        `${process.env.VITE_SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`Spotify token request failed: ${res.status}`)
  const data = await res.json()
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 }
  return cached.token
}
```

- [ ] **Step 2: Search endpoint**

```js
// api/spotify-search.js
import { createClient } from '@supabase/supabase-js'
import { getSpotifyToken } from './_lib/spotify-token.js'

export default async function handler(req, res) {
  const authHeader = req.headers.authorization ?? ''
  const accessToken = authHeader.replace(/^Bearer\s+/i, '')
  if (!accessToken) return res.status(401).json({ error: 'not authenticated' })

  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const { data: { user }, error: authError } = await sb.auth.getUser(accessToken)
  if (authError || !user?.app_metadata?.host_verified) {
    return res.status(403).json({ error: 'host verification required' })
  }

  const q = (req.query.q || '').trim()
  if (!q) return res.status(200).json({ tracks: [] })

  try {
    const token = await getSpotifyToken()
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10`
    const searchRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!searchRes.ok) throw new Error(`Spotify search failed: ${searchRes.status}`)
    const data = await searchRes.json()

    const tracks = (data.tracks?.items ?? []).map(t => ({
      spotifyId: t.id,
      title: t.name,
      artist: t.artists.map(a => a.name).join(', '),
      artworkUrl: t.album?.images?.[2]?.url ?? t.album?.images?.[0]?.url ?? null,
    }))
    res.status(200).json({ tracks })
  } catch (e) {
    res.status(502).json({ error: e.message ?? 'Spotify search failed' })
  }
}
```

- [ ] **Step 3: Add the secret to Vercel**

```bash
cd ~/Projects/baynes-trivia/trivia-os
vercel env add SPOTIFY_CLIENT_SECRET production
vercel env add SPOTIFY_CLIENT_SECRET preview
vercel env add SPOTIFY_CLIENT_SECRET development
```
Paste the value from the Prerequisite step when prompted. **Checkpoint: confirm the secret value came from Ben (or was retrieved with his direct approval), never guess or fabricate it.**

- [ ] **Step 4: Manual verification**

`vercel dev` needs the env vars pulled locally first (it doesn't read the dashboard automatically). Pull **Preview**, not the default Development — `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are only set on Production+Preview in this project (confirmed via `vercel env ls`), so a default `vercel env pull` gets neither and `spotify-search.js`'s `createClient(undefined, undefined)` throws before the auth check even runs:

```bash
vercel env pull .env.vercel --environment=preview
vercel dev &
sleep 3
```

Get a real access token from a logged-in host session first (open the deployed app, run in the browser console: `(await window.supabase?.auth.getSession())?.data?.session?.access_token` — or read it from `localStorage` under the Supabase auth key), then:

```bash
curl -s -H "Authorization: Bearer <token>" "http://localhost:3000/api/spotify-search?q=hey+jude" | head -c 500
```
Expected: JSON with a `tracks` array containing "Hey Jude" by The Beatles. Also verify the auth gate itself:
```bash
curl -s "http://localhost:3000/api/spotify-search?q=hey+jude"
```
Expected: `401 {"error":"not authenticated"}`.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/spotify-token.js api/spotify-search.js
git commit -m "feat: add Spotify search backend for Bendle song picker"
```

---

### Task 4: Song search UI in BendleAdmin

**Files:**
- Create: `client/src/components/host/BendleSongSearch.jsx`
- Modify: `client/src/components/host/BendleAdmin.jsx` (add the search picker above the existing manual-entry form; manual form stays untouched as the fallback path)
- Test: `client/src/components/host/BendleSongSearch.test.jsx`

**Interfaces:**
- Consumes: `GET /api/spotify-search?q=` (Task 3).
- Produces: `onPick(track)` callback with `{ spotifyId, title, artist, artworkUrl }`, called when the host clicks a search result.

- [ ] **Step 1: Write the failing test**

```js
// client/src/components/host/BendleSongSearch.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Same reasoning as AddSlideWizard.test.jsx: stub the client at import time
// so auth.getSession() doesn't reach a real network call in a unit test.
vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'test-token' } } }) } },
}))

const { default: BendleSongSearch } = await import('./BendleSongSearch.jsx')

describe('BendleSongSearch', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tracks: [
        { spotifyId: '1', title: 'Hey Jude', artist: 'The Beatles', artworkUrl: null },
      ] }),
    })
  })

  it('searches and calls onPick with the chosen track', async () => {
    const onPick = vi.fn()
    render(<BendleSongSearch onPick={onPick} />)
    fireEvent.change(screen.getByPlaceholderText(/search a song/i), { target: { value: 'hey jude' } })
    await waitFor(() => expect(screen.getByText('Hey Jude')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Hey Jude'))
    expect(onPick).toHaveBeenCalledWith({ spotifyId: '1', title: 'Hey Jude', artist: 'The Beatles', artworkUrl: null })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- BendleSongSearch.test.jsx`
Expected: FAIL — `BendleSongSearch.jsx` doesn't exist.

- [ ] **Step 3: Implement the component**

```jsx
// client/src/components/host/BendleSongSearch.jsx
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase.js'

export default function BendleSongSearch({ onPick }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    clearTimeout(debounceRef.current)
    let ignore = false // guards against an older, slower request overwriting a newer one's results
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/spotify-search?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        })
        const data = await res.json()
        if (!ignore) setResults(data.tracks ?? [])
      } catch {
        if (!ignore) setResults([])
      } finally {
        if (!ignore) setLoading(false)
      }
    }, 350)
    return () => { ignore = true; clearTimeout(debounceRef.current) }
  }, [query])

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search a song on Spotify…"
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
      />
      {loading && <p className="text-xs text-gray-400">Searching…</p>}
      {results.length > 0 && (
        <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
          {results.map(track => (
            <li key={track.spotifyId}>
              <button
                onClick={() => onPick(track)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50"
              >
                {track.artworkUrl && <img src={track.artworkUrl} alt="" className="w-8 h-8 rounded" />}
                <span>
                  <span className="block text-sm font-medium text-gray-900">{track.title}</span>
                  <span className="block text-xs text-gray-500">{track.artist}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- BendleSongSearch.test.jsx`
Expected: PASS

- [ ] **Step 5: Wire into BendleAdmin.jsx**

Add above the existing manual "Title" input (`BendleAdmin.jsx`, inside the form section), and add the handler that inserts a `requested` row:

Spotify titles routinely carry suffixes like "Hey Jude - Remastered 2015" or "Song (feat. X)" — `bendleScoring.js`'s `matchesBendleAnswer` is an exact match after normalize, so storing the raw title as `answer` would make a correct guess of "Hey Jude" score wrong. Strip the common suffix shapes into a cleaner `answer`, and keep the raw Spotify title as an alias so either still matches:

```jsx
// near the top of the BendleAdmin component, alongside the other useState calls
import BendleSongSearch from './BendleSongSearch.jsx'
// ...
function cleanSpotifyTitle(title) {
  return title
    .replace(/\s*-\s*(remaster(ed)?|mono|stereo|single|album)\b.*$/i, '')
    .replace(/\s*[\(\[](feat\.?|with|remaster|mono|stereo)[^)\]]*[\)\]]/gi, '')
    .trim()
}

async function handleSpotifyPick(track) {
  setError(null)
  const id = `bnd_${nanoid(8)}`
  const cleanAnswer = cleanSpotifyTitle(track.title)
  const { error: insertError } = await supabase.from('bendle_songs').insert({
    id,
    title: track.title,
    answer: cleanAnswer,
    aliases: cleanAnswer === track.title ? [] : [track.title],
    status: 'requested',
    spotify_id: track.spotifyId,
    artist: track.artist,
    artwork_url: track.artworkUrl,
    drums_url: null, bass_url: null, other_url: null, vocals_url: null,
  })
  if (insertError) { setError(insertError.message); return }
  const { data } = await supabase.from('bendle_songs').select('id, title, created_at, status, artist, error_text').order('created_at', { ascending: false })
  setSongs(data ?? [])
}
```

And in JSX, right after the modal header:
```jsx
<div className="border-b border-gray-100 pb-4">
  <p className="text-xs font-medium text-gray-500 mb-2">Pick from Spotify (automatic)</p>
  <BendleSongSearch onPick={handleSpotifyPick} />
</div>
<p className="text-xs text-gray-400 text-center">— or upload stems manually below —</p>
```

Also update the initial songs query (line 20) and the two post-save refresh queries (lines 21, 53) to select the new columns:
```js
supabase.from('bendle_songs').select('id, title, created_at, status, artist, error_text').order('created_at', { ascending: false })
```

- [ ] **Step 6: Run full unit suite**

Run: `npm run test:unit`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add client/src/components/host/BendleSongSearch.jsx client/src/components/host/BendleSongSearch.test.jsx client/src/components/host/BendleAdmin.jsx
git commit -m "feat: pick Bendle songs from Spotify search instead of manual stem upload"
```

---

### Task 5: Status list in BendleAdmin (badges + retry)

**Files:**
- Modify: `client/src/components/host/BendleAdmin.jsx` (the song list at the bottom of the modal)
- Test: extend `client/src/components/host/BendleAdmin.test.jsx` if it exists — if not, create one covering just the badge-rendering logic below (check first: `ls client/src/components/host/BendleAdmin.test.jsx`)

**Interfaces:**
- Consumes: `bendle_songs.status`, `error_text` (Task 1).

- [ ] **Step 1: Write the failing test**

```js
// client/src/components/host/BendleAdmin.test.jsx (add if missing, or extend existing)
import { describe, it, expect } from 'vitest'
import { statusLabel } from './BendleAdmin.jsx'

describe('statusLabel', () => {
  it('labels requested', () => expect(statusLabel('requested')).toBe('⏳ Queued'))
  it('labels processing', () => expect(statusLabel('processing')).toBe('⚙️ Processing'))
  it('labels ready', () => expect(statusLabel('ready')).toBe('✅ Ready'))
  it('labels failed', () => expect(statusLabel('failed')).toBe('❌ Failed'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- BendleAdmin.test.jsx`
Expected: FAIL — `statusLabel` not exported.

- [ ] **Step 3: Implement**

Add near the top of `BendleAdmin.jsx`, outside the component (so it's a plain exported function, testable without rendering):

```js
export function statusLabel(status) {
  return {
    requested: '⏳ Queued',
    processing: '⚙️ Processing',
    ready: '✅ Ready',
    failed: '❌ Failed',
  }[status] ?? status
}
```

Replace the song list rendering (`<ul>...{songs.map(s => <li key={s.id}>...)}</ul>`) with:

```jsx
<ul className="flex flex-col gap-1">
  {songs.map(s => (
    <li key={s.id} className="flex items-center justify-between text-sm text-gray-700 gap-2">
      <span>{s.title}{s.artist ? ` — ${s.artist}` : ''}</span>
      <span className="text-xs shrink-0">{statusLabel(s.status)}</span>
    </li>
  ))}
</ul>
{songs.some(s => s.status === 'failed') && (
  <p className="text-xs text-gray-400">
    A failed song can be retried by deleting its row and picking it again — automatic retry isn't built, this is rare enough at this volume not to need it yet.
  </p>
)}
```

- [ ] **Step 4: Subscribe to realtime updates so status flips without a manual refresh**

Add a realtime subscription effect, following the same `supabase.channel().on('postgres_changes', ...)` pattern `useShow.js` already uses for `shows`:

```js
useEffect(() => {
  const channel = supabase
    .channel('bendle_songs_status')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bendle_songs' }, payload => {
      setSongs(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...payload.new } : s))
    })
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}, [])
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:unit -- BendleAdmin.test.jsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/components/host/BendleAdmin.jsx client/src/components/host/BendleAdmin.test.jsx
git commit -m "feat: show live status per Bendle song in the admin panel"
```

---

### Task 6: Worker core logic (Python, pure functions tested)

**Files:**
- Create: `worker/bendle/bendle_worker.py`
- Create: `worker/bendle/requirements.txt`
- Test: `worker/bendle/test_bendle_worker.py`

**Interfaces:**
- Consumes: `bendle_songs` rows via Supabase REST (service role key), `spotify_id`/`title`/`artist` fields (Task 1).
- Produces: the 4 stem files uploaded to `trivia-show-media` bucket at `bendle/<id>/<stem>.mp3`, and a row update to `status='ready'` (with `drums_url`/`bass_url`/`other_url`/`vocals_url`) or `status='failed'` (with `error_text`).

- [ ] **Step 1: `requirements.txt`**

```
supabase==2.9.1
python-dotenv
yt-dlp
demucs
```

- [ ] **Step 2: Write the failing tests for the pure helpers**

```python
# worker/bendle/test_bendle_worker.py
from bendle_worker import build_search_query, build_ready_update

def test_build_search_query_combines_artist_and_title():
    assert build_search_query("Hey Jude", "The Beatles") == "The Beatles Hey Jude official audio"

def test_build_search_query_handles_missing_artist():
    assert build_search_query("Hey Jude", None) == "Hey Jude official audio"

def test_build_ready_update_shape():
    urls = {"drums": "https://x/drums.mp3", "bass": "https://x/bass.mp3",
            "other": "https://x/other.mp3", "vocals": "https://x/vocals.mp3"}
    update = build_ready_update(urls)
    assert update == {
        "status": "ready",
        "drums_url": urls["drums"], "bass_url": urls["bass"],
        "other_url": urls["other"], "vocals_url": urls["vocals"],
        "error_text": None,
    }
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd worker/bendle && python3 -m pytest test_bendle_worker.py -v`
Expected: FAIL — `bendle_worker.py` doesn't exist.

- [ ] **Step 4: Implement the worker**

**Two fixes baked in from the start, not left for later cleanup:**
1. `subprocess.run(["yt-dlp", ...])`/`["demucs", ...]` would fail with `FileNotFoundError` under launchd — the plist's `PATH` (`/opt/homebrew/bin:/usr/bin:/bin`, Task 7) has no entry for the venv's `bin/` where pip installs these console scripts. Every song would silently land `failed`. Invoke them as `[sys.executable, "-m", "yt_dlp", ...]`/`[sys.executable, "-m", "demucs", ...]` instead — `sys.executable` is an absolute path baked into the venv, no PATH lookup needed.
2. Dropped the `yt-dlp -U` self-update call — pip-installed yt-dlp refuses `-U` (it's reserved for the standalone binary release channel) and exits non-zero every single run for no benefit. Keeping yt-dlp current is a `pip install --upgrade yt-dlp` run occasionally by hand instead (yt-dlp breaks against YouTube's changes periodically — this is a known, accepted maintenance cost of the tool, not something to silently paper over with a command that doesn't work here anyway).

```python
# worker/bendle/bendle_worker.py
import glob
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

POLL_SECONDS = 30
STEMS = ["drums", "bass", "other", "vocals"]


def build_search_query(title, artist):
    parts = [artist, title] if artist else [title]
    return " ".join(p for p in parts if p) + " official audio"


def build_ready_update(urls):
    return {
        "status": "ready",
        "drums_url": urls["drums"], "bass_url": urls["bass"],
        "other_url": urls["other"], "vocals_url": urls["vocals"],
        "error_text": None,
    }


def build_failed_update(message):
    return {"status": "failed", "error_text": message}


def get_client():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def process_song(sb, song):
    song_id = song["id"]
    with tempfile.TemporaryDirectory() as tmp:
        # %(ext)s, not a fixed "audio.wav" — yt-dlp's own recommended pattern for
        # -x/--audio-format, since the extractor's native format is unknown up
        # front and the postprocessor conversion step needs a template it controls.
        output_template = f"{tmp}/audio.%(ext)s"
        query = build_search_query(song["title"], song.get("artist"))

        result = subprocess.run(
            [sys.executable, "-m", "yt_dlp", f"ytsearch1:{query}", "-x", "--audio-format", "wav", "-o", output_template],
            capture_output=True, text=True,
        )
        matches = glob.glob(f"{tmp}/audio.*")
        if result.returncode != 0 or not matches:
            raise RuntimeError(f"couldn't find or download audio for \"{query}\"")
        audio_path = matches[0]

        demucs_out = f"{tmp}/separated"
        result = subprocess.run(
            [sys.executable, "-m", "demucs", "-n", "htdemucs", "--mp3", "-o", demucs_out, audio_path],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            raise RuntimeError("stem separation failed — the audio may be corrupt or unsupported")

        # demucs names its output folder after the input file's stem — "audio" here,
        # since output_template above always writes to a file named audio.<ext>.
        stem_dir = f"{demucs_out}/htdemucs/audio"
        urls = {}
        for stem in STEMS:
            local_path = f"{stem_dir}/{stem}.mp3"
            if not Path(local_path).exists():
                raise RuntimeError(f"missing {stem} stem after separation")
            storage_path = f"bendle/{song_id}/{stem}.mp3"
            with open(local_path, "rb") as f:
                sb.storage.from_("trivia-show-media").upload(
                    storage_path, f, {"content-type": "audio/mpeg", "upsert": "true"}
                )
            urls[stem] = sb.storage.from_("trivia-show-media").get_public_url(storage_path)

        sb.table("bendle_songs").update(build_ready_update(urls)).eq("id", song_id).execute()


def run_once(sb):
    rows = (
        sb.table("bendle_songs").select("*").eq("status", "requested")
        .order("created_at").limit(1).execute().data
    )
    if not rows:
        return False
    song = rows[0]
    sb.table("bendle_songs").update({"status": "processing"}).eq("id", song["id"]).execute()
    try:
        process_song(sb, song)
    except Exception as e:
        sb.table("bendle_songs").update(build_failed_update(str(e))).eq("id", song["id"]).execute()
    return True


def recover_stuck_jobs(sb):
    # Only one worker process ever runs (this launchd job, KeepAlive-restarted on
    # crash) — so any row still 'processing' at startup was mid-work when the
    # previous run died (crash, reboot, kill). Nothing else will ever pick it back
    # up otherwise: it would sit "Processing" in the UI forever. Safe to requeue
    # unconditionally under that single-worker assumption; would need a real lease/
    # timeout scheme if a second worker instance were ever added.
    sb.table("bendle_songs").update({"status": "requested"}).eq("status", "processing").execute()


def main_loop():
    sb = get_client()
    recover_stuck_jobs(sb)
    while True:
        try:
            did_work = run_once(sb)
        except Exception as e:
            print(f"worker loop error: {e}")
            did_work = False
        if not did_work:
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main_loop()
```

Note: `demucs`'s output folder is always named after the input file's basename — always `audio` here, since `output_template` always writes to `audio.<ext>` regardless of song. That's why `stem_dir` above is a fixed `.../htdemucs/audio` rather than something computed per-song.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd worker/bendle && python3 -m pytest test_bendle_worker.py -v`
Expected: PASS (3/3)

- [ ] **Step 6: Commit**

```bash
git add worker/bendle/bendle_worker.py worker/bendle/requirements.txt worker/bendle/test_bendle_worker.py
git commit -m "feat: add Bendle worker (yt-dlp + demucs + Supabase upload)"
git push
```

---

### Task 7: Provision bens-server and install as a launchd service

**Checkpoint: this installs new software (Homebrew, ffmpeg, a Python venv with PyTorch via demucs — a few GB) on bens-server, a production machine already running Kingo. Confirm with Ben before running Steps 1-2.**

**Files:**
- Create (on bens-server, not in the repo): `~/Projects/baynes-trivia/trivia-os/worker/bendle/.env`
- Create: `worker/bendle/com.bencoughlin.bendle-worker.plist` (committed to the repo as the template; installed copy on bens-server points at the real paths)
- Test: manual — `launchctl list | grep bendle` shows a loaded, non-crashing job

- [ ] **Step 1: Install Homebrew + system deps on bens-server**

```bash
ssh bens-server '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
ssh bens-server "eval \"\$(/opt/homebrew/bin/brew shellenv)\" && brew install ffmpeg"
```

- [ ] **Step 2: Set up the Python venv and install deps (this pulls PyTorch — a few GB, several minutes)**

```bash
ssh bens-server "cd ~/Projects/baynes-trivia/trivia-os && git pull"
ssh bens-server "cd ~/Projects/baynes-trivia/trivia-os/worker/bendle && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt"
```

- [ ] **Step 3: Write the `.env` on bens-server**

Get the service role key from the Supabase dashboard (Project Settings → API → `service_role`, project `qwtbgusqfoypvehnungr`) — it is not in any `.env.local` already checked into this repo, so it must be fetched fresh from the dashboard.

```bash
ssh bens-server "cat > ~/Projects/baynes-trivia/trivia-os/worker/bendle/.env" <<'EOF'
SUPABASE_URL=https://qwtbgusqfoypvehnungr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<paste from dashboard>
EOF
```

- [ ] **Step 4: Write the launchd plist template**

```xml
<!-- worker/bendle/com.bencoughlin.bendle-worker.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.bencoughlin.bendle-worker</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/bencoughlin/Projects/baynes-trivia/trivia-os/worker/bendle/venv/bin/python3</string>
    <string>/Users/bencoughlin/Projects/baynes-trivia/trivia-os/worker/bendle/bendle_worker.py</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/bencoughlin/Projects/baynes-trivia/trivia-os/worker/bendle</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/bencoughlin/Library/Logs/bendle-worker.log</string>
  <key>StandardErrorPath</key><string>/Users/bencoughlin/Library/Logs/bendle-worker.log</string>
</dict>
</plist>
```

Note: the plist's `EnvironmentVariables` only carries `PATH` — `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` come from `worker/bendle/.env` instead, which is why `bendle_worker.py` already calls `load_dotenv()` at the top (Task 6) and `requirements.txt` already includes `python-dotenv`. Nothing further needed here — just confirm the `.env` from Step 3 actually sits in `worker/bendle/` (the same `WorkingDirectory` the plist sets), since `load_dotenv()` with no path argument looks in the current working directory.

- [ ] **Step 5: Install and load the service**

```bash
ssh bens-server "cp ~/Projects/baynes-trivia/trivia-os/worker/bendle/com.bencoughlin.bendle-worker.plist ~/Library/LaunchAgents/"
ssh bens-server "launchctl bootstrap gui/\$(id -u) ~/Library/LaunchAgents/com.bencoughlin.bendle-worker.plist"
ssh bens-server "launchctl list | grep bendle"
```
Expected: a line showing the job loaded (PID present or `0` if between poll cycles, not a crash-loop exit status).

- [ ] **Step 6: Commit the template + requirements update**

```bash
git add worker/bendle/com.bencoughlin.bendle-worker.plist worker/bendle/requirements.txt worker/bendle/bendle_worker.py
git commit -m "feat: install Bendle worker as a launchd service on bens-server"
git push
```

---

### Task 8: End-to-end smoke test with a real throwaway song

**Checkpoint: this inserts and deletes real rows/files against the live Supabase project and live Storage bucket. Confirm with Ben, use an obviously-throwaway title, and clean up fully afterward.**

- [ ] **Step 1: Trigger a real request**

Via the deployed app's BendleAdmin panel (or directly):
```sql
insert into bendle_songs (id, title, answer, aliases, status, artist)
values ('bnd_smoketest', 'Never Gonna Give You Up', 'Never Gonna Give You Up', '{}', 'requested', 'Rick Astley');
```

- [ ] **Step 2: Watch the worker log on bens-server**

```bash
ssh bens-server "tail -f ~/Library/Logs/bendle-worker.log"
```
Expected within ~5 min: log lines for the yt-dlp download, demucs run, uploads, then silence (back to polling). This first-ever run also downloads demucs's `htdemucs` model (~80MB, one-time, cached after) — a few minutes of apparent silence between the yt-dlp download finishing and demucs's own progress output starting is normal on this first run, not a hang.

- [ ] **Step 3: Verify the row**

```sql
select id, status, drums_url, bass_url, other_url, vocals_url, error_text from bendle_songs where id = 'bnd_smoketest';
```
Expected: `status = 'ready'`, all 4 URLs populated, `error_text` null.

- [ ] **Step 4: Verify a stem file actually plays**

Fetch `drums_url` and confirm it's a real, non-empty MP3 (e.g. `curl -sI <url>` shows `content-type: audio/mpeg` and a non-zero `content-length`).

- [ ] **Step 5: Clean up**

```sql
delete from bendle_songs where id = 'bnd_smoketest';
```
```bash
# remove the uploaded test stems from storage — use the Supabase dashboard Storage browser,
# path bendle/bnd_smoketest/, or the storage API; confirm 0 files remain under that prefix.
```

- [ ] **Step 6: Update the original design doc**

Add a note to `docs/superpowers/specs/2026-09-04-bendle-layered-audio-question-design.md`'s "Content pipeline" section pointing at this plan, so a future reader doesn't think the manual-only pipeline is still the whole story:

```
**2026-09-07 update:** the manual pipeline above is now the fallback path.
The primary path is automatic — see docs/superpowers/plans/2026-09-07-bendle-song-automation.md.
Ben picks a song via Spotify search in BendleAdmin; a worker on bens-server
handles yt-dlp + demucs + upload with no manual file handling.
```

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-09-04-bendle-layered-audio-question-design.md
git commit -m "docs: point Bendle content pipeline at the new automation plan"
git push
```

---

## Task 9 (queued, NOT part of the current execution pass — pick this up after Tasks 1-8 ship and are verified live)

**Why this exists:** Ben's real Bendle rounds always play the same fixed reveal — Drums Only → +Bass → +Everything Else. He wants variation: sometimes bass should lead, sometimes drums; and separately, whether a fourth real instrument (guitar) can ever get its own reveal moment instead of disappearing into the "Everything Else" catch-all. Confirmed via web search: Demucs has a 6-source model (`htdemucs_6s`) that separates guitar and piano in addition to drums/bass/vocals/other — guitar quality is decent, piano has real bleeding/artifact problems, so piano is excluded as a lead stem and always folds into "other."

**Design, keeping the house "always 3 steps" rule intact (`bendleScoring.js`'s own comment: "THREE steps, always ... a house rule across the shiny step formats"):** two independent knobs.
1. **Prep-time (per song):** an "also split out guitar" toggle when requesting a song via Spotify search. If on, the worker runs the 6-stem model instead of the 4-stem one and uploads a 5th stem (`guitar_url`), folding piano into `other` via an audio mixdown rather than storing a poor-quality 5th URL nobody asked for.
2. **Edit-time (per slide):** a "which 2 stems lead" picker — two dropdowns choosing from whatever stems that song actually has (`drums`/`bass`, plus `guitar` if that song was prepped with it). The third tier is always "everything else" — every stem not picked as a lead. Points/timing (30/10/40s... wait, 30/15/10 pts at 0/20/40s) never change — only which stems fill which slot.

**Files:**
- Modify: `supabase/migrations/` (new migration, timestamp after Task 1's)
- Modify: `client/src/lib/bendleScoring.js` (add `buildBendleTiers()`, keep `BENDLE_TIERS` as its default-args result — zero breaking change for existing songs/slides with no order preference set)
- Modify: `client/src/lib/bendleScoring.test.js`
- Modify: `worker/bendle/bendle_worker.py`, `worker/bendle/test_bendle_worker.py`
- Modify: `client/src/components/host/BendleAdmin.jsx` (guitar toggle on request)
- Modify: `client/src/components/host/SlideEditor.jsx` (`BendleBuilder`'s lead-stem picker)
- Modify: `client/src/components/display/slides/ShinyBendleQuestion.jsx` (build tiers dynamically instead of the static import)
- Modify: `client/src/components/host/LiveMode.jsx` (`handleLockAndScoreBendle` passes the computed tiers into scoring)

**Interfaces:**
- Produces: `buildBendleTiers(leadOrder = ['drums', 'bass'], hasGuitar = false)` → the same `[{id,label,atSeconds,points,stems}]` shape `BENDLE_TIERS` already has. `BENDLE_TIERS` becomes `buildBendleTiers()` called with no args — byte-identical output to today's literal array (verify this in Step 2 below).
- Consumes: `bendle_songs.guitar_url` (new, nullable), `bendle_songs.wants_guitar` (new, boolean), `slide.data.bendleTierOrder` (new, `[stem, stem]`, optional — absence means the existing default order).

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/<next-timestamp>_bendle_guitar_and_tier_order.sql
alter table public.bendle_songs
  add column wants_guitar boolean not null default false,
  add column guitar_url text;
```
No `tier_order` column on `bendle_songs` — reveal order is a per-slide editorial choice (the same song can be replayed across shows with a different order), so it belongs in `slide.data`, not on the reusable song row. Apply and verify the same way Task 1 did (controller-executed checkpoint, not a subagent — this mutates the live `qwtbgusqfoypvehnungr` project).

- [ ] **Step 2: Write the failing test for `buildBendleTiers`**

```js
// client/src/lib/bendleScoring.test.js — add to the existing file
import { buildBendleTiers } from './bendleScoring.js' // add to the existing import line

describe('buildBendleTiers', () => {
  it('matches the original BENDLE_TIERS literal exactly with default args', () => {
    expect(buildBendleTiers()).toEqual([
      { id: 'drums', label: 'Drums Only',        atSeconds: 0,  points: 30, stems: ['drums'] },
      { id: 'bass',  label: '+ Bass',            atSeconds: 20, points: 15, stems: ['bass'] },
      { id: 'full',  label: '+ Everything Else', atSeconds: 40, points: 10, stems: ['other', 'vocals'] },
    ])
  })

  it('swaps lead order when bass is requested first', () => {
    const tiers = buildBendleTiers(['bass', 'drums'])
    expect(tiers[0]).toEqual({ id: 'bass', label: 'Bass Only', atSeconds: 0, points: 30, stems: ['bass'] })
    expect(tiers[1]).toEqual({ id: 'drums', label: '+ Drums', atSeconds: 20, points: 15, stems: ['drums'] })
    expect(tiers[2].stems.sort()).toEqual(['other', 'vocals'])
  })

  it('folds guitar into the final tier when not chosen as a lead', () => {
    const tiers = buildBendleTiers(['drums', 'bass'], true)
    expect(tiers[2].stems.sort()).toEqual(['guitar', 'other', 'vocals'])
  })

  it('lets guitar lead when the song has it', () => {
    const tiers = buildBendleTiers(['guitar', 'drums'], true)
    expect(tiers[0]).toEqual({ id: 'guitar', label: 'Guitar Only', atSeconds: 0, points: 30, stems: ['guitar'] })
    expect(tiers[2].stems.sort()).toEqual(['bass', 'other', 'vocals'])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:unit -- bendleScoring.test.js`
Expected: FAIL — `buildBendleTiers` not exported.

- [ ] **Step 4: Implement `buildBendleTiers`, keep `BENDLE_TIERS` as its result**

Replace the existing `BENDLE_TIERS` literal in `client/src/lib/bendleScoring.js` (the whole `export const BENDLE_TIERS = [...]` block and its long comment stay — the comment is still accurate, "not exposed for per-slide editing" becomes false as of this task, update that one line of the comment) with:

```js
const BENDLE_LEAD_LABELS = { drums: 'Drums', bass: 'Bass', guitar: 'Guitar' }

// Building block for the fixed 3-tier reveal. `leadOrder` names which 2
// stems get their own tier (in that order); everything else — always
// including `other` and `vocals`, plus guitar when the song wasn't
// prepped with a guitar stem, plus whichever of drums/bass wasn't chosen
// as a lead — lands in the fixed final "+ Everything Else" tier. Points
// and timing never move; only which stems occupy which slot does.
export function buildBendleTiers(leadOrder = ['drums', 'bass'], hasGuitar = false) {
  const available = ['drums', 'bass', 'other', 'vocals', ...(hasGuitar ? ['guitar'] : [])]
  const [first, second] = leadOrder
  const remaining = available.filter(s => s !== first && s !== second)
  return [
    { id: first, label: `${BENDLE_LEAD_LABELS[first]} Only`, atSeconds: 0, points: 30, stems: [first] },
    { id: second, label: `+ ${BENDLE_LEAD_LABELS[second]}`, atSeconds: 20, points: 15, stems: [second] },
    { id: 'full', label: '+ Everything Else', atSeconds: 40, points: 10, stems: remaining },
  ]
}

export const BENDLE_TIERS = buildBendleTiers()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:unit -- bendleScoring.test.js`
Expected: PASS, including the full existing suite in that file (confirms `BENDLE_TIERS` is still byte-identical, so `resolveBendleTier`/`scoreBendleRound`'s existing tests — which reference `BENDLE_TIERS` — need zero changes).

- [ ] **Step 6: Worker — request-time guitar toggle**

In `worker/bendle/bendle_worker.py`'s `process_song`, branch on `song.get("wants_guitar")`:

```python
STEMS_STANDARD = ["drums", "bass", "other", "vocals"]
STEMS_EXTENDED = ["drums", "bass", "other", "vocals", "guitar", "piano"]

def process_song(sb, song):
    song_id = song["id"]
    wants_guitar = bool(song.get("wants_guitar"))
    model = "htdemucs_6s" if wants_guitar else "htdemucs"
    stems_to_read = STEMS_EXTENDED if wants_guitar else STEMS_STANDARD

    with tempfile.TemporaryDirectory() as tmp:
        output_template = f"{tmp}/audio.%(ext)s"
        query = build_search_query(song["title"], song.get("artist"))

        result = subprocess.run(
            [sys.executable, "-m", "yt_dlp", f"ytsearch1:{query}", "-x", "--audio-format", "wav", "-o", output_template],
            capture_output=True, text=True,
        )
        matches = glob.glob(f"{tmp}/audio.*")
        if result.returncode != 0 or not matches:
            raise RuntimeError(f"couldn't find or download audio for \"{query}\"")
        audio_path = matches[0]

        demucs_out = f"{tmp}/separated"
        result = subprocess.run(
            [sys.executable, "-m", "demucs", "-n", model, "--mp3", "-o", demucs_out, audio_path],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            raise RuntimeError("stem separation failed — the audio may be corrupt or unsupported")

        stem_dir = f"{demucs_out}/{model}/audio"
        for stem in stems_to_read:
            if not Path(f"{stem_dir}/{stem}.mp3").exists():
                raise RuntimeError(f"missing {stem} stem after separation")

        # Piano quality is poor enough (bleeding/artifacts, confirmed against
        # Demucs's own known limitations for htdemucs_6s) that it never becomes
        # its own reveal layer — mix it into `other` instead of uploading a
        # 5th URL nobody would choose to lead with.
        if wants_guitar:
            mixed_other = f"{stem_dir}/other_mixed.mp3"
            result = subprocess.run(
                ["ffmpeg", "-y", "-i", f"{stem_dir}/other.mp3", "-i", f"{stem_dir}/piano.mp3",
                 "-filter_complex", "amix=inputs=2:duration=longest", mixed_other],
                capture_output=True, text=True,
            )
            if result.returncode != 0:
                raise RuntimeError("piano fold-in failed — ffmpeg couldn't mix other+piano")
            os.replace(mixed_other, f"{stem_dir}/other.mp3")

        upload_stems = STEMS_STANDARD + (["guitar"] if wants_guitar else [])
        urls = {}
        for stem in upload_stems:
            local_path = f"{stem_dir}/{stem}.mp3"
            storage_path = f"bendle/{song_id}/{stem}.mp3"
            with open(local_path, "rb") as f:
                sb.storage.from_("trivia-show-media").upload(
                    storage_path, f, {"content-type": "audio/mpeg", "upsert": "true"}
                )
            urls[stem] = sb.storage.from_("trivia-show-media").get_public_url(storage_path)

        update = build_ready_update({k: urls[k] for k in STEMS_STANDARD})
        if wants_guitar:
            update["guitar_url"] = urls["guitar"]
        sb.table("bendle_songs").update(update).eq("id", song_id).execute()
```

This replaces the existing `process_song` body from Task 6 (same function name, same signature — the rest of the file is unchanged). Add this pure-function test to `worker/bendle/test_bendle_worker.py`:

```python
def test_stems_extended_includes_guitar_and_piano():
    assert "guitar" in STEMS_EXTENDED and "piano" in STEMS_EXTENDED
    assert "piano" not in STEMS_STANDARD and "guitar" not in STEMS_STANDARD
```

Run: `cd worker/bendle && python3 -m pytest test_bendle_worker.py -v` — expect PASS (4/4).

- [ ] **Step 7: BendleAdmin — request-time toggle**

In `handleSpotifyPick` (Task 4), add a `wantsGuitar` param sourced from a new checkbox next to the search box ("Also split out guitar — adds separation time, use for guitar-forward songs"), and include it in the insert:

```jsx
const [wantsGuitar, setWantsGuitar] = useState(false)
// ...
async function handleSpotifyPick(track) {
  // ...unchanged...
  const { error: insertError } = await supabase.from('bendle_songs').insert({
    // ...unchanged fields...
    wants_guitar: wantsGuitar,
  })
  // ...unchanged...
}
```
```jsx
<label className="flex items-center gap-2 text-xs text-gray-600">
  <input type="checkbox" checked={wantsGuitar} onChange={e => setWantsGuitar(e.target.checked)} />
  Also split out guitar (slower, use for guitar-forward songs)
</label>
```

- [ ] **Step 8: SlideEditor — lead-stem order picker**

Extend `BendleBuilder` (Task 6's design didn't touch this component, Task 9 does) to accept and set `tierOrder`:

```jsx
function BendleBuilder({ songId, onChangeSongId, tierOrder, onChangeTierOrder }) {
  const [songs, setSongs] = useState([])
  useEffect(() => {
    let cancelled = false
    supabase.from('bendle_songs').select('id, title, answer, aliases, guitar_url').eq('status', 'ready').order('title')
      .then(({ data }) => { if (!cancelled) setSongs(data ?? []) })
    return () => { cancelled = true }
  }, [])
  const selected = songs.find(s => s.id === songId)
  const hasGuitar = !!selected?.guitar_url
  const leadOptions = ['drums', 'bass', ...(hasGuitar ? ['guitar'] : [])]
  const order = tierOrder ?? ['drums', 'bass']
  const tiers = buildBendleTiers(order, hasGuitar)

  function setLead(index, stem) {
    const next = [...order]
    next[index] = stem
    // Same stem can't lead twice — bump the other slot to whatever's left.
    if (next[0] === next[1]) next[1 - index] = leadOptions.find(s => s !== stem) ?? next[1 - index]
    onChangeTierOrder(next)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ...existing Song select unchanged... */}
      {selected && (
        <div className="flex gap-2">
          <select value={order[0]} onChange={e => setLead(0, e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
            {leadOptions.map(s => <option key={s} value={s}>{BENDLE_LEAD_LABELS[s]} first</option>)}
          </select>
          <select value={order[1]} onChange={e => setLead(1, e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
            {leadOptions.filter(s => s !== order[0]).map(s => <option key={s} value={s}>{BENDLE_LEAD_LABELS[s]} second</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Bendle steps</label>
        <div className="flex flex-col gap-1.5">
          {tiers.map(t => (
            <div key={t.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
              <span className="text-sm font-medium text-gray-800 flex-1">{t.label}</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">{t.points} pts</span>
              <span className="text-xs text-gray-400">at {t.atSeconds}s</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```
`BENDLE_LEAD_LABELS` needs exporting from `bendleScoring.js` alongside `buildBendleTiers` (change `const BENDLE_LEAD_LABELS` from Step 4 to `export const BENDLE_LEAD_LABELS`). Update the call site (`SlideEditor.jsx:1011`):
```jsx
<BendleBuilder
  songId={data.bendleSongId}
  onChangeSongId={id => onChange('bendleSongId', id)}
  tierOrder={data.bendleTierOrder}
  onChangeTierOrder={order => onChange('bendleTierOrder', order)}
/>
```

- [ ] **Step 9: ShinyBendleQuestion.jsx — build tiers dynamically**

Replace the static `BENDLE_TIERS` import and the local `STEM_KEYS` constant:
```jsx
import { buildBendleTiers } from '../../../lib/bendleScoring.js'
```
Inside the component, once `song` has loaded, compute once per song/data change:
```jsx
const tiers = song ? buildBendleTiers(data.bendleTierOrder ?? ['drums', 'bass'], !!song.guitar_url) : []
const stemKeys = tiers.flatMap(t => t.stems)
```
Replace every remaining `STEM_KEYS` reference in the file with `stemKeys`, and every `BENDLE_TIERS` reference with `tiers` — except `ROUND_LENGTH_SECONDS` (top-level constant, timing never varies with lead order, leave it computed from the default `buildBendleTiers()` import, unchanged).

- [ ] **Step 10: LiveMode.jsx — pass computed tiers into scoring**

```jsx
import { scoreBendleRound, computeBendleScoreUpdates, buildBendleTiers } from '../../lib/bendleScoring.js'
// ...
const tiers = buildBendleTiers(slide.data?.bendleTierOrder ?? ['drums', 'bass'], !!song.guitar_url)
const results = scoreBendleRound({ entries, song, tiers })
```

- [ ] **Step 11: Run the full unit suite**

Run: `npm run test:unit`
Expected: all PASS, no regressions in the pre-existing Bendle/scoring tests.

- [ ] **Step 12: Commit**

```bash
git add supabase/migrations/ client/src/lib/bendleScoring.js client/src/lib/bendleScoring.test.js worker/bendle/bendle_worker.py worker/bendle/test_bendle_worker.py client/src/components/host/BendleAdmin.jsx client/src/components/host/SlideEditor.jsx client/src/components/display/slides/ShinyBendleQuestion.jsx client/src/components/host/LiveMode.jsx
git commit -m "feat: variable Bendle reveal order + optional guitar stem"
git push
```

**Known limitation, not a gap to close later — this is the real ceiling of what any current tool can do:** the only lead-stem options are drums, bass, and guitar. Piano is never selectable (folded into "other") given Demucs's documented quality problems there. Sax, harmonica, or any other specifically-named instrument can NEVER be its own lead stem with Demucs or any other production-ready separation tool — isolating an arbitrary named instrument (as opposed to Demucs's fixed categories) is an unsolved research problem as of 2026 (text/query-prompted separation exists only in papers, not shipping tools). Those instruments always stay inside "other," permanently, regardless of future Demucs versions short of a fundamentally different model. Do not resurrect this ask without a genuinely new tool to point at — it isn't a build gap, it's a real capability wall.

