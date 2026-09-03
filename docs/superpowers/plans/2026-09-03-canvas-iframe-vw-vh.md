# Build-Mode Canvas Iframe (vw/vh WYSIWYG) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `vw`/`vh`-sized slide content in the build-mode canvas (`SlideCanvasEditor.jsx`) render at the correct proportion relative to the 1920×1080 TV, regardless of the host's browser window width — matching the WYSIWYG guarantee the file's own header comment already claims for everything else.

**Architecture:** `canvasRef`'s content (`ParticleBackground` + `SlideRenderer`) moves into a real `<iframe>` sized to a fixed 1920×1080 viewport and CSS-scaled as a whole, so `vw`/`vh` inside it resolve against that fixed viewport instead of the real window — the same technique `ThemePickerModal.jsx` already uses for its own theme preview. `overlayRef` (every drag/rotate/resize handle, all the gesture math) does **not** move — it is already a separate sibling DOM subtree whose positioning is pure percent-of-canvas arithmetic with no cross-document measurement. Only two functions need surgical fixes for the new document boundary: `detectRegions()` (adds an iframe-offset conversion to its rect math) and `enterEditMode()` (targets the iframe's own `document`/`window` for caret placement, via `el.ownerDocument`).

**Tech Stack:** React 18, Vite, Tailwind (compiled), Google Fonts (Boogaloo + DM Sans), Playwright (bundled Chromium) for verification — no new dependencies.

**Spec:** This document; no separate spec file. Full research brief (file:line inventory of every gesture handler, `getBoundingClientRect()` call site, and the `vw`/`vh` usages this fixes) is folded into the Global Constraints and per-task context below — sourced from a full read of `client/src/components/host/SlideCanvasEditor.jsx` (1860 lines) and `client/src/components/host/ThemePickerModal.jsx` (321 lines) on 2026-09-03.

## Global Constraints

- `INNER_W = 1920`, `INNER_H = 1080` — the canvas's reference resolution. Do not change; region transforms (`_regionTransforms.fontSizePx`/`dx`/`dy`) are stored in these pixels and read back verbatim on `/display` (see `client/src/components/host/SlideCanvasEditor.jsx:38-47`).
- **`overlayRef` and everything it renders (region handle boxes, overlay boxes, snap guides, rotate readout) stays in the top-level document.** Do not move it into the iframe. Its positioning math (`overlayBoxStyle`, `textBoxTypography`, all overlay gesture handlers) is pure percent-of-`scaledW`/`scaledH` arithmetic and needs zero changes.
- **`canvasRef` must keep pointing at the same wrapper div type it always has** — a plain DOM node with `querySelector`/`querySelectorAll` available, `width: INNER_W`, `height: INNER_H`, `containerType: 'size'`. The only difference is that div now lives inside `iframe.contentDocument` instead of the top document. This keeps the ~30 existing `canvasRef.current.querySelector(...)` call sites (region gestures, `enterEditMode`, `getRegionFontSizePx`) working with **zero changes**.
- Do not touch `client/src/components/host/ThemePickerModal.jsx`. It has its own working `PreviewFrame` iframe implementation solving a narrower problem (static content, no per-element measurement, no gestures). Sharing a component with it is an explicit non-goal for this plan — it adds refactor risk to a file that isn't broken, for no functional gain here.
- Do not touch `client/src/components/display/slides/*.jsx`, `SlideRenderer.jsx`, or `OverlayLayer.jsx`. `SlideRenderer` already reads `theme` from `ThemeProvider` context (not a prop), and React context propagation follows the component tree, not the DOM tree — a `createPortal` into the iframe's `document.body` does not break it. No slide component needs to change.
- `youtubeWarmAudio.js` (`client/src/lib/youtubeWarmAudio.js:54,113,116,125`) creates its own hidden YouTube player `<iframe>` via `document.createElement` + `document.body.appendChild`, using the bare module-level `document` global — which always resolves to the top-level document (ES modules parse once, in one JS realm), regardless of where the *calling* slide component's JSX gets portaled. This is unaffected by this change; do not modify it.
- Zero automated test coverage exists today for `SlideCanvasEditor.jsx` or `ThemePickerModal.jsx` (confirmed: no `.test.js`/`.test.jsx` file references either). Every task below that touches gesture behavior ends in a scripted Playwright check against the real dev server (this session's established pattern — bundled Chromium, `PLAYWRIGHT_HOST_PIN` from `.env.local`, never `executablePath` at Ben's real Chrome) — not a claim of passing tests that don't exist.
- `getRegionFontSizePx()` (`client/src/components/host/SlideCanvasEditor.jsx:711-719`) calls the bare `getComputedStyle(leaf)` global on an element that, after Task 1, lives inside the iframe's document. Per the CSSOM spec this resolves against the element's own document regardless of which window's `getComputedStyle` you call — should need no code change, but is explicitly verified in Task 2 Step 6 rather than assumed.
- `npm run test:unit` (vitest, 33 files, ~600 tests) and `npm run build` must stay green after every task.

