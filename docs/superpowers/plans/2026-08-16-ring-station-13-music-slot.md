# Ring Station 13 (Music Slot) Implementation Plan

> **SUPERSEDED DETAIL, 2026-08-16 (same day, follow-up commit on this branch):** every
> "station 12 / index 12 / `MUSIC_STATION = 12`" below is the plan as executed, but the
> record was then SWAPPED to **station 10** (trading places with the supernova, now
> st12) to resolve the radial-mass spacing tradeoff this plan itself flagged — Ben:
> "it can just flip it with another station, correct?". `MUSIC_STATION = 10` now.
> See the record entry's comment in `concepts/world-07-ring.html` for the full
> spacing arithmetic. PANES=13, the wrap point, and everything else here stand.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the jukebox grading-break its own dedicated 13th stop in the ring's rotation — a real drawn `record` object with its own sky region — instead of consuming an arbitrary one of the existing 12 stations and hiding it under an opaque overlay.

**Architecture:** `ENGINE.PANES` goes 12 → 13 in both builds. A new `record` primitive is added to the shared `ringPrimitives.js` `makePrim()` dispatch (one edit, both builds inherit it). Station index 12 is appended to both station arrays as the music station, carrying a new third sky region (`disco`) with itself as `regionSource`. `Display.jsx` routes the break onto that slot via a new `stationOverride` prop threaded through `ParticleBackground` to `RingAmbient`'s already-existing `jumpTo()`.

**Tech Stack:** React 18, Vite, plain DOM + SVG (no canvas), Vitest, Playwright (`ring-verify.mjs`).

**Ownership boundary:** ring-side only. `StationRingLayer.jsx`, `LiveScreen.jsx`, `Jukebox.jsx`, `JukeboxBreakOverlay.jsx` belong to a concurrent agent on `jukebox-ring-fusion` — read-only here, never edited.

---

## Context an engineer needs before starting

