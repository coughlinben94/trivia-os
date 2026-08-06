# Space World Spec Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the shipped ring ambient build (`concepts/world-07-ring.html`, `client/src/components/display/RingAmbient.jsx`, `client/src/worlds/midnightGalaxy.ring.js`) into conformance with `concepts/ART-DIRECTION-SPEC.md`, the canonical spec. Scope is the **space world only** — the 21-theme generalization goal is explicitly dropped (Ben's direct instruction); nothing here should be written to accommodate themes that don't exist yet.

**Architecture:** Fix the 6 known live bugs first (fast, already diagnosed, each independent). Then rework the primitive vocabulary for real edge/silhouette legibility (§6 — the single highest-impact visual fix per the design critique). Then placement/legibility (§2, §9), the value-arc gate (§3), depth mechanics (§7), and motion (§8). Each task updates `concepts/world-07-ring.html` (source of truth) and, where the change is in scope for what's already been ported, the corresponding `client/src/` file — but do NOT re-open files/scope that prior tasks on this branch already shipped and reviewed unless this plan explicitly says to (e.g. `ringEngine.js`'s `arcAt` jitter fix from earlier today stays as-is; §3 of this plan only adds the no-flat-neighbours replacement, doesn't re-touch the jitter formula).

**Tech Stack:** Vanilla JS (reference build), React (production port), `concepts/tools/ring-verify.mjs` (the gate — several of its checks need updating to match the new spec, see Task 8).

**Reference:** `concepts/ART-DIRECTION-SPEC.md` — every task below cites the section it implements. Read the cited section before implementing; this plan doesn't repeat the full rule text.

---

## File Structure

