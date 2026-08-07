// client/src/lib/ringPrimitives.js
// Shared DOM-building logic for the ring ambient system. Framework-agnostic
// vanilla JS - loaded via <script type="module"> in concepts/world-07-ring.html
// AND imported into client/src/components/display/RingAmbient.jsx. This is
// the fix for a real, repeatedly-observed bug class this session: the two
// files hand-duplicated this logic, and every hardening pass (rim thickness,
// contrast, the ring/binary primitives) landed in one file and not the
// other - at one point RingAmbient.jsx rendered two stations as empty divs
// because its copy of makePrim had no branch for a primitive the world data
// required. One source now; both builds consume it.
//
// ringDom(prefix, engine) is the ONLY way a consumer touches this module's
// class-prefixed builders. It closes over prefix/engine once and hands back
// el/makePrim/bandY/buildStars already bound, so no call site downstream
// ever passes a literal prefix string again. The prior design threaded
// `prefix` through every call site by hand (~21 in the HTML, ~13 in the
// JSX) - a call written the old one-argument way (`el('b-lobe')`, which
// under the old two-arg signature meant prefix='b-lobe', name=undefined)
// silently produced a classless, invisible div: no error, exactly the
// "renders as an empty thing" bug class this module exists to prevent.
// ringDom() makes that call shape impossible - there is no bare `el` to
// misuse.
//
// engine is bound the same way (not read off a caller's module-scope
// ENGINE const) because this module has no access to either caller's local
// ENGINE - world-07-ring.html's own ENGINE stays a same-file const (this
// module is a separate script context once imported), and RingAmbient.jsx
// already took this same approach before the extraction (its bandY/
// buildStars already accepted engine as a param).
//
// rng/lerp come from client/src/lib/ringEngine.js rather than being
// redefined here - that module already has them.
import { rng, lerp } from './ringEngine.js'

export function px(n) { return n.toFixed(1) + 'px' }

export function hsla(h, s, l, a) { return `hsla(${h},${s}%,${l}%,${a})` }

// bandY: places an element's TOP edge such that its CENTROID never falls
// inside engine.SAFE, for any element height h - clamped by centroid, not a
// fixed y-offset (see ART-DIRECTION-SPEC.md §2; this fixed a real safe-box
// violation earlier this session where a tall headline's centroid could
// land inside the box under the old fixed-offset constants).
function bandY(engine, r, h) {
  const H = engine.H, top = engine.SAFE.y * H, bot = (engine.SAFE.y + engine.SAFE.h) * H
  const upper = r() < 0.5, margin = 8
  if (upper) {
    const maxY = top - h / 2 - margin, minY = -h * 0.10
    return maxY <= minY ? maxY : minY + (maxY - minY) * r()
  }
  const minY = bot - h / 2 + margin, maxY = H - h * 0.88
  return minY >= maxY ? minY : minY + (maxY - minY) * r()
}