**Two-file sync discipline.** `client/src/worlds/midnightGalaxy.ring.js` and `concepts/world-07-ring.html` hold independent hand-maintained copies of the station array and `ENGINE`. Every station edit lands in BOTH, in the same commit. `references/ring-world-continuity.md` and `concepts/FAILURE-LEDGER.md` document a real drift bug from exactly this (st9's spanning field shipped in one build and not the other for four days).

**STAYS-HUMAN (`references/ring-world-continuity.md` §4).** Do not edit `concepts/tools/ring-spec.lock.json`, `ring-verify.mjs`'s pass/fail logic, or any gate cap. Do not invent replacement thresholds. If the gate fails after this change, report the delta and stop — that is the correct outcome, not a problem to patch around.

**The gate lies unless frozen.** `ring-verify.mjs` calls `freezeFrame()` after every `jumpTo()`. Instruments eight and nine in the failure ledger are both the same bug (measuring an unfrozen animation frame). Any new time-varying element on station 12 must be pinnable by `document.getAnimations()` — i.e. a real CSS animation, never a `requestAnimationFrame` loop.

**Why `jumpTo` and not a multi-frame glide.** The pan cylinder is built exactly `cylinder + ENGINE.W` wide — one spare frame. A glide can cover exactly one station of travel. Travelling from an arbitrary station to station 12 is up to 12 frames, which there is no authored content for. `jumpTo()` already exists as the authoritative snap-resync and is the only path `ring-verify.mjs` drives. Firing it at the instant the opaque jukebox overlay mounts hides the snap the same way the wrap's deferred modulo reset is hidden.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `client/src/lib/ringPrimitives.js` | Modify | Add `record` primitive to `makePrim()`; add `.rc-*` CSS to `ringCss()`; add `disco` to `SKY_REGIONS` |
| `client/src/lib/ringEngine.js` | Modify | Add `assertLayerPeriods()` invariant self-check |
| `client/src/worlds/midnightGalaxy.ring.js` | Modify | Append station 12 |
| `concepts/world-07-ring.html` | Modify | `PANES: 13`, append station 12 (hand-synced copy) |
| `client/src/components/display/RingAmbient.jsx` | Modify | `PANES: 13`; add `stationOverride` prop + effect |
| `client/src/components/display/ParticleBackground.jsx` | Modify | Thread `stationOverride` through |
| `client/src/views/Display.jsx` | Modify | Pass `MUSIC_STATION` when `breakActive` |
| `client/src/lib/ringEngine.test.js` | Modify | Add 13-pane arithmetic + wrap-glide tests |
| `client/src/lib/skyRegions.test.js` | Modify | Extend shipped-layout test for 13 stations + `disco` |

---

### Task 1: Record the pre-change gate baseline

The gate has pre-existing failures unrelated to this work (`drawnSubject.kinds` in the lock file lists only `ground/nebulaCloud/ring/sprite`, while the shipped world uses 12 different prims). Without a baseline, every one of those gets misattributed to station 13.

**Files:**
- Create: `concepts/.audit-shots/station13-baseline.txt` (gitignored scratch — do not commit)

- [ ] **Step 1: Run the gate on unmodified `origin/main`**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.worktrees/ring-station-13
npm run verify:ring > /tmp/verify-BASELINE.txt 2>&1; echo "EXIT=$?"
```

Expected: completes in 3-8 minutes. Non-zero exit is fine and expected — capture it.

- [ ] **Step 2: Extract the FAIL/WARN roster**

```bash
grep -E "^\s*(FAIL|WARN)" /tmp/verify-BASELINE.txt | sort | uniq -c | sort -rn
```

Expected: a list. Save it verbatim — the final report compares against exactly this.

- [ ] **Step 3: No commit** (baseline is measurement, not a code change)

---

### Task 2: Layer-period invariant self-check

`concepts/world-07-ring.html:279` documents the invariant "m must divide PANES". `near` has `m: 3`, and `3 ∤ 13`. The arithmetic still tiles exactly (13×2880/3 = 12480px, an integer, and 3×12480 = 37440 = the full cylinder), so the change is safe — but the documented rule is now wrong, and the real requirement needs stating and checking rather than being silently violated.

**Files:**
- Modify: `client/src/lib/ringEngine.js:20-21`
- Test: `client/src/lib/ringEngine.test.js`

- [ ] **Step 1: Write the failing test**

Append to `client/src/lib/ringEngine.test.js`:

```js
import { assertLayerPeriods } from './ringEngine.js'

describe('assertLayerPeriods', () => {
  const LAYERS = [
    { id: 'sky', surge: 0, m: 1 },
    { id: 'far', surge: 480, m: 1 },
    { id: 'mid', surge: 1920, m: 1 },
    { id: 'near', surge: 2880, m: 3 },
  ]

  it('accepts the shipped 13-pane engine (13 is not divisible by 3, but the pixel period is integral)', () => {
    expect(() => assertLayerPeriods({ PANES: 13, LAYERS })).not.toThrow()
  })

  it('accepts the historical 12-pane engine', () => {
    expect(() => assertLayerPeriods({ PANES: 12, LAYERS })).not.toThrow()
  })

  it('throws when a layer period is not a whole number of pixels', () => {
    const bad = [{ id: 'near', surge: 2881, m: 3 }]
    expect(() => assertLayerPeriods({ PANES: 13, LAYERS: bad })).toThrow(/whole pixels/)
  })

  it('throws when the authored period does not tile the cylinder', () => {
    const bad = [{ id: 'near', surge: 2880, m: 0 }]
    expect(() => assertLayerPeriods({ PANES: 13, LAYERS: bad })).toThrow()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx vitest run client/src/lib/ringEngine.test.js
```

Expected: FAIL — `assertLayerPeriods is not a function`.

- [ ] **Step 3: Implement**

In `client/src/lib/ringEngine.js`, directly after the `authorPeriodOf` export (line 21), add:

```js
// The real invariant, replacing "m must divide PANES" (concepts/world-07-
// ring.html's old ENGINE comment, accurate only while PANES was 12).
//
// What actually has to hold is that each layer's authored strip is a whole
// number of pixels AND tiles its cylinder exactly m times — otherwise the
// modulo wrap lands mid-content and the repeat shows a seam. At PANES=13
// with near's m=3: cylinder 37440, period 12480, 3 x 12480 === 37440. Exact.
// 13 is not divisible by 3 and does not need to be: what the old wording was
// really protecting is pixel-exact tiling, not an integer turn count. The
// turn count per repeat (PANES/m = 4.333 at 13 panes) only has to be integral
// for layers whose content is station-keyed, and m>1 is permitted solely on
// anonymous layers (near = 26 stars, no station identity) — the original
// comment says so itself in its next clause.
export function assertLayerPeriods(engine) {
  for (const L of engine.LAYERS) {
    if (L.surge === 0) continue // sky never pans
    const cyl = cylinderOf(engine, L)
    const period = authorPeriodOf(engine, L)
    if (!Number.isInteger(period)) {
      throw new Error(`ringEngine: layer "${L.id}" period ${period} is not whole pixels (PANES=${engine.PANES}, surge=${L.surge}, m=${L.m})`)
    }
    if (period * L.m !== cyl) {
      throw new Error(`ringEngine: layer "${L.id}" period ${period} x m ${L.m} !== cylinder ${cyl}`)
    }
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run client/src/lib/ringEngine.test.js
```

Expected: PASS, all 4 new tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/ringEngine.js client/src/lib/ringEngine.test.js
git commit -m "ring: assert layer periods tile the cylinder, replacing the 'm divides PANES' rule"
```

---

### Task 3: The `record` primitive

Station 13 needs an object with the same construction quality as the comet, pulsar and binary pair — not a placeholder disc. A vinyl record in this world's vocabulary: a tilted ellipse (reusing `ring`'s established perspective language and `tilt = -10`), concentric groove arcs, a specular sheen sweep across the grooves, a bright centre label, and the standard `d-glow` outer wash every other primitive carries.

Aesthetics here are STAYS-HUMAN. This is a considered default, explicitly expected to be iterated on visually by Ben — not a locked design.

**Files:**
- Modify: `client/src/lib/ringPrimitives.js` — new `else if (kind === 'record')` branch in `makePrim()`, inserted after the `ring` branch (currently ends line 1898); new CSS in `ringCss()`

- [ ] **Step 1: Add the CSS classes**

In `ringCss(p)`, alongside the existing `.${p}rg-ring` / `.${p}r-body` rules, add:

```js
.${p}rc-svg{position:absolute;inset:0;width:100%;height:100%}
.${p}rc-label{position:absolute;border-radius:50%}
.${p}rc-spindle{position:absolute;border-radius:50%;background:#0a0512}
.${p}rc-sheen{position:absolute;border-radius:50%;mix-blend-mode:screen;pointer-events:none}
```

- [ ] **Step 2: Add the primitive branch**

Insert immediately after the `ring` branch's closing brace in `makePrim()`:

```js
  else if (kind === 'record') {
    // Station 12's music object. Built on `ring`'s already-accepted
    // perspective language (same tilt, same SVG-arc-in-a-viewBox idiom, same
    // d-glow wash) rather than a new visual grammar — a record IS a tilted
    // disc, so the anatomy transfers directly. What makes it read as a
    // record and not a planet: concentric grooves at a real LP's proportions
    // (label ~= 0.36 of the disc, grooves stopping short of both the outer
    // edge and the label), a specular sheen sweep, and a flat self-lit face
    // instead of drawPlanetDisc's terminator — vinyl has no day/night side.
    const NS = 'http://www.w3.org/2000/svg'
    const cx = w / 2, cy = h / 2
    const tilt = -10 // matches `ring` — one light/perspective convention per world
    const rx = Math.min(w, h) * 0.46, ry = rx * 0.34

    // outer glow first (paints behind everything) — same closest-side wash
    // and fill scaling every other primitive uses.
    const glow = el('d-glow')
    const gd = w * 0.95
    glow.style.left = px((w - gd) / 2); glow.style.top = px((h - gd) / 2)
    glow.style.width = glow.style.height = px(gd)
    glow.style.background = `radial-gradient(circle closest-side, ${hsla(hue, 62, 68, A(0.30, fill))} 0%, transparent ${E(94, fill).toFixed(0)}%)`
    f.appendChild(glow)

    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    svg.setAttribute('class', el('rc-svg').className)
    const rot = `rotate(${tilt} ${cx.toFixed(1)} ${cy.toFixed(1)})`

    // disc face — dark vinyl, not black: carries the station hue at low
    // lightness so it belongs to the palette instead of punching a hole.
    const face = document.createElementNS(NS, 'ellipse')
    face.setAttribute('cx', cx.toFixed(1)); face.setAttribute('cy', cy.toFixed(1))
    face.setAttribute('rx', rx.toFixed(1)); face.setAttribute('ry', ry.toFixed(1))
    face.setAttribute('transform', rot)
    face.setAttribute('fill', hsla(hue, 42, 12, A(0.94, fill)))
    svg.appendChild(face)

    // grooves — 9 concentric ellipses between the label edge (0.40) and just
    // inside the rim (0.94). Alpha rises toward the outer edge so the disc
    // reads as catching light at its perimeter, the way a real LP does.
    const GROOVES = 9
    for (let g = 0; g < GROOVES; g++) {
      const t = g / (GROOVES - 1)
      const k = lerp(0.40, 0.94, t)
      const e = document.createElementNS(NS, 'ellipse')
      e.setAttribute('cx', cx.toFixed(1)); e.setAttribute('cy', cy.toFixed(1))
      e.setAttribute('rx', (rx * k).toFixed(1)); e.setAttribute('ry', (ry * k).toFixed(1))
      e.setAttribute('transform', rot)
      e.setAttribute('fill', 'none')
      e.setAttribute('stroke', hsla(hue + 6, 58, lerp(38, 70, t), A(lerp(0.16, 0.40, t), fill)))
      e.setAttribute('stroke-width', Math.max(1, w * 0.0025).toFixed(2))
      svg.appendChild(e)
    }

    // rim — the one crisp edge, so the silhouette closes cleanly against the
    // sky rather than dissolving into the outermost groove.
    const rim = document.createElementNS(NS, 'ellipse')
    rim.setAttribute('cx', cx.toFixed(1)); rim.setAttribute('cy', cy.toFixed(1))
    rim.setAttribute('rx', rx.toFixed(1)); rim.setAttribute('ry', ry.toFixed(1))
    rim.setAttribute('transform', rot)
    rim.setAttribute('fill', 'none')
    rim.setAttribute('stroke', hsla(hue + 10, 74, 76, A(0.46, fill)))
    rim.setAttribute('stroke-width', Math.max(1.5, w * 0.004).toFixed(2))
    svg.appendChild(rim)

    // centre label — the bright, saturated core. This is the element that
    // makes the object read at frame scale and from the back of a taproom.
    const label = document.createElementNS(NS, 'ellipse')
    label.setAttribute('cx', cx.toFixed(1)); label.setAttribute('cy', cy.toFixed(1))
    label.setAttribute('rx', (rx * 0.36).toFixed(1)); label.setAttribute('ry', (ry * 0.36).toFixed(1))
    label.setAttribute('transform', rot)
    label.setAttribute('fill', hsla(hue, 82, 62, A(0.88, fill)))
    svg.appendChild(label)

    // spindle hole
    const hole = document.createElementNS(NS, 'ellipse')
    hole.setAttribute('cx', cx.toFixed(1)); hole.setAttribute('cy', cy.toFixed(1))
    hole.setAttribute('rx', (rx * 0.045).toFixed(1)); hole.setAttribute('ry', (ry * 0.045).toFixed(1))
    hole.setAttribute('transform', rot)
    hole.setAttribute('fill', hsla(hue, 40, 8, 0.95))
    svg.appendChild(hole)

    f.appendChild(svg)

    // specular sheen — a soft elliptical highlight raked across the grooves,
    // screen-blended. Vinyl's whole visual signature is this sweep; without
    // it the grooves read as a target. Static (no animation) so the verify
    // gate's freezeFrame has nothing to pin and the p99.5 luminance is
    // deterministic.
    const sheen = el('rc-sheen')
    const sw = rx * 2, sh = ry * 2
    sheen.style.left = px(cx - sw / 2); sheen.style.top = px(cy - sh / 2)
    sheen.style.width = px(sw); sheen.style.height = px(sh)
    sheen.style.transform = `rotate(${tilt}deg)`
    sheen.style.background = `linear-gradient(112deg, transparent 26%, ${hsla(hue + 16, 70, 82, A(0.20, fill))} 44%, ${hsla(hue + 16, 60, 90, A(0.30, fill))} 50%, ${hsla(hue + 16, 70, 82, A(0.16, fill))} 56%, transparent 74%)`
    f.appendChild(sheen)
  }
```

- [ ] **Step 3: Verify it renders in the harness**

```bash
npx vite --port 5199 &
sleep 4
node -e "1" # placeholder — real check is Step 4's gate run
```

Actually verify visually via `concepts/world-07-ring.html` once Task 5 lands. No standalone check here; the primitive is unreachable until a station uses it.

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/ringPrimitives.js
git commit -m "ring: add the record primitive (tilted disc, grooves, label, sheen)"
```

---

### Task 4: The `disco` sky region

Ben: "ensure that the color wiring on s13 is noticeable and fun." The strongest available lever is the sky-region system that already exists — a third region makes station 12 light its own sky, exactly as the pulsar and supernova do, rather than being one more object on the world's default purple.

Hue 300 (magenta) is deliberate: it sits between the world's violet home (256/268) and its rose accent (330), so it is a relative of the purple family — which also serves the "three colour themes flowing in unison" ask — while being the most saturated point in that family. `accent: false`: the world caps warm complementary accents at 3 stations (st3/st6/st10) and that cap is already met.

Side effect worth knowing: this partly fills the ring's flattest colour stretch. Station 0 previously carried zero region weight; it now carries `disco: 0.5`.

**Files:**
- Modify: `client/src/lib/ringPrimitives.js:2821-2826` (`SKY_REGIONS`)
- Test: `client/src/lib/skyRegions.test.js`

- [ ] **Step 1: Write the failing test**

Append to `client/src/lib/skyRegions.test.js`:

```js
  it('gives the music station its own region, lighting st11 and st0', () => {
    const w = skyRegionWeights(midnightGalaxyRing.stations)
    expect(midnightGalaxyRing.stations).toHaveLength(13)
    expect(w[12].disco).toBe(1)
    expect(w[11].disco).toBe(0.25) // approach
    expect(w[0].disco).toBe(0.5)   // exit — wraps past the end of the array
  })
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx vitest run client/src/lib/skyRegions.test.js
```

Expected: FAIL — length is 12, `w[12]` is undefined.

- [ ] **Step 3: Add the region**

Replace the `SKY_REGIONS` object body (`ringPrimitives.js:2821-2826`):

```js
export const SKY_REGIONS = {
  // Hues match the objects that cause them: aurora sits on the lit
  // planet (140) / pulsar (120) pair, ember on the supernova (36),
  // disco on the record (300).
  aurora: { hue: 152, tintSat: 60, tintLight: 27, srcSat: 55, srcLight: 56 },
  ember: { hue: 26, tintSat: 66, tintLight: 28, srcSat: 62, srcLight: 56 },
  // 2026-08-16, station 12 (Ben: "ensure that the color wiring on s13 is
  // noticeable and fun"). Deliberately the most saturated of the three
  // (tintSat 74 vs 60/66) and one lightness step up — this is the party
  // moment, and it is the only region whose object is a manufactured thing
  // rather than an astronomical one. Hue 300 keeps it inside the world's
  // violet family (sky 268, st0 256, st2 268) instead of opening a fourth
  // unrelated colour zone, so it reads as the home palette turned up rather
  // than a stranger.
  disco: { hue: 300, tintSat: 74, tintLight: 30, srcSat: 70, srcLight: 60 },
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run client/src/lib/skyRegions.test.js
```

Expected: still FAIL — the station array is not yet 13 long. That is Task 5. Do not commit a red test; sequence Task 5 immediately after and commit them together.

- [ ] **Step 5: No commit yet** — held until Task 5

---

### Task 5: Station 12 in both builds

**Files:**
- Modify: `client/src/worlds/midnightGalaxy.ring.js:79` (after the aurora-ribbon entry)
- Modify: `concepts/world-07-ring.html:379` (after the aurora-ribbon entry) — hand-synced copy

- [ ] **Step 1: Append to `midnightGalaxy.ring.js`'s `stations` array**

```js
    { key: 'record', prim: 'record', hue: 300, accent: false, region: 'disco', regionSource: true }, // NEW 2026-08-16 — station 13, the jukebox grading-break's own slot (Ben: "it needs to have its own ring slot"). Radial-mass family: {0,4,8,12} — 12 is 4 from st8 and 1 from st0 cyclically at 13 panes... see world-07-ring.html's identical comment for the spacing tradeoff, flagged not hidden. regionSource: the record's own label IS the light source for the disco sky (same contract as the pulsar/supernova). accent:false — the world's warm-complementary cap (<=3 stations) is already met by st3/st6/st10.
```

- [ ] **Step 2: Append the identical entry to `concepts/world-07-ring.html`**

```js
  { key:'record',         prim:'record',       hue:300, accent:false, region:'disco', regionSource:true }, // NEW 2026-08-16 — station 13, the jukebox grading-break's own slot (Ben: "it needs to have its own ring slot"). KNOWN TRADEOFF, flagged not hidden: the radial-mass silhouette family was {0,4,8}; adding 12 at PANES=13 puts st12-st0 at cyclic distance 1, violating the >=3 same-family spacing rule the 2026-08-09 reshuffle established. The music station's index is pinned by the break-routing contract (Display.jsx's MUSIC_STATION), so it cannot simply be moved; either st0 or st12 changes silhouette family, or the rule takes an exception here. Ben's call, same as st3's own 2026-08-13 spacing exception.
```

- [ ] **Step 3: Run the sky-region tests**

```bash
npx vitest run client/src/lib/skyRegions.test.js
```

Expected: PASS — including Task 4's new test.

- [ ] **Step 4: Fix the pre-existing shipped-layout test**

`skyRegions.test.js`'s existing `'matches the shipped Midnight Galaxy layout'` test asserts a 12-long array. Extend both expected arrays by one trailing element (aurora gains `0`, ember gains `0`) and re-run. Show the diff in the commit.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/ringPrimitives.js client/src/lib/skyRegions.test.js \
        client/src/worlds/midnightGalaxy.ring.js concepts/world-07-ring.html
git commit -m "ring: add station 13 (record) with its own disco sky region, both builds"
```

---

### Task 6: PANES 12 → 13

This is the high-blast-radius step. `arcAt()` is `cos(2*PI*(i + phase) / PANES)`, so changing `PANES` moves the loudness arc at **every** station, not just the new one — which moves ink, fill, safe-box luminance and arc-band membership everywhere. That is expected and is what Task 8 measures.

**Files:**
- Modify: `client/src/components/display/RingAmbient.jsx:53`
- Modify: `concepts/world-07-ring.html:274`
- Modify: `concepts/world-07-ring.html:279-281` (the now-wrong invariant comment)
- Modify: `client/src/components/display/RingAmbient.jsx:563` (stale `12 x` docstring)

- [ ] **Step 1: Write the failing wrap-glide test**

Ben: "ensure that the glide from s12-s13-s0 is smooth using pixel math like earlier." In 0-indexed terms that is st11 → st12 and st12 → st0. The second is the new wrap point. Append to `client/src/lib/ringEngine.test.js`:

```js
// Ben, 2026-08-16: "ensure that the glide from s12-s13-s0 is smooth using
// pixel math like earlier". 1-indexed s12/s13/s0 = indices 11 -> 12 -> 0.
// The wrap point MOVED when PANES went 12 -> 13: it used to be 11 -> 0, it is
// now 12 -> 0. This reproduces turn()'s own offset arithmetic (RingAmbient.jsx
// and world-07-ring.html share it) and asserts every turn advances by exactly
// one surge of real travel — no snap, no double-step, no dropped frame.
describe('13-pane wrap glide', () => {
  const ENGINE13 = {
    PANES: 13,
    LAYERS: [
      { id: 'far', surge: 480, m: 1 },
      { id: 'mid', surge: 1920, m: 1 },
      { id: 'near', surge: 2880, m: 3 },
    ],
  }

  // turn(): offset += surge unconditionally (the GLIDE target, possibly
  // un-modded and hanging one frame past the cylinder — legal, the DOM is
  // built cylinder + W wide), then AFTER the transition completes, %= cylinder.
  function simulate(engine, turns) {
    const offset = Object.fromEntries(engine.LAYERS.map(L => [L.id, 0]))
    const legs = []
    for (let t = 0; t < turns; t++) {
      const before = { ...offset }
      for (const L of engine.LAYERS) offset[L.id] += L.surge
      const glideTarget = { ...offset }
      for (const L of engine.LAYERS) offset[L.id] %= cylinderOf(engine, L)
      legs.push({ before, glideTarget, after: { ...offset } })
    }
    return legs
  }

  it('every leg glides exactly one surge, including 11->12 and 12->0', () => {
    const legs = simulate(ENGINE13, 13)
    legs.forEach((leg, i) => {
      for (const L of ENGINE13.LAYERS) {
        const travel = leg.glideTarget[L.id] - leg.before[L.id]
        expect(travel, `turn ${i}, layer ${L.id}`).toBe(L.surge)
      }
    })
  })

  it('the glide target is always real authored content (<= cylinder)', () => {
    const legs = simulate(ENGINE13, 13)
    for (const leg of legs) {
      for (const L of ENGINE13.LAYERS) {
        expect(leg.glideTarget[L.id]).toBeLessThanOrEqual(cylinderOf(ENGINE13, L))
      }
    }
  })

  it('all layers return to phase 0 together on turn 13, not 12', () => {
    const legs = simulate(ENGINE13, 13)
    const at12 = legs[11].after
    const at13 = legs[12].after
    expect(Object.values(at12).some(v => v !== 0)).toBe(true)
    expect(at13).toEqual({ far: 0, mid: 0, near: 0 })
  })

  it('the wrap leg (12->0) is a full surge of travel, not a rewind', () => {
    const legs = simulate(ENGINE13, 13)
    const wrap = legs[12]
    expect(wrap.glideTarget.mid).toBe(cylinderOf(ENGINE13, ENGINE13.LAYERS[1]))
    expect(wrap.glideTarget.mid - wrap.before.mid).toBe(1920) // forward, positive
    expect(wrap.after.mid).toBe(0) // reset happens only after the transition
  })

  it('near (m=3) tiles its cylinder exactly at 13 panes', () => {
    const near = ENGINE13.LAYERS[2]
    expect(authorPeriodOf(ENGINE13, near) * near.m).toBe(cylinderOf(ENGINE13, near))
    expect(Number.isInteger(authorPeriodOf(ENGINE13, near))).toBe(true)
  })
})
```

- [ ] **Step 2: Run it**

```bash
npx vitest run client/src/lib/ringEngine.test.js
```

Expected: PASS immediately — this is pure arithmetic over `cylinderOf`/`authorPeriodOf`, which already take `PANES` as a parameter. A PASS here is the point: it proves the glide math generalises to n=13 with no off-by-one, before any component changes. If it FAILS, stop and report.

- [ ] **Step 3: Change `PANES` in `RingAmbient.jsx:53`**

```js
  PANES: 13,
```

- [ ] **Step 4: Change `PANES` in `concepts/world-07-ring.html:274`**

```js
  PANES: 13,
```

- [ ] **Step 5: Correct the invariant comment in `concepts/world-07-ring.html:278-281`**

```js
  /* surge = px this layer moves per turn.  m = how many times its content
     repeats around the ring; m>1 only where content is anonymous, because an
     anonymous repeat is invisible.
     cylinder = PANES * surge — the layer's period, exactly PANES turns.
     The constraint is pixel-exact tiling (authorPeriodOf integral, and
     period*m === cylinder), NOT "m divides PANES" — that older wording was
     only ever accurate while PANES was 12. See ringEngine.js's
     assertLayerPeriods(), which now checks the real rule. At PANES=13,
     near's m=3 still tiles exactly: 13*2880/3 = 12480, 3*12480 = 37440. */
```

- [ ] **Step 6: Fix the stale docstring at `RingAmbient.jsx:563`**

```js
// stations: [PANES x {key,prim,hue,accent}] } — see concepts/world-07-ring.html's
```

- [ ] **Step 7: Wire the assertion in at mount**

In `RingAmbient.jsx`, import `assertLayerPeriods` alongside the existing `ringEngine.js` imports on line 39, and call it once at module scope directly after the `ENGINE` literal (line 71):

```js
assertLayerPeriods(ENGINE)
```

- [ ] **Step 8: Run the full unit suite**

```bash
npx vitest run
```

Expected: 122 baseline + new tests, 0 failures.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/display/RingAmbient.jsx concepts/world-07-ring.html \
        client/src/lib/ringEngine.test.js
git commit -m "ring: PANES 12 -> 13, both builds; correct the layer-period invariant"
```

---

### Task 7: Route the grading break onto station 12

The break currently burns an arbitrary turn and then hides whatever station it landed on under an opaque overlay. This makes it land on the music station instead.

`jumpTo()` snaps rather than glides — correct here, because it fires in the same React commit that mounts the opaque `JukeboxBreakOverlay`, so the snap is covered exactly the way the wrap's deferred modulo reset is.

**Files:**
- Modify: `client/src/components/display/RingAmbient.jsx` (new prop + effect)
- Modify: `client/src/components/display/ParticleBackground.jsx:1206,1248`
- Modify: `client/src/views/Display.jsx:409`

- [ ] **Step 1: Add the prop and effect to `RingAmbient.jsx`**

Change the signature (line 566):

```js
const RingAmbient = forwardRef(function RingAmbient({ worldData, slideKey, stationOverride }, ref) {
```

Add, immediately after the existing `slideKey` effect (after line 746):

```js
  // ── Station override: the jukebox grading-break's dedicated slot ──
  // Everything else advances the ring by exactly one station per slide. The
  // break is the one moment that must land on a SPECIFIC station (12, the
  // record) regardless of where the rotation happens to be, so it is the one
  // caller that jumps instead of turning.
  //
  // jumpTo() snaps — no glide — and that is deliberate, not a shortcut. The
  // pan cylinder is authored exactly `cylinder + ENGINE.W` wide: one spare
  // frame, enough to glide one station. Travelling an arbitrary 0-12 stations
  // has no authored content to glide across. Display.jsx flips this prop in
  // the same commit that mounts the opaque JukeboxBreakOverlay, so the snap
  // happens under cover, the same way turn()'s own post-wrap modulo reset does.
  //
  // Contract for the jukebox-side layer (jukebox-ring-fusion branch): by the
  // time the overlay paints, stationRef is 12 and the disco sky tint is at
  // full weight. Reading window.__ringStation gives the live index.
  useEffect(() => {
    if (stationOverride == null) return
    jumpTo(stationOverride)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationOverride])
```

- [ ] **Step 2: Thread it through `ParticleBackground.jsx`**

Line 1206:

```js
export default function ParticleBackground({ theme, slideKey, stationOverride }) {
```

Line 1248:

```js
              ? <RingAmbient worldData={ringWorld} slideKey={slideKey} stationOverride={stationOverride} />
```

- [ ] **Step 3: Pass it from `Display.jsx`**

Add near the top of the file, beside the other module constants:

```js
// The ring's dedicated music slot — index 12, the `record` station (see
// client/src/worlds/midnightGalaxy.ring.js). Kept here rather than imported
// so a non-ring theme, which has no stations at all, still compiles: the
// value is inert unless a ring world is mounted.
const MUSIC_STATION = 12
```

Change line 409:

```js
      <ParticleBackground
        theme={theme}
        slideKey={currentSlide?.id}
        stationOverride={breakActive ? MUSIC_STATION : null}
      />
```

- [ ] **Step 4: Verify by hand in the browser**

```bash
npx vite --port 5173
```

Open `/display?show=<id>` on a show with a grading break. Advance to the break slide. Expected: the ring turns normally on arrival; 5 seconds later the jukebox overlay mounts and the ring is on the record station behind it. On break exit, the record station is visible, and the next slide glides 12 → 0.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/display/RingAmbient.jsx \
        client/src/components/display/ParticleBackground.jsx \
        client/src/views/Display.jsx
git commit -m "display: route the grading break onto the ring's dedicated music station"
```

---

### Task 8: Re-run the gate and report the delta

- [ ] **Step 1: Run**

```bash
npm run verify:ring > /tmp/verify-AFTER.txt 2>&1; echo "EXIT=$?"
```

- [ ] **Step 2: Diff against the Task 1 baseline**

```bash
diff <(grep -E "^\s*(PASS|FAIL|WARN)" /tmp/verify-BASELINE.txt | sed 's/[0-9]\+\.[0-9]\+//g') \
     <(grep -E "^\s*(PASS|FAIL|WARN)" /tmp/verify-AFTER.txt | sed 's/[0-9]\+\.[0-9]\+//g')
```

- [ ] **Step 3: Classify every changed line**

Three buckets, reported verbatim to Ben:
1. **Pre-existing** — failed on baseline too. Not caused by this work.
2. **Count-threshold drift** — a check whose cap is a raw count calibrated against 12 (`bleed: 3-5/12`, `vertSpread: >=6/12`, `quadrant: 2-4 per quadrant`). These are lock-file values. **Do not edit them.** Report the new number and the old cap.
3. **Arc/luminance movement** — caused by `arcAt`'s cosine now dividing by 13. Report per-station deltas.

- [ ] **Step 4: Do NOT edit `ring-spec.lock.json`.** STAYS-HUMAN, `references/ring-world-continuity.md` §4. A failure here is the correct, reportable outcome.

- [ ] **Step 5: Commit the plan's completion notes only if any docs changed.**

---

## Self-Review

**Spec coverage:**
- 13th slot in rotation → Tasks 5, 6
- Real station-array entry, not a copy → Tasks 3, 5
- Break routes onto it → Task 7
- `skyRegionWeights` at n=13 → Task 4 (already generic; test added)
- Lock-file recalibration reported not patched → Tasks 1, 8
- Object reads as belonging to the vocabulary → Task 3
- Glide smooth at s12→s13→s0 → Task 6 Step 1
- Colour noticeable and fun → Task 4
- Two-file sync → Tasks 5, 6 (both files in the same commit)

**Placeholder scan:** Task 3 Step 3 is a stub ("no standalone check here") — acceptable, it states plainly that the primitive is unreachable until Task 5 and defers to the gate. No TBDs elsewhere.

**Type consistency:** `stationOverride` used identically in Tasks 7 Steps 1-3. `assertLayerPeriods` signature `(engine)` matches between Task 2 Step 3 and Task 6 Step 7. `MUSIC_STATION = 12` matches the station array index appended in Task 5.

**Known risk carried, not resolved:** Task 5's silhouette-family spacing violation (st12 and st0 are both radial-mass, cyclic distance 1). Flagged in both files' comments for Ben, following st3's 2026-08-13 precedent.
