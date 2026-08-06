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
// classPrefix lets each embedding context keep its own CSS-class convention
// without this module caring: concepts/world-07-ring.html uses unprefixed
// classes (.b-lobe, .b-rim); RingAmbient.jsx prefixes everything (.ring-b-lobe,
// .ring-b-rim) to avoid colliding with the rest of the app's CSS. Every
// element this module creates goes through prefix(name) instead of a literal
// string.
//
// engine is passed explicitly (not closed over) because this module has no
// access to either caller's local ENGINE constant - world-07-ring.html's own
// ENGINE stays a same-file const (this module is a separate script context
// once imported), and RingAmbient.jsx already took this same approach before
// the extraction (its bandY/buildStars already accepted engine as a param).
//
// rng/lerp come from client/src/lib/ringEngine.js rather than being
// redefined here - that module already has them (RingAmbient.jsx already
// imports both from there; world-07-ring.html's own local rng/lerp are the
// numerically identical hash32-based implementation, so importing here
// instead of duplicating is not a behavior change).
import { rng, lerp } from './ringEngine.js'

export function el(prefix, name) {
  const d = document.createElement('div')
  if (name) d.className = prefix + name
  return d
}

export function px(n) { return n.toFixed(1) + 'px' }

export function hsla(h, s, l, a) { return `hsla(${h},${s}%,${l}%,${a})` }