// ═══ PRIMITIVES ═══ the engine renders these; a world picks one and a hue.
// Each guarantees a hard edge structurally, so nothing can turn to mush.
// `el` is a bound element factory (see ringDom below) that already carries
// its consumer's class prefix - every call in this function is just
// el('some-class').
function makePrim(el, kind, w, h, hue, alpha, r) {
  const f = el('pf')
  f.style.width = px(w); f.style.height = px(h)
  f.style.setProperty('--pa', alpha.toFixed(3))
  f.style.setProperty('--pa2', Math.min(alpha * 1.18, 1).toFixed(3))
  f.style.setProperty('--pb', (47 + Math.floor(r() * 26)) + 's')
  f.style.setProperty('--pd', (-r() * 40).toFixed(1) + 's')

  if (kind === 'blob') {
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, domRot = 0, domArea = -1
    for (let i = 0; i < 3; i++) {
      const L = el('b-lobe')
      const lw = w * (0.62 + r() * 0.38), lh = h * (0.55 + r() * 0.45)
      const lx = (w - lw) * r(), ly = (h - lh) * r()
      L.style.left = px(lx); L.style.top = px(ly)
      L.style.width = px(lw); L.style.height = px(lh)
      L.style.background = `radial-gradient(ellipse 56% 44% at ${40 + r() * 20}% 50%,
        ${hsla(hue, 72, 62, 0.42)} 0%, ${hsla(hue - 8, 64, 46, 0.20)} 40%,
        ${hsla(hue - 14, 56, 30, 0.07)} 66%, transparent 82%)`
      const rot = -30 + r() * 60
      L.style.transform = `rotate(${rot.toFixed(0)}deg)`
      f.appendChild(L)
      bx0 = Math.min(bx0, lx); by0 = Math.min(by0, ly)
      bx1 = Math.max(bx1, lx + lw); by1 = Math.max(by1, ly + lh)
      const area = lw * lh
      if (area > domArea) { domArea = area; domRot = rot }
    }
    // core-as-a-region: 8-14% of the cloud's width, positioned inside the
    // real lobe-cluster bbox, soft radial fill (not a flat disc).
    const core = el('s-core')
    const cs = w * (0.08 + r() * 0.06)
    const ccx = lerp(bx0, bx1, 0.3 + r() * 0.4), ccy = lerp(by0, by1, 0.3 + r() * 0.4)
    core.style.width = core.style.height = px(cs)
    core.style.left = px(ccx - cs / 2); core.style.top = px(ccy - cs / 2)
    core.style.background = `radial-gradient(circle, ${hsla(hue, 30, 96, 0.95)} 0%, ${hsla(hue, 70, 80, 0.5)} 55%, transparent 100%)`
    core.style.boxShadow = `0 0 ${px(cs * 2.4)} ${px(cs * 0.8)} ${hsla(hue, 84, 78, 0.55)}`
    f.appendChild(core)
    // rim: traces the ACTUAL lobe cluster's bounding box, inset to the
    // gradient's own visible radii (56%/44%, matching each lobe's own
    // `ellipse 56% 44%` gradient above), rotated with the dominant lobe.
    const rim = el('b-rim')
    const rw = (bx1 - bx0) * 0.56, rh = (by1 - by0) * 0.44
    const rcx = (bx0 + bx1) / 2, rcy = (by0 + by1) / 2
    rim.style.left = px(rcx - rw / 2); rim.style.top = px(rcy - rh / 2)
    rim.style.width = px(rw); rim.style.height = px(rh)
    rim.style.setProperty('--rim', hsla(hue + 6, 90, 82, 0.85))
    rim.style.transform = `rotate(${domRot.toFixed(0)}deg)`
    f.appendChild(rim)
  }

  else if (kind === 'dots') {
    const g = el('d-glow')
    g.style.background = `radial-gradient(circle closest-side,
      ${hsla(hue, 58, 66, 0.16)} 0%, ${hsla(hue, 50, 52, 0.06)} 48%, transparent 76%)`
    f.appendChild(g)
    const n = 26 + Math.floor(r() * 22)
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, rad = Math.pow(r(), 0.55) * 0.46
      const s = 2.0 + r() * 3.4
      const d = el(''); d.style.position = 'absolute'; d.style.borderRadius = '50%'
      d.style.left = px((0.5 + Math.cos(a) * rad) * w)
      d.style.top = px((0.5 + Math.sin(a) * rad) * h)
      d.style.width = d.style.height = px(s)
      d.style.background = i % 4 ? '#ffffff' : hsla(hue, 70, 84, 1)
      d.style.opacity = (0.55 + r() * 0.45).toFixed(2)
      if (s > 4.2) d.style.boxShadow = `0 0 ${px(s * 2.2)} ${px(s * 0.3)} ${hsla(hue, 70, 80, 0.5)}`
      f.appendChild(d)
    }
  }

  else if (kind === 'spikes') {
    const sh = el('d-glow')
    sh.style.background = `radial-gradient(circle closest-side,
      ${hsla(hue, 80, 74, 0.34)} 0%, ${hsla(hue - 10, 70, 58, 0.16)} 26%,
      ${hsla(hue - 30, 60, 44, 0.08)} 52%, transparent 76%)`
    f.appendChild(sh)
    for (let i = 0; i < 6; i++) {
      const s = el('s-spk')
      const len = w * (i < 2 ? 0.86 : 0.54)
      const th = Math.max(4, w * 0.012) // scales with w, floor 4px
      s.style.width = px(len); s.style.height = px(th)
      s.style.marginLeft = px(-len / 2); s.style.marginTop = px(-th / 2)
      s.style.background = `linear-gradient(90deg,transparent 0%,${hsla(hue, 86, 86, 0.7)} 50%,transparent 100%)`
      s.style.transform = `rotate(${i * 30 + (i < 2 ? 0 : 15)}deg)`
      f.appendChild(s)
    }
    const c = el('s-core')
    const cs = Math.max(16, w * 0.055)
    c.style.width = c.style.height = px(cs)
    c.style.marginLeft = px(-cs / 2); c.style.marginTop = px(-cs / 2)
    c.style.boxShadow = `0 0 ${px(cs * 2.4)} ${px(cs * 0.8)} ${hsla(hue, 84, 74, 0.55)}`
    f.appendChild(c)
  }

  else if (kind === 'lens') {
    // was a full inset:0 ellipse spanning the ENTIRE headline box - the
    // literal "flattened ellipse disc" this fix exists to move away from
    // (a fill-black test that treats any-nonzero-alpha as "on" turns a
    // full-box wash into one giant ellipse regardless of what's drawn on
    // top of it). Bounded to roughly the arm cluster's own footprint
    // instead, so it reads as a soft galactic bulge behind the arms, not
    // the dominant shape of the whole primitive.
    const d = el('l-disc')
    const dw = w * 0.60, dh = h * 0.60
    d.style.left = px(w * 0.5 - dw / 2); d.style.top = px(h * 0.5 - dh / 2)
    d.style.width = px(dw); d.style.height = px(dh)
    d.style.background = `radial-gradient(ellipse 62% 62% at 50% 50%,
      ${hsla(hue, 40, 44, 0.16)} 0%, ${hsla(hue, 36, 32, 0.08)} 50%, transparent 80%)`
    f.appendChild(d)
    // spiral arms: this used to be a straight dust lane across a flattened
    // disc, which fill-black-silhouettes indistinguishable from `ring`'s
    // actual hollow ellipse - two nouns, one silhouette. A true curve isn't
    // in this vocabulary (no path/bezier primitive) - two rotated straight
    // ellipses were tried first and rendered as a sharp V/boomerang, not a
    // spiral (confirmed on an isolated render, not assumed). Reused the
    // technique `blob` already uses to fake an irregular cloud from
    // circular primitives instead: each arm is 5 soft lobes stepped along a
    // logarithmic spiral (radius grows, angle advances, size shrinks) out
    // from the core - a real curve made of overlapping circles, the same
    // way blob fakes an irregular silhouette from three overlapping
    // ellipses.
    const cx = w * 0.5, cy = h * 0.5
    const baseAng = r() * Math.PI * 2
    let domEdge = null, domEdgeArea = -1
    ;[1, -1].forEach((dir, ai) => {
      // 6 lobes, radius growing from near-core to ~0.34w and angle
      // advancing ~20-27deg/step (~110-140deg total sweep) - spaced far
      // enough apart that they trace a visible curve instead of stacking
      // into one indistinct blob (the first attempt at this: radius grew
      // from ~0.06w with lobes sized ~0.22w, so consecutive lobes overlapped
      // almost completely and it rendered as a fuzzy ball with a stray
      // bright line, not an arm - confirmed on an isolated render).
      const lobes = 6
      const maxRad = w * (0.30 + r() * 0.08)
      const dTheta = (0.36 + r() * 0.10) * dir
      for (let k = 0; k < lobes; k++) {
        const t = k / (lobes - 1)
        const rad = maxRad * (0.12 + 0.88 * Math.pow(t, 0.9))
        const ang = baseAng + dTheta * k
        const lx = cx + Math.cos(ang) * rad, ly = cy + Math.sin(ang) * rad * (h / w)
        const ls = w * (0.19 - t * 0.11) * (0.9 + r() * 0.2)
        const lobe = el('l-arm')
        lobe.style.width = lobe.style.height = px(Math.max(10, ls))
        lobe.style.left = px(lx - ls / 2); lobe.style.top = px(ly - ls / 2)
        lobe.style.background = `radial-gradient(circle,
          ${hsla(hue + ai * 6, 62 - t * 10, 72 - t * 16, 0.42 - t * 0.20)} 0%,
          ${hsla(hue, 52, 46, 0.16 - t * 0.08)} 55%, transparent 82%)`
        f.appendChild(lobe)
        if (k <= 1 && ls > domEdgeArea) { domEdgeArea = ls; domEdge = { lx, ly, ls, ang } }
      }
    })
    // bright inner edge: hugs whichever lobe came out biggest AND closest
    // to the core (across both arms) - same hug-the-actual-glow approach as
    // blob's rim (sized/rotated to that lobe's own visible extent), not a
    // floating shape placed elsewhere in the frame.
    if (domEdge) {
      const edge = el('l-arm-edge')
      const es = domEdge.ls * 0.60
      edge.style.width = px(es); edge.style.height = px(Math.max(4, es * 0.22))
      edge.style.left = px(domEdge.lx - es / 2); edge.style.top = px(domEdge.ly - es * 0.11)
      edge.style.transform = `rotate(${(domEdge.ang * 180 / Math.PI).toFixed(0)}deg)`
      edge.style.background = `linear-gradient(90deg, transparent 0%,
        ${hsla(hue + 8, 72, 88, 0.85)} 44%, ${hsla(hue + 8, 72, 88, 0.85)} 56%, transparent 100%)`
      f.appendChild(edge)
    }
    const c = el('l-core')
    const cs = Math.max(11, w * 0.036)
    c.style.width = c.style.height = px(cs)
    c.style.marginLeft = px(-cs / 2); c.style.marginTop = px(-cs / 2)
    c.style.boxShadow = `0 0 ${px(cs * 2.6)} ${px(cs * 0.7)} ${hsla(hue, 70, 80, 0.45)}`
    f.appendChild(c)
    f.style.transform = `rotate(${(-30 + r() * 24).toFixed(0)}deg)`
  }

  else if (kind === 'streak') {
    const t = el('k-tail')
    t.style.width = '100%'; t.style.height = px(Math.max(6, h * 0.14)) // broadens vs prior 0.10
    t.style.marginTop = px(-Math.max(6, h * 0.14) / 2)
    t.style.background = `linear-gradient(90deg,transparent 0%,${hsla(hue, 60, 70, 0.10)} 18%,
      ${hsla(hue, 66, 78, 0.32)} 70%,${hsla(hue, 70, 90, 0.62)} 100%)`
    f.appendChild(t)
    // coma: soft glow bigger than the nucleus, marking this as a comet not
    // a point-source shooting star. Centered on the head's actual position
    // (.k-head is right:-4px, top:50%, so its center sits at
    // x = w+4-hs/2).
    const hs = Math.max(16, h * 0.30)
    const headCx = w + 4 - hs / 2
    const comaW = h * 0.7
    const coma = el('d-glow')
    coma.style.left = px(headCx - comaW / 2); coma.style.top = '0'; coma.style.width = px(comaW); coma.style.height = '100%'
    coma.style.background = `radial-gradient(circle, ${hsla(hue, 70, 85, 0.5)} 0%, transparent 70%)`
    f.appendChild(coma)
    const hd = el('k-head')
    hd.style.width = hd.style.height = px(hs); hd.style.marginTop = px(-hs / 2)
    hd.style.background = '#f2fbff'
    hd.style.boxShadow = `0 0 ${px(hs * 2.2)} ${px(hs * 0.6)} ${hsla(hue, 72, 80, 0.5)}`
    f.appendChild(hd)
    f.style.transform = `rotate(${(-26 + r() * 16).toFixed(0)}deg)`
  }

  else if (kind === 'ribbon') {
    // was 'ellipse 60% 18%' - a headline-sized bounding box (576-880px)
    // with a visible gradient reading out to only 18% of its own height:
    // big box, near-nothing inside it ("a scratch on a dark screen" per the
    // visual review). Box size alone doesn't fix ink (spec §1) - the
    // gradient's own visible extent has to be big. Widened/heightened to
    // 94%/42% of the box (nearly the full frame this headline occupies)
    // and alpha lowered - big AND dim, not small and dim.
    const b = el('r-body')
    b.style.background = `radial-gradient(ellipse 94% 42% at 50% 50%,
      ${hsla(hue, 42, 30, 0.38)} 0%, ${hsla(hue, 38, 24, 0.22)} 46%,
      ${hsla(hue, 34, 18, 0.09)} 70%, transparent 88%)`
    f.appendChild(b)
    // hard edge traces the band's OWN long top edge only (one rim, per
    // spec's fix suggestion) - a bright horizontal line positioned at the
    // gradient's own visible top extent (42% ellipse height => the visible
    // edge sits ~19% of h above center), not a floating full-ellipse ring.
    const edge = el('r-edge')
    edge.style.left = '5%'; edge.style.right = '5%'
    edge.style.top = px(h * 0.5 - h * 0.19)
    edge.style.height = px(Math.max(4, h * 0.022))
    edge.style.background = `linear-gradient(90deg, transparent 0%,
      ${hsla(hue + 6, 60, 76, 0.55)} 20%, ${hsla(hue + 6, 62, 80, 0.65)} 80%, transparent 100%)`
    f.appendChild(edge)
    f.style.transform = `rotate(${(-18 + r() * 36).toFixed(0)}deg)`
  }

  else if (kind === 'ring') {
    const ring = el('rg-ring')
    const rw = w * 0.9, rh = h * 0.9
    ring.style.left = px((w - rw) / 2); ring.style.top = px((h - rh) / 2)
    ring.style.width = px(rw); ring.style.height = px(rh)
    ring.style.borderWidth = px(Math.max(4, w * 0.02))
    ring.style.borderStyle = 'solid'
    ring.style.borderColor = hsla(hue, 70, 78, 0.75)
    f.appendChild(ring)
    // planet body it wraps - reuses .l-disc (position:absolute;inset:0;
    // border-radius:50%, no lens-specific geometry baked in); the inline
    // left/top/width/height below fully override its inset:0 default per
    // the CSS over-constrained-box rule (right/bottom get dropped, verified
    // empirically, not assumed), so this is a clean reuse, not a coupling.
    const body = el('l-disc')
    const bw = w * 0.42, bh = h * 0.42
    body.style.left = px((w - bw) / 2); body.style.top = px((h - bh) / 2)
    body.style.width = px(bw); body.style.height = px(bh)
    body.style.background = `radial-gradient(circle at 38% 38%, ${hsla(hue, 60, 68, 0.9)} 0%, ${hsla(hue, 50, 40, 0.7)} 70%, transparent 100%)`
    f.appendChild(body)
  }

  else if (kind === 'binary') {
    // two unequal bodies + a shared halo - distinct from the unparameterized
    // dots cluster (spec §6.2: an atlas entry must be a recipe, not a bare
    // primitive token).
    const sizes = [0.62, 0.40] // two unequal bodies, not two identical dots
    const positions = [[0.38, 0.5], [0.62, 0.5]]
    // halo scoped to the two dots' own span (not .d-glow's inset:0 default,
    // which fills the entire headline box) - unsized it merged the two dots
    // and their oversized halo into one solid oval on a real render, reading
    // as another blob rather than a distinct binary-pair silhouette.
    const halo = el('d-glow')
    const haloD = w * 0.5
    halo.style.left = px(w * 0.5 - haloD / 2); halo.style.top = px(h * 0.5 - haloD / 2)
    halo.style.width = halo.style.height = px(haloD)
    halo.style.background = `radial-gradient(circle closest-side, ${hsla(hue, 60, 70, 0.20)} 0%, transparent 75%)`
    f.appendChild(halo)
    sizes.forEach((sz, i) => {
      const d = el(''); d.style.position = 'absolute'; d.style.borderRadius = '50%'
      const s = w * sz * 0.22
      d.style.left = px(positions[i][0] * w - s / 2); d.style.top = px(positions[i][1] * h - s / 2)
      d.style.width = d.style.height = px(s)
      // was a flat `hsla(...,1)` opaque fill - the only fully-opaque flat
      // element in a world built entirely from glowing forms (a real
      // regression from the halo-sizing fix, which correctly stopped the
      // two dots merging into one blob but overshot into flat matte
      // circles). Hot core fading to a soft halo instead, matching every
      // other primitive's own core treatment (blob/spikes/lens all use a
      // radial-gradient core, never a flat disc).
      d.style.background = `radial-gradient(circle at 36% 36%,
        ${hsla(hue, 25, 97, 1)} 0%, ${hsla(hue, 65, 84, 0.92)} 34%,
        ${hsla(hue, 62, 60, 0.55)} 64%, ${hsla(hue, 55, 38, 0.16)} 100%)`
      d.style.boxShadow = `0 0 ${px(s * 2)} ${px(s * 0.3)} ${hsla(hue, 70, 80, 0.5)}`
      f.appendChild(d)
    })
  }
  return f
}

