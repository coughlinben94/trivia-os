# PLAN — ring-review-tool (standalone review-annotation tool, world-07-ring)

Written 2026-08-11, before any code, per `references/ring-world-continuity.md` §2 (a
plan meant to outlive one session gets written here, not left in chat).

## What
`concepts/ring-review-tool.html` — Ben's own visual review instrument for the 12
ring-world stations. Replaces hand-typed prose review with direct paint-and-note
markup. Does not touch `world-07-ring.html` itself.

## Why a local server is required (not a plain double-clicked HTML file)
Two hard requirements can't be met by a static file opened via `file://`:
1. **Same-origin access into the world-07-ring iframe.** The tool needs
   `iframe.contentWindow.__world.jumpTo()`, `contentDocument.getAnimations()`, and
   `contentDocument.getElementById('stage').getBoundingClientRect()` from the parent
   page. `file://` origins are not guaranteed same-origin across two files in Chrome.
2. **"Frozen frame with strokes burned in" evidence PNGs.** There is no native browser
   API to rasterize arbitrary DOM (gradients, box-shadows, the iframe'd content) to an
   image. Rather than pull in html2canvas (a new dependency for a real rasterization
   problem it doesn't solve reliably for iframes anyway), reuse what's already in this
   repo: **Playwright**, already a `concepts/tools` dependency, already the library
   `safebox-hit-test.mjs` and `station-audit.mjs` use for exactly this (freeze +
   screenshot). A tiny Node script serves the tool + world-07-ring.html over
   `http://127.0.0.1`, launches a **headed** (visible, interactive) Chromium window via
   Playwright, and Ben reviews *in that window*. On Save, the same server process — which
   holds the live `page` handle — drives the capture itself: jump to each marked
   station, freeze, screenshot `#stage`, write PNG.

This is the "tiny local save endpoint" option named in the spec, and it solves both the
same-origin problem and the evidence-capture problem with one already-installed tool,
not two new ones.

Tradeoff, named plainly: Ben reviews in a Playwright-launched Chromium window, not his
everyday Chrome. Necessary so the save step can screenshot the live page server-side.

## Freeze pattern (non-negotiable, per FAILURE-LEDGER instruments eight + nine)
`document.getAnimations().forEach(a => { a.pause(); a.currentTime = 0 })` — `pause()`
alone is not enough (instrument nine); pins every animation to a fixed point on its own
timeline, not wherever wall-clock happened to leave it. Applied to the iframe's
`contentDocument`, called every time the station changes, before any paint interaction
is allowed and before any screenshot.

## Known divergence, named not hidden
`safebox-hit-test.mjs` (lines ~120-127) found that a direct `jumpTo(i)` from a fresh
page reads different pixels than reaching station `i` via the gate's real path (36
`turn()` calls, then `jumpTo(0..i)` in sequence) — instrument nine, Test B. This tool
uses direct `jumpTo(i)` per the spec's explicit instruction, for review speed across 12
stations. Flagging here per `ring-world-mistakes.md`'s falsifiers discipline: what Ben
reviews may not pixel-match what the real gate/playthrough renders. Fine for reviewing
composition/shape/color problems (the categories this tool captures); if a mark's
category is specifically about something that could be an artifact of this shortcut,
that's worth a second look via the real path before treating it as a confirmed bug.

## Layout
- Outer page (`ring-review-tool.html`): top toolbar (progress strip, brush size,
  save button), then a wrapper `<div>` containing `<iframe src="world-07-ring.html">`
  behind a `<canvas>` overlay on top, absolutely positioned to exactly match the
  iframe's live `#stage` rect (recomputed on load/resize — `.wrap` has its own
  max-width/padding, `#stage` isn't flush with the iframe's own top-left).
- Iframe's own header/controls render as-is (untouched); the paint canvas only
  covers `#stage`.