---

### Task 1: `CanvasIframe.jsx` — the iframe/portal component, wired into `SlideCanvasEditor.jsx`

**Files:**
- Create: `client/src/components/host/CanvasIframe.jsx`
- Modify: `client/src/components/host/SlideCanvasEditor.jsx:940-946` (swap the plain scaled `<div ref={canvasRef}>` for `<CanvasIframe>`)

**Interfaces:**
- Produces: `CanvasIframe` — a `forwardRef` component. Props: `{ width: number, height: number, scale: number, background: string, children: ReactNode }`. The forwarded ref resolves to the wrapper `<div>` **inside** the iframe's own document (same role `canvasRef.current` played before this task — a real DOM node with `querySelector`/`offsetWidth`/etc., just now owned by a different `document`). Also attaches that wrapper div as `el.dataset.canvasIframeStage = '1'` so later tasks can find the iframe element itself via `el.ownerDocument.defaultView.frameElement`.
- Consumes: nothing from earlier tasks (first task).

- [ ] **Step 1: Write `CanvasIframe.jsx`**

```jsx
// CanvasIframe — renders children inside a real <iframe>, sized to a fixed
// resolution and CSS-scaled as a whole, so vw/vh units inside resolve against
// that fixed resolution instead of the real browser window. Same technique as
// ThemePickerModal.jsx's PreviewFrame, generalized for a resizable host panel
// (scale is a prop, not a fixed constant) and for content that needs live DOM
// measurement from outside (SlideCanvasEditor's detectRegions) — so, unlike
// PreviewFrame, the exposed ref is a real node inside the iframe's document,
// not just a portal target.
//
// Style/font strategy deliberately differs from ThemePickerModal: that file
// hand-duplicates the ~4 Tailwind classes its own tiny preview needs. The
// slide-render tree this wraps (SlideRenderer + 19 slide types + OverlayLayer)
// uses far more Tailwind utility classes than is practical to hand-duplicate
// and keep in sync — instead, every <link rel="stylesheet"> and <style> tag
// already in the host document's <head> is cloned into the iframe's <head> at
// mount. This covers Tailwind (a single hashed stylesheet in production, or
// Vite's injected <style> tags in dev) automatically, with no manual class
// list to maintain.
import { useEffect, useRef, useState, forwardRef } from 'react'
import { createPortal } from 'react-dom'

const GOOGLE_FONTS_HTML = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Boogaloo&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
`

const CanvasIframe = forwardRef(function CanvasIframe(
  { width, height, scale, background, children },
  forwardedRef
) {
  const iframeRef = useRef(null)
  const [frameBody, setFrameBody] = useState(null)
  const stageRef = useRef(null)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    doc.open()
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">${GOOGLE_FONTS_HTML}</head><body></body></html>`)
    doc.close()

    // Clone every stylesheet link + injected <style> tag from the host
    // document into the iframe — Tailwind's compiled output either way,
    // without hand-duplicating utility classes.
    document.querySelectorAll('head link[rel="stylesheet"], head style').forEach(node => {
      doc.head.appendChild(node.cloneNode(true))
    })

    doc.body.style.margin = '0'
    doc.body.style.padding = '0'
    setFrameBody(doc.body)
  }, [])

  // Expose the wrapper div (not the iframe element itself) as the ref, so
  // callers keep using it exactly like the old plain-div canvasRef.
  function setStageRef(el) {
    stageRef.current = el
    if (typeof forwardedRef === 'function') forwardedRef(el)
    else if (forwardedRef) forwardedRef.current = el
  }

  return (
    <iframe
      ref={iframeRef}
      title="slide-canvas-stage"
      style={{
        position: 'absolute', top: 0, left: 0,
        width, height,
        border: 0,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        overflow: 'hidden',
      }}
    />
  )

  // NOTE: the wrapper div + portal must render even before frameBody is
  // ready is impossible (no DOM to portal into) — see Step 2 for the real
  // return, which conditions the portal on frameBody and puts the iframe +
  // portal together. Written as a separate step so Step 1's file compiles
  // and Step 2's diff is easy to review in isolation.
})