// ═══ STARS ═══ every one twinkles, wide swing, 5-13s - the Sonora
// behaviour Ben named as the bar. NEVER a blur filter on these.
const TEMP = ['#ffffff', '#f6e6ff', '#ffffff', '#fff3e2', '#eaf0ff']

function buildStars(el, engine, host, period, perFrame, sizeMul, seed) {
  const n = Math.round(perFrame * (period / engine.W))
  const frag = document.createDocumentFragment()
  for (let i = 0; i < n; i++) {
    const r = rng(i, seed), roll = r()
    /* 65% small, 27% mid, 8% big - S1 §4.5 */
    const size = (roll < 0.65 ? 1.2 + r() * 1.0
      : roll < 0.92 ? 2.4 + r() * 1.6
        : 4.5 + r() * 3.5) * sizeMul
    const lo = engine.STAR_ALPHA_FLOOR + r() * 0.14
    const hi = Math.min(lo + 0.40 + r() * 0.15, 1)
    const dur = 5 + r() * 8
    const d = el('star'), s = d.style
    s.left = px(r() * period); s.top = px(r() * engine.H)
    s.width = s.height = px(size)
    s.setProperty('--sc', TEMP[i % 5])
    s.setProperty('--ob', lo.toFixed(2))
    s.setProperty('--op', hi.toFixed(2))
    s.setProperty('--tp', dur.toFixed(2) + 's')
    s.setProperty('--td', (-r() * dur).toFixed(2) + 's')
    /* glow is a box-shadow, never a blur filter - a blur wider than a
       quarter of an element deletes it (ledger #14) */
    if (size >= 5) s.boxShadow = `0 0 ${px(size * 2.2)} ${px(size * 0.3)} ${TEMP[i % 5]}`
    frag.appendChild(d)
  }
  host.appendChild(frag)
  return n
}

