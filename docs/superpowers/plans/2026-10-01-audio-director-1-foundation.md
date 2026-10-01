# Audio Director — Plan 1: Foundation (no slide changed)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the audio director — the ONE module that will own all sound playback on `/display` — plus `resolveSlideClip`, the ONE function that says what clip a slide has and when it starts. Nothing in `/display` or `/host` changes behavior in this plan.

**Architecture:** `client/src/audio/director.js` is a factory (`createDirector(deps)`) with every browser dependency injected, so it is tested with fakes; a lazily-bound singleton `director` is exported for the app. Clips are plain data (`{kind:'youtube'|'file', …}`), normalized by `audio/clips.js`. `lib/slideClip.js` maps a slide to `{clip, trigger}`. The director reports every step (Sentry breadcrumbs; one Sentry event per blocked clip) and exposes a subscribable snapshot `{status, blocked[]}` so a UI cue can be driven from it in Plan 2.

**Tech Stack:** React 18 + Vite, vitest (jsdom opt-in per file), `@sentry/react`, existing `lib/youtubeWarmAudio.js`, `lib/audioBlocked.js`, `lib/audioPending.js`, `lib/shinySeries.js`.

**Spec:** `docs/superpowers/specs/2026-09-29-audio-pipeline-design.md` (design) — plus the inventory of all 14 playback paths gathered 2026-10-01 (summarized in "Facts the director must honor" below).

**This is Plan 1 of 3.**
- **Plan 1 (this):** director core + youtube/file clips + `resolveSlideClip`. No slide changed.
- **Plan 2:** question clips (plain, shiny audio, series, Bendle on the shared context) and `/host` + TV Next triggers move onto the director; the "Click for sound" cue is driven by the director; `QuestionAudio`/`ShinyAudioQuestion` playback code deleted.
- **Plan 3:** everything else (PreShow/StateOfUnion walkouts, TeamPicker, Rules, LastCall, WinnerReveal, Race, CustomSlide/ShinyVideo iframes, Display warm + prime ritual), then delete dead code.

## Global Constraints

- Every new behavior: failing test first, watched failing for the right reason; then a mutation check (break the code, see the test fail). Gate commits on the real exit code of the test command, never on `grep`.
- Run vitest from the **worktree root**: `npx vitest run <path>` (running from `client/` finds no files).
- zsh does not word-split `$VAR`; use literal paths or confirm the baseline run reports N tests.
- `/display` is a TV in a bar: the director must NEVER throw into the show. Every external call is guarded; failure becomes a report, not an exception.
- Preview pane (`setPreview(true)`): every call is a no-op, no sound, no reports.
- Chrome facts (found in real Chromium, 2026-10-01): without a user gesture `AudioContext.resume()` NEVER settles and `play()` can hang before it throws. So any "did it start?" check must start AT THE REQUEST, never after `play()` resolves.
- Clip `end` must be passed to `youtubeWarmAudio` as `null` (not `undefined`/`0`) so warm and claim agree on the pool key `videoId:start:end`.
- No new npm dependencies.

## Facts the director must honor (from the inventory)

- Loudness: file clips use `gain = 10^(gainDb/20)`; gain can be > 1 (up to +12 dB), so file audio goes through a `GainNode`, not `element.volume`.
- YouTube volume is `clip.volume` (0–100, default 100) via `player.setVolume`; pause means park at `start` (replay restarts from the clip start).
- A part of a multi-part series is identified by `part`; the same slide id plays different clips per part.
- Triggers (who starts a clip) stay owned by callers in this plan; `resolveSlideClip` only DESCRIBES them: `'click'` (Next press via the `audio_playing` mark) or `'advance'` (starts when the slide goes live).

## File Structure

| File | Responsibility |
|---|---|
| `client/src/audio/clips.js` | `dbToGain`, `normalizeClip`, `clipKey` (pure) |
| `client/src/audio/clips.test.js` | tests for the above |
| `client/src/lib/slideClip.js` | `resolveSlideClip(slide)` → `{clip, trigger}` or `null` (pure) |
| `client/src/lib/slideClip.test.js` | tests incl. agreement with `audioPlayPending` |
| `client/src/audio/director.fakes.js` | test-only fakes: context, element, YouTube, deps |
| `client/src/audio/director.js` | `createDirector`, singleton `director` |
| `client/src/audio/director.test.js` | director behavior tests |

---

### Task 1: Clip data helpers

**Files:**
- Create: `client/src/audio/clips.js`
- Create: `client/src/audio/clips.test.js`

**Interfaces:**
- Produces: `dbToGain(db:number): number`; `normalizeClip(c): NormalizedClip` (throws `Error` on bad input); `clipKey(slideId, clip): string`.
- `NormalizedClip` youtube: `{kind:'youtube', videoId:string, start:number, end:number|null, volume:number, part:number}`; file: `{kind:'file', url:string, gainDb:number, loop:boolean, start:number, part:number}`.

- [ ] **Step 1: Write the failing test**

**Create `client/src/audio/clips.test.js`:**
```js
import { describe, it, expect } from 'vitest'
import { dbToGain, normalizeClip, clipKey } from './clips.js'

describe('dbToGain', () => {
  it('converts decibels to linear gain', () => {
    expect(dbToGain(0)).toBe(1)
    expect(dbToGain(20)).toBeCloseTo(10, 6)
    expect(dbToGain(-20)).toBeCloseTo(0.1, 6)
    expect(dbToGain(6)).toBeCloseTo(1.9953, 3)
  })
  it('treats missing or non-finite values as 0 dB', () => {
    expect(dbToGain(undefined)).toBe(1)
    expect(dbToGain(null)).toBe(1)
    expect(dbToGain(NaN)).toBe(1)
  })
})

describe('normalizeClip', () => {
  it('fills youtube defaults and keeps end null when absent or 0', () => {
    expect(normalizeClip({ kind: 'youtube', videoId: 'abc' })).toEqual({
      kind: 'youtube', videoId: 'abc', start: 0, end: null, volume: 100, part: 0,
    })
    expect(normalizeClip({ kind: 'youtube', videoId: 'abc', start: 12.5, end: 0 }).end).toBeNull()
    expect(normalizeClip({ kind: 'youtube', videoId: 'abc', start: 10, end: 40, volume: 80, part: 2 })).toEqual({
      kind: 'youtube', videoId: 'abc', start: 10, end: 40, volume: 80, part: 2,
    })
  })

  it('fills file defaults', () => {
    expect(normalizeClip({ kind: 'file', url: '/a.mp3' })).toEqual({
      kind: 'file', url: '/a.mp3', gainDb: 0, loop: false, start: 0, part: 0,
    })
    expect(normalizeClip({ kind: 'file', url: '/a.mp3', gainDb: 6, loop: true, start: 181, part: 1 })).toEqual({
      kind: 'file', url: '/a.mp3', gainDb: 6, loop: true, start: 181, part: 1,
    })
  })

  it('throws a clear error for bad input', () => {
    expect(() => normalizeClip(null)).toThrow(/must be an object/)
    expect(() => normalizeClip({ kind: 'youtube' })).toThrow(/videoId/)
    expect(() => normalizeClip({ kind: 'file' })).toThrow(/url/)
    expect(() => normalizeClip({ kind: 'bendle', songId: 's' })).toThrow(/unsupported audio clip kind: bendle/)
    expect(() => normalizeClip({ kind: 'nope' })).toThrow(/unsupported audio clip kind: nope/)
  })
})

describe('clipKey', () => {
  const yt = (extra = {}) => normalizeClip({ kind: 'youtube', videoId: 'abc', ...extra })
  it('is stable for the same slide, part and source', () => {
    expect(clipKey('s1', yt())).toBe(clipKey('s1', yt()))
  })
  it('differs by slide, part, kind and source', () => {
    const base = clipKey('s1', yt())
    expect(clipKey('s2', yt())).not.toBe(base)
    expect(clipKey('s1', yt({ part: 1 }))).not.toBe(base)
    expect(clipKey('s1', normalizeClip({ kind: 'file', url: 'abc' }))).not.toBe(base)
    expect(clipKey('s1', yt({ videoId: 'xyz' }))).not.toBe(base)
  })
  it('treats a missing slide id as empty', () => {
    expect(clipKey(null, yt())).toBe(clipKey(undefined, yt()))
  })
})
```

- [ ] **Step 2: Run it, confirm it fails because the module is missing**

Run: `npx vitest run client/src/audio/clips.test.js`
Expected: FAIL — `Cannot find module './clips.js'`.

- [ ] **Step 3: Write the implementation**