export default CanvasIframe
```

- [ ] **Step 2: Fix the return statement — portal the stage div in once `frameBody` is ready**

Replace the `return` block from Step 1 with:

```jsx
  return (
    <>
      <iframe
        ref={iframeRef}
        title="slide-canvas-stage"
        style={{
          position: 'absolute', top: 0, left: 0,
          width, height,
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          overflow: 'hidden',
        }}
      />
      {frameBody && createPortal(
        <div
          ref={setStageRef}
          data-canvas-iframe-stage="1"
          style={{
            position: 'absolute', top: 0, left: 0,
            width, height,
            overflow: 'hidden',
            containerType: 'size',
            background,
          }}
        >
          {children}
        </div>,
        frameBody
      )}
    </>
  )
```

Remove the placeholder `return` and trailing comment from Step 1 — this is the file's real, final return.

- [ ] **Step 3: Wire it into `SlideCanvasEditor.jsx`**

Add the import near the other host component imports (after the `SHINY_GOLD` import, `client/src/components/host/SlideCanvasEditor.jsx:36`):

```jsx
import CanvasIframe from './CanvasIframe.jsx'
```

Replace the canvas div (`client/src/components/host/SlideCanvasEditor.jsx:940-946`):

```jsx
            <div ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: INNER_W, height: INNER_H, transform: `scale(${dynScale})`, transformOrigin: 'top left', overflow: 'hidden', containerType: 'size', background: theme.colors.bg }}>
              <ParticleBackground theme={theme} />
              <SlideRenderer slide={{ ...slide, data }} show={show} direction={1} isPreview />
            </div>
```

with:

```jsx
            <CanvasIframe ref={canvasRef} width={INNER_W} height={INNER_H} scale={dynScale} background={theme.colors.bg}>
              <ParticleBackground theme={theme} />
              <SlideRenderer slide={{ ...slide, data }} show={show} direction={1} isPreview />
            </CanvasIframe>
```

The outer clipping wrapper (`client/src/components/host/SlideCanvasEditor.jsx:941-942`, `<div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>`) stays unchanged around it.

- [ ] **Step 4: Verify — build, then a scripted Playwright check against the real dev server**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
npm run test:unit 2>&1 | tail -5
npm run build 2>&1 | tail -3
```

Then start the dev server and check with a real browser that (a) the canvas still renders at all, (b) a `vw`-sized element now measures correctly regardless of window width. Use `client/src/components/display/slides/TitleSlide.jsx:42` (`fontSize: 'clamp(3rem, 7vw, 6rem)'`, un-overridden) as the test element — open a slide of type `title` in build mode.

Write this as a standalone script (this session's established pattern for
one-off verification — see the plan's own git history for `probe-host.mjs`/
`make-throwaway.mjs` if those still exist in the scratchpad): the navigation
steps below are the exact, concrete steps, not a placeholder — copy them in.