// ringDom: bind a class prefix + engine once per consumer. Returns el/
// makePrim/bandY/buildStars ready to call with no prefix/engine argument to
// ever get wrong - see the module comment above for the bug this replaces.
export function ringDom(prefix, engine) {
  const el = (name) => {
    const d = document.createElement('div')
    if (name) d.className = prefix + name
    return d
  }
  return {
    el,
    makePrim: (kind, w, h, hue, alpha, r) => makePrim(el, kind, w, h, hue, alpha, r),
    bandY: (r, h) => bandY(engine, r, h),
    buildStars: (host, period, perFrame, sizeMul, seed) => buildStars(el, engine, host, period, perFrame, sizeMul, seed),
  }
}

// ═══ CSS ═══ the primitive-related rules were hand-duplicated between
// world-07-ring.html's <style> block and RingAmbient.jsx's RING_CSS template
// literal (in sync, but nothing enforced that - the exact bug class this
// module already fixed once for makePrim). ringCss(prefix) is the one
// source for the rules that are genuinely identical modulo class prefix.
//
// NOT included here, on purpose - these are real, deliberate differences
// between the two contexts, not omissions to fix:
//   - the `.stage`/`.ring-stage` chassis and its `.go` transition rule
//     (`.stage.go .surge{transition:...}`) - .stage/.ring-stage are each
//     file's own top-level class (HTML defines it as page chrome; the JSX
//     applies it via inline style), not something ringPrimitives owns, and
//     the transition's easing source differs (HTML hardcodes the curve,
//     the JSX reads client/src/lib/easings.js's EASE_SURGE).
//   - the reduced-motion media query - the JSX's is a strict subset (no
//     `.shoot`, no `.stage.rm` manual-toggle branch, since both belong to
//     the HTML-only shooting-star/demo-controls systems).
//   - `.shootLane`/`.shootRot`/`.shoot`/`@keyframes shootGo` - the shooting
//     star system exists only in the HTML reference build.
//
// Keyframe names differ by design too (`tw`/`pfBreathe` unprefixed in the
// HTML vs `ringTw`/`ringPfBreathe` in the JSX, to avoid colliding with
// unrelated keyframes elsewhere in the app's CSS) - kfName() derives the
// right one from the same `prefix` a caller already has, so this can't
// drift out of sync with the class-prefix convention the way the old
// hand-duplicated blocks could.
function kfName(prefix, camelName) {
  const stem = prefix.replace(/-$/, '')
  return stem ? stem + camelName : camelName[0].toLowerCase() + camelName.slice(1)
}

