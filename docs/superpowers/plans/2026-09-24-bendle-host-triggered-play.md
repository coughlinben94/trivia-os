# Bendle Host-Triggered Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bendle step-leg slides (1/2/3) no longer autoplay their stem mix on mount — the host lands on the slide, tells the room which instrument it is (already shown via the existing StepIndicator label), then presses Next (keyboard/Stream Deck/on-screen button) to start playback. Second Next advances as normal, mirroring the existing "Next plays audio" pattern already shipped for other shiny-audio questions.

**Architecture:** Reuse the existing `show.audio_playing` realtime field and `maybeStartAudioPlay()` gate in `LiveMode.jsx` (already built 2026-09-01 for this exact interaction model on other audio questions) instead of inventing new state. On the display side, split `ShinyBendleQuestion.jsx`'s single load+play effect into "load and prime" (always runs on mount) and "start playback" (gated on `show.audio_playing` matching this slide, only for non-revealed step mode — the reveal/full-mix path keeps its existing immediate-autoplay-on-`A`-press behavior unchanged, since pressing `A` is already an explicit host action).

**Tech Stack:** React, Tone.js (Transport singleton + Player), Supabase Realtime (`show.audio_playing`).

**Spec:** This plan doc — direct verbal spec from Ben in-session: "if rather get to the slide, tell them which instrument it is, then invoke with a click" / "ie host trigger for all three steps."

## Global Constraints

- Do not change reveal-mode (`revealed === true`) playback — it must keep auto-starting immediately when the host presses `A`, unchanged.
- Do not add new Supabase schema or new realtime fields — reuse `show.audio_playing` (`{ slideId, playing }`) exactly as the existing generic mechanism does.
- Do not add a new on-screen button — reuse the existing Next-button/keyboard/Stream-Deck path via `maybeStartAudioPlay()`.
- GPU-only / reduced-motion / theme-font rules from SKILL.md are unaffected (no visual changes beyond the existing StepIndicator already showing the instrument label — no new task needed for that, it already renders before playback starts).

---

### Task 1: Gate step-mode playback behind `show.audio_playing` on the display side

**Files:**
- Modify: `client/src/components/display/slides/ShinyBendleQuestion.jsx`

**Interfaces:**
- Consumes: `show.audio_playing` (`{ slideId: string, playing: boolean } | null`, already passed into this component via the existing `show` prop — no plumbing change needed).
- Produces: no new exports; internal behavior change only.

- [ ] **Step 1: Add `useRef` import and a `startedRef`**

In the `import { useState, useEffect } from 'react'` line, add `useRef`:
```js
import { useState, useEffect, useRef } from 'react'
```

Inside the component, near the other `useState` calls (after `const [loadState, setLoadState] = useState('loading')`), add:
```js
const startedRef = useRef(false)
```

- [ ] **Step 2: Reset `startedRef` and gate the unconditional `transport.start()` on `revealed`**

In the load/play `useEffect` (the one with deps `[song, isPreview, revealed, stepIndex, data.bendleTierOrder]`), inside `async function setup()`, right after `transport.seconds = 0` at the top, add:
```js
startedRef.current = false
```

Then find the end of `setup()`:
```js
      Tone.start().catch(() => {})
      setLoadState('ready')
      transport.start()
    }
    setup()
```
Replace the last two lines of that block with:
```js
      Tone.start().catch(() => {})
      setLoadState('ready')
      if (revealed) {
        startedRef.current = true
        transport.start()
      }
    }
    setup()
```

- [ ] **Step 3: Add the host-triggered play effect**