## Data model (in-memory, per station)
```
station.verdict = 'fine' | null      // G-keyed, only settable when marks.length === 0
station.marks = [{
  id, category: 'shape-wrong'|'too-dim'|'contaminated'|'other'|null,
  note, bbox: [x,y,w,h] (0-1, normalized to #stage rect), ts,
  _points, _radius   // in-memory only, for redraw — stripped before export
}]
```
`key`/`prim` (station noun/primitive) stored redundantly on each mark at commit time,
not derived from index at export time — stations have been reshuffled before
(2026-08-09), an index-only reference would silently drift.

## Interaction
- Prev/Next buttons + ←/→ keys (ignored while the note textarea is focused).
- Progress strip: 12 dots — gray (unreviewed) / amber (has marks) / green (G-keyed
  fine). Not clickable nav (out of scope; trivial to add later if wanted).
- Brush size: 3-stop S/M/L toggle above the canvas, no slider.
- Drag paints a semi-transparent stroke (full opacity while drawing). Mouseup with any
  points → inline autofocused-textarea card anchored near the stroke, non-blocking (no
  modal), with the 4 category buttons. Enter (no Shift) commits, Esc discards the
  stroke entirely and removes it. Starting a new stroke auto-commits any still-open
  card first (empty note allowed).
- Committed strokes redraw at ~30% opacity.
- `G` keys the current station "fine" — only when it has zero marks.
- `beforeunload` warns if an open card or any unsaved marks/verdicts exist since last
  save.

## Export (Save button, not automatic)
- `POST /api/save` with the full 12-station verdict+mark set (marks stripped of
  `_points`/`_radius` client-side before send).
- Server writes `concepts/reviews/ring-review-<YYYY-MM-DD-HHMMSS>.json` (creates
  `concepts/reviews/` if absent), one file per Save click — not per calendar date.
  **Revised 2026-08-11, post-Opus-critique:** the original design keyed the filename
  on date alone, so a second sitting on the same day silently overwrote the first
  sitting's file and orphaned its PNGs. Filename now carries a full local timestamp
  (seconds resolution) so every Save is its own file; nothing is ever overwritten.
- For every station with ≥1 mark: server drives the live Playwright page — `jumpTo`,
  freeze, wait for settle, screenshot `#paintCanvas` (element screenshot, not a
  viewport clip — see Known limitations) — and writes
  `concepts/reviews/ring-review-<stamp>-st<NN>.png` (`NN` = station number, 01-12).
  Station is restored to whatever Ben was looking at before Save when done.
- Client shows `Saved ✓ <path>` on success.

## Known limitations, accepted not fixed (post-Opus-critique, 2026-08-11)
A second-opinion critique (Claude Opus 5) reviewed the build. Real bugs it found were
fixed the same session (PNG viewport-crop, `.shoot` element leak on freeze, bbox
y-extent math on non-square stages, dead Enter/Esc after clicking a category button,
stray-click phantom marks, Save re-entrancy, a dirty-flag gap around in-flight saves).
Two structural findings were reviewed and deliberately left as-is:
- **Capture architecture.** Opus's suggestion: a second headless Playwright page draws
  marks from payload data instead of the server driving Ben's own live/headed page for
  capture. Real tradeoff (a save mid-draw can, in principle, still interleave with the
  capture navigation on the single shared page) — but a bigger rewrite than the
  bug-fix budget justified for a one-user internal tool. Not revisited unless it
  actually bites in practice.
- **Iframe auto-advance desync.** world-07-ring.html's own on-canvas controls
  (auto-advance, quietest/loudest, reduced-motion, safe-box) are still live and can
  change what's on screen without the parent tool's `currentStation` tracking it,
  producing a mark mis-keyed to the wrong station/key/prim. Accepted as a known
  limitation, not fixed: Ben's workflow is arrow-keys/G to navigate, not those
  controls, and disabling them would mean reaching into iframe internals beyond the
  freeze precedent already established.

## Files this adds
- `concepts/PLAN-ring-review-tool.md` (this file)
- `concepts/ring-review-tool.html`
- `concepts/tools/ring-review-server.mjs`
- `concepts/reviews/` (created on first save)

## Explicitly out of scope (per spec)
No undo beyond Esc-discard-current-stroke. No editing a mark after commit. No mark
color-coding by category. No stroke-path export. Does not modify `world-07-ring.html`.