export function ringCss(prefix) {
  const p = prefix
  const tw = kfName(p, 'Tw'), pfBreathe = kfName(p, 'PfBreathe')
  return `
.${p}lyr{position:absolute;inset:0;overflow:hidden}
.${p}surge{position:absolute;left:0;top:0;width:100%;height:100%;
  will-change:transform;transform:translate3d(0,0,0)}

.${p}void{position:absolute;inset:0;
  background:radial-gradient(ellipse 138% 128% at 50% 48%,
    var(--sky-1) 0%, var(--sky-2) 46%, var(--sky-3) 78%, var(--sky-4) 100%)}

.${p}star{position:absolute;border-radius:50%;background:var(--sc);
  animation:${tw} var(--tp) ease-in-out infinite;animation-delay:var(--td)}
@keyframes ${tw}{0%,100%{opacity:var(--ob)}50%{opacity:var(--op)}}

.${p}pf{position:absolute;pointer-events:none;
  animation:${pfBreathe} var(--pb) ease-in-out infinite;animation-delay:var(--pd)}
@keyframes ${pfBreathe}{0%,100%{opacity:var(--pa)}50%{opacity:var(--pa2)}}

.${p}b-lobe{position:absolute;border-radius:50%}
.${p}b-rim{position:absolute;border-radius:50%;border:4px solid var(--rim);
  border-right-color:transparent;border-bottom-color:transparent}

.${p}d-glow{position:absolute;inset:0;border-radius:50%}

.${p}s-core{position:absolute;left:50%;top:50%;border-radius:50%;background:#fffaf0}
.${p}s-spk{position:absolute;left:50%;top:50%;transform-origin:50% 50%}

.${p}l-disc{position:absolute;inset:0;border-radius:50%}
.${p}l-core{position:absolute;left:50%;top:50%;border-radius:50%;background:#fff6e6}
.${p}l-arm{position:absolute;border-radius:50%}
.${p}l-arm-edge{position:absolute;border-radius:999px}

.${p}k-tail{position:absolute;left:0;top:50%;border-radius:999px}
.${p}k-head{position:absolute;right:-4px;top:50%;border-radius:50%}

.${p}r-body{position:absolute;inset:0;border-radius:50%}
.${p}r-edge{position:absolute;border-radius:999px}

.${p}rg-ring{position:absolute;border-radius:50%}
`
}