// bandY: places an element's TOP edge such that its CENTROID never falls
// inside engine.SAFE, for any element height h - clamped by centroid, not a
// fixed y-offset (see ART-DIRECTION-SPEC.md §2; this fixed a real safe-box
// violation earlier this session where a tall headline's centroid could
// land inside the box under the old fixed-offset constants).
export function bandY(engine, r, h) {
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
function makePrim(prefix, kind, w, h, hue, alpha, r) {
  const f = el(prefix, 'pf')
  f.style.width = px(w); f.style.height = px(h)
  f.style.setProperty('--pa', alpha.toFixed(3))
  f.style.setProperty('--pa2', Math.min(alpha * 1.18, 1).toFixed(3))
  f.style.setProperty('--pb', (47 + Math.floor(r() * 26)) + 's')
  f.style.setProperty('--pd', (-r() * 40).toFixed(1) + 's')

  if (kind === 'blob') {
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, domRot = 0, domArea = -1
    for (let i = 0; i < 3; i++) {
      const L = el(prefix, 'b-lobe')
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
    const core = el(prefix, 's-core')
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
    const rim = el(prefix, 'b-rim')
    const rw = (bx1 - bx0) * 0.56, rh = (by1 - by0) * 0.44
    const rcx = (bx0 + bx1) / 2, rcy = (by0 + by1) / 2
    rim.style.left = px(rcx - rw / 2); rim.style.top = px(rcy - rh / 2)
    rim.style.width = px(rw); rim.style.height = px(rh)
    rim.style.setProperty('--rim', hsla(hue + 6, 90, 82, 0.85))
    rim.style.transform = `rotate(${domRot.toFixed(0)}deg)`
    f.appendChild(rim)
  }

  else if (kind === 'dots') {
    const g = el(prefix, 'd-glow')
    g.style.background = `radial-gradient(circle closest-side,
      ${hsla(hue, 58, 66, 0.16)} 0%, ${hsla(hue, 50, 52, 0.06)} 48%, transparent 76%)`
    f.appendChild(g)
    const n = 26 + Math.floor(r() * 22)
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, rad = Math.pow(r(), 0.55) * 0.46
      const s = 2.0 + r() * 3.4
      const d = el(prefix, ''); d.style.position = 'absolute'; d.style.borderRadius = '50%'
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
    const sh = el(prefix, 'd-glow')
    sh.style.background = `radial-gradient(circle closest-side,
      ${hsla(hue, 80, 74, 0.34)} 0%, ${hsla(hue - 10, 70, 58, 0.16)} 26%,
      ${hsla(hue - 30, 60, 44, 0.08)} 52%, transparent 76%)`
    f.appendChild(sh)
    for (let i = 0; i < 6; i++) {
      const s = el(prefix, 's-spk')
      const len = w * (i < 2 ? 0.86 : 0.54)
      const th = Math.max(4, w * 0.012) // scales with w, floor 4px
      s.style.width = px(len); s.style.height = px(th)
      s.style.marginLeft = px(-len / 2); s.style.marginTop = px(-th / 2)
      s.style.background = `linear-gradient(90deg,transparent 0%,${hsla(hue, 86, 86, 0.7)} 50%,transparent 100%)`
      s.style.transform = `rotate(${i * 30 + (i < 2 ? 0 : 15)}deg)`
      f.appendChild(s)
    }
    const c = el(prefix, 's-core')
    const cs = Math.max(16, w * 0.055)
    c.style.width = c.style.height = px(cs)
    c.style.marginLeft = px(-cs / 2); c.style.marginTop = px(-cs / 2)
    c.style.boxShadow = `0 0 ${px(cs * 2.4)} ${px(cs * 0.8)} ${hsla(hue, 84, 74, 0.55)}`
    f.appendChild(c)
  }

  else if (kind === 'lens') {
    const d = el(prefix, 'l-disc')
    d.style.background = `radial-gradient(ellipse 54% 24% at 50% 50%,
      ${hsla(hue, 60, 74, 0.30)} 0%, ${hsla(hue, 54, 58, 0.15)} 42%, transparent 74%)`
    f.appendChild(d)
    // dust lane: dark-on-dark against the disc's own low peak alpha is
    // invisible on its own - a thin bright edge above/below the dark lane
    // gives it the contrast delta. Narrowed from the CSS default's 88%
    // width to 55%, centered - the disc's gradient only reads out to
    // roughly half the disc's own width.
    const lane = el(prefix, 'l-lane')
    lane.style.left = '22.5%'; lane.style.right = '22.5%'
    lane.style.boxShadow = `0 -4px 0 0 ${hsla(hue, 60, 70, 0.5)}, 0 4px 0 0 ${hsla(hue, 60, 70, 0.5)}`
    f.appendChild(lane)
    const c = el(prefix, 'l-core')
    const cs = Math.max(11, w * 0.032)
    c.style.width = c.style.height = px(cs)
    c.style.marginLeft = px(-cs / 2); c.style.marginTop = px(-cs / 2)
    c.style.boxShadow = `0 0 ${px(cs * 2.6)} ${px(cs * 0.7)} ${hsla(hue, 70, 80, 0.45)}`
    f.appendChild(c)
    f.style.transform = `rotate(${(-30 + r() * 24).toFixed(0)}deg)`
  }

  else if (kind === 'streak') {
    const t = el(prefix, 'k-tail')
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
    const coma = el(prefix, 'd-glow')
    coma.style.left = px(headCx - comaW / 2); coma.style.top = '0'; coma.style.width = px(comaW); coma.style.height = '100%'
    coma.style.background = `radial-gradient(circle, ${hsla(hue, 70, 85, 0.5)} 0%, transparent 70%)`
    f.appendChild(coma)
    const hd = el(prefix, 'k-head')
    hd.style.width = hd.style.height = px(hs); hd.style.marginTop = px(-hs / 2)
    hd.style.background = '#f2fbff'
    hd.style.boxShadow = `0 0 ${px(hs * 2.2)} ${px(hs * 0.6)} ${hsla(hue, 72, 80, 0.5)}`
    f.appendChild(hd)
    f.style.transform = `rotate(${(-26 + r() * 16).toFixed(0)}deg)`
  }

  else if (kind === 'ribbon') {
    const b = el(prefix, 'r-body')
    b.style.background = `radial-gradient(ellipse 60% 18% at 50% 50%,
      ${hsla(hue, 44, 26, 0.72)} 0%, ${hsla(hue, 40, 20, 0.40)} 44%, transparent 76%)`
    f.appendChild(b)
    // same dark-on-dark failure as lens, worse. Reuses .b-rim - its arc-style
    // border (right/bottom transparent) and inset-shape logic don't assume
    // a round parent, only an elliptical border-box, which ribbon's body
    // also is (just flatter).
    const rim = el(prefix, 'b-rim')
    rim.style.left = '4%'; rim.style.top = '34%'; rim.style.width = '92%'; rim.style.height = '32%'
    rim.style.setProperty('--rim', hsla(hue + 10, 70, 78, 0.85))
    f.appendChild(rim)
    f.style.transform = `rotate(${(-18 + r() * 36).toFixed(0)}deg)`
  }

  else if (kind === 'ring') {
    const ring = el(prefix, 'rg-ring')
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
    const body = el(prefix, 'l-disc')
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
    const halo = el(prefix, 'd-glow')
    const haloD = w * 0.5
    halo.style.left = px(w * 0.5 - haloD / 2); halo.style.top = px(h * 0.5 - haloD / 2)
    halo.style.width = halo.style.height = px(haloD)
    halo.style.background = `radial-gradient(circle closest-side, ${hsla(hue, 60, 70, 0.20)} 0%, transparent 75%)`
    f.appendChild(halo)
    sizes.forEach((sz, i) => {
      const d = el(prefix, ''); d.style.position = 'absolute'; d.style.borderRadius = '50%'
      const s = w * sz * 0.22
      d.style.left = px(positions[i][0] * w - s / 2); d.style.top = px(positions[i][1] * h - s / 2)
      d.style.width = d.style.height = px(s)
      d.style.background = hsla(hue, 70, 85, 1)
      d.style.boxShadow = `0 0 ${px(s * 2)} ${px(s * 0.3)} ${hsla(hue, 70, 80, 0.5)}`
      f.appendChild(d)
    })
  }
  return f
}

export { makePrim }

// ═══ STARS ═══ every one twinkles, wide swing, 5-13s - the Sonora
// behaviour Ben named as the bar. NEVER a blur filter on these.
const TEMP = ['#ffffff', '#f6e6ff', '#ffffff', '#fff3e2', '#eaf0ff']

export function buildStars(prefix, engine, host, period, perFrame, sizeMul, seed) {
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
    const d = el(prefix, 'star'), s = d.style
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