**Create `client/src/audio/clips.js`:**
```js
// Clip data helpers for the audio director (Plan 1 of 3).
// A "clip" is plain data describing ONE thing to play; slides describe clips and
// never touch AudioContext / Audio / YT.Player themselves.

const num = (v, fallback) => (Number.isFinite(v) ? v : fallback)

// Decibels -> linear gain. Used for file clips so loudness normalization can BOOST
// (gain > 1, up to +12 dB in practice), which element.volume (capped at 1) cannot.
export function dbToGain(db) {
  return Math.pow(10, num(db, 0) / 20)
}

// Validate + fill defaults. Throws on bad input so a malformed clip fails loudly
// at the call site (the director catches it and reports; it never reaches the TV).
export function normalizeClip(c) {
  if (!c || typeof c !== 'object') throw new Error('audio clip must be an object')
  const part = num(c.part, 0)
  if (c.kind === 'youtube') {
    if (!c.videoId) throw new Error('youtube clip needs a videoId')
    return {
      kind: 'youtube',
      videoId: String(c.videoId),
      start: num(c.start, 0),
      // null (never 0/undefined) so warm and claim agree on the pool key videoId:start:end
      end: Number.isFinite(c.end) && c.end > 0 ? c.end : null,
      volume: num(c.volume, 100),
      part,
    }
  }
  if (c.kind === 'file') {
    if (!c.url) throw new Error('file clip needs a url')
    return { kind: 'file', url: String(c.url), gainDb: num(c.gainDb, 0), loop: !!c.loop, start: num(c.start, 0), part }
  }
  throw new Error(`unsupported audio clip kind: ${c.kind}`)
}

// One key per distinct (slide, part, source). The director keeps at most one live
// handle per key, and reports each blocked key to Sentry once.
export function clipKey(slideId, clip) {
  return `${slideId ?? ''}|${clip.kind}|${clip.part}|${clip.videoId ?? clip.url}`
}
```

- [ ] **Step 4: Run it, confirm it passes (and counts N tests)**

Run: `npx vitest run client/src/audio/clips.test.js`
Expected: PASS, `Tests  8 passed (8)`.

- [ ] **Step 5: Mutation check**

Break each line and confirm a test fails, then restore: (a) change `end: Number.isFinite(c.end) && c.end > 0 ? c.end : null` to `end: c.end ?? 0`; (b) change `Math.pow(10, num(db, 0) / 20)` to `Math.pow(10, num(db, 0) / 10)`; (c) drop `${slideId ?? ''}` to `${slideId}`. Each must fail at least one test.

- [ ] **Step 6: Commit**

```bash
git add client/src/audio/clips.js client/src/audio/clips.test.js docs/superpowers/plans/2026-10-01-audio-director-1-foundation.md
git commit -m "feat(audio): clip data helpers for the audio director (plan 1, task 1)"
```

---

### Task 2: resolveSlideClip

**Files:**
- Create: `client/src/lib/slideClip.js`
- Create: `client/src/lib/slideClip.test.js`

**Interfaces:**
- Consumes: `resolveShinyPart`, `isAudioShiny`, `isBendleShiny` from `./shinySeries.js`; `audioPartOf`, `audioPlayPending` from `./audioPending.js`.
- Produces: `resolveSlideClip(slide): { clip, trigger } | null` where `trigger` is `'click'` or `'advance'`, and `clip` is an (un-normalized) youtube/file clip or `{kind:'bendle', songId}` (the director does not play bendle until Plan 2).

- [ ] **Step 1: Write the failing test**

**Create `client/src/lib/slideClip.test.js`:**
```js
import { describe, it, expect } from 'vitest'
import { resolveSlideClip } from './slideClip.js'
import { audioPlayPending } from './audioPending.js'

const q = (data, id = 'q1') => ({ id, type: 'question', data })
const ytSlot = (over = {}) => ({ type: 'youtube', videoId: 'vid1', start: 10, end: 40, volume: 80, ...over })

describe('resolveSlideClip: what clip does this slide have', () => {
  it('returns null for non-questions and for slides with no audio', () => {
    expect(resolveSlideClip(null)).toBeNull()
    expect(resolveSlideClip({ id: 't', type: 'title', data: {} })).toBeNull()
    expect(resolveSlideClip(q({ text: 'no audio' }))).toBeNull()
    expect(resolveSlideClip(q({ mediaUrl: '/pic.png', mediaType: 'image/png' }))).toBeNull()
  })

  it('plain question with an uploaded clip: file clip, gain from audioGainDb, click by default', () => {
    expect(resolveSlideClip(q({ mediaUrl: '/a.mp3', mediaType: 'audio/mpeg', audioGainDb: 6 }))).toEqual({
      clip: { kind: 'file', url: '/a.mp3', gainDb: 6, part: 0 },
      trigger: 'click',
    })
  })

  it('plain question with audioTrigger advance: trigger advance', () => {
    expect(resolveSlideClip(q({ mediaUrl: '/a.mp3', mediaType: 'audio/mpeg', audioTrigger: 'advance' })).trigger).toBe('advance')
  })

  it('plain question with a YouTube clip: youtube clip with start/end/volume', () => {
    expect(resolveSlideClip(q({ mediaSlots: [ytSlot()] }))).toEqual({
      clip: { kind: 'youtube', videoId: 'vid1', start: 10, end: 40, volume: 80, part: 0 },
      trigger: 'click',
    })
  })

  it('YouTube defaults: start 0, end null, volume 100', () => {
    const r = resolveSlideClip(q({ mediaSlots: [{ type: 'youtube', videoId: 'v' }] }))
    expect(r.clip).toEqual({ kind: 'youtube', videoId: 'v', start: 0, end: null, volume: 100, part: 0 })
  })

  it('shiny audio question is always click-triggered (the Next press)', () => {
    const r = resolveSlideClip(q({ isShiny: true, shinyType: 'audio', mediaSlots: [ytSlot()], audioTrigger: 'advance' }))
    expect(r.trigger).toBe('click')
  })

  it('shiny non-audio formats have no clip', () => {
    expect(resolveSlideClip(q({ isShiny: true, shinyInputSchema: { type: 'list' } }))).toBeNull()
    expect(resolveSlideClip(q({ isShiny: true, shinyType: 'visual', mediaSlots: [{ type: 'image/png', url: '/x.png' }] }))).toBeNull()
  })

  it('multi-part series: the clip is the CURRENT part, and part is its index', () => {
    const part = n => ({ text: `p${n}`, mediaSlots: [{ type: 'audio/mpeg', url: `/p${n}.mp3` }] })
    const slide = q({ isShiny: true, shinyType: 'audio', parts: [part(0), part(1), part(2)], currentPart: 1 })
    expect(resolveSlideClip(slide)).toEqual({ clip: { kind: 'file', url: '/p1.mp3', gainDb: 0, part: 1 }, trigger: 'click' })
  })

  it('a series part with no clip of its own resolves to null', () => {
    const slide = q({ isShiny: true, shinyType: 'audio', parts: [{ mediaSlots: [{ type: 'audio/mpeg', url: '/p0.mp3' }] }, { text: 'silent' }], currentPart: 1 })
    expect(resolveSlideClip(slide)).toBeNull()
  })

  it('Bendle: described as a bendle clip keyed by song id, click-triggered', () => {
    expect(resolveSlideClip(q({ isShiny: true, shinyInputSchema: { type: 'bendle' }, bendleSongId: 'song9' }))).toEqual({
      clip: { kind: 'bendle', songId: 'song9' },
      trigger: 'click',
    })
  })
})

// The director's future gate and today's audioPlayPending must never disagree about
// whether a slide has sound. Until Plan 2 swaps one for the other, this agreement
// test is the guard: "pending with no mark" === "has a clip whose trigger is click".
describe('agreement with audioPlayPending', () => {
  const part = n => ({ mediaSlots: [{ type: 'audio/mpeg', url: `/p${n}.mp3` }] })
  const matrix = {
    'plain mp3, click': q({ mediaUrl: '/a.mp3', mediaType: 'audio/mpeg' }),
    'plain mp3, advance': q({ mediaUrl: '/a.mp3', mediaType: 'audio/mpeg', audioTrigger: 'advance' }),
    'plain youtube': q({ mediaSlots: [ytSlot()] }),
    'plain, no audio': q({ text: 'x' }),
    'plain image': q({ mediaUrl: '/p.png', mediaType: 'image/png' }),
    'shiny audio youtube': q({ isShiny: true, shinyType: 'audio', mediaSlots: [ytSlot()] }),
    'shiny audio upload': q({ isShiny: true, shinyType: 'audio', mediaUrl: '/a.mp3', mediaType: 'audio/mpeg' }),
    'shiny list': q({ isShiny: true, shinyInputSchema: { type: 'list' } }),
    'shiny visual': q({ isShiny: true, shinyType: 'visual', mediaSlots: [{ type: 'image/png', url: '/x.png' }] }),
    'series part 0': q({ isShiny: true, shinyType: 'audio', parts: [part(0), part(1)], currentPart: 0 }),
    'series silent part': q({ isShiny: true, shinyType: 'audio', parts: [part(0), { text: 's' }], currentPart: 1 }),
    bendle: q({ isShiny: true, shinyInputSchema: { type: 'bendle' }, bendleSongId: 's' }),
    'title slide': { id: 't', type: 'title', data: {} },
  }

  for (const [name, slide] of Object.entries(matrix)) {
    it(`${name}: pending-with-no-mark matches "has a click clip"`, () => {
      const r = resolveSlideClip(slide)
      expect(audioPlayPending(slide, null)).toBe(!!r && r.trigger === 'click')
    })
    it(`${name}: a mark naming this slide is never pending`, () => {
      expect(audioPlayPending(slide, { slideId: slide.id, playing: true })).toBe(false)
    })
  }
})
```