- Modify: `concepts/world-07-ring.html` — the reference build, source of truth for every visual rule.
- Modify: `client/src/components/display/RingAmbient.jsx` — the React port, mirrors whatever changes here (see Task 12 — the sync pass).
- Modify: `client/src/worlds/midnightGalaxy.ring.js` — world data (hue anchors, sky stops).
- Modify: `concepts/tools/ring-verify.mjs` — the gate; several checks are being replaced per the spec, not just added to.
- Create: `client/src/lib/colorContrast.js` — small, reusable relative-luminance/contrast-ratio helpers (needed by Task 1, doesn't exist yet — check `client/src/lib/colorTint.js` first, it has hex parsing but no luminance/contrast math).

---

### Task 1: Question text color legibility floor (spec §9, appendix #1)

**Files:**
- Create: `client/src/lib/colorContrast.js`
- Create: `client/src/lib/colorContrast.test.js`
- Modify: `client/src/worlds/midnightGalaxy.ring.js`

- [ ] **Step 1: Write the failing test**

```js
// client/src/lib/colorContrast.test.js
import { describe, it, expect } from 'vitest'
import { relativeLuminance, contrastRatio, ensureLegibleTextColor } from './colorContrast.js'

describe('relativeLuminance', () => {
  it('white is 1, black is 0', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 2)
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 2)
  })
})

describe('contrastRatio', () => {
  it('white on black is 21:1', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0)
  })
})

describe('ensureLegibleTextColor', () => {
  it('passes through a color that already meets the floor', () => {
    // #e2ccff against luma-34-equivalent bg easily clears 7:1
    const result = ensureLegibleTextColor('#e2ccff', '#222222')
    expect(result).toBe('#e2ccff')
  })
  it('lightens a color that fails the floor, preserving hue', () => {
    // #4a1a8f (Midnight Galaxy's real theme.colors.accent) against a dark bg
    // is the actual live bug this fix closes - roughly 1.4:1, must be lightened
    const result = ensureLegibleTextColor('#4a1a8f', '#222222')
    expect(contrastRatio(result, '#222222')).toBeGreaterThanOrEqual(7)
    expect(relativeLuminance(result)).toBeGreaterThanOrEqual(0.45)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL — `colorContrast.js` doesn't exist yet.

- [ ] **Step 3: Implement**

```js
// client/src/lib/colorContrast.js
// Relative luminance + contrast ratio (WCAG 2 formulas), plus a helper that
// auto-lightens a color toward white (hue preserved) until it clears a
// legibility floor. Exists because a real bug shipped: midnightGalaxy.ring.js
// sourced question text color from theme.colors.accent (a UI-surface color,
// never tuned for text) and landed at ~1.4:1 contrast for Midnight Galaxy.
// See ART-DIRECTION-SPEC.md §9.

function srgbToLinear(c) {
  c /= 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

export function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexA), lb = relativeLuminance(hexB)
  const lighter = Math.max(la, lb), darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

function rgbToHex(r, g, b) {
  const c = v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

// Lightens toward white in RGB space, preserving hue direction, until the
// color clears BOTH the luminance floor and the contrast-against-bg floor.
export function ensureLegibleTextColor(hex, bgHex, { minLuminance = 0.45, minContrast = 7 } = {}) {
  if (relativeLuminance(hex) >= minLuminance && contrastRatio(hex, bgHex) >= minContrast) return hex
  const { r, g, b } = hexToRgb(hex)
  for (let t = 0.05; t <= 1; t += 0.05) {
    const lr = r + (255 - r) * t, lg = g + (255 - g) * t, lb = b + (255 - b) * t
    const candidate = rgbToHex(lr, lg, lb)
    if (relativeLuminance(candidate) >= minLuminance && contrastRatio(candidate, bgHex) >= minContrast) {
      return candidate
    }
  }
  return '#ffffff'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit`
Expected: PASS, all new tests green, existing suite still green (28 tests total: 25 prior + 3 new).

- [ ] **Step 5: Wire it into `midnightGalaxy.ring.js`**

```js
// add import at top
import { ensureLegibleTextColor } from '../lib/colorContrast.js'

// replace the qColours line:
qColours: [
  ensureLegibleTextColor(theme.colors.highlight, theme.colors.bgDeep),
  ensureLegibleTextColor(theme.colors.text ?? theme.colors.highlight, theme.colors.bgDeep),
],
```

Per spec §9: never source from `theme.colors.accent` (a UI-surface color). Use `highlight` and `text`/a `highlight` fallback, run both through the floor.

- [ ] **Step 6: Verify against real data**

Run: `node -e "import('./client/src/worlds/midnightGalaxy.ring.js').then(m => console.log(m.midnightGalaxyRing.qColours))"` — confirm both colors are legible hex strings, not the old `theme.colors.accent` value (`#4a1a8f`).

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/colorContrast.js client/src/lib/colorContrast.test.js client/src/worlds/midnightGalaxy.ring.js
git commit -m "Fix live text-contrast bug: question colors now pass a legibility floor, never source from theme.accent"
```

---

### Task 2: Sky terminal stop should derive from theme, not a hardcoded literal (spec §9, appendix #5)

**Files:**
- Modify: `client/src/worlds/midnightGalaxy.ring.js`

- [ ] **Step 1: Replace the hardcoded terminal stop**

Current (already partially fixed earlier today — the middle stop is now interpolated, but the 4th stop is still a literal):

```js
sky: [theme.colors.bg, mixHex(theme.colors.bg, theme.colors.bgDeep, 0.5), theme.colors.bgDeep, '#010109'],
```

Replace with a derived terminal stop — darken `bgDeep` toward near-black while preserving its hue, instead of falling back to a fixed blue-black:

```js
const darken = (hex, t) => mixHex(hex, '#000000', t)
// ...
sky: [theme.colors.bg, mixHex(theme.colors.bg, theme.colors.bgDeep, 0.5), theme.colors.bgDeep, darken(theme.colors.bgDeep, 0.75)],
```

- [ ] **Step 2: Verify**

Run the same one-off check as Task 1 Step 6, confirm 4 distinct hex stops, confirm the 4th stop's hue (not just luma) tracks `bgDeep`'s hue rather than defaulting to blue — e.g. compute each stop's hue via the existing `rgbToHsl` logic in `colorTint.js` (read it, don't reimplement) and confirm stop 4's hue is within a few degrees of stop 3's.

- [ ] **Step 3: Commit**

```bash
git add client/src/worlds/midnightGalaxy.ring.js
git commit -m "Derive sky's terminal gradient stop from the theme instead of a hardcoded blue-black literal"
```

---

### Task 3: Placement — full-width draw range, centroid+luminance instead of geometric exclusion (spec §2, appendix #2/#3)

**Files:**
- Modify: `concepts/world-07-ring.html`
- Modify: `client/src/components/display/RingAmbient.jsx`

This is the same defect class that shipped in world-06 AND world-07 — read spec §2 in full before touching this, the rule exists specifically because a capped draw range passed every prior review by averaging out.

- [ ] **Step 1: Read the current `bandY()` and headline/companion placement code**

In `concepts/world-07-ring.html`, find `function bandY(r, h)` and the `mid` branch of `buildLayerContent` (the `head.style.left = px(x0 + lerp(0.06, 0.44, r())*(ENGINE.W - hw))` line and its companion equivalent at `lerp(0.10, 0.62, r())`).

- [ ] **Step 2: Replace the capped horizontal draw range**

```js
// was: lerp(0.06, 0.44, r())  — headline
// was: lerp(0.10, 0.62, r())  — companion
// both capped well below the frame's full width, causing every element to
// cluster left-of-center across all 12 stations (measured: mean centroid x
// = 692 against a frame center of 960 — a 268px left bias, on world-06 AND
// on this build). Spec §2: draw range must span at least 0.90 of available
// width. Use lerp(0.02, 0.92, r()) for both; the generator gate should
// reject anything narrower.
head.style.left = px(x0 + lerp(0.02, 0.92, r())*(ENGINE.W - hw));
// ...
comp.style.left = px(x0 + lerp(0.02, 0.92, r())*(ENGINE.W - cw));
```

- [ ] **Step 3: Replace `bandY()`'s geometric exclusion with the centroid+luminance rule**

Current `bandY()` places everything in the top or bottom band, evacuating the safe box entirely (the "dead stripe" spec §2 calls out). Replace with: allow any y-position whose *centroid* falls outside the safe box, but the safe-box luminance cap (already implemented via `layoutScrim`'s adaptive alpha) is what protects legibility — not a hard placement ban. Concretely: keep elements' centroids out of `y ∈ [ENGINE.SAFE.y*H, (ENGINE.SAFE.y+ENGINE.SAFE.h)*H]` (that part of `bandY` was already doing the right thing), but widen the allowed placement *within* the upper/lower bands so at least some elements' centroids land close to the box edge (near y=302 or y=778) rather than clustering at the frame's very top/bottom:

```js
function bandY(r, h){
  const H = ENGINE.H, top = ENGINE.SAFE.y*H, bot = (ENGINE.SAFE.y+ENGINE.SAFE.h)*H;
  const upper = r() < 0.5;
  // was: (0.25 + r()*0.75) — biased away from the box edge, toward the
  // frame's extreme top/bottom. Spec §2's vertical-spread rule needs >=6/12
  // stations placing >=15% of their largest element's AREA in y 302-778
  // (beside the box); an element whose centroid sits right at the box edge
  // (near 0) has much more of its own area crossing into that band than one
  // pushed to the frame extreme (near 1).
  if (upper) return Math.max(-h*0.10, (top - h) * (0.05 + r()*0.95));
  return Math.min(H - h*0.88, bot + (H - bot - h) * (r()*0.95));
}
```

- [ ] **Step 4: Verify — horizontal balance and vertical spread, computed from real data**

Write a scratch check (delete before committing, or keep in scratchpad) that renders all 12 stations, reads each headline element's actual centroid x/y from the DOM, and computes: mean centroid x (target 960±96, was 692), and count of stations with ≥15% of the headline's area inside y 302-778 (target ≥6/12). Iterate the two `lerp` ranges and `bandY`'s constants if the first pass doesn't land in range — this is a real measurement, not a one-shot guess.

- [ ] **Step 5: Port the same fix to `RingAmbient.jsx`**

Find the equivalent `bandY`/placement code in `client/src/components/display/RingAmbient.jsx` (ported from this same source) and apply the identical change. Re-verify via the `/ambient?ring=1` dev preview (Playwright, real render) that the composition now uses the right side of the frame across a few turns — screenshot before/after.

- [ ] **Step 6: Re-run the verification gate**

Run: `node concepts/tools/ring-verify.mjs concepts/world-07-ring.html` — must still be all-PASS (this task doesn't change any of the gate's existing checks, only placement, which isn't gated yet — Task 8 adds that gate).

- [ ] **Step 7: Commit**

```bash
git add concepts/world-07-ring.html client/src/components/display/RingAmbient.jsx
git commit -m "Fix placement left-bias: full-width draw range, centroid+luminance replaces geometric exclusion band"
```

---

### Task 4: `turn()`/`jumpTo()` must queue, never silently drop (spec §8, appendix #6)

**Files:**
- Modify: `concepts/world-07-ring.html`
- Modify: `client/src/components/display/RingAmbient.jsx`

- [ ] **Step 1: Read the current `turn()` in both files**

Reference build: `function turn()` — `if (busy) return;` silently drops. React port: same pattern in `RingAmbient.jsx`.

- [ ] **Step 2: Make a dropped call during `busy` queue instead of vanish**

```js
// concepts/world-07-ring.html — replace the busy-guard at the top of turn()
let queuedTurns = 0;
function turn(){
  if (busy) { queuedTurns++; return; }
  busy = true;
  // ...existing body...
}
// at the end of land() (or wherever busy is cleared), drain the queue:
function land(){
  station = (station+1) % ENGINE.PANES;
  slide++; turns++;
  showQ(slide); status(); busy = false;
  if (queuedTurns > 0) { queuedTurns--; turn(); }
}
```

- [ ] **Step 3: Apply the same fix in `RingAmbient.jsx`**, matching its own `turn()`/`land`-equivalent structure (it may not have an identical `land()` split — read the file first, the busy-unlock point is wherever `busyRef.current` is set back to `false`).

- [ ] **Step 4: Write a test proving the invariant**

For the React port, add a scratch/manual check (or a real test if `RingAmbient` gets any test coverage in a future task — none exists yet, don't add a testing framework just for this): call `turn()` twice in rapid succession (before the first transition completes), wait for both to resolve, confirm `station` advanced by exactly 2, not 1. Do this via the `/ambient?ring=1` preview + `page.evaluate` double-click, same technique used earlier this session to verify the wrap.

- [ ] **Step 5: Commit**

```bash
git add concepts/world-07-ring.html client/src/components/display/RingAmbient.jsx
git commit -m "turn() queues a request received mid-transition instead of silently dropping it"
```

---

### Task 5: Primitive hard-edge rework — thickness, contrast, silhouette-tracing (spec §6.1)

**Files:**
- Modify: `concepts/world-07-ring.html`

The single highest-impact visual fix per the design critique: every current "rim"/edge sub-element is ~2px at low alpha, physically below the detection threshold at bar-TV distance. This task reworks `makePrim`'s edge treatment for all 6 existing primitives to meet spec §6.1: **thickness ≥ 4px, peak luma ≥ local background + 40, longest dimension ≥ 15% of parent, and the edge geometry traces ≥ 60% of the parent's own silhouette** (not a fixed-inset shape floating inside it).

- [ ] **Step 1: `blob` (nebula) — the worst offender per the critique**

Current rim is a fixed-inset arc unrelated to the actual lobe silhouette, and drops the "core as a region" requirement from the original S1 critique entirely. Rework:

```js
if (kind === 'blob'){
  for (let i=0;i<3;i++){
    const L = el('b-lobe');
    const lw = w*(0.62 + r()*0.38), lh = h*(0.55 + r()*0.45);
    L.style.left = px((w-lw)*r()); L.style.top = px((h-lh)*r());
    L.style.width = px(lw); L.style.height = px(lh);
    L.style.background = `radial-gradient(ellipse 56% 44% at ${40+r()*20}% 50%,
      ${hsla(hue, 72, 62, 0.42)} 0%, ${hsla(hue-8, 64, 46, 0.20)} 40%,
      ${hsla(hue-14, 56, 30, 0.07)} 66%, transparent 82%)`;
    L.style.transform = `rotate(${(-30+r()*60).toFixed(0)}deg)`;
    f.appendChild(L);
  }
  // core-as-a-region: 8-14% of the cloud's width, NOT a pixel dot (S1's
  // original defect, re-introduced by the rim-only fix that shipped after).
  const core = el('s-core');
  const cs = w * (0.08 + r()*0.06);
  core.style.width = core.style.height = px(cs);
  core.style.left = px(w*(0.42+r()*0.16) - cs/2); core.style.top = px(h*(0.42+r()*0.16) - cs/2);
  core.style.boxShadow = `0 0 ${px(cs*2.4)} ${px(cs*0.8)} ${hsla(hue, 84, 78, 0.55)}`;
  f.appendChild(core);
  // rim: 4px minimum, traces the outer lobe's own silhouette (same ellipse
  // geometry as the largest lobe, scaled to ~92% so it reads as an edge on
  // THAT shape, not a floating unrelated arc).
  const rim = el('b-rim');
  const rw = w*0.86, rh = h*0.86;
  rim.style.left = px((w-rw)/2); rim.style.top = px((h-rh)/2);
  rim.style.width = px(rw); rim.style.height = px(rh);
  rim.style.borderWidth = '4px';
  rim.style.setProperty('--rim', hsla(hue+6, 90, 82, 0.85));
  rim.style.transform = `rotate(${(-40+r()*80).toFixed(0)}deg)`;
  f.appendChild(rim);
}
```

Also update the `.b-rim` CSS rule's `border: 2px solid var(--rim)` to `border-width: 4px` (keep it settable via inline style per-instance as above, or bump the CSS default — either way the shipped thickness must be 4px, not 2px).

- [ ] **Step 2: `spikes` (supernova) — spike thickness must scale with element width**

Current spikes are fixed 2-3px regardless of the primitive's size. Per spec, thickness must track the parent's scale so a large supernova doesn't ship sub-threshold spikes:

```js
for (let i=0;i<6;i++){
  const s = el('s-spk');
  const len = w*(i<2 ? 0.86 : 0.54);
  const th = Math.max(4, w*0.012);  // was fixed i<2?3:2 — now scales, floor 4px
  s.style.width = px(len); s.style.height = px(th);
  s.style.marginLeft = px(-len/2); s.style.marginTop = px(-th/2);
  s.style.background = `linear-gradient(90deg,transparent 0%,${hsla(hue,86,86,0.7)} 50%,transparent 100%)`;
  s.style.transform = `rotate(${i*30 + (i<2?0:15)}deg)`;
  f.appendChild(s);
}
```

(Alpha bumped 0.46→0.7 on the spike gradient's peak stop too — the old value was below the contrast-delta requirement against a dark sky.)

- [ ] **Step 3: `lens` (galaxy) — dust lane must not be dark-on-dark**

Current lane is `rgba(4,3,14,.62)` over a disc whose own peak alpha is 0.30 — invisible. Per spec §6.1 + §7.2 ("dark on dark is nothing... needs a rim"), give the lane a thin bright edge instead of relying on its own darkness to read:

```js
const lane = el('l-lane');
lane.style.background = 'rgba(4,3,14,.62)';
lane.style.boxShadow = `0 -2px 0 0 ${hsla(hue,60,70,0.5)}, 0 2px 0 0 ${hsla(hue,60,70,0.5)}`;
f.appendChild(lane);
```

- [ ] **Step 4: `ribbon` (dust ribbon) — same dark-on-dark failure, worse**

Rework using the same rim-brightness-delta approach as blob, at 4px minimum:

```js
if (kind === 'ribbon'){
  const b = el('r-body');
  b.style.background = `radial-gradient(ellipse 60% 18% at 50% 50%,
    ${hsla(hue,44,26,0.72)} 0%, ${hsla(hue,40,20,0.40)} 44%, transparent 76%)`;
  f.appendChild(b);
  const rim = el('b-rim');
  rim.style.left='4%'; rim.style.top='34%'; rim.style.width='92%'; rim.style.height='32%';
  rim.style.borderWidth = '4px';
  rim.style.setProperty('--rim', hsla(hue+10, 70, 78, 0.85));
  f.appendChild(rim);
  f.style.transform = `rotate(${(-18+r()*36).toFixed(0)}deg)`;
}
```

- [ ] **Step 5: `streak` (comet) vs the shooting-star transient — differentiate anatomy per spec §6.2**

Comet needs a coma (soft head bigger than its nucleus) and a broadening tail, distinct from the shooting-star transient's simple line+point:

```js
if (kind === 'streak'){
  const t = el('k-tail');
  t.style.width = '100%'; t.style.height = px(Math.max(6, h*0.14));  // broadens vs prior 0.10
  t.style.marginTop = px(-Math.max(6, h*0.14)/2);
  t.style.background = `linear-gradient(90deg,transparent 0%,${hsla(hue,60,70,0.10)} 18%,
    ${hsla(hue,66,78,0.32)} 70%,${hsla(hue,70,90,0.62)} 100%)`;
  f.appendChild(t);
  // coma: soft glow bigger than the nucleus, marking this as a comet not a
  // point-source shooting star
  const coma = el('d-glow');
  coma.style.left = px(w*0.78); coma.style.top = '0'; coma.style.width = px(h*0.7); coma.style.height = '100%';
  coma.style.background = `radial-gradient(circle, ${hsla(hue,70,85,0.5)} 0%, transparent 70%)`;
  f.appendChild(coma);
  const hd = el('k-head');
  const hs = Math.max(16, h*0.30);
  hd.style.width = hd.style.height = px(hs); hd.style.marginTop = px(-hs/2);
  hd.style.background = '#f2fbff';
  hd.style.boxShadow = `0 0 ${px(hs*2.2)} ${px(hs*0.6)} ${hsla(hue,72,80,0.5)}`;
  f.appendChild(hd);
  f.style.transform = `rotate(${(-26+r()*16).toFixed(0)}deg)`;
}
```

- [ ] **Step 6: `dots` — no change needed**

Per the design critique this primitive already passes the hard-edge/legibility bar (individual dots are inherently hard-edged). Confirm by re-reading `makePrim`'s `dots` branch; if it's unchanged from the version already reviewed, skip it.

- [ ] **Step 7: Verify — render and silhouette-test each primitive**

Use the `/ambient?ring=1` preview (or the standalone reference file directly), screenshot each of the 12 stations, and for each one apply the spec §6.2 fill-black test yourself: does the silhouette still read as its intended noun? This is an [eye] check — do it for real, don't assume the code change satisfies it.

- [ ] **Step 8: Run the gate**

Run: `node concepts/tools/ring-verify.mjs concepts/world-07-ring.html` — must stay all-PASS (none of these changes touch anything the current gate checks).

- [ ] **Step 9: Commit**

```bash
git add concepts/world-07-ring.html
git commit -m "Rework primitive hard edges: 4px minimum thickness, real contrast delta, edges trace their parent's silhouette"
```

---

### Task 6: `ring` primitive + fix binary-pair/ringed-lens noun mismatches (spec §6, §6.2, appendix #4)

**Files:**
- Modify: `concepts/world-07-ring.html`
- Modify: `client/src/worlds/midnightGalaxy.ring.js`

- [ ] **Step 1: Add the `ring` primitive to `makePrim`**

```js
else if (kind === 'ring'){
  const ring = el('rg-ring');
  const rw = w*0.9, rh = h*0.9;
  ring.style.left = px((w-rw)/2); ring.style.top = px((h-rh)/2);
  ring.style.width = px(rw); ring.style.height = px(rh);
  ring.style.borderWidth = px(Math.max(4, w*0.02));
  ring.style.borderStyle = 'solid';
  ring.style.borderColor = hsla(hue, 70, 78, 0.75);
  ring.style.borderRadius = '50%';
  f.appendChild(ring);
  // planet body it wraps
  const body = el('l-disc');
  const bw = w*0.42, bh = h*0.42;
  body.style.left = px((w-bw)/2); body.style.top = px((h-bh)/2);
  body.style.width = px(bw); body.style.height = px(bh);
  body.style.background = `radial-gradient(circle at 38% 38%, ${hsla(hue,60,68,0.9)} 0%, ${hsla(hue,50,40,0.7)} 70%, transparent 100%)`;
  f.appendChild(body);
}
```

Add the matching `.rg-ring{position:absolute;border-radius:50%}` rule to the reference build's CSS block.

- [ ] **Step 2: Remap "ringed lens" to the new `ring` primitive**

In `midnightGalaxy.ring.js`, change station 10 (`ringed lens`) from `prim: 'lens'` to `prim: 'ring'` — it currently renders identically to `spiral galaxy` (also `lens`), which is exactly the silhouette-duplication the spec calls out.

- [ ] **Step 3: Give "binary pair" real distinguishing parameters instead of bare `dots`**

Per spec §6.2's recipe-not-token rule. The `dots` primitive needs an optional param path for exactly 2 elements with a shared halo, distinct from a full cluster. Add a `binary` variant inside the `dots` branch of `makePrim` (or a small new `kind === 'binary'` branch — implementer's judgment on whichever reads cleaner in the existing function, but it must NOT reuse the unparameterized cluster path):

```js
else if (kind === 'binary'){
  const halo = el('d-glow');
  halo.style.background = `radial-gradient(circle closest-side, ${hsla(hue,60,70,0.20)} 0%, transparent 75%)`;
  f.appendChild(halo);
  const sizes = [0.62, 0.40]; // two unequal bodies, not two identical dots
  const positions = [[0.38,0.5],[0.62,0.5]];
  sizes.forEach((sz, i) => {
    const d = el(); d.style.position='absolute'; d.style.borderRadius='50%';
    const s = w * sz * 0.22;
    d.style.left = px(positions[i][0]*w - s/2); d.style.top = px(positions[i][1]*h - s/2);
    d.style.width = d.style.height = px(s);
    d.style.background = hsla(hue, 70, 85, 1);
    d.style.boxShadow = `0 0 ${px(s*2)} ${px(s*0.3)} ${hsla(hue,70,80,0.5)}`;
    f.appendChild(d);
  });
}
```

Update `midnightGalaxy.ring.js`'s `binary pair` station to `prim: 'binary'`.

- [ ] **Step 4: Re-run the silhouette-distinctness check**

Manually count distinct silhouette classes across all 12 stations after this change (same method as Task 5 Step 7). Target ≥8/12 per spec §6.2. Report the actual count — if still short, that's a finding for the next pass, not something to force-fix by inventing more primitives beyond what this task scoped.

- [ ] **Step 5: Verify + commit**

```bash
node concepts/tools/ring-verify.mjs concepts/world-07-ring.html   # must stay 14/14
git add concepts/world-07-ring.html client/src/worlds/midnightGalaxy.ring.js
git commit -m "Add ring primitive, fix ringed-lens/binary-pair noun collisions with their own silhouettes"
```

---

### Task 7: Hue anchors (spec §4)

**Files:**
- Modify: `client/src/worlds/midnightGalaxy.ring.js`

- [ ] **Step 1: Audit the current 12 station hues against a single-anchor model**

Midnight Galaxy's `theme.colors.highlight` is `#c060ff` (hue ≈276°). List each station's hue and its angular distance from 276°. Per the design critique, several (208, 214, 224 — the blues) sit outside a ±25° single-window and don't share the purple family.

- [ ] **Step 2: Declare a dyad (two anchors) instead of forcing one window**

Per spec §4: a world may declare 1-3 anchors. Midnight Galaxy reads naturally as purple/violet (anchor 1, ≈276°) plus a blue "starfield/cool" family (anchor 2, ≈214°) — declare both explicitly rather than stretching one window to cover 68° of hue:

```js
// in midnightGalaxy.ring.js, alongside the existing fields
hueAnchors: [
  { deg: 276, window: 25 },  // violet/purple — nebulae, supernova accent
  { deg: 214, window: 25 },  // cool blue — clusters, galaxies, comet
],
```

- [ ] **Step 3: Check the outliers against the dyad, fix or justify each**

- `orange nebula` (28°) and `supernova` (36°) are declared `accent: true` — per spec, single-anchor worlds get ≤1 complementary accent on ≤3 stations at ≤25% ink each. Confirm this world has exactly the stations it needs marked `accent`, no more.
- `green nebula` (140°) at station 12 doesn't fit either anchor and isn't marked accent — per the critique, this is the one hue that should change. Re-hue it to fit the violet or blue anchor (e.g. shift toward 250-260° to read as a "violet-blue nebula" instead of introducing a third unrelated hue), or mark it as the world's one deliberate 3rd accent if a green counterpoint is wanted — pick one, don't leave it silently out-of-family.

- [ ] **Step 4: Verify + commit**

```bash
node concepts/tools/ring-verify.mjs concepts/world-07-ring.html   # unaffected, stays 14/14 (hue anchors aren't gated yet — Task 8 territory if time allows, not required for this task)
git add client/src/worlds/midnightGalaxy.ring.js
git commit -m "Declare Midnight Galaxy's hue anchors as a dyad (violet + blue), fix the one out-of-family hue"
```

---

### Task 8: Update `ring-verify.mjs` to the new spec's rules

**Files:**
- Modify: `concepts/tools/ring-verify.mjs`

The gate was built against the OLD spec draft (S1). Several of its checks are now wrong per `ART-DIRECTION-SPEC.md` and must be replaced, not just added to.

- [ ] **Step 1: Replace the rank-based `no-flat-neighbours` check**

Per spec §3: the rank-distance check passes the exact defect it was meant to catch. Replace with the absolute-gap + cyclic check:

```js
// REPLACES the existing no-flat-neighbours block
{
  const ARC = world.ARC;
  const range = Math.max(...ARC) - Math.min(...ARC);
  let minGap = Infinity;
  for (let i = 0; i < ARC.length; i++) {
    const j = (i + 1) % ARC.length;  // cyclic — station 12 -> station 1 counted
    minGap = Math.min(minGap, Math.abs(ARC[i] - ARC[j]));
  }
  const gapPct = (minGap / range) * 100;
  report('adjacent-station minimum gap (need >=6% of range, cyclic)', gapPct >= 6 ? 'PASS' : 'FAIL',
    `smallest adjacent gap ${minGap.toFixed(1)} = ${gapPct.toFixed(1)}% of range ${range.toFixed(1)}`);
}
```

- [ ] **Step 2: Add the chroma-must-move check**

Per spec §3, currently unenforced. Requires reading each station's actual rendered chroma (max channel - min channel of the dominant color), which needs a real DOM/canvas sample — add via the existing Playwright page context, sampling each station's largest element's computed background color(s) similar to how `no-stray-math-random` does a source check vs. a DOM check. Implementer: read how the existing `visible stars per frame` check samples the live page for the pattern to follow; this check is structurally similar (loop over 12 stations, measure something, compute a ratio).

- [ ] **Step 3: Add the silhouette-distinctness check**

Per spec §6.2 (≥8/12 distinct silhouette classes). This likely can't be fully automated (silhouette "distinctness" is closer to an [eye] judgment than a number), but a proxy is checkable: for each station, hash the (primitive, and any distinguishing params like dot-count-bucket or lobe-count) tuple, count distinct hashes across the 12. Implement as a best-effort [auto] proxy; note in a comment that it's a proxy for the real [eye] fill-black test, not a replacement for it.

- [ ] **Step 4: Run the updated gate against the now-fixed reference build**

Run: `node concepts/tools/ring-verify.mjs concepts/world-07-ring.html` — report the real pass/fail counts. Some checks may newly fail if earlier tasks in this plan didn't fully close the gap (e.g. if Task 7's hue work didn't get a dedicated gate check, that's fine, it wasn't asked for) — report honestly, don't tune the gate to pass by loosening a threshold.

- [ ] **Step 5: Commit**

```bash
git add concepts/tools/ring-verify.mjs
git commit -m "Update ring-verify.mjs to ART-DIRECTION-SPEC.md's rules: cyclic absolute-gap arc check, chroma-must-move, silhouette-distinctness proxy"
```

---

### Task 9: Depth mechanics — occlusion, scale ladder, declared pairs, anchor, one drifter (spec §7)

**Files:**
- Modify: `concepts/world-07-ring.html`

This is the largest remaining task — the design critique found ALL FIVE of §7's mechanisms unimplemented in the current build. Scope it honestly: implement what's tractable in one pass, and if any sub-item needs its own follow-up task, say so rather than half-shipping it silently.

- [ ] **Step 1: Scale ladder (§7.3) — cheapest, do first**

Within `buildLayerContent`'s `mid` branch, after generating a station's headline/companion/detail elements, check `headline.longestDim / smallest-detail.longestDim >= 6`. If a seed's random draw doesn't clear it, resample the detail sizes (they're currently `lerp(58,154,r())` independent of the headline — tighten the lower end or force at least one detail element toward the tier floor when the ladder isn't met).

- [ ] **Step 2: One trackable drifter (§7.7)**

Currently zero continuous translate motion exists (the old "rail" was deleted for good reason — do NOT reintroduce a second transform at the layer level, spec is explicit about this). Add exactly one element on the `far` layer with its own `transform: translateX()` CSS animation, independent of the layer's own `.surge` transform (i.e., animating the element's own inline transform via a keyframe, nested inside the already-transformed layer — this is a transform on the ELEMENT, not a second transform on the LAYER, which is what the spec prohibits):

```css
@keyframes ringDrift{ from{transform:translateX(0)} to{transform:translateX(var(--drift-dist))} }
.ring-drifter{ animation: ringDrift var(--drift-dur) linear infinite; }
```

Crossing time 4-12 minutes (`--drift-dur`), distance sized so it crosses meaningfully within the far layer's own visible window. One instance, placed once in `buildLayerContent`'s `far` branch.

- [ ] **Step 3: Anchor on the far layer (§7.6)**

One nameable form, visible in 4-6 of 12 stations, sized via `(frameWidth + anchorWidth) / farSurge` landing in that band (far surge = 480 per §0, frame width 1920 → for 4-6 stations, anchor width should be roughly `farSurge * 4` to `farSurge * 6 - frameWidth`, i.e. 0-960px — implementer: do the actual arithmetic against the real far-layer period, don't eyeball it). Place exactly once per far-layer author-period in `buildLayerContent`'s `far` branch, using one of the existing primitives (a large, slow `lens` reads well as a distant anchor per the critique's own praise of that primitive).

- [ ] **Step 4: Occlusion (§7.2) — measured by ablation**

At least 1-in-3 stations needs an element whose footprint measurably dims the star layer behind it (≥0.5× reduction). Given stars are on `far`/`near` and forms are on `mid`, true occlusion (mid element genuinely blocking far/near stars) requires either z-order + opacity ≈1 dark shape, or accept a documented simplification: pick 4 of 12 stations and place a dark, rimmed shape (reuse the ribbon's rim treatment from Task 5) directly over a dense star region on the mid layer. This is the most speculative sub-item in this task — if it doesn't land cleanly, report DONE_WITH_CONCERNS rather than force a fake pass.

- [ ] **Step 5: Declared pairs (§7.5)**

For each station, mark the headline and companion as a declared pair when they already share proximity — add a simple visual link (a thin connecting gradient bridge, or matching a shared hue/halo more deliberately than the current independent-random companion hue). Cheapest implementation: when generating the companion, bias its hue to be within 20° of the headline's hue on ~half of stations (currently the companion hue is headline hue ± full accent-or-random, no relation).

- [ ] **Step 6: Verify + commit**

```bash
node concepts/tools/ring-verify.mjs concepts/world-07-ring.html   # confirm still passes everything it checked before
git add concepts/world-07-ring.html
git commit -m "Add depth mechanics: scale ladder enforcement, one trackable drifter, a far-layer anchor, basic occlusion and declared pairs"
```

---

### Task 10: Reduce sub-visible breathe animation (spec §8)

**Files:**
- Modify: `concepts/world-07-ring.html`

- [ ] **Step 1: Remove `pfBreathe` from every element except the headline**

Currently ~44 forms all run an invisible opacity pulse. Per spec: only the headline element per station may breathe, and only if the swing is ≥22 luma. Change `makePrim` so `--pa`/`--pa2` (and the `pfBreathe` animation itself) are only set on elements explicitly flagged as the station's headline — pass a `{ breathe: true }` option from the `mid` branch's headline call site only, and skip the animation entirely (static alpha) for companion/detail/far-wash elements.

- [ ] **Step 2: Widen the headline's breathe swing to clear the 22-luma floor**

The current `--pa2` is `Math.min(alpha*1.18, 1)` — an 18% swing on an alpha that's often ~0.4-0.5 doesn't clear 22 luma at typical hue/lightness values. Bump to `Math.min(alpha*1.6, 1)` for headline-only breathe, and lengthen the period floor to ≥30s per spec.

- [ ] **Step 3: Verify + commit**

```bash
node concepts/tools/ring-verify.mjs concepts/world-07-ring.html
git add concepts/world-07-ring.html
git commit -m "Breathe animation: headline-only, wide enough to actually be visible, per spec's dead-weight-animation ban"
```

---

## Self-Review

**Spec coverage:** §0 (engine) — already solved, no task needed. §1 (tiers/ink) — already conformant per prior session's build, no task needed. §2 (placement) — Task 3. §3 (value arc) — jitter formula already fixed this session; gate check replaced in Task 8. §4 (color/hue anchors) — Task 7. §5 (star field) — already conformant, no task needed (verified 171/frame against 150-260 target). §6 (primitive vocabulary + hard edges + distinctness) — Tasks 5, 6. §7 (depth) — Task 9. §8 (motion) — Tasks 4, 10 (turn-12-animates-through enhancement from spec is explicitly optional/deferred — not included as a task since the current hard-cut is already verified visually clean, per the spec's own note). §9 (legibility) — Task 1, 2. §10 (pacing) — covered incidentally by Tasks 5/6/7's distinctness work, no dedicated task (most of §10 is already satisfied by existing per-station data variety). §11 (generator output shape) — not applicable, generator is out of scope per Ben's instruction dropping the 21-theme goal. §12 (eye checks) — flagged throughout tasks as [eye], not something an agent can close; final eye-check pass is Ben's, not a task. §13 (unverified) — real-hardware profiling and dwell-time timing are explicitly out of scope for this plan (no agent can do them); noted, not silently dropped.

**Placeholder scan:** Task 9 Step 4 (occlusion) is explicitly flagged as the most speculative item with permission to report DONE_WITH_CONCERNS rather than fake a pass — this is intentional honesty about task difficulty, not a placeholder for missing content; the actual approach to try is fully specified.

**Type consistency:** `hueAnchors` shape introduced in Task 7 (`[{deg, window}]`) matches spec §11's generator-output shape. `ensureLegibleTextColor(hex, bgHex, opts)` signature from Task 1 is used identically in Task 1 Step 5's call site.
