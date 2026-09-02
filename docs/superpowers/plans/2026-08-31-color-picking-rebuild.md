# Color Picking Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Ben the same picking experience `ThemePickerModal.jsx`/`ThemeCustomizeControls.jsx` already provides for show theme colors, extended to reach the ring world's 13 station colors — which today cannot be changed except by hand-editing a source constant and are explicitly "palette-fixed by design." Ben has verbally overridden that standing caution for the ring specifically; this plan is honest about what that override costs (a verification gate calibrated against today's fixed hues) rather than papering over it.

**Architecture:** Two independent, already-different color systems, kept independent — not merged into one. (1) Show theme colors: a small, real gap closed cheaply — `ThemeCustomizeControls.jsx` already edits 4 of `theme.colors`' 8 fields through a working, live, per-show pipeline (`shows.theme_overrides` → `ThemeProvider.applyOverrides()`); the other 4 just need the same rows added. (2) Ring station colors: no live per-show pipeline exists or should be built tonight — station hues are one shared constant array (`midnightGalaxy.ring.js`), read once per station at render time (not frozen at module load the way the ring's *sky* palette is), gated by `ring-verify`'s regression tier. The new capability here is a **host-facing live-preview editor**, visually and interactionally modeled on `ThemePickerModal`, whose output is a pasteable source edit plus a mandatory verify step — not a live Supabase write. Section "Ring Station Color Editor — how it reaches a live slide" below states plainly why an instant, unverified, per-show write (the theme-color pattern's actual save mechanism) is not proposed for the ring without a further, explicitly-flagged decision from Ben.

**Tech Stack:** React 18, Tailwind (editor UI); Node/Playwright (`concepts/tools/ring-verify.mjs`, unchanged, invoked not modified); no new dependencies, no schema changes for the ring half of this plan (there is nothing in Supabase to change — ring station hues are not currently stored per-show).

**Spec:** This document. No separate spec doc — the investigation that produced it is recorded inline below because the ask was "read the code and plan," not a pre-written spec.

## Global Constraints

- No Socket.io, no Express, no local file storage — Supabase is the only backend (repo-wide rule). The ring editor's "save" step therefore cannot be a live server-side file write from a deployed host session — see Task 3.
- Every write to `shows.theme_overrides` goes through `useShow.js`'s existing `actions.updateShowMeta({ themeOverrides })` — no second write path.
- `ThemeProvider.jsx`'s `applyOverrides()` is the **single merge chokepoint** for theme colors — never hand-duplicate the merge or the contrast floor.
- **STAYS HUMAN, no exceptions in this plan** (`references/ring-world-continuity.md` §4): choosing target metrics/thresholds, editing `ring-spec.lock.json` or `ring-verify.mjs`'s pass/fail logic or any gate cap, interpreting a POISONED/ambiguous verify run, and aesthetic acceptance ("does this actually look right") are Ben's calls. No task below writes to a lock file or gate-logic file, runs an optimization loop against the gate, or auto-accepts a verify result on Ben's behalf.
- Any hue value change requires a `ring-verify` re-run before it's treated as safe to ship — this plan does not shortcut that, per the project's own standing rule ("never move a threshold to make something pass," `ring-world-mistakes.md`).
- `midnightGalaxy.ring.js`'s station array and `concepts/world-07-ring.html`'s own independent copy of the same array **must be hand-kept in sync** — this is not new to this plan, it's an existing, documented, previously-violated (2026-08-16, the st9 spanning-field drift) requirement of the current architecture, and the editor's output must always cover both files, never one.
- Do not touch `LiveScreen.jsx` or `StationRingLayer.jsx` — a separate agent is actively rewriting the jukebox grading-break visual in its own isolated worktree.
- Do not touch `client/src/lib/ringEngine.js`'s `skyFromTheme()` or the ring's sky-palette derivation — that stays palette-fixed; this plan's ring scope is per-station object hue only, the one thing Ben actually asked to change.

---

## Investigation Summary

### Part A — the reference implementation: how a theme color picked in `ThemePickerModal` actually reaches a live slide

Traced end to end, because the ring editor needs to reuse this pattern where it fits and depart from it honestly where it can't:

1. **Storage:** `shows.theme_overrides jsonb`, shape `{ fonts: {...}, colors: {...} }`. A per-show column — every show has its own value, defaulting to `{}`.
2. **UI → storage:** `ThemePickerModal.jsx` holds `overrides` in local state, seeded from `show.themeOverrides`. Each swatch's `onChange` calls `setTextColor(field, color)` (a generic setter despite its name — works on any key), which updates local state immediately (so the picker's own preview is instant) and, debounced 600ms (native `<input type="color">` fires continuously while dragging), calls `onUpdateOverrides(next)` — wired by `Host.jsx` to `actions.updateShowMeta({ themeOverrides: next })`, which writes the whole object to Supabase.
3. **Storage → live TV:** Every real `<ThemeProvider showThemeId={...} overrides={show.themeOverrides}>` mount (Host.jsx, and 2 of Display.jsx's 3 mounts) calls `applyOverrides(getTheme(themeId), overrides)`, which spreads `overrides.colors` over the base theme's `colors`, then runs `floorReadableColors()` (a contrast floor re-derived from the just-merged `bg`/`bgDeep`, so it stays correct even if `bg` itself is overridden). `shows` is a realtime-subscribed table, so a host's edit reaches the live `/display` within Supabase's normal realtime latency — no page reload, no rebuild, no verification step, because every combination of `theme.colors` values is safe by construction (they're just CSS colors on text/background; nothing about them can break a rendering assumption the way a ring station's hue interacts with luminance-based safe-box math).
4. **The gap this plan closes for theme colors:** `ThemeCustomizeControls.jsx` — the actual form — only renders swatches for `accent`, `highlight`, `text`, `textMuted`. `bg`, `bgDeep` (the literal full-screen background on every slide and `Display.jsx`'s own root) and `shinyBg`/`shinyAccent` (every shiny-question surface) have no swatch at all, despite the storage/merge/floor pipeline already handling them correctly today with zero code change (confirmed by reading `applyOverrides` — it's a full spread, not a whitelist). This is a real, cheap, same-pipeline gap — see Task 1.

### Part B — the ring: what's actually fixed, what isn't, and what "the same picker" would mean here

1. **The ring's *sky* palette is genuinely fixed at module load** and stays out of scope in this plan: `midnightGalaxy.ring.js` line 5, `const theme = THEMES.find(t => t.id === 'midnight-galaxy')`, runs once when the module is imported; `sky: skyFromTheme(theme)` is computed from that snapshot and never re-reads a live per-show override. Not touched here.
2. **Station hues are a different, better-news case.** Each of the 13 stations is a flat object, `{ key, prim, hue, accent, ... }`, in the exported `midnightGalaxyRing.stations` array. `RingAmbient.jsx` reads `st.hue` directly off this array **at render/turn time** (confirmed: `makePrim(st.prim, hw, hh, st.hue, ...)`, `makeNebulaRing(nrW, nrH, st.hue, fill)`, the companion-hue derivation `st.hue + (st.accent ? 168 : ...)`, all inside the per-station render path, not a one-time snapshot). `RingAmbient` takes `worldData` as a prop (`<RingAmbient worldData={midnightGalaxyRing} />`, confirmed live in `AmbientAudit.jsx`'s existing `?ring=1` dev route). **This means a locally-cloned `worldData` object with one station's `hue` field changed, mounted into a second, isolated `RingAmbient` instance, renders that candidate color live in the browser with zero risk to the real show** — the real show's own `RingAmbient` mount keeps reading the real, unmutated `midnightGalaxyRing` import. This is the concrete opening the editor in Task 3 uses for its live preview, and it's why this is buildable tonight without touching gate code.
3. **What ring-verify actually checks, and why free hue-picking isn't just a UI problem.** `concepts/tools/ring-spec.lock.json`'s caps (safe-box luminance, ink-per-station, arc-band, drawn-subject kind, etc.) were calibrated, over many documented rounds (`FAILURE-LEDGER.md`), against the *current* 13 hues. `ringPrimitives.js` itself notes hues are "green-starved under Rec.709 luma at any alpha" — i.e., luminance isn't hue-neutral, so a station that currently passes the safe-box cap at hue 300 is not guaranteed to pass at hue 90. `midnightGalaxyRing`'s own `hueAnchors` (two-to-three named silhouette-family windows, e.g. "violet/purple, 276°±25") and the per-file comment on family spacing mean an arbitrary new hue can also silently break the "same silhouette family stays ≥3 stations apart" rule if it drifts into a different family's window. None of this is visible from the picker UI alone — it only shows up by actually running `ring-verify`.
4. **There is currently no per-show storage for ring station colors, and this plan does not add one.** Building that (a `theme_overrides`-shaped live pipeline for ring hues, matching the theme-color save mechanism exactly) would mean any host could recolor a station instantly, live, per-show, with **no verification step in the loop at all** — silently reopening exactly the failure classes `FAILURE-LEDGER.md` spent weeks closing (safe-box overages, hue-anchor-family collisions, drawn-subject regressions). That tradeoff is a real product decision, not an implementation detail, and is called out explicitly as **not decided here** (see "Explicitly deferred" below) rather than built by default just because the theme-color picker happens to work that way.

---

## Explicitly out of scope / explicitly deferred

- **A live, per-show, instantly-saved ring hue override** (the theme-color pattern's actual save mechanism, applied unmodified to the ring) — **not built in this plan.** It is architecturally the "same picker," but its save step bypasses `ring-verify` entirely, which is a different risk profile than any theme-color combination (see Investigation Part B.3–4). Naming it here so it isn't silently assumed out of reach forever: if Ben wants this specifically (instant, no per-change verify), that's a one-line decision for him to make explicitly — flag it, don't build it preemptively.
- **The ring's sky palette** (`skyFromTheme`) — stays fixed, not part of "station colors."
- **The jukebox grading-break visual rewrite** (`LiveScreen.jsx`, `StationRingLayer.jsx`) — a separate agent's isolated worktree. Not touched.
- **Auto-writing the source-file edit from the browser** — there is no backend to do this safely from a deployed host session (`No Socket.io, no Express, no local file storage`). Task 3's editor produces the exact text to paste plus the exact command to run; it does not attempt to patch `midnightGalaxy.ring.js` over the network.
- **Editing `ring-spec.lock.json`, `ring-verify.mjs`'s checks, or any threshold** — STAYS HUMAN, never proposed here.

---

## Task 1: Expose all 8 `theme.colors` fields in the existing show-theme picker (ships tonight, trivial)

**Why this is low-risk:** zero new storage, zero new merge logic. `applyOverrides()` already spreads any key in `overrides.colors` and already re-derives its contrast floor from the merged result. `setTextColor(field, color)` is already generic. This task is 4 new `<input>` rows in one file.

**Files:**
- Modify: `client/src/components/host/ThemeCustomizeControls.jsx`
- No changes to: `ThemeProvider.jsx`, `useShow.js`, `themes/index.js`, any slide component, the Supabase schema

**Interfaces:**
- Consumes: `ThemePickerModal.jsx`'s existing `setTextColor(field, color)`, `overrides`, `baseTheme` props (unchanged signatures).
- Produces: nothing new for later tasks — self-contained.

- [ ] **Step 1: Add the 4 missing color rows**

  Insert before the existing "Accent color" row, following the exact pattern already used there (native `<input type="color">`, same classes, same `onSetTextColor` wiring):

  ```jsx
  <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
    Background color
    <input
      type="color"
      value={overrides.colors?.bg ?? baseTheme.colors.bg}
      onChange={e => onSetTextColor('bg', e.target.value)}
      className="w-7 h-7 border border-gray-200 rounded-md cursor-pointer"
    />
  </label>
  <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
    Deep background color
    <input
      type="color"
      value={overrides.colors?.bgDeep ?? baseTheme.colors.bgDeep}
      onChange={e => onSetTextColor('bgDeep', e.target.value)}
      className="w-7 h-7 border border-gray-200 rounded-md cursor-pointer"
    />
  </label>
  <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
    Shiny background color
    <input
      type="color"
      value={overrides.colors?.shinyBg ?? baseTheme.colors.shinyBg}
      onChange={e => onSetTextColor('shinyBg', e.target.value)}
      className="w-7 h-7 border border-gray-200 rounded-md cursor-pointer"
    />
  </label>
  <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
    Shiny accent color
    <input
      type="color"
      value={overrides.colors?.shinyAccent ?? baseTheme.colors.shinyAccent}
      onChange={e => onSetTextColor('shinyAccent', e.target.value)}
      className="w-7 h-7 border border-gray-200 rounded-md cursor-pointer"
    />
  </label>
  ```

  Resulting visual order: Background, Deep background, Shiny background, Shiny accent, Accent, Highlight, Text, Muted text. The row is already `flex-wrap` — confirm it still wraps cleanly with 8 fields instead of 4.

- [ ] **Step 2: Manual verification**

  Run the app locally, open `/host`, load a show, open Theme → Customize:
  1. Change **Background color** and **Deep background color**; confirm the `ThemePickerModal` preview backdrop updates (the preview frame's own background prop reads `previewTheme.colors.bgDeep`).
  2. Open `/display` for that show and confirm a real slide now renders the new background — proves the override reaches `SlideRenderer.jsx`/`Display.jsx` with no code beyond Step 1.
  3. Change **Text color** to something low-contrast against the new background; confirm `floorReadableColors()` still visibly corrects it on the real display, proving the floor re-derives against the *overridden* `bg`/`bgDeep`.
  4. Change **Shiny background** / **Shiny accent** and view any `isShiny` question slide on `/display` to confirm both apply. (Note: the picker's own preview card has no shiny-slide mockup, so this pair isn't visible until you check the real display — a known, acceptable limitation, not a defect to fix here.)

- [ ] **Step 3: fix the stale schema comment**

  `SKILL.md`'s Theme System section still describes `theme_overrides.colors` as `{ text, textMuted }`. Update to `{ bg, bgDeep, accent, highlight, text, textMuted, shinyBg, shinyAccent }`.

- [ ] **Step 4: Commit**

  ```bash
  git add client/src/components/host/ThemeCustomizeControls.jsx SKILL.md
  git commit -m "Expose bg/bgDeep/shinyBg/shinyAccent in per-show theme color picker"
  ```

---

## Task 2: Per-field "revert to default" for theme colors (reuses the jukebox's proven pattern)

**Why:** with 8 overridable fields instead of 4, the existing single global "Reset" (clears every color *and* font override at once) gets worse as a way to undo one bad pick. The jukebox's `GradientColorPicker.jsx` already solved exactly this with a per-slot "↺ auto" link, shown only when that field is overridden. Port that one interaction — not the eyedropper or swatch-extraction, neither of which has a theme-color equivalent (there's no cover art to sample).

**Files:**
- Modify: `client/src/components/host/ThemeCustomizeControls.jsx`, `client/src/components/host/ThemePickerModal.jsx`

**Interfaces:**
- Consumes: same `overrides`/`baseTheme` props as Task 1.
- Produces: `onRevertColor(field)`, a new prop `ThemeCustomizeControls` calls per field. It must **delete** the key, not set it to the default value — setting it would leave `overrides.colors` non-empty forever, breaking the existing global Reset button's `disabled={!hasOverrides}` guard.

- [ ] **Step 1: Add `revertColor(field)` in `ThemePickerModal.jsx`**

  ```jsx
  function revertColor(field) {
    const nextColors = { ...overrides.colors }
    delete nextColors[field]
    const next = { ...overrides, colors: nextColors }
    setOverrides(next)
    onUpdateOverrides(next)
  }
  ```

  Pass down: `<ThemeCustomizeControls ... onRevertColor={revertColor} />`.

- [ ] **Step 2: Render the per-field "↺" link**

  For each of the 8 color rows (Task 1's 4 plus the pre-existing 4), add a conditional revert button matching the jukebox's visibility rule:

  ```jsx
  {overrides.colors?.bg !== undefined && (
    <button
      onClick={() => onRevertColor('bg')}
      title="Revert to theme default"
      className="text-[11px] text-gray-400 hover:text-gray-700"
    >
      ↺
    </button>
  )}
  ```

  (repeat per field: `bg`, `bgDeep`, `shinyBg`, `shinyAccent`, `accent`, `highlight`, `text`, `textMuted`)

- [ ] **Step 3: Manual verification**

  1. Override Accent only — confirm "↺" appears only next to Accent.
  2. Click it — confirm it reverts, disappears, and the global Reset button becomes disabled (proving `overrides.colors` is genuinely `{}` again).
  3. Override 3 fields, revert 1 — confirm the other 2 remain and global Reset stays enabled.

- [ ] **Step 4: Commit**

  ```bash
  git add client/src/components/host/ThemeCustomizeControls.jsx client/src/components/host/ThemePickerModal.jsx
  git commit -m "Add per-field revert-to-default for theme color overrides"
  ```

---

## Task 3: Ring Station Color Editor — a live-preview picker for station hues, modeled on ThemePickerModal

**What this delivers:** a host opens a panel that looks and behaves like `ThemePickerModal` — pick a station from a list (13, named), drag a hue control, watch an isolated live render of that exact station update in real time — and on "Done" gets the exact two-file text edit to paste plus the exact command to run before treating the new color as safe. This is the real, honest equivalent of the theme picker for this specific system: same interaction quality, deliberately different save mechanism, because the two systems have different risk profiles (see Investigation Part B).

**Files:**
- Create: `client/src/components/host/RingStationColorEditor.jsx`
- Modify: `client/src/components/host/ThemePickerModal.jsx` (one entry-point button, shown only when previewing `midnight-galaxy`)
- No changes to: `RingAmbient.jsx`, `ringEngine.js`, `ringPrimitives.js`, `midnightGalaxy.ring.js`, `concepts/world-07-ring.html`, `concepts/tools/ring-verify.mjs`, `concepts/tools/ring-spec.lock.json` — this task ships a new, additive, isolated editor component. It reads the shipped ring data; it does not modify any ring source file automatically.

**Interfaces:**
- Consumes: `midnightGalaxyRing` (default export shape) from `client/src/worlds/midnightGalaxy.ring.js`; `RingAmbient` (default export, accepts `worldData` prop, imperative `ref.turn()`/`ref.station`/`ref.jumpTo` per `AmbientAudit.jsx`'s existing usage).
- Produces: no new exports consumed by later tasks — this is the terminal task of this plan.

- [ ] **Step 1: Build the station list + hue control shell, no preview wiring yet**

  ```jsx
  import { useState } from 'react'
  import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'

  export default function RingStationColorEditor({ onClose }) {
    const stations = midnightGalaxyRing.stations
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [candidateHue, setCandidateHue] = useState(stations[0].hue)

    function selectStation(i) {
      setSelectedIndex(i)
      setCandidateHue(stations[i].hue)
    }

    const selected = stations[selectedIndex]
    const changed = candidateHue !== selected.hue

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6" onClick={onClose}>
        <div
          className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ width: 960, maxWidth: '96vw', maxHeight: '88vh' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
            <h2 className="text-sm font-semibold text-gray-800">Ring station colors — Midnight Galaxy</h2>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm">✕</button>
          </div>
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="w-56 shrink-0 border-r border-gray-100 overflow-y-auto py-2">
              {stations.map((st, i) => (
                <button
                  key={st.key}
                  onClick={() => selectStation(i)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors capitalize ${
                    i === selectedIndex ? 'bg-gray-900 text-white font-semibold' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {st.key}
                </button>
              ))}
            </div>
            <div className="flex-1 bg-[#050505] flex items-center justify-center overflow-hidden">
              {/* preview mounts here — Step 2 */}
            </div>
          </div>
          <div className="flex items-center gap-4 px-5 py-3 border-t border-gray-100 shrink-0">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600 flex-1">
              Hue ({candidateHue}°)
              <input
                type="range"
                min="0"
                max="359"
                value={candidateHue}
                onChange={e => setCandidateHue(Number(e.target.value))}
                className="flex-1"
                style={{ accentColor: `hsl(${candidateHue}, 70%, 50%)` }}
              />
            </label>
            <div className="w-7 h-7 rounded-md border border-gray-200 shrink-0" style={{ background: `hsl(${candidateHue}, 70%, 50%)` }} />
            <button
              onClick={() => setCandidateHue(selected.hue)}
              disabled={!changed}
              className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-default"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    )
  }
  ```

  Note: the control is a bare hue (0–359°), not a full RGB `<input type="color">`. This is deliberate, not a shortcut — every station's actual rendered color is built from `hue` alone inside `ringPrimitives.js` (saturation/lightness per element are engine-authored, e.g. `hsla(hue, 72, LB(62), ...)`), so a full RGB picker would let a host pick a saturation/lightness combination the engine doesn't actually use anywhere, misrepresenting what's really adjustable.

- [ ] **Step 2: Wire the live preview using an isolated `RingAmbient` instance**

  Replace the preview placeholder div. This mounts a **second, throwaway** `RingAmbient` — never the show's real one — fed a shallow-cloned `worldData` with only the selected station's `hue` patched to the candidate value. `RingAmbient` already accepts a `stationOverride` prop (`forwardRef(function RingAmbient({ worldData, slideIndex, stationOverride, showStationDebug }, ref)`, confirmed in the component's own signature) that jumps to a given station index whenever the prop changes (its internal effect calls `jumpTo(stationOverride)` on every `stationOverride` change) — that's simpler and more idiomatic than driving `ref.jumpTo()` from a manual effect, so use the prop directly rather than reaching for the ref:

  ```jsx
  import { useMemo } from 'react'
  import RingAmbient from '../display/RingAmbient.jsx'
  // ...inside the component, after `selected`/`changed`:

  const previewWorldData = useMemo(() => ({
    ...midnightGalaxyRing,
    stations: stations.map((st, i) => i === selectedIndex ? { ...st, hue: candidateHue } : st),
  }), [selectedIndex, candidateHue])
  ```

  ```jsx
  <div className="flex-1 bg-[#050505] flex items-center justify-center overflow-hidden">
    <div style={{ width: 640, height: 360, position: 'relative', overflow: 'hidden', borderRadius: 12 }}>
      <RingAmbient key="ring-station-preview" worldData={previewWorldData} stationOverride={selectedIndex} />
    </div>
  </div>
  ```

  This instance is intentionally keyed and scoped to this modal only — it is never the one mounted by `ParticleBackground.jsx` for a live show (Critical Rule 1, "ParticleBackground never re-mounts," applies to that live instance, not this dev-only preview clone). Dragging the hue slider updates `previewWorldData`, which re-renders this isolated instance live — no Supabase round-trip, no verify run, because nothing here is being shipped yet. No ref is needed for this task since `stationOverride` alone drives the jump; the ref/`jumpTo`/`turn` imperative handle stays available if a later iteration wants an animated turn instead of a hard jump between stations, but isn't needed for this editor.

- [ ] **Step 3: Manual verification of the preview itself**

  1. Open the editor, select "record," drag the hue slider from 300 across the range, confirm the preview's disco-region station visibly recolors live.
  2. Select a different station (e.g. "supernova"), confirm the slider resets to that station's own current hue (36) and the preview jumps to it.
  3. Confirm the real `/display` output for a live or preview show on Midnight Galaxy is completely unaffected while this modal is open — the editor's `RingAmbient` instance must never share state with the live one.

- [ ] **Step 4: Wire the "Done" step — produce the paste-ready edit, not a live write**

  Add a Done button that, only when `changed` is true, renders the exact two-file diff text plus the next command, for the host to copy and paste themselves (matching Ben's documented preference for pasteable prompts over auto-applied changes — `ring-world-mistakes.md`, "Working with Ben": *"he asks for prompts to paste, not prose about prompts"*):

  ```jsx
  {changed && (
    <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 text-xs font-mono whitespace-pre-wrap">
      <div className="font-sans font-semibold text-gray-700 mb-2 text-sm">
        Paste into BOTH files (they must stay in sync — see midnightGalaxy.ring.js's own comment on this), then run the command below before treating this as safe to ship:
      </div>
      1. client/src/worlds/midnightGalaxy.ring.js — update the "{selected.key}" station's hue to {candidateHue}{'\n'}
      2. concepts/world-07-ring.html — update its own independent copy of the same station entry to hue: {candidateHue}{'\n\n'}
      Then run: npm run verify:ring{'\n'}
      A FAIL, or any change to the regression tier's pass/fail counts, is not something to auto-fix — report it and stop (per references/ring-world-continuity.md §4, thresholds and gate logic are Ben's call, not an agent's).
    </div>
  )}
  ```

  This deliberately does **not** attempt to write either file from the browser — there is no backend in this app that could do so safely from a deployed session (Global Constraints), and even a local-dev-only file-write would still need the same human-in-the-loop verify step, so nothing is gained by automating the write specifically while still requiring a human to interpret the verify output.

- [ ] **Step 5: Add the entry point in `ThemePickerModal.jsx`**

  ```jsx
  {previewId === 'midnight-galaxy' && (
    <button
      onClick={() => setRingEditorOpen(true)}
      className="text-sm font-medium text-gray-600 hover:text-gray-900 underline"
    >
      Edit ring station colors
    </button>
  )}
  {ringEditorOpen && <RingStationColorEditor onClose={() => setRingEditorOpen(false)} />}
  ```

  (with a `const [ringEditorOpen, setRingEditorOpen] = useState(false)` added alongside the modal's existing state.) Placed near `ThemeCustomizeControls` in the existing "Customize + Done" footer area, visible only when the theme being customized is Midnight Galaxy — the only theme with a ring world.

- [ ] **Step 6: End-to-end manual verification**

  1. Open `/host`, load a Midnight Galaxy show, open Theme → "Edit ring station colors."
  2. Pick a station, drag to a new hue, confirm the live preview updates and the paste-ready text appears with the correct station name and hue.
  3. Actually paste the two edits into the two real files, run `npm run verify:ring`, and confirm the command runs and reports a real PASS/FAIL — not a guess. Report the actual result plainly (per the project's own "render before you claim" rule) rather than assuming it will pass because the preview looked fine.
  4. If it fails: **stop and report to Ben** which check failed and why, rather than adjusting the hue further to chase a pass, or touching any threshold. Picking a different hue and re-checking is fine; silently loosening a cap is not (STAYS HUMAN).

- [ ] **Step 7: Commit**

  ```bash
  git add client/src/components/host/RingStationColorEditor.jsx client/src/components/host/ThemePickerModal.jsx
  git commit -m "Add live-preview ring station color editor (produces a pasteable edit + verify step, no live write)"
  ```

---

## Self-Review

**Spec coverage:** "Same picker experience for the ring" → Task 3, explicitly modeled on `ThemePickerModal`'s own layout/interaction. "How it reaches a live slide" → traced for theme colors (Investigation Part A) and answered honestly for the ring (Task 3 Step 4 + "Explicitly deferred": paste + verify, not instant write, with the tradeoff of the alternative named rather than hidden). "What breaks / needs re-verification" → named explicitly (safe-box luminance, hue-anchor families, drawn-subject checks; two files must stay in sync). "Sequencing — tonight vs. multi-session" → Tasks 1–3 are all scoped to ship in one session (no schema work, no gate-code work); the one genuinely multi-session/undecided item (live per-show ring overrides bypassing verify) is named and explicitly not built, pending Ben's own call. "Reuses the jukebox pattern" → Task 2 ports the per-field revert affordance directly; Task 3's hue slider deliberately does not import the jukebox's eyedropper/swatch-extraction UI since there's no source image to sample for a ring station.

**Placeholder scan:** no TBD/TODO; every step has literal code or a literal manual-test/paste procedure.

**Type consistency:** `onSetTextColor(field, color)` and the new `onRevertColor(field)` both take a plain string field name across Tasks 1–2. `RingStationColorEditor`'s `previewWorldData` matches `midnightGalaxyRing`'s real shape (`{ ...midnightGalaxyRing, stations: [...] }`) exactly, and `RingAmbient`'s `worldData`/`ref.jumpTo` usage matches `AmbientAudit.jsx`'s existing, already-working usage of the same component — no invented API surface.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-31-color-picking-rebuild.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