- [ ] **Step 2: Run it, confirm it fails because the module is missing**

Run: `npx vitest run client/src/lib/slideClip.test.js`
Expected: FAIL — `Cannot find module './slideClip.js'`.

- [ ] **Step 3: Write the implementation**

**Create `client/src/lib/slideClip.js`:**
```js
// resolveSlideClip — the ONE function that answers "what clip does this slide have
// and what starts it?" (audio pipeline spec, 2026-10-01). It replaces the private
// copies of that logic scattered across LiveMode (audioPlayPending), QuestionSlide
// (hasAudio checks) and the shiny part resolvers. Host and TV can no longer disagree
// about whether a slide has sound, because both ask here.
//
// Returns { clip, trigger } or null.
//   trigger 'click'   — starts when the host's Next press writes the audio_playing mark
//   trigger 'advance' — starts as soon as the slide goes live (plain questions with
//                       data.audioTrigger === 'advance')
// clip is a description only; the director normalizes and plays it. A Bendle clip is
// described here but the director does not play it until Plan 2.
import { resolveShinyPart, isAudioShiny, isBendleShiny } from './shinySeries.js'
import { audioPartOf } from './audioPending.js'

const isAudioMime = type => String(type ?? '').startsWith('audio')

export function resolveSlideClip(slide) {
  if (!slide || slide.type !== 'question') return null
  const data = slide.data ?? {}

  // Bendle's audio is a stem mix keyed by song id, not a mediaUrl.
  if (isBendleShiny(data)) return { clip: { kind: 'bendle', songId: data.bendleSongId ?? null }, trigger: 'click' }

  let trigger = 'click'
  if (data.isShiny) {
    // Shiny audio is always started by the Next press; other shiny formats have no clip here.
    if (!isAudioShiny(data)) return null
  } else if ((data.audioTrigger ?? 'click') !== 'click') {
    trigger = 'advance'
  }

  const part = resolveShinyPart(data)
  const partIdx = audioPartOf(data)

  if (part.youtubeId) {
    return {
      clip: {
        kind: 'youtube',
        videoId: part.youtubeId,
        start: part.youtubeStart ?? 0,
        end: part.youtubeEnd ?? null,
        volume: part.volume ?? 100,
        part: partIdx,
      },
      trigger,
    }
  }
  if (part.mediaUrl && isAudioMime(part.mediaType)) {
    return { clip: { kind: 'file', url: part.mediaUrl, gainDb: data.audioGainDb ?? 0, part: partIdx }, trigger }
  }
  return null
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `npx vitest run client/src/lib/slideClip.test.js`
Expected: PASS (10 behavior tests + 26 agreement tests = 36).

- [ ] **Step 5: Mutation check**

(a) make shiny audio return `trigger: 'advance'`; (b) drop the `isAudioShiny` guard; (c) make `end: part.youtubeEnd ?? 0`; (d) drop `audioGainDb`. Each must fail a test; restore.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/slideClip.js client/src/lib/slideClip.test.js
git commit -m "feat(audio): resolveSlideClip — one answer to what clip a slide has (plan 1, task 2)"
```

---

### Task 3: Director core — status, unlock, subscribe, preview, test fakes

**Files:**
- Create: `client/src/audio/director.fakes.js`
- Create: `client/src/audio/director.js`
- Create: `client/src/audio/director.test.js`

**Interfaces:**
- Consumes: `normalizeClip`, `dbToGain`, `clipKey` (Task 1); `youtubeIsSounding`, `mediaIsSounding` from `../lib/audioBlocked.js`; `warmYoutubeAudio`, `claimYoutubeAudio` from `../lib/youtubeWarmAudio.js`; `@sentry/react`.
- Produces (stable API Plans 2 and 3 build on):
  - `createDirector(overrides?: Partial<Deps>): Director`, and the singleton `director`.
  - `Director`: `status(): 'locked'|'unlocked'`; `unlock(): void` (call from a user gesture); `installGestureUnlock(target?: EventTarget): () => void`; `subscribe(cb): () => void`; `getSnapshot(): {status, blocked: Array<{key, slideId, kind, part, reason}>}`; `setPreview(on:boolean): void`; `warm(clip): void`; `play(clip, {slideId}): Handle`; `retryBlocked(): void`.
  - `Handle`: `{key, slideId, clip, state, reason, onEnded(cb), stop(), retry()}` with `state` one of `'pending'|'playing'|'blocked'|'ended'|'stopped'|'preview'`.
  - `Deps`: `makeContext()`, `makeElement()`, `youtube:{warm,claim}`, `hasUserActivation()`, `setTimer(fn,ms)`, `clearTimer(id)`, `now()`, `breadcrumb(message,data)`, `event(level,message,extra)`.

Because `play()` is large, this task creates the whole `director.js` file with `play` stubbed to throw `not implemented`; Tasks 4–6 add file playback, YouTube playback and blocked handling with their own tests. Within this task only status/unlock/subscribe/preview are tested.

- [ ] **Step 1: Create the test fakes (used by every director test)**

**Create `client/src/audio/director.fakes.js`:**
```js
// Test-only fakes for the audio director. Not imported by app code.
import { vi } from 'vitest'

// A Web Audio context whose state the test controls. resumeMode:
//   'ok'     resume() settles and the context becomes 'running'
//   'hang'   resume() NEVER settles (what Chrome does with no user gesture)
//   'reject' resume() rejects
export class FakeContext {
  constructor(state = 'suspended') {
    this.state = state
    this.destination = { name: 'destination' }
    this.listeners = new Set()
    this.resumeCalls = 0
    this.resumeMode = 'ok'
    this.gains = []
    this.sources = []
  }
  addEventListener(type, cb) { if (type === 'statechange') this.listeners.add(cb) }
  removeEventListener(type, cb) { this.listeners.delete(cb) }
  _set(state) { this.state = state; this.listeners.forEach(cb => cb()) }
  createGain() {
    const g = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }
    this.gains.push(g)
    return g
  }
  createMediaElementSource(el) {
    const s = { el, connect: vi.fn(), disconnect: vi.fn() }
    this.sources.push(s)
    return s
  }
  resume() {
    this.resumeCalls++
    if (this.resumeMode === 'hang') return new Promise(() => {})
    if (this.resumeMode === 'reject') return Promise.reject(new Error('resume refused'))
    this._set('running')
    return Promise.resolve()
  }
}

// An <audio> element. playMode: 'ok' | 'reject' (NotAllowedError) | 'hang' | 'throw'.
export class FakeElement {
  constructor() {
    this.paused = true
    this.ended = false
    this.currentTime = 0
    this.loop = false
    this.src = ''
    this.preload = ''
    this.volume = 1
    this.playMode = 'ok'
    this.playCalls = 0
    this.listeners = {}
  }
  addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb) }
  removeAttribute(name) { if (name === 'src') this.src = '' }
  emit(type) { (this.listeners[type] || []).forEach(cb => cb()) }
  play() {
    this.playCalls++
    if (this.playMode === 'throw') throw new Error('play threw')
    if (this.playMode === 'reject') return Promise.reject(new DOMException('blocked', 'NotAllowedError'))
    if (this.playMode === 'hang') return new Promise(() => {})
    this.paused = false
    return Promise.resolve()
  }
  pause() { this.paused = true }
}

// A fake lib/youtubeWarmAudio.js. `yt.state` / `yt.muted` drive what every claimed
// player reports; set yt.neverReady = true to model a YouTube API that never loads.
export function fakeYoutube({ state = 1, muted = false } = {}) {
  const yt = { state, muted, neverReady: false, claims: [] }
  yt.warm = vi.fn()
  yt.claim = vi.fn((videoId, start, end) => {
    const player = {
      setVolume: vi.fn(),
      unMute: vi.fn(),
      seekTo: vi.fn(),
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      getPlayerState: () => yt.state,
      isMuted: () => yt.muted,
    }
    const h = {
      videoId, start, end, player, destroyed: false, readyCbs: [], stateCb: null,
      whenReady(cb) { if (yt.neverReady) this.readyCbs.push(cb); else cb(player) },
      onStateChange(cb) { this.stateCb = cb },
      destroy() { this.destroyed = true },
    }
    yt.claims.push(h)
    return h
  })
  return yt
}

// A complete deps object plus handles the test can poke. Timers stay real so
// vi.useFakeTimers() controls them.
export function makeFakes({ ctx = new FakeContext('suspended'), activation = false, youtube = fakeYoutube() } = {}) {
  const f = {
    ctx,
    elements: [],
    youtube,
    activation,
    breadcrumbs: [],
    events: [],
  }
  f.deps = {
    makeContext: vi.fn(() => f.ctx),
    makeElement: vi.fn(() => { const el = new FakeElement(); f.elements.push(el); return el }),
    youtube: f.youtube,
    hasUserActivation: () => f.activation,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: id => clearTimeout(id),
    now: () => Date.now(),
    breadcrumb: vi.fn((message, data) => { f.breadcrumbs.push({ message, data }) }),
    event: vi.fn((level, message, extra) => { f.events.push({ level, message, extra }) }),
  }
  return f
}
```