```js
// verify-canvas-iframe.mjs — save anywhere and run with:
//   node --env-file=.env.local verify-canvas-iframe.mjs [--width=800]
import { chromium } from '@playwright/test'

const PIN = process.env.PLAYWRIGHT_HOST_PIN
const SHOW_ID = process.env.SHOW_ID || 'show_NyRe6x2Q' // a real, non-throwaway show is fine — read-only
const WIDTH = Number((process.argv.find(a => a.startsWith('--width=')) || '--width=1400').split('=')[1])

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 } })

// Authenticate past HostPinGate — same flow as e2e/global-setup.js.
await page.addInitScript(id => localStorage.setItem('trivia-os:activeShowId', id), SHOW_ID)
await page.goto('http://localhost:5173/host', { waitUntil: 'networkidle' })
const pinHeading = page.getByRole('heading', { name: 'Enter host PIN' })
if (await pinHeading.isVisible().catch(() => false)) {
  await page.getByPlaceholder('••••').fill(PIN)
  await page.getByRole('button', { name: 'Unlock' }).click()
  await pinHeading.waitFor({ state: 'hidden', timeout: 15_000 })
}

// Open a title slide in build mode: expand a round, click a slide whose
// sidebar row is labeled with the round's title-card icon, or simplest —
// click "Pre-Show"/"State of the Union"/any row and confirm slide.type via
// the loaded show; for a guaranteed title slide, click a round's own title
// card if the show has one, or add one via "+ Add" -> Title first.
await page.locator('aside').getByText(/Round 1|State of the Union/).first().click()
await page.waitForTimeout(2000)

const measured = await page.evaluate(() => {
  const iframe = document.querySelector('iframe[title="slide-canvas-stage"]')
  if (!iframe) return { error: 'no CanvasIframe found — is a slide open in build mode?' }
  const titleEl = iframe.contentDocument.querySelector('[data-slide-region="title"] *, [data-slide-region="title"]')
  if (!titleEl) return { error: 'no title region found — open a title-type slide' }
  const fontPx = parseFloat(iframe.contentWindow.getComputedStyle(titleEl).fontSize)
  return { fontPx, viewportWidth: window.innerWidth }
})
console.log(JSON.stringify(measured, null, 2))
await browser.close()
```