Directly after the closing `}, [song, isPreview, revealed, stepIndex, data.bendleTierOrder])` of the load/play effect (before the component's `return (`), add a new effect:
```js
  // Host-triggered play for step-mode legs (2026-09-24, Ben: "get to the
  // slide, tell them which instrument it is, then invoke with a click").
  // Mirrors the existing "Next plays audio" pattern (LiveMode.jsx's
  // maybeStartAudioPlay) other shiny-audio questions already use — first
  // Next after landing on the slide fires show.audio_playing instead of
  // advancing, this effect reacts to it. Reveal mode is untouched: it
  // still auto-starts in the effect above, since pressing A is already an
  // explicit host action.
  useEffect(() => {
    if (revealed) return
    if (loadState !== 'ready') return
    if (startedRef.current) return
    const playing = show?.audio_playing
    if (playing?.slideId !== slide.id || !playing?.playing) return
    startedRef.current = true
    Tone.getTransport().start()
  }, [show?.audio_playing, loadState, revealed, slide.id])
```

- [ ] **Step 4: Manual verification (no test framework mock exists for Tone.js Transport singleton — verify live)**

Run: `cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && npm run dev`

In a browser, open `/host`, load a show with a Bendle round, Go Live to the first Bendle step slide, open `/display` in a second tab/window for the same show.

Expected:
- `/display` shows the Bendle title + StepIndicator (instrument label) but audio does NOT start automatically.
- Pressing Next (or the on-screen Next button) in `/host` starts the audio on `/display` without advancing the slide.
- Pressing Next again advances to the next real slide (leg 2).
- Pressing `A` (answer reveal) on the final leg still auto-starts the full mix immediately, unchanged.

- [ ] **Step 5: Commit**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
git add client/src/components/display/slides/ShinyBendleQuestion.jsx
git commit -m "feat(bendle): gate step-leg playback behind host Next press

Was auto-playing on slide mount, before Ben could announce which
instrument the room is about to hear. Reuses the existing
show.audio_playing 'Next plays audio' mechanism (Task 2 wires the host
side) instead of inventing new state. Reveal-mode playback (full mix on
A press) is unchanged."
```

---

### Task 2: Widen `maybeStartAudioPlay()` to recognize Bendle slides

**Files:**
- Modify: `client/src/components/host/LiveMode.jsx`

**Interfaces:**
- Consumes: `isBendleShiny(data)` from `client/src/lib/shinySeries.js` (already exported, currently unused in this file — checks `data.shinyInputSchema?.type === 'bendle'`).
- Produces: `maybeStartAudioPlay()` now returns `true` (and fires `actions.setAudioPlaying(...)`) for Bendle question slides on their first Next press, same contract as before for every other caller.

- [ ] **Step 1: Import `isBendleShiny`**

Change:
```js
import { resolveShinyPart, isAudioShiny } from '../../lib/shinySeries.js'
```
to:
```js
import { resolveShinyPart, isAudioShiny, isBendleShiny } from '../../lib/shinySeries.js'
```

- [ ] **Step 2: Add the Bendle branch to `maybeStartAudioPlay()`**

Current function:
```js
  function maybeStartAudioPlay() {
    if (!currentSlide || currentSlide.type !== 'question') return false
    if (currentSlide.data?.isShiny) {
      if (!isAudioShiny(currentSlide.data)) return false
    } else if ((currentSlide.data?.audioTrigger ?? 'click') !== 'click') {
      return false
    }
    const part = resolveShinyPart(currentSlide.data)
    const hasAudio = !!part.youtubeId || (!!part.mediaUrl && String(part.mediaType ?? '').startsWith('audio'))
    if (!hasAudio) return false
    if (show.audio_playing?.slideId === currentSlide.id) return false
    guardNav(() => actions.setAudioPlaying({ slideId: currentSlide.id, playing: true }))
    return true
  }
```

Replace with:
```js
  function maybeStartAudioPlay() {
    if (!currentSlide || currentSlide.type !== 'question') return false
    // Bendle's audio isn't mediaUrl-shaped (it's a Tone.js stem mix keyed
    // by bendleSongId) — resolveShinyPart/hasAudio below don't apply to
    // it, so it's handled as its own branch ahead of the generic checks.
    if (isBendleShiny(currentSlide.data)) {
      if (show.audio_playing?.slideId === currentSlide.id) return false
      guardNav(() => actions.setAudioPlaying({ slideId: currentSlide.id, playing: true }))
      return true
    }
    if (currentSlide.data?.isShiny) {
      if (!isAudioShiny(currentSlide.data)) return false
    } else if ((currentSlide.data?.audioTrigger ?? 'click') !== 'click') {
      return false
    }
    const part = resolveShinyPart(currentSlide.data)
    const hasAudio = !!part.youtubeId || (!!part.mediaUrl && String(part.mediaType ?? '').startsWith('audio'))
    if (!hasAudio) return false
    if (show.audio_playing?.slideId === currentSlide.id) return false
    guardNav(() => actions.setAudioPlaying({ slideId: currentSlide.id, playing: true }))
    return true
  }
```

- [ ] **Step 3: Manual verification**

Covered by Task 1 Step 4 (same live-show test exercises both sides together — Next press on host must be what starts the display's audio).

- [ ] **Step 4: Commit**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
git add client/src/components/host/LiveMode.jsx
git commit -m "feat(bendle): host Next press fires audio_playing for Bendle slides

Widens the existing 'Next plays audio' gate (maybeStartAudioPlay) to
recognize Bendle question slides via isBendleShiny, instead of the
mediaUrl-shaped hasAudio check that doesn't apply to Bendle's Tone.js
stem-mix audio."
```

---

## Self-Review

**Spec coverage:** "get to the slide, tell them which instrument it is, then invoke with a click" — instrument label (StepIndicator) already renders before playback starts (Task 1, no autoplay); "invoke with a click" — Task 2 wires the existing Next-button/keyboard/Stream-Deck click path. "ie host trigger for all three steps" — the gate applies to every step-mode (`!revealed`) mount, i.e. all 3 leg slides identically; each is its own real slide so each gets a fresh `startedRef`/effect run. No gaps found.

**Placeholder scan:** none — every step has literal before/after code.

**Type consistency:** `show.audio_playing` shape (`{ slideId, playing }`) matches what `actions.setAudioPlaying` already writes elsewhere in the codebase (Task 2 doesn't change the writer, only widens who calls it) and what Task 1's reader effect checks (`playing?.slideId`, `playing?.playing`) — consistent both sides.