- [ ] **Step 2: Write the failing tests for status, unlock, subscribe, preview**

**Create `client/src/audio/director.test.js`:**
```js
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('../lib/youtubeWarmAudio.js', () => ({ warmYoutubeAudio: vi.fn(), claimYoutubeAudio: vi.fn() }))

import { createDirector } from './director.js'
import { FakeContext, makeFakes } from './director.fakes.js'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const flush = async () => { await Promise.resolve(); await Promise.resolve() }

describe('director status and unlock', () => {
  it('is locked with no context and no user activation', () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    expect(d.status()).toBe('locked')
    expect(d.getSnapshot()).toEqual({ status: 'locked', blocked: [] })
  })

  it('is unlocked with no context when the page already has user activation', () => {
    const f = makeFakes({ activation: true })
    expect(createDirector(f.deps).status()).toBe('unlocked')
  })

  it('unlock() creates the shared context, resumes it, and becomes unlocked', async () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    d.unlock()
    await flush()
    expect(f.deps.makeContext).toHaveBeenCalledTimes(1)
    expect(f.ctx.resumeCalls).toBe(1)
    expect(d.status()).toBe('unlocked')
  })

  it('reuses ONE context for every use (shared across the whole tab)', () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    d.unlock()
    d.unlock()
    expect(f.deps.makeContext).toHaveBeenCalledTimes(1)
  })

  it('a context that stays suspended means locked, whatever else is true', () => {
    const f = makeFakes({ activation: true })
    const d = createDirector(f.deps)
    f.ctx.resumeMode = 'hang'
    d.unlock()
    expect(d.status()).toBe('locked')
  })

  it('a resume() that NEVER settles does not throw or wedge; a later statechange unlocks and notifies', async () => {
    const f = makeFakes()
    f.ctx.resumeMode = 'hang'
    const d = createDirector(f.deps)
    const seen = []
    d.subscribe(() => seen.push(d.getSnapshot().status))
    expect(() => d.unlock()).not.toThrow()
    await flush()
    expect(d.status()).toBe('locked')
    f.ctx._set('running') // the user finally clicked and Chrome let it start
    expect(d.status()).toBe('unlocked')
    expect(seen).toContain('unlocked')
  })

  it('a rejected resume() does not throw', async () => {
    const f = makeFakes()
    f.ctx.resumeMode = 'reject'
    const d = createDirector(f.deps)
    expect(() => d.unlock()).not.toThrow()
    await flush()
    expect(d.status()).toBe('locked')
  })

  it('works when there is no AudioContext at all (makeContext returns null)', () => {
    const f = makeFakes({ ctx: null })
    f.deps.makeContext = vi.fn(() => null)
    const d = createDirector(f.deps)
    expect(() => d.unlock()).not.toThrow()
    expect(d.status()).toBe('unlocked') // a gesture happened; there is simply no graph to wait for
  })
})

describe('director subscribe / snapshot', () => {
  it('notifies subscribers on status change and stops after unsubscribe', () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    const cb = vi.fn()
    const off = d.subscribe(cb)
    d.unlock()
    expect(cb).toHaveBeenCalled()
    cb.mockClear()
    off()
    f.ctx._set('suspended')
    expect(cb).not.toHaveBeenCalled()
  })

  it('keeps the SAME snapshot object when nothing changed (React re-renders on identity)', () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    const a = d.getSnapshot()
    d.unlock() // ctx running -> changes
    const b = d.getSnapshot()
    expect(b).not.toBe(a)
    d.unlock() // nothing changes
    expect(d.getSnapshot()).toBe(b)
  })

  it('a throwing subscriber never breaks the director or other subscribers', () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    const ok = vi.fn()
    d.subscribe(() => { throw new Error('bad subscriber') })
    d.subscribe(ok)
    expect(() => d.unlock()).not.toThrow()
    expect(ok).toHaveBeenCalled()
  })
})

describe('installGestureUnlock', () => {
  it('unlocks on the first real gesture and returns an uninstaller', () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    const target = new EventTarget()
    const off = d.installGestureUnlock(target)
    expect(d.status()).toBe('locked')
    target.dispatchEvent(new Event('pointerdown'))
    expect(f.ctx.resumeCalls).toBe(1)
    expect(d.status()).toBe('unlocked')
    off()
    f.ctx._set('suspended')
    target.dispatchEvent(new Event('keydown'))
    expect(f.ctx.resumeCalls).toBe(1) // uninstalled: no second unlock
  })

  it('also listens for keydown and click', () => {
    for (const type of ['keydown', 'click']) {
      const f = makeFakes()
      const d = createDirector(f.deps)
      const target = new EventTarget()
      d.installGestureUnlock(target)
      target.dispatchEvent(new Event(type))
      expect(f.ctx.resumeCalls).toBe(1)
    }
  })
})

describe('preview mode', () => {
  it('play() in preview returns a no-op handle: no context, no element, no claim, no breadcrumb', () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    d.setPreview(true)
    const h = d.play({ kind: 'file', url: '/a.mp3' }, { slideId: 's1' })
    expect(h.state).toBe('preview')
    expect(() => { h.stop(); h.retry(); h.onEnded(() => {}) }).not.toThrow()
    expect(f.deps.makeContext).not.toHaveBeenCalled()
    expect(f.deps.makeElement).not.toHaveBeenCalled()
    expect(f.deps.breadcrumb).not.toHaveBeenCalled()
    expect(d.getSnapshot().blocked).toEqual([])
  })

  it('warm() is a no-op in preview', () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    d.setPreview(true)
    d.warm({ kind: 'youtube', videoId: 'v' })
    expect(f.youtube.warm).not.toHaveBeenCalled()
  })

  it('leaving preview makes play() live again', () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    d.setPreview(true)
    d.setPreview(false)
    expect(d.play({ kind: 'file', url: '/a.mp3' }, { slideId: 's1' }).state).not.toBe('preview')
  })
})
```

- [ ] **Step 3: Run the tests, confirm they fail because the module is missing**

Run: `npx vitest run client/src/audio/director.test.js`
Expected: FAIL — `Cannot find module './director.js'`. (The `leaving preview` test needs `play`, which Task 3 stubs; it will fail with `not implemented` until Task 4 — that is expected and listed below.)

- [ ] **Step 4: Write the director core**