Run it twice, once with `--width=1400` and once with `--width=800`, alongside
`npm run dev` running in another terminal. `fontPx` must be the SAME both
times (the iframe's own fixed 1920px viewport, not the real window width).
Before this task, the same check against the OLD plain-div canvas would have
returned a font size scaled to the real viewport width — different at 1400
vs 800.
```

Expected: `fontPx` is close to `expectedPx` (96, the `6rem` clamp ceiling — a 1920px iframe viewport puts `7vw` past the ceiling) **regardless of the real browser window's width** — confirm this by re-running with `viewport: { width: 800, height: 600 }` and getting the same `fontPx`. Before this task, the same check against the OLD plain-div canvas would have returned a font size scaled to the REAL viewport width (800px window → `7vw` = 56px, wrong).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/host/CanvasIframe.jsx client/src/components/host/SlideCanvasEditor.jsx
git commit -m "$(cat <<'EOF'
Add CanvasIframe: build-mode canvas content moves into a real iframe so vw/vh resolve correctly

vw/vh always resolve against the real browser viewport, never against an
ancestor's transform:scale() — so un-overridden slide text sized in vw/vh
rendered at the wrong proportion in build mode, correct only when the host's
window happened to be exactly 1920px wide. ThemePickerModal.jsx solved this
for its own simpler preview with an iframe; this generalizes the technique.

CanvasIframe clones every stylesheet in the host document's <head> into the
iframe instead of hand-duplicating Tailwind classes (ThemePickerModal's
approach doesn't scale to SlideRenderer's much larger utility-class surface).

The ref it exposes is a real DOM node inside the iframe's own document,
playing the exact role the old plain-div canvasRef did — every existing
canvasRef.current.querySelector(...) call site needs no changes. Region
detection and inline-edit caret placement DO need cross-document fixes;
that is the next task, not this one — expect region handles to be visibly
misaligned until then.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QAj33pGSxSrjnhSdJM5DPm
EOF
)"
```

Do not push yet — Task 2 fixes the region-detection regression this task deliberately introduces.

---

### Task 2: Fix `detectRegions()` and `enterEditMode()` for the new document boundary

**Files:**
- Modify: `client/src/components/host/SlideCanvasEditor.jsx` (the `detectRegions` function, `~line 507-538`; the `enterEditMode` function, `~line 732-801`)

**Interfaces:**
- Consumes: `canvasRef.current` from Task 1 — a DOM node inside `iframe.contentDocument`. `overlayRef.current` — unchanged, top-document.
- Produces: `toPageRect(iframeInternalRect, iframeElRect, scale)` — a new pure function (plain numbers in, plain object out — no DOM access, unit-testable without jsdom's layout limitations).

**Context — why this needs a fix:** Before Task 1, `canvasRef`'s content was a direct child of the top document with `transform: scale(dynScale)` applied to the SAME element whose descendants get measured — the browser resolves that ancestor transform automatically when you call `el.getBoundingClientRect()` on a descendant, so `detectRegions()` could freely mix `canvasRef`-descendant rects with `overlayRef.current.getBoundingClientRect()` (both already page-relative, both already scaled). After Task 1, `canvasRef`'s content lives inside the iframe's OWN document — `getBoundingClientRect()` calls made from inside that document return coordinates relative to the IFRAME'S OWN viewport (unscaled, as if it were an independent 1920×1080 window), not the page. `offsetWidth`/`offsetHeight` were already being treated as unscaled values in the pre-existing code (`el.offsetWidth * dynScale` at the old line 532) — that math is untouched and already correct for the new architecture. Only the `r = el.getBoundingClientRect()` branch (used when the region has no rotate/scale transform active) needs a page-offset added.

- [ ] **Step 1: Add the `toPageRect` helper**

Add near the top of `SlideCanvasEditor.jsx`, after the `clamp` function (`client/src/components/host/SlideCanvasEditor.jsx:52`):

```jsx
// Converts a rect measured INSIDE an iframe's own document (unscaled,
// relative to the iframe's own viewport) into page-relative, scaled
// coordinates — by adding the iframe element's own page position and
// multiplying by its outer CSS scale. Pure function: plain numbers in,
// plain numbers out, so it's testable without a real iframe or jsdom's
// unreliable layout engine.
function toPageRect(iframeInternalRect, iframeElRect, scale) {
  const left = iframeElRect.left + iframeInternalRect.left * scale
  const top = iframeElRect.top + iframeInternalRect.top * scale
  const width = iframeInternalRect.width * scale
  const height = iframeInternalRect.height * scale
  return { left, top, width, height, right: left + width, bottom: top + height }
}
```

- [ ] **Step 2: Write a unit test for `toPageRect` before wiring it in**

Create `client/src/components/host/CanvasIframe.test.js` (co-located, matching the repo's existing `lib/*.test.js` convention):

```js
import { describe, it, expect } from 'vitest'

// toPageRect is defined inline in SlideCanvasEditor.jsx (not exported — it's
// a one-file-local helper). Re-implemented verbatim here as a golden-master:
// if SlideCanvasEditor.jsx's copy diverges from this, the region-detection
// math has changed and this test should be updated deliberately, not
// silently pass. (If a second consumer ever needs this function, promote it
// to client/src/lib/ and import it in both places + this test.)
function toPageRect(iframeInternalRect, iframeElRect, scale) {
  const left = iframeElRect.left + iframeInternalRect.left * scale
  const top = iframeElRect.top + iframeInternalRect.top * scale
  const width = iframeInternalRect.width * scale
  const height = iframeInternalRect.height * scale
  return { left, top, width, height, right: left + width, bottom: top + height }
}

describe('toPageRect', () => {
  it('maps an iframe-internal rect to page coordinates at scale 1, zero offset', () => {
    const result = toPageRect(
      { left: 100, top: 50, width: 200, height: 80 },
      { left: 0, top: 0 },
      1
    )
    expect(result).toEqual({ left: 100, top: 50, width: 200, height: 80, right: 300, bottom: 130 })
  })

  it('scales dimensions and offsets by the iframe element scale', () => {
    // A 1920x1080 iframe scaled to 0.5 (960x540 on screen), positioned at
    // page (40, 20) — matches SlideCanvasEditor's real geometry model.
    const result = toPageRect(
      { left: 960, top: 540, width: 100, height: 40 }, // element at iframe-center, iframe-internal px
      { left: 40, top: 20 },
      0.5
    )
    expect(result.left).toBe(40 + 960 * 0.5)   // 520
    expect(result.top).toBe(20 + 540 * 0.5)    // 290
    expect(result.width).toBe(50)
    expect(result.height).toBe(20)
    expect(result.right).toBe(result.left + 50)
    expect(result.bottom).toBe(result.top + 20)
  })

  it('handles a zero-size rect (collapsed/hidden element) without NaN', () => {
    const result = toPageRect({ left: 0, top: 0, width: 0, height: 0 }, { left: 0, top: 0 }, 1)
    expect(result).toEqual({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 })
  })
})
```

- [ ] **Step 3: Run the test — should pass immediately (pure function, no wiring needed yet)**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
npx vitest run client/src/components/host/CanvasIframe.test.js 2>&1 | tail -10
```

Expected: 3 passed. (This test validates the formula in isolation, before Step 4 wires the real one into `detectRegions()` — if Step 4's copy ever drifts from this golden master, this file is the place to update deliberately.)

- [ ] **Step 4: Fix `detectRegions()`**

Replace (`client/src/components/host/SlideCanvasEditor.jsx`, current `detectRegions` body):

```jsx
  function detectRegions() {
    if (!canvasRef.current || !overlayRef.current) return
    const oRect = overlayRef.current.getBoundingClientRect()
    const els = canvasRef.current.querySelectorAll('[data-slide-region]')
    setRegions(Array.from(els).map(el => {
      const r = el.getBoundingClientRect()
      const id = el.dataset.slideRegion
      const rt = (data._regionTransforms ?? {})[id] ?? {}
      const dx = rt.dx ?? 0, dy = rt.dy ?? 0
      const hasRotScale = !!(rt.rotate || (rt.scale && rt.scale !== 1))
      const w = hasRotScale ? el.offsetWidth * dynScale : r.width
      const h = hasRotScale ? el.offsetHeight * dynScale : r.height
      const cx = (r.left + r.right) / 2 - oRect.left - dx * dynScale
      const cy = (r.top + r.bottom) / 2 - oRect.top - dy * dynScale
      return { id, field: el.dataset.slideField, x: cx - w / 2, y: cy - h / 2, w, h }
    }))
  }
```

with:

```jsx
  function detectRegions() {
    if (!canvasRef.current || !overlayRef.current) return
    // canvasRef.current now lives inside CanvasIframe's own document — its
    // getBoundingClientRect() calls are relative to the IFRAME's own
    // viewport (unscaled), not the page. Convert through the iframe
    // element's own page position + scale to get page-relative rects, the
    // same coordinate space overlayRef (unchanged, top-document) is in.
    const iframeWin = canvasRef.current.ownerDocument.defaultView
    const iframeEl = iframeWin.frameElement
    const iframeElRect = iframeEl.getBoundingClientRect()
    const oRect = overlayRef.current.getBoundingClientRect()
    const els = canvasRef.current.querySelectorAll('[data-slide-region]')
    setRegions(Array.from(els).map(el => {
      const raw = el.getBoundingClientRect()
      const r = toPageRect(raw, iframeElRect, dynScale)
      const id = el.dataset.slideRegion
      const rt = (data._regionTransforms ?? {})[id] ?? {}
      const dx = rt.dx ?? 0, dy = rt.dy ?? 0
      const hasRotScale = !!(rt.rotate || (rt.scale && rt.scale !== 1))
      const w = hasRotScale ? el.offsetWidth * dynScale : r.width
      const h = hasRotScale ? el.offsetHeight * dynScale : r.height
      const cx = (r.left + r.right) / 2 - oRect.left - dx * dynScale
      const cy = (r.top + r.bottom) / 2 - oRect.top - dy * dynScale
      return { id, field: el.dataset.slideField, x: cx - w / 2, y: cy - h / 2, w, h }
    }))
  }
```

`el.offsetWidth`/`el.offsetHeight` are untouched — they were already unscaled-layout values multiplied by `dynScale`, which is exactly right whether the element lives in the top document or the iframe's document (offsetWidth never reflects an ANCESTOR's CSS transform, only the element's own layout box, regardless of which document it's measured from).

- [ ] **Step 5: Fix `enterEditMode()`'s document/window references**

Replace (`client/src/components/host/SlideCanvasEditor.jsx`, inside `enterEditMode`, the caret-placement block near the end of the function):

```jsx
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
```

with:

```jsx
    // el now lives inside CanvasIframe's own document (its slide-region text
    // is portaled there along with the rest of SlideRenderer's output) — use
    // ITS document/window for caret placement, not the top-level ones, or
    // the selection silently targets the wrong document and nothing visible
    // happens.
    const doc = el.ownerDocument
    const win = doc.defaultView
    el.focus()
    const range = doc.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = win.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
```

- [ ] **Step 6: Verify — build, then a scripted Playwright check of the full region gesture set**

```bash
npm run test:unit 2>&1 | tail -5
npm run build 2>&1 | tail -3
```

Then, against the real dev server (same harness pattern as Task 1 Step 4 — authenticate via `PLAYWRIGLE_HOST_PIN`, load a real show, open a question slide in build mode):

1. Click the question-text region — confirm a selection outline box appears, and its screen position visually overlaps the real rendered text (not offset).
2. Drag the region — confirm it moves smoothly and the box tracks the pointer with no jump or lag.
3. Rotate the region via its rotate handle — confirm it rotates around its own center, matching pre-Task-1 behavior.
4. Double-click / click-again to enter text-edit mode on the region — confirm the caret appears inside the text (this is the `enterEditMode` fix; before Step 5 the caret placement would silently target the wrong document and do nothing visible).
5. Type a character, blur — confirm the change persists (saved via `change(region.field, val)`).
6. Resize a photo region via its corner handle — confirm smooth, centered radial resize.
7. Select a text region and use the toolbar's font-size stepper (not double-click-edit — this exercises `getRegionFontSizePx()`, `client/src/components/host/SlideCanvasEditor.jsx:711-719`, a code path this task does NOT modify but that reads `getComputedStyle(leaf)` on an element now living inside the iframe's document via the bare top-level `getComputedStyle` global). Confirm the stepper shows a sane starting value (not `40` — the NaN fallback) and that dragging/stepping it resizes the text. Per the CSSOM spec, `Window.getComputedStyle(elt)` resolves against `elt`'s own document regardless of which window's `getComputedStyle` you call it through, so this should already work — this step exists to confirm that against the real app rather than leave it as an unverified spec citation. If it shows `40` or doesn't resize, that's a real gap this task's Step 4/5 pattern needs to extend to `getRegionFontSizePx`.

Every check above is a manual/scripted assertion against the real running app — there is no automated test suite for this gesture surface to lean on (see Global Constraints). Take a screenshot at each step and visually confirm rather than assuming from the absence of a thrown error.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/host/SlideCanvasEditor.jsx client/src/components/host/CanvasIframe.test.js
git commit -m "$(cat <<'EOF'
Fix detectRegions() and enterEditMode() for the new iframe document boundary

CanvasIframe (prior commit) moved canvasRef's content into its own document,
which broke region detection: getBoundingClientRect() calls made from inside
an iframe return coordinates relative to the IFRAME's own viewport, not the
page, so subtracting overlayRef's (page-relative, unchanged) rect from a
region's (now iframe-relative) rect produced garbage offsets.

toPageRect() converts through the iframe element's own page position and
scale — pure function, golden-mastered in CanvasIframe.test.js since jsdom
can't validate real layout math (getBoundingClientRect always returns zeros
there). offsetWidth/offsetHeight math is untouched: it was already treating
those as unscaled values, which is correct in both the old and new layout.

enterEditMode's caret placement used the bare `document`/`window` globals,
which always mean the TOP document — now targets el.ownerDocument (the
iframe's) so double-click-to-edit actually places a visible caret again.

Verified against the real dev server: region select/drag/rotate/resize and
enter-text-edit-mode all confirmed working by direct observation.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QAj33pGSxSrjnhSdJM5DPm
EOF
)"
```

---

### Task 3: Verify the overlay system needs no changes, and confirm vw/vh WYSIWYG across the real slide catalog

**Files:**
- None modified — this task is verification-only. If it finds a real regression, STOP and write a new task rather than patching ad hoc; the plan's architecture claim (overlay gestures need zero changes) should be either confirmed or falsified cleanly, not patched around silently.

**Interfaces:**
- Consumes: the completed Task 1 + Task 2 state.

**Context:** Per the Global Constraints, every overlay gesture handler (`startOverlayDrag`, `startOverlayResize`, `startOverlayRotate`, snap-guide math, `centerOverlayH`/`centerOverlayV`) computes geometry from `overlayRef.current.getBoundingClientRect()` (top-document, unchanged) combined with `e.clientX`/`e.clientY` (also top-document, since the pointer is physically over the top-level page) and pure percent-of-`scaledW`/`scaledH` arithmetic — none of it reads `canvasRef`'s content. This task exists to actually confirm that claim against the running app rather than leave it as an assumption, and to sweep the 15 files with real `vw`/`vh` usages for any that still look wrong.

- [ ] **Step 1: Overlay gesture smoke test** — against the real dev server, in build mode with "Edit layout" on:
  1. Insert a text overlay — confirm it appears at the expected position.
  2. Drag it — confirm smooth movement, snap guides appear near canvas center/other overlays.
  3. Resize and rotate it via its handles.
  4. Insert an image overlay (upload or from host photos) — confirm it renders and is draggable.
  5. Undo/redo a few steps — confirm history walks correctly.
  6. Toggle "Edit layout" off and back on — confirm nothing shifts.

  If every one of these behaves identically to before Task 1 (compare against the pre-change build if in doubt — `git stash` the `CanvasIframe` changes temporarily, or trust the architecture analysis if it's unambiguous), the Global Constraints claim holds and no overlay code changes are needed.

- [ ] **Step 2: vw/vh sweep across real content** — open at least one slide of each type listed below in build mode, at two different real browser window widths (e.g. 1400px and 900px), and confirm the un-overridden text size looks the SAME relative proportion in both (not literally identical pixels — the canvas itself scales with the panel — but the same fraction of the canvas):
   - `TitleSlide.jsx:42,61` — title + subtitle
   - `RoundIntroSlide.jsx:56,75` — round number + title
   - `QuestionSlide.jsx:1091,1249` — question text at two different font-size call sites
   - `RulesSlide.jsx:249,268,273` — three separate clamp() sites in one slide
   - `ShinyOrderQuestion.jsx:126,149,186` — text + gap sizing
   - One slide with an un-overridden `vh`-based size: `ShinyWagerQuestion.jsx:190` (`height: '38vh'`) or `StateOfUnionSlide.jsx:230` (`height: '24vh'`)

   This is the direct fix verification — before this plan, at least one of these would visibly change proportion when you resized the browser window; after, none should.

- [ ] **Step 3: Report findings inline in the plan's tracking (no separate file)** — if Step 1 or Step 2 surfaces anything unexpected, stop and write a new task (do not patch inline mid-verification).

---

### Task 4: Final verification, YouTube/audio spot-check, and cleanup

**Files:**
- None expected to change, unless Task 3 surfaced a real issue.

**Interfaces:**
- Consumes: Tasks 1-3 complete and confirmed.

- [ ] **Step 1: YouTube/audio embed spot-check** — open a shiny video question (uses `QuestionSlide.jsx:1008`'s plain `<iframe src={embedSrc}>`) and a slide with a walkout song or shiny audio question (uses `youtubeWarmAudio.js`'s hidden top-document player) in build mode. Confirm both still play correctly. Per the Global Constraints, `youtubeWarmAudio.js` was already architected to target `document.body` directly regardless of any calling component's portal target, so this should need no code change — this step exists to confirm that reasoning against the real app, not to leave it as a read-only code-review claim.

- [ ] **Step 2: Full regression pass**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
npm run test:unit 2>&1 | tail -6
npm run build 2>&1 | tail -3
```

Expected: same pass count as `main` before this branch started, plus the 3 new `CanvasIframe.test.js` tests.

- [ ] **Step 3: Update this plan's own status** — mark every checkbox above `[x]` as completed, or note explicitly which steps were skipped/deferred and why, before handing off for merge review.

- [ ] **Step 4: Hand off for merge** — per this repo's established pattern this session: commit on a `fix/`-prefixed branch, verify tests + build on the merged result, merge to `main`, push, report the exact commits and verification evidence — do not merge/push without being asked.