**Create `client/src/audio/director.js`:**
```js
// The audio director (Plan 1 of 3; spec: docs/superpowers/specs/2026-09-29-audio-pipeline-design.md).
//
// ONE module owns playback on /display. Slides describe a clip and never touch
// AudioContext, Audio, or YT.Player themselves. Every step is reported (Sentry
// breadcrumbs; one Sentry event per blocked clip) because the 2026-09-29 "Next did
// not start sound" night left no signal at all.
//
// Everything external is injected (see `Deps`) so the whole thing is tested with
// fakes. The director NEVER throws into the show: external calls are guarded and a
// failure becomes a report, not an exception.
//
// Hard-won facts baked in (found in real Chromium, 2026-10-01):
//  - With no user gesture AudioContext.resume() NEVER SETTLES (no rejection), and
//    play() can hang before it throws. So the "is it really sounding?" check starts
//    AT THE REQUEST, never after play() resolves.
//  - A blocked clip is re-checked every second; a slow start that finally sounds
//    clears itself.
import * as Sentry from '@sentry/react'
import { normalizeClip, dbToGain, clipKey } from './clips.js'
import { youtubeIsSounding, mediaIsSounding } from '../lib/audioBlocked.js'
import { warmYoutubeAudio, claimYoutubeAudio } from '../lib/youtubeWarmAudio.js'

export const SOUND_CHECK_MS = 2000 // a clip asked to play must be sounding by now
export const BLOCKED_RECHECK_MS = 1000 // while blocked, keep looking

function browserDeps() {
  return {
    makeContext: () => {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext
      return Ctor ? new Ctor() : null
    },
    makeElement: () => new Audio(),
    youtube: { warm: warmYoutubeAudio, claim: claimYoutubeAudio },
    hasUserActivation: () => !!globalThis.navigator?.userActivation?.hasBeenActive,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: id => clearTimeout(id),
    now: () => Date.now(),
    breadcrumb: (message, data) => {
      try { Sentry.addBreadcrumb({ category: 'audio', message, data, level: 'info' }) } catch { /* never break the show */ }
    },
    event: (level, message, extra) => {
      try { Sentry.captureMessage(message, { level, tags: { area: 'audio' }, extra }) } catch { /* never break the show */ }
    },
  }
}

const safe = (fn, ...args) => {
  try { return fn(...args) } catch { return undefined }
}

export function createDirector(overrides = {}) {
  const d = { ...browserDeps(), ...overrides }
  let ctx = null
  let gestureSeen = false
  let preview = false
  const listeners = new Set()
  const handles = new Map() // clipKey -> live handle
  const reported = new Set() // clipKeys already sent to Sentry
  let snapshot = { status: 'locked', blocked: [] }

  function status() {
    if (ctx) return ctx.state === 'running' ? 'unlocked' : 'locked'
    return gestureSeen || d.hasUserActivation() ? 'unlocked' : 'locked'
  }

  const sameBlocked = (a, b) => a.length === b.length && a.every((x, i) => x.key === b[i].key && x.reason === b[i].reason)

  function emit() {
    const blocked = [...handles.values()]
      .filter(h => h.state === 'blocked')
      .map(h => ({ key: h.key, slideId: h.slideId, kind: h.clip.kind, part: h.clip.part, reason: h.reason }))
    const next = { status: status(), blocked }
    if (next.status === snapshot.status && sameBlocked(next.blocked, snapshot.blocked)) return
    snapshot = next
    listeners.forEach(l => safe(l))
  }

  function ensureContext() {
    if (!ctx) {
      ctx = safe(d.makeContext) ?? null
      if (ctx) safe(() => ctx.addEventListener?.('statechange', emit))
    }
    return ctx
  }

  // Call from a real user gesture. Never awaits: without a gesture resume() hangs
  // forever, and the statechange event (or the then below) is what reports success.
  function unlock() {
    gestureSeen = true
    const c = ensureContext()
    if (c) {
      const p = safe(() => c.resume())
      p?.then?.(emit, emit)
    }
    emit()
  }

  function installGestureUnlock(target = globalThis.window) {
    if (!target?.addEventListener) return () => {}
    const events = ['pointerdown', 'keydown', 'click']
    const handler = () => unlock()
    events.forEach(e => target.addEventListener(e, handler, true))
    return () => events.forEach(e => target.removeEventListener(e, handler, true))
  }

  function subscribe(cb) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }

  function setPreview(on) {
    preview = !!on
  }

  function warm(rawClip) {
    if (preview) return
    const clip = safe(() => normalizeClip(rawClip))
    if (clip?.kind === 'youtube') safe(d.youtube.warm, clip.videoId, clip.start, clip.end)
  }

  function previewHandle(clip, slideId) {
    return { key: clipKey(slideId, clip), slideId, clip, state: 'preview', reason: null, onEnded() {}, stop() {}, retry() {} }
  }

  function play(/* rawClip, { slideId } */) {
    throw new Error('director.play is implemented in Plan 1, Task 4')
  }

  function retryBlocked() {
    unlock()
    for (const h of [...handles.values()]) if (h.state === 'blocked') h.retry()
  }

  snapshot = { status: status(), blocked: [] }

  return {
    status, unlock, installGestureUnlock, subscribe, getSnapshot: () => snapshot,
    setPreview, warm, play, retryBlocked,
    // internals shared with later tasks in this file
    _internals: { d, handles, reported, emit, ensureContext, previewHandle, isPreview: () => preview, dbToGain, mediaIsSounding, youtubeIsSounding },
  }
}

export const director = createDirector()
```

- [ ] **Step 5: Run the tests, confirm status/unlock/subscribe/preview pass**

Run: `npx vitest run client/src/audio/director.test.js`
Expected: all pass EXCEPT `leaving preview makes play() live again` (needs `play`, Task 4). Report `Tests  17 passed | 1 failed (18)`.

- [ ] **Step 6: Mutation check**

(a) make `status()` return `'unlocked'` when `ctx.state === 'suspended'`; (b) make `unlock()` `await` the resume promise (wrap in `async`/`await c.resume()`) and confirm the "NEVER settles" test fails or hangs; (c) drop the `sameBlocked`/status identity check in `emit`. Each must fail; restore.

- [ ] **Step 7: Commit**

```bash
git add client/src/audio/director.js client/src/audio/director.fakes.js client/src/audio/director.test.js
git commit -m "feat(audio): director core — shared context, unlock, subscribe, preview (plan 1, task 3)"
```

---

### Task 4: Director plays file clips

**Files:**
- Modify: `client/src/audio/director.js` (replace the stubbed `play`, add handle machinery and `startFile`)
- Modify: `client/src/audio/director.test.js` (append tests)

**Interfaces:**
- Consumes: Task 3's `createDirector` and `_internals`.
- Produces: `director.play(clip, {slideId})` for `kind:'file'` returning a `Handle` (see Task 3); `handle.onEnded`, `handle.stop`, `handle.retry`; blocked/playing state machine used by Task 5 (YouTube) and Task 6.

- [ ] **Step 1: Append the failing tests**

**Append to `client/src/audio/director.test.js`:**
```js
describe('director plays file clips', () => {
  const clip = { kind: 'file', url: '/a.mp3', gainDb: 6, start: 0 }
  // Make every element the director creates start in a given play mode.
  const withPlayMode = (f, mode) => {
    const orig = f.deps.makeElement.getMockImplementation()
    f.deps.makeElement.mockImplementation(() => { const el = orig(); el.playMode = mode; return el })
  }

  it('routes the element through the shared context with dB gain and starts playing', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    await flush()
    const el = f.elements[0]
    expect(el.src).toBe('/a.mp3')
    expect(el.playCalls).toBe(1)
    expect(f.ctx.sources[0].el).toBe(el)
    expect(f.ctx.gains[0].gain.value).toBeCloseTo(1.9953, 3)
    expect(f.ctx.gains[0].connect).toHaveBeenCalledWith(f.ctx.destination)
    expect(h.state).toBe('playing')
  })

  it('reports requested then started with the elapsed ms (breadcrumbs, no Sentry event)', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    d.play(clip, { slideId: 's1' })
    await flush()
    expect(f.breadcrumbs.map(b => b.message)).toEqual(['audio requested', 'audio started'])
    expect(f.breadcrumbs[0].data).toMatchObject({ kind: 'file', slideId: 's1', part: 0 })
    expect(f.breadcrumbs[1].data).toMatchObject({ kind: 'file', slideId: 's1', afterBlock: false })
    expect(f.events).toEqual([])
  })

  it('honors start offset and loop', () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    d.play({ kind: 'file', url: '/theme.mp3', start: 181, loop: true }, { slideId: 's1' })
    expect(f.elements[0].currentTime).toBe(181)
    expect(f.elements[0].loop).toBe(true)
  })

  it('a rejected play() (NotAllowedError) is blocked with reason not-allowed and reported ONCE', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    withPlayMode(f, 'reject')
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    await flush()
    expect(h.state).toBe('blocked')
    expect(h.reason).toBe('not-allowed')
    expect(d.getSnapshot().blocked).toEqual([{ key: h.key, slideId: 's1', kind: 'file', part: 0, reason: 'not-allowed' }])
    expect(f.events).toHaveLength(1)
    expect(f.events[0]).toMatchObject({ level: 'warning', message: 'audio: play blocked (file)' })
    expect(f.events[0].extra).toMatchObject({ slideId: 's1', part: 0, reason: 'not-allowed' })
    // the same clip blocked again does not send a second Sentry event
    d.play(clip, { slideId: 's1' })
    await flush()
    expect(f.events).toHaveLength(1)
  })

  it('a play() that throws synchronously is blocked with reason play-threw', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    withPlayMode(f, 'throw')
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    expect(h.state).toBe('blocked')
    expect(h.reason).toBe('play-threw')
  })

  it('a suspended context whose resume() hangs: blocked "not-sounding" after 2s (the check starts at the request)', async () => {
    const f = makeFakes({ ctx: new FakeContext('suspended') })
    f.ctx.resumeMode = 'hang'
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    await flush()
    expect(f.elements[0].playCalls).toBe(1) // play() IS called; it just cannot be heard
    expect(h.state).toBe('pending')
    vi.advanceTimersByTime(1999)
    expect(h.state).toBe('pending')
    vi.advanceTimersByTime(1)
    expect(h.state).toBe('blocked')
    expect(h.reason).toBe('not-sounding')
  })

  it('while blocked it keeps re-checking: a slow start that finally sounds clears itself', async () => {
    const f = makeFakes({ ctx: new FakeContext('suspended') })
    f.ctx.resumeMode = 'hang'
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    await flush()
    vi.advanceTimersByTime(2000)
    expect(h.state).toBe('blocked')
    f.ctx._set('running') // the user clicked; the element is already playing
    vi.advanceTimersByTime(1000)
    expect(h.state).toBe('playing')
    expect(d.getSnapshot().blocked).toEqual([])
    expect(f.breadcrumbs.at(-1)).toMatchObject({ message: 'audio started', data: { afterBlock: true } })
  })

  it('retryBlocked(): unlocks (a gesture), replays, and the clip plays', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    withPlayMode(f, 'reject')
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    await flush()
    expect(h.state).toBe('blocked')
    f.elements[0].playMode = 'ok' // the click made playback allowed
    d.retryBlocked()
    expect(h.state).toBe('pending') // cleared while retrying
    expect(d.getSnapshot().blocked).toEqual([])
    await flush()
    expect(f.elements[0].playCalls).toBe(2)
    expect(h.state).toBe('playing')
  })

  it('a retry that is STILL silent raises the block again (not a silent second failure)', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    withPlayMode(f, 'reject')
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    await flush()
    d.retryBlocked()
    await flush()
    expect(h.state).toBe('blocked')
    expect(f.events).toHaveLength(1) // still one Sentry event for this clip
  })

  it("emits the element's ended event to onEnded exactly once and releases the clip", async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    await flush()
    const onEnded = vi.fn()
    h.onEnded(onEnded)
    f.elements[0].emit('ended')
    f.elements[0].emit('ended')
    expect(onEnded).toHaveBeenCalledTimes(1)
    expect(h.state).toBe('ended')
  })

  it('stop() pauses the element, disconnects the graph, and cancels the sound check', async () => {
    const f = makeFakes({ ctx: new FakeContext('suspended') })
    f.ctx.resumeMode = 'hang'
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    h.stop()
    expect(h.state).toBe('stopped')
    expect(f.elements[0].paused).toBe(true)
    expect(f.ctx.sources[0].disconnect).toHaveBeenCalled()
    vi.advanceTimersByTime(5000) // the 2s check must not fire for a stopped clip
    expect(f.events).toEqual([])
    expect(h.state).toBe('stopped')
  })

  it('playing the same slide+part again stops the earlier handle (one live handle per clip)', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    const first = d.play(clip, { slideId: 's1' })
    const second = d.play(clip, { slideId: 's1' })
    expect(first.state).toBe('stopped')
    expect(second.state).not.toBe('stopped')
  })

  it('with no AudioContext at all, plays through the element with a capped volume', async () => {
    const f = makeFakes({ ctx: null })
    f.deps.makeContext = vi.fn(() => null)
    const d = createDirector(f.deps)
    const h = d.play({ kind: 'file', url: '/a.mp3', gainDb: 12 }, { slideId: 's1' })
    await flush()
    expect(f.elements[0].volume).toBe(1) // 12 dB would be 3.98: capped at 1
    expect(f.elements[0].playCalls).toBe(1)
    expect(h.state).toBe('playing')
  })

  it('a bad clip throws a clear error to the caller (it never reaches the TV)', () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    expect(() => d.play({ kind: 'bendle', songId: 's' }, { slideId: 's1' })).toThrow(/unsupported audio clip kind: bendle/)
    expect(() => d.play({ kind: 'file' }, { slideId: 's1' })).toThrow(/url/)
  })
})
```

- [ ] **Step 2: Run the tests, confirm the new ones fail because `play` is a stub**

Run: `npx vitest run client/src/audio/director.test.js`
Expected: the file-clip tests FAIL with `director.play is implemented in Plan 1, Task 4`.

- [ ] **Step 3: Implement handle machinery and `startFile`**

**In `client/src/audio/director.js`, replace the stub**
```js
  function play(/* rawClip, { slideId } */) {
    throw new Error('director.play is implemented in Plan 1, Task 4')
  }
```
**with:**
```js
  // One handle per playing clip. `ctl` is the private control surface the start
  // functions use; callers only ever see the handle.
  function createHandle(clip, slideId) {
    const key = clipKey(slideId, clip)
    const t0 = d.now()
    let state = 'pending'
    let reason = null
    let watch = null
    let poll = null
    let checkFn = () => false
    let stopImpl = () => {}
    let retryImpl = () => {}
    let onEndedImpl = () => {} // runs only on a NATURAL end (not on stop()), e.g. re-warm for an instant replay
    const endedCbs = []
    const done = () => state === 'stopped' || state === 'ended'
    const stopTimers = () => {
      if (watch != null) d.clearTimer(watch)
      if (poll != null) d.clearTimer(poll)
      watch = null
      poll = null
    }

    const handle = {
      key, slideId, clip,
      get state() { return state },
      get reason() { return reason },
      onEnded(cb) { endedCbs.push(cb) },
      stop() {
        if (done()) return
        state = 'stopped'
        stopTimers()
        safe(stopImpl)
        handles.delete(key)
        emit()
      },
      // From the "Click for sound" button (a real gesture): clear the block and try again.
      retry() {
        if (done()) return
        if (state === 'blocked') {
          state = 'pending'
          reason = null
          emit()
        }
        safe(retryImpl)
      },
    }

    function reportBlockedOnce() {
      d.breadcrumb('audio blocked', { kind: clip.kind, slideId, part: clip.part, reason })
      if (reported.has(key)) return
      reported.add(key)
      d.event('warning', `audio: play blocked (${clip.kind})`, { slideId, part: clip.part, reason })
    }

    function startPoll() {
      const tick = () => {
        poll = null
        if (state !== 'blocked') return
        if (safe(checkFn)) { ctl.playing(); return }
        poll = d.setTimer(tick, BLOCKED_RECHECK_MS)
      }
      poll = d.setTimer(tick, BLOCKED_RECHECK_MS)
    }

    const ctl = {
      setStop(fn) { stopImpl = fn },
      setRetry(fn) { retryImpl = fn },
      setOnEnded(fn) { onEndedImpl = fn },
      // Start (or restart) the 2s "is it really sounding?" check. Call BEFORE anything
      // that can hang (resume(), play()).
      arm(check) {
        checkFn = check
        stopTimers()
        watch = d.setTimer(() => {
          watch = null
          if (done()) return
          if (safe(checkFn)) ctl.playing()
          else ctl.block('not-sounding')
        }, SOUND_CHECK_MS)
      },
      playing() {
        if (done() || state === 'playing') return
        const afterBlock = state === 'blocked'
        state = 'playing'
        reason = null
        stopTimers()
        d.breadcrumb('audio started', { kind: clip.kind, slideId, part: clip.part, ms: d.now() - t0, afterBlock })
        emit()
      },
      block(why) {
        if (done() || state === 'blocked') return
        state = 'blocked'
        reason = why
        if (watch != null) { d.clearTimer(watch); watch = null }
        reportBlockedOnce()
        startPoll()
        emit()
      },
      ended() {
        if (done()) return
        state = 'ended'
        stopTimers()
        safe(stopImpl)
        safe(onEndedImpl)
        endedCbs.forEach(cb => safe(cb))
        handles.delete(key)
        emit()
      },
    }
    return { handle, ctl }
  }

  // Uploaded file: an <audio> routed through a GainNode on the SHARED context, so
  // loudness normalization can boost (gain > 1) and one context serves the whole tab.
  function startFile(clip, ctl) {
    const c = ensureContext()
    const el = d.makeElement()
    el.preload = 'auto'
    el.loop = clip.loop
    el.src = clip.url
    let src = null
    if (c) {
      try {
        src = c.createMediaElementSource(el)
        const gain = c.createGain()
        gain.gain.value = dbToGain(clip.gainDb)
        src.connect(gain)
        gain.connect(c.destination)
      } catch { src = null }
    }
    // No context (or the graph failed): fall back to the element's own volume, which cannot boost.
    if (!src) el.volume = Math.min(1, dbToGain(clip.gainDb))
    if (clip.start) el.currentTime = clip.start
    el.addEventListener('ended', () => ctl.ended())

    const check = () => mediaIsSounding(el, c)
    const go = () => {
      ctl.arm(check) // FIRST: resume() and play() can each hang forever without a gesture
      if (c && c.state !== 'running') safe(() => c.resume()?.catch?.(() => {}))
      let p
      try { p = el.play() } catch { ctl.block('play-threw'); return }
      p?.then?.(
        () => { if (!c || c.state === 'running') ctl.playing() },
        err => ctl.block(err?.name === 'NotAllowedError' ? 'not-allowed' : 'play-rejected'),
      )
    }
    ctl.setRetry(() => { unlock(); go() })
    ctl.setStop(() => {
      safe(() => el.pause())
      safe(() => src?.disconnect())
      safe(() => el.removeAttribute?.('src'))
    })
    go()
  }

  function play(rawClip, { slideId = null } = {}) {
    const clip = normalizeClip(rawClip) // a malformed clip throws to the CALLER, never into the show
    if (preview) return previewHandle(clip, slideId)
    handles.get(clipKey(slideId, clip))?.stop()
    const { handle, ctl } = createHandle(clip, slideId)
    handles.set(handle.key, handle)
    d.breadcrumb('audio requested', { kind: clip.kind, slideId, part: clip.part })
    try {
      if (clip.kind === 'youtube') startYoutube(clip, ctl)
      else startFile(clip, ctl)
    } catch {
      ctl.block('start-threw')
    }
    emit()
    return handle
  }

  // Replaced in Task 5.
  function startYoutube(/* clip, ctl */) {
    throw new Error('youtube playback is implemented in Plan 1, Task 5')
  }
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx vitest run client/src/audio/director.test.js`
Expected: PASS — `Tests  32 passed (32)` (Task 3's 18 + 14 here; the preview-leaving test now passes).

- [ ] **Step 5: Mutation check**

(a) in `startFile` move `ctl.arm(check)` to AFTER `el.play()`'s `.then` — the hang test must fail; (b) delete `reported.has(key)` guard — the once-only test must fail; (c) in `retry()` drop the `state = 'pending'` reset — the "STILL silent" test must fail; (d) change `Math.min(1, …)` to no cap — the no-context test must fail; (e) drop `handles.get(...)?.stop()` — the one-live-handle test must fail. Restore each.

- [ ] **Step 6: Commit**

```bash
git add client/src/audio/director.js client/src/audio/director.test.js
git commit -m "feat(audio): director plays file clips with blocked detection and retry (plan 1, task 4)"
```

---

### Task 5: Director plays YouTube clips

**Files:**
- Modify: `client/src/audio/director.js` (replace the `startYoutube` stub)
- Modify: `client/src/audio/director.test.js` (append tests)

**Interfaces:**
- Consumes: `d.youtube.claim(videoId, start, end)` returning `{whenReady(cb(player)), onStateChange(cb(state)), destroy()}` (the existing `lib/youtubeWarmAudio.js` contract); `youtubeIsSounding(player)`.
- Produces: `director.play({kind:'youtube',…})` and `director.warm({kind:'youtube',…})` behaving per the tests below.

- [ ] **Step 1: Append the failing tests**

**Append to `client/src/audio/director.test.js`:**
```js
import { fakeYoutube } from './director.fakes.js'

describe('director plays YouTube clips', () => {
  const clip = { kind: 'youtube', videoId: 'vid1', start: 10, end: 40, volume: 80 }

  it('claims the warm player and drives it: volume, unmute, seek to start, play', () => {
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: fakeYoutube({ state: 1, muted: false }) })
    const d = createDirector(f.deps)
    d.play(clip, { slideId: 's1' })
    expect(f.youtube.claim).toHaveBeenCalledWith('vid1', 10, 40)
    const p = f.youtube.claims[0].player
    expect(p.setVolume).toHaveBeenCalledWith(80)
    expect(p.unMute).toHaveBeenCalled()
    expect(p.seekTo).toHaveBeenCalledWith(10, true)
    expect(p.playVideo).toHaveBeenCalled()
  })

  it('passes end as null (never 0/undefined) so warm and claim share one pool key', () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    d.warm({ kind: 'youtube', videoId: 'v' })
    d.play({ kind: 'youtube', videoId: 'v' }, { slideId: 's1' })
    expect(f.youtube.warm).toHaveBeenCalledWith('v', 0, null)
    expect(f.youtube.claim).toHaveBeenCalledWith('v', 0, null)
  })

  it('becomes playing as soon as the player reports PLAYING and is unmuted (no 2s wait)', () => {
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: fakeYoutube({ state: 1, muted: false }) })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    expect(h.state).toBe('pending')
    f.youtube.claims[0].stateCb(1)
    expect(h.state).toBe('playing')
  })

  it('a player that is not sounding after 2s is blocked (state 2 paused), reported once', () => {
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: fakeYoutube({ state: 2 }) })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    vi.advanceTimersByTime(2000)
    expect(h.state).toBe('blocked')
    expect(h.reason).toBe('not-sounding')
    expect(f.events).toHaveLength(1)
    expect(f.events[0]).toMatchObject({ message: 'audio: play blocked (youtube)' })
  })

  it('buffering (state 3) is not a block: slow network, not the autoplay policy', () => {
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: fakeYoutube({ state: 3 }) })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    vi.advanceTimersByTime(2000)
    expect(h.state).toBe('playing')
  })

  it('a muted player is not sounding', () => {
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: fakeYoutube({ state: 1, muted: true }) })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    vi.advanceTimersByTime(2000)
    expect(h.state).toBe('blocked')
  })

  it('a YouTube API that never loads (player never ready) is blocked after 2s', () => {
    const yt = fakeYoutube()
    yt.neverReady = true
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: yt })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    vi.advanceTimersByTime(2000)
    expect(h.state).toBe('blocked')
    expect(f.youtube.claims[0].player.playVideo).not.toHaveBeenCalled()
  })

  it('retry() drives the player again from a gesture; a still-silent retry blocks again', () => {
    const yt = fakeYoutube({ state: 2 })
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: yt })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    vi.advanceTimersByTime(2000)
    expect(h.state).toBe('blocked')
    d.retryBlocked()
    expect(h.state).toBe('pending')
    expect(yt.claims[0].player.playVideo).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(2000)
    expect(h.state).toBe('blocked')
    expect(f.events).toHaveLength(1)
    yt.state = 1 // it finally plays
    vi.advanceTimersByTime(1000)
    expect(h.state).toBe('playing')
  })

  it('ENDED (state 0): onEnded fires, the claim is destroyed, and the clip is re-warmed for an instant replay', () => {
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: fakeYoutube({ state: 1 }) })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    const onEnded = vi.fn()
    h.onEnded(onEnded)
    f.youtube.claims[0].stateCb(0)
    expect(onEnded).toHaveBeenCalledTimes(1)
    expect(h.state).toBe('ended')
    expect(f.youtube.claims[0].destroyed).toBe(true)
    expect(f.youtube.warm).toHaveBeenCalledWith('vid1', 10, 40)
  })

  it('backstop: a clip with an end is ended by a timer if YouTube never reports ENDED', () => {
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: fakeYoutube({ state: 1 }) })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    f.youtube.claims[0].stateCb(1)
    vi.advanceTimersByTime((40 - 10) * 1000 + 499)
    expect(h.state).toBe('playing')
    vi.advanceTimersByTime(1)
    expect(h.state).toBe('ended')
  })

  it('stop() destroys the claim and cancels the backstop', () => {
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: fakeYoutube({ state: 1 }) })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    h.stop()
    expect(f.youtube.claims[0].destroyed).toBe(true)
    vi.advanceTimersByTime(60000)
    expect(h.state).toBe('stopped')
  })

  it('warm() forwards to the pool; a malformed clip to warm() is ignored, not thrown', () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    d.warm({ kind: 'youtube', videoId: 'v', start: 5, end: 25 })
    expect(f.youtube.warm).toHaveBeenCalledWith('v', 5, 25)
    expect(() => d.warm({ kind: 'youtube' })).not.toThrow()
    expect(() => d.warm(null)).not.toThrow()
    expect(f.youtube.warm).toHaveBeenCalledTimes(1)
  })

  it('a YouTube clip and a file clip can play at once, each with its own handle', async () => {
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: fakeYoutube({ state: 1 }) })
    const d = createDirector(f.deps)
    const a = d.play(clip, { slideId: 's1' })
    const b = d.play({ kind: 'file', url: '/a.mp3' }, { slideId: 's2' })
    await flush()
    expect(a.state).not.toBe('stopped')
    expect(b.state).toBe('playing')
  })
})
```

- [ ] **Step 2: Run the tests, confirm the new ones fail because `startYoutube` is a stub**

Run: `npx vitest run client/src/audio/director.test.js`
Expected: the YouTube tests FAIL with `youtube playback is implemented in Plan 1, Task 5` (surfacing as a blocked `start-threw` handle).

- [ ] **Step 3: Implement `startYoutube`**

**In `client/src/audio/director.js`, replace**
```js
  // Replaced in Task 5.
  function startYoutube(/* clip, ctl */) {
    throw new Error('youtube playback is implemented in Plan 1, Task 5')
  }
```
**with:**
```js
  // YouTube: claim the pre-warmed hidden player (lib/youtubeWarmAudio.js owns the
  // iframe pool) and drive it. warm() and claim() both receive end as null-or-number
  // so they agree on the pool key videoId:start:end.
  function startYoutube(clip, ctl) {
    const h = d.youtube.claim(clip.videoId, clip.start, clip.end)
    let player = null
    let endTimer = null
    const check = () => !!player && youtubeIsSounding(player)

    h.onStateChange?.(s => {
      if (s === 0) ctl.ended() // YouTube's ENDED
      else if (s === 1 && player && youtubeIsSounding(player)) ctl.playing()
    })

    const go = () => {
      ctl.arm(check) // FIRST: the player may never become ready (API blocked) — that must still be reported
      h.whenReady(p => {
        player = p
        safe(() => {
          p.setVolume(clip.volume)
          p.unMute()
          p.seekTo(clip.start, true)
          p.playVideo()
        })
      })
      // Backstop for a clip with an end: the player's own `end` normally stops it and
      // reports ENDED; if it never does, end the handle ourselves shortly after.
      if (clip.end != null) {
        if (endTimer != null) d.clearTimer(endTimer)
        endTimer = d.setTimer(() => ctl.ended(), Math.max(0, clip.end - clip.start) * 1000 + 500)
      }
    }

    ctl.setRetry(() => { unlock(); go() })
    ctl.setStop(() => {
      if (endTimer != null) d.clearTimer(endTimer)
      endTimer = null
      safe(() => h.destroy())
    })
    // After a NATURAL end, re-warm so the next play of this clip is instant (replay restarts from the start).
    ctl.setOnEnded(() => safe(d.youtube.warm, clip.videoId, clip.start, clip.end))
    go()
  }
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx vitest run client/src/audio/director.test.js`
Expected: PASS — `Tests  44 passed (44)`.

- [ ] **Step 5: Mutation check**

(a) pass `clip.end ?? 0` to `claim`/`warm` instead of `null` — the pool-key test must fail; (b) call `ctl.arm(check)` after `h.whenReady(...)` and make `whenReady` queue (never ready) — the never-loads test must still be caught by the watch (verify it fails if you remove the `arm` call entirely); (c) remove the re-warm line — the ENDED test must fail; (d) drop the `endTimer` clear in `setStop` — the stop test must fail (a stale timer ends a stopped handle). Restore each.

- [ ] **Step 6: Commit**

```bash
git add client/src/audio/director.js client/src/audio/director.test.js
git commit -m "feat(audio): director plays YouTube clips, warms, re-warms after end (plan 1, task 5)"
```

---

### Task 6: Never throws into the show; module hygiene; gate

**Files:**
- Modify: `client/src/audio/director.test.js` (append tests)
- Modify: `client/src/audio/director.js` only if a test reveals a gap

**Interfaces:** none new.

- [ ] **Step 1: Append robustness tests**

**Append to `client/src/audio/director.test.js`:**
```js
describe('director never throws into the show', () => {
  it('a breadcrumb or event sink that throws does not break play()', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    f.deps.breadcrumb = vi.fn(() => { throw new Error('sentry down') })
    f.deps.event = vi.fn(() => { throw new Error('sentry down') })
    const d = createDirector(f.deps)
    expect(() => d.play({ kind: 'file', url: '/a.mp3' }, { slideId: 's1' })).not.toThrow()
    await flush()
  })

  it('a context whose createMediaElementSource throws falls back to element volume and still plays', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    f.ctx.createMediaElementSource = () => { throw new Error('graph failed') }
    const d = createDirector(f.deps)
    const h = d.play({ kind: 'file', url: '/a.mp3', gainDb: -6 }, { slideId: 's1' })
    await flush()
    expect(f.elements[0].volume).toBeCloseTo(0.5012, 3)
    expect(h.state).toBe('playing')
  })

  it('a YouTube claim() that throws becomes a blocked handle, not an exception', () => {
    const yt = fakeYoutube()
    yt.claim = vi.fn(() => { throw new Error('iframe api exploded') })
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: yt })
    const d = createDirector(f.deps)
    let h
    expect(() => { h = d.play({ kind: 'youtube', videoId: 'v' }, { slideId: 's1' }) }).not.toThrow()
    expect(h.state).toBe('blocked')
    expect(h.reason).toBe('start-threw')
  })

  it('an onEnded callback that throws does not stop the others or the director', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    const h = d.play({ kind: 'file', url: '/a.mp3' }, { slideId: 's1' })
    await flush()
    const second = vi.fn()
    h.onEnded(() => { throw new Error('bad cb') })
    h.onEnded(second)
    expect(() => f.elements[0].emit('ended')).not.toThrow()
    expect(second).toHaveBeenCalled()
  })

  it('stop() after ended, and a second stop(), are harmless', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    const h = d.play({ kind: 'file', url: '/a.mp3' }, { slideId: 's1' })
    await flush()
    f.elements[0].emit('ended')
    expect(() => { h.stop(); h.stop(); h.retry() }).not.toThrow()
    expect(h.state).toBe('ended')
  })

  it('snapshot.blocked lists only blocked clips and clears when they stop', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const orig = f.deps.makeElement.getMockImplementation()
    f.deps.makeElement.mockImplementation(() => { const el = orig(); el.playMode = 'reject'; return el })
    const d = createDirector(f.deps)
    const a = d.play({ kind: 'file', url: '/a.mp3' }, { slideId: 's1' })
    const b = d.play({ kind: 'file', url: '/b.mp3' }, { slideId: 's2' })
    await flush()
    expect(d.getSnapshot().blocked.map(x => x.slideId).sort()).toEqual(['s1', 's2'])
    a.stop()
    expect(d.getSnapshot().blocked.map(x => x.slideId)).toEqual(['s2'])
    b.stop()
    expect(d.getSnapshot().blocked).toEqual([])
  })
})

describe('module hygiene', () => {
  it('the app singleton exists and has the public API', async () => {
    const mod = await import('./director.js')
    for (const k of ['status', 'unlock', 'installGestureUnlock', 'subscribe', 'getSnapshot', 'setPreview', 'warm', 'play', 'retryBlocked']) {
      expect(typeof mod.director[k]).toBe('function')
    }
  })
})
```

- [ ] **Step 2: Run, and fix `director.js` only if a test reveals a gap**

Run: `npx vitest run client/src/audio/director.test.js`
Expected: PASS — `Tests  50 passed (50)`. If the `claim() throws` test shows an uncaught throw, the `try/catch` in `play()` already routes it to `ctl.block('start-threw')`; if `createMediaElementSource` throw falls through, confirm `startFile`'s `try { … } catch { src = null }` is in place.

- [ ] **Step 3: Mutation check on the whole file**

(a) remove the `try/catch` in `play()` — the `claim() throws` test must fail; (b) make `emit()` call listeners without `safe` — the throwing-subscriber test must fail; (c) make `d.breadcrumb(...)` unguarded in `browserDeps` is irrelevant (deps injected), so instead remove `safe` from `endedCbs.forEach(cb => safe(cb))` — the throwing-onEnded test must fail. Restore.

- [ ] **Step 4: The gate (record real exit codes, do not pipe)**

```bash
npx vitest run client/src/audio client/src/lib/slideClip.test.js > /tmp/plan1-new.txt 2>&1; echo NEW_EXIT=$?
npx vitest run --maxWorkers=3 > /tmp/plan1-all.txt 2>&1; echo ALL_EXIT=$?
npx vite build --outDir /tmp/plan1-build --emptyOutDir > /tmp/plan1-build.txt 2>&1; echo BUILD_EXIT=$?
```
Expected: all three `0`; full suite reports one more file per new test file than before (baseline: 139 files / 2015 tests at `3288b42`, now 142 files).

- [ ] **Step 5: Confirm nothing in the app imports the director yet (Plan 1 changes no behavior)**

Run: `grep -rn "audio/director" client/src --include=*.jsx --include=*.js | grep -v "audio/director"` should print nothing outside `client/src/audio/` and the test files. (`grep -rln "slideClip" client/src` likewise only the module and its test.)

- [ ] **Step 6: Update the spec's status block and commit**

Add to `docs/superpowers/specs/2026-09-29-audio-pipeline-design.md` under "Status update": a line `Plan 1 of 3 (foundation: director + resolveSlideClip, no slide changed) landed on branch feat/audio-director; Plans 2 and 3 migrate slides.` Then:

```bash
git add docs/superpowers/specs/2026-09-29-audio-pipeline-design.md client/src/audio/director.test.js client/src/audio/director.js
git commit -m "test(audio): director robustness + hygiene, plan 1 gate (plan 1, task 6)"
```

---

## Self-Review (spec coverage)

- Spec "Director API": `warm`, `play → handle {stop, onEnded}`, `status`/`subscribe`, `unlock`, `setPreview` — Tasks 3–5. (`retry` is an addition from the real-browser findings.)
- Spec "One shared `AudioContext`": Task 3 (`ensureContext` single instance; test "reuses ONE context").
- Spec "Failure is loud": breadcrumbs `requested`/`started`/`blocked`, one Sentry event per blocked clip, `timeout-rebuild` stays in `youtubeWarmAudio.js` — Tasks 4–5.
- Spec "`resolveSlideClip` the ONE function": Task 2, with an agreement test against today's `audioPlayPending`.
- Spec "tap the TV for sound" cue: the director exposes `getSnapshot().blocked` + `retryBlocked()`; the cue UI is Plan 2.
- Not in Plan 1 on purpose: Bendle/Tone on the shared context, effect clips, fades/loops, triggers, slide migration — Plans 2 and 3.
- Type consistency: `Handle` fields (`key, slideId, clip, state, reason, onEnded, stop, retry`) and `NormalizedClip` shapes are identical in Tasks 1, 3, 4, 5 and 6; `ctl` methods (`setStop, setRetry, arm, playing, block, ended`) are used consistently by `startFile` and `startYoutube`.
- No placeholders: every step carries its full code. The only intentional stubs are Task 3's `play` (replaced in Task 4) and Task 4's `startYoutube` (replaced in Task 5), each tested to fail first.
