// RingAmbient — the DOM-building half of the "ring" ambient model.
// Ported from concepts/world-07-ring.html, which remains the source of
// truth (see client/src/lib/ringEngine.js for the pure-math half). This
// component is NOT wired into production — it exists in isolation until a
// later task mounts it in the dev-only /ambient preview route.
//
// Architectural constraint (matches ParticleBackground.jsx's own "never
// re-mounts" rule, see that file's Critical Rules comment and the repo
// SKILL.md): the station index must NEVER arrive as a React prop, because
// this component will eventually live inside ParticleBackground, which
// mounts once per show. So the entire DOM tree is built exactly once in a
// mount-only useEffect (mirroring the reference build's own top-level
// `(function build(){...})()` IIFE), and turn()/jumpTo() are exposed
// imperatively via useImperativeHandle. Both mutate `surge.style.transform`
// directly — never React state/props — so calling them never triggers a
// re-render of this subtree.
//
// Out of scope for this port (see the plan task for the full reasoning):
// question-slide rendering (qScrim/qLayer/qText/renderQ/showQ/hideQ/
// layoutScrim/fitPx/wrapLines/fits — Trivia OS already has its own
// question-rendering system elsewhere), the reference build's own demo-page
// chrome (.notes/.ctl/header/.sub/status line, the safe-box `.guides`
// overlay, `.vig` vignette and `.grain` texture — none of these appear in
// the task's explicit "CSS you'll need" class list), and the shooting-star
// system (spawnShoot/shootLoop/.shootLane).
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { cylinderOf, authorPeriodOf, buildArc, loudnessOf, rng, lerp } from '../../lib/ringEngine.js'
import { EASE_SURGE } from '../../lib/easings.js'

// ENGINE — engine-fixed, identical for every world; never a prop (a world
// never sets any of this, same as the reference build's own ENGINE const).
// SAFE is included (absent from the reference's WORLD-facing exports but
// present in its own ENGINE object) because bandY() needs it to keep solid
// forms out of the safe box. Q/DWELL_MS/SHOOT_MS are omitted — they belong
// to the out-of-scope question and shooting-star systems.
const ENGINE = {
  W: 1920, H: 1080,
  PANES: 12,
  SURGE_MS: 1700,
  SAFE: { x: 0.20, y: 0.28, w: 0.60, h: 0.44 },
  LAYERS: [
    { id: 'sky',  surge: 0,    m: 1 },
    { id: 'far',  surge: 480,  m: 1 },
    { id: 'mid',  surge: 1920, m: 1 },
    { id: 'near', surge: 2880, m: 3 },
  ],
  ARC: { lo: 18, hi: 52, exp: 1.6 },
  STAR_ALPHA_FLOOR: 0.28,
}

const TEMP = ['#ffffff', '#f6e6ff', '#ffffff', '#fff3e2', '#eaf0ff']

// ── tiny DOM helpers — ported verbatim from the reference build ──────────
function el(c) { const d = document.createElement('div'); if (c) d.className = c; return d }
const px = n => n.toFixed(1) + 'px'
function hsla(h, s, l, a) { return `hsla(${h},${s}%,${l}%,${a})` }

// ── CSS — verbatim port of the reference build's chassis/primitive/star
// rules (the exact class list named in the task: .ring-lyr, .ring-surge,
// .ring-void, .ring-star, .ring-pf, .ring-b-lobe, .ring-b-rim, .ring-d-glow,
// .ring-s-core, .ring-s-spk, .ring-l-disc, .ring-l-lane, .ring-l-core,
// .ring-k-tail, .ring-k-head, .ring-r-body, @keyframes ringTw/ringPfBreathe
// — all prefixed to match ParticleBackground.jsx's convention (kebab-case
// classes, camelCase keyframes, e.g. .hw-anim / ambientBreathe / hwFogR).
// `.stage` is renamed `.ring-stage` — that class isn't part of the
// ring-verify.mjs contract (only #design, .void, .star, .surge,
// window.__world are), and "stage" is generic enough to risk colliding with
// unrelated app CSS. ──
const RING_CSS = `
.ring-lyr{position:absolute;inset:0;overflow:hidden}
.ring-surge{position:absolute;left:0;top:0;width:100%;height:100%;
  will-change:transform;transform:translate3d(0,0,0)}
.ring-stage.go .ring-surge{transition:transform var(--surge-ms) cubic-bezier(${EASE_SURGE.join(',')})}

.ring-void{position:absolute;inset:0;
  background:radial-gradient(ellipse 138% 128% at 50% 48%,
    var(--sky-1) 0%, var(--sky-2) 46%, var(--sky-3) 78%, var(--sky-4) 100%)}

.ring-star{position:absolute;border-radius:50%;background:var(--sc);
  animation:ringTw var(--tp) ease-in-out infinite;animation-delay:var(--td)}
@keyframes ringTw{0%,100%{opacity:var(--ob)}50%{opacity:var(--op)}}

.ring-pf{position:absolute;pointer-events:none;
  animation:ringPfBreathe var(--pb) ease-in-out infinite;animation-delay:var(--pd)}
@keyframes ringPfBreathe{0%,100%{opacity:var(--pa)}50%{opacity:var(--pa2)}}

.ring-b-lobe{position:absolute;border-radius:50%}
.ring-b-rim{position:absolute;border-radius:50%;border:4px solid var(--rim);
  border-right-color:transparent;border-bottom-color:transparent}

.ring-d-glow{position:absolute;inset:0;border-radius:50%}

.ring-s-core{position:absolute;left:50%;top:50%;border-radius:50%;background:#fffaf0}
.ring-s-spk{position:absolute;left:50%;top:50%;transform-origin:50% 50%}

.ring-l-disc{position:absolute;inset:0;border-radius:50%}
.ring-l-lane{position:absolute;left:6%;right:6%;top:46%;height:8%;border-radius:50%;
  background:rgba(4,3,14,.62)}
.ring-l-core{position:absolute;left:50%;top:50%;border-radius:50%;background:#fff6e6}

.ring-k-tail{position:absolute;left:0;top:50%;border-radius:999px}
.ring-k-head{position:absolute;right:-4px;top:50%;border-radius:50%}

.ring-r-body{position:absolute;inset:0;border-radius:50%}

.ring-rg-ring{position:absolute;border-radius:50%}

@media (prefers-reduced-motion:reduce){
  .ring-surge{transition:none!important}
  .ring-star,.ring-pf{animation-play-state:paused!important}
}
`

// ═══ PRIMITIVES ═══ the engine renders these; a world picks one and a hue.
// Ported verbatim from concepts/world-07-ring.html's makePrim — every
// inline style/gradient/transform is load-bearing for how the ambient
// actually looks (Ben has already reviewed and approved this appearance).
function makePrim(kind, w, h, hue, alpha, r) {
  const f = el('ring-pf')
  f.style.width = px(w); f.style.height = px(h)
  f.style.setProperty('--pa', alpha.toFixed(3))
  f.style.setProperty('--pa2', Math.min(alpha * 1.18, 1).toFixed(3))
  f.style.setProperty('--pb', (47 + Math.floor(r() * 26)) + 's')
  f.style.setProperty('--pd', (-r() * 40).toFixed(1) + 's')

  if (kind === 'blob') {
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, domRot = 0, domArea = -1
    for (let i = 0; i < 3; i++) {
      const L = el('ring-b-lobe')
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
    const core = el('ring-s-core')
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
    const rim = el('ring-b-rim')
    const rw = (bx1 - bx0) * 0.56, rh = (by1 - by0) * 0.44
    const rcx = (bx0 + bx1) / 2, rcy = (by0 + by1) / 2
    rim.style.left = px(rcx - rw / 2); rim.style.top = px(rcy - rh / 2)
    rim.style.width = px(rw); rim.style.height = px(rh)
    rim.style.setProperty('--rim', hsla(hue + 6, 90, 82, 0.85))
    rim.style.transform = `rotate(${domRot.toFixed(0)}deg)`
    f.appendChild(rim)
  }

  else if (kind === 'dots') {
    const g = el('ring-d-glow')
    g.style.background = `radial-gradient(circle closest-side,
      ${hsla(hue, 58, 66, 0.16)} 0%, ${hsla(hue, 50, 52, 0.06)} 48%, transparent 76%)`
    f.appendChild(g)
    const n = 26 + Math.floor(r() * 22)
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, rad = Math.pow(r(), 0.55) * 0.46
      const s = 2.0 + r() * 3.4
      const d = el(); d.style.position = 'absolute'; d.style.borderRadius = '50%'
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
    const sh = el('ring-d-glow')
    sh.style.background = `radial-gradient(circle closest-side,
      ${hsla(hue, 80, 74, 0.34)} 0%, ${hsla(hue - 10, 70, 58, 0.16)} 26%,
      ${hsla(hue - 30, 60, 44, 0.08)} 52%, transparent 76%)`
    f.appendChild(sh)
    for (let i = 0; i < 6; i++) {
      const s = el('ring-s-spk')
      const len = w * (i < 2 ? 0.86 : 0.54)
      const th = Math.max(4, w * 0.012) // scales with w, floor 4px
      s.style.width = px(len); s.style.height = px(th)
      s.style.marginLeft = px(-len / 2); s.style.marginTop = px(-th / 2)
      s.style.background = `linear-gradient(90deg,transparent 0%,${hsla(hue, 86, 86, 0.7)} 50%,transparent 100%)`
      s.style.transform = `rotate(${i * 30 + (i < 2 ? 0 : 15)}deg)`
      f.appendChild(s)
    }
    const c = el('ring-s-core')
    const cs = Math.max(16, w * 0.055)
    c.style.width = c.style.height = px(cs)
    c.style.marginLeft = px(-cs / 2); c.style.marginTop = px(-cs / 2)
    c.style.boxShadow = `0 0 ${px(cs * 2.4)} ${px(cs * 0.8)} ${hsla(hue, 84, 74, 0.55)}`
    f.appendChild(c)
  }

  else if (kind === 'lens') {
    const d = el('ring-l-disc')
    d.style.background = `radial-gradient(ellipse 54% 24% at 50% 50%,
      ${hsla(hue, 60, 74, 0.30)} 0%, ${hsla(hue, 54, 58, 0.15)} 42%, transparent 74%)`
    f.appendChild(d)
    // dust lane: dark-on-dark against the disc's own low peak alpha is
    // invisible on its own — a thin bright edge above/below the dark lane
    // gives it the contrast delta. Narrowed from the CSS default's 88%
    // width to 55%, centered — the disc's gradient only reads out to
    // roughly half the disc's own width.
    const lane = el('ring-l-lane')
    lane.style.left = '22.5%'; lane.style.right = '22.5%'
    lane.style.boxShadow = `0 -4px 0 0 ${hsla(hue, 60, 70, 0.5)}, 0 4px 0 0 ${hsla(hue, 60, 70, 0.5)}`
    f.appendChild(lane)
    const c = el('ring-l-core')
    const cs = Math.max(11, w * 0.032)
    c.style.width = c.style.height = px(cs)
    c.style.marginLeft = px(-cs / 2); c.style.marginTop = px(-cs / 2)
    c.style.boxShadow = `0 0 ${px(cs * 2.6)} ${px(cs * 0.7)} ${hsla(hue, 70, 80, 0.45)}`
    f.appendChild(c)
    f.style.transform = `rotate(${(-30 + r() * 24).toFixed(0)}deg)`
  }

  else if (kind === 'streak') {
    const t = el('ring-k-tail')
    t.style.width = '100%'; t.style.height = px(Math.max(6, h * 0.14)) // broadens vs prior 0.10
    t.style.marginTop = px(-Math.max(6, h * 0.14) / 2)
    t.style.background = `linear-gradient(90deg,transparent 0%,${hsla(hue, 60, 70, 0.10)} 18%,
      ${hsla(hue, 66, 78, 0.32)} 70%,${hsla(hue, 70, 90, 0.62)} 100%)`
    f.appendChild(t)
    // coma: soft glow bigger than the nucleus, marking this as a comet not
    // a point-source shooting star. Centered on the head's actual position
    // (.ring-k-head is right:-4px, top:50%, so its center sits at
    // x = w+4-hs/2).
    const hs = Math.max(16, h * 0.30)
    const headCx = w + 4 - hs / 2
    const comaW = h * 0.7
    const coma = el('ring-d-glow')
    coma.style.left = px(headCx - comaW / 2); coma.style.top = '0'; coma.style.width = px(comaW); coma.style.height = '100%'
    coma.style.background = `radial-gradient(circle, ${hsla(hue, 70, 85, 0.5)} 0%, transparent 70%)`
    f.appendChild(coma)
    const hd = el('ring-k-head')
    hd.style.width = hd.style.height = px(hs); hd.style.marginTop = px(-hs / 2)
    hd.style.background = '#f2fbff'
    hd.style.boxShadow = `0 0 ${px(hs * 2.2)} ${px(hs * 0.6)} ${hsla(hue, 72, 80, 0.5)}`
    f.appendChild(hd)
    f.style.transform = `rotate(${(-26 + r() * 16).toFixed(0)}deg)`
  }

  else if (kind === 'ribbon') {
    const b = el('ring-r-body')
    b.style.background = `radial-gradient(ellipse 60% 18% at 50% 50%,
      ${hsla(hue, 44, 26, 0.72)} 0%, ${hsla(hue, 40, 20, 0.40)} 44%, transparent 76%)`
    f.appendChild(b)
    const rim = el('ring-b-rim')
    rim.style.left = '4%'; rim.style.top = '34%'; rim.style.width = '92%'; rim.style.height = '32%'
    rim.style.setProperty('--rim', hsla(hue + 10, 70, 78, 0.85))
    f.appendChild(rim)
    f.style.transform = `rotate(${(-18 + r() * 36).toFixed(0)}deg)`
  }

  else if (kind === 'ring') {
    const ring = el('ring-rg-ring')
    const rw = w * 0.9, rh = h * 0.9
    ring.style.left = px((w - rw) / 2); ring.style.top = px((h - rh) / 2)
    ring.style.width = px(rw); ring.style.height = px(rh)
    ring.style.borderWidth = px(Math.max(4, w * 0.02))
    ring.style.borderStyle = 'solid'
    ring.style.borderColor = hsla(hue, 70, 78, 0.75)
    f.appendChild(ring)
    // planet body it wraps — reuses ring-l-disc (inset:0, no lens-specific
    // geometry baked in); the inline left/top/width/height below fully
    // override its inset:0 default.
    const body = el('ring-l-disc')
    const bw = w * 0.42, bh = h * 0.42
    body.style.left = px((w - bw) / 2); body.style.top = px((h - bh) / 2)
    body.style.width = px(bw); body.style.height = px(bh)
    body.style.background = `radial-gradient(circle at 38% 38%, ${hsla(hue, 60, 68, 0.9)} 0%, ${hsla(hue, 50, 40, 0.7)} 70%, transparent 100%)`
    f.appendChild(body)
  }

  else if (kind === 'binary') {
    // two unequal bodies + a shared halo — distinct from the unparameterized
    // dots cluster.
    const sizes = [0.62, 0.40] // two unequal bodies, not two identical dots
    const positions = [[0.38, 0.5], [0.62, 0.5]]
    // halo scoped to the two dots' own span (not ring-d-glow's inset:0
    // default, which fills the entire headline box) — unsized it merges
    // the two dots into one solid oval, reading as another blob.
    const halo = el('ring-d-glow')
    const haloD = w * 0.5
    halo.style.left = px(w * 0.5 - haloD / 2); halo.style.top = px(h * 0.5 - haloD / 2)
    halo.style.width = halo.style.height = px(haloD)
    halo.style.background = `radial-gradient(circle closest-side, ${hsla(hue, 60, 70, 0.20)} 0%, transparent 75%)`
    f.appendChild(halo)
    sizes.forEach((sz, i) => {
      const d = el(); d.style.position = 'absolute'; d.style.borderRadius = '50%'
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

// ═══ PLACEMENT ═══ centroid+luminance, not geometric exclusion. Keep
// element CENTROIDS out of the safe box (top/bot below) — that's the whole
// geometric constraint; area may cross freely because the scrim's adaptive
// alpha, not an evacuated band, protects legibility (spec §2). Within the
// upper/lower bands, draw close to the box edge (near y=302/778) as often
// as the frame's extreme top/bottom — was (0.25 + r()*0.75) / (r()*0.72),
// which pushed every centroid away from the edge and evacuated the
// y 302-778 stripe of area, recreating the dead stripe §2 eliminates
// (appendix #3).
function bandY(engine, r, h) {
  const H = engine.H, top = engine.SAFE.y * H, bot = (engine.SAFE.y + engine.SAFE.h) * H
  const upper = r() < 0.5, margin = 8
  // Clamp by centroid (y + h/2), not a fixed offset from y — see
  // world-07-ring.html's bandY() for why (tall headlines could land with
  // their centroid inside the safe box under the old constants).
  if (upper) {
    const maxY = top - h / 2 - margin, minY = -h * 0.10
    return maxY <= minY ? maxY : minY + (maxY - minY) * r()
  }
  const minY = bot - h / 2 + margin, maxY = H - h * 0.88
  return minY >= maxY ? minY : minY + (maxY - minY) * r()
}

// ═══ STARS ═══ every one twinkles, wide swing, 5-13s.
function buildStars(engine, host, period, perFrame, sizeMul, seed) {
  const n = Math.round(perFrame * (period / engine.W))
  const frag = document.createDocumentFragment()
  for (let i = 0; i < n; i++) {
    const r = rng(i, seed), roll = r()
    /* 65% small, 27% mid, 8% big */
    const size = (roll < 0.65 ? 1.2 + r() * 1.0
      : roll < 0.92 ? 2.4 + r() * 1.6
        : 4.5 + r() * 3.5) * sizeMul
    const lo = engine.STAR_ALPHA_FLOOR + r() * 0.14
    const hi = Math.min(lo + 0.40 + r() * 0.15, 1)
    const dur = 5 + r() * 8
    const d = el('ring-star'), s = d.style
    s.left = px(r() * period); s.top = px(r() * engine.H)
    s.width = s.height = px(size)
    s.setProperty('--sc', TEMP[i % 5])
    s.setProperty('--ob', lo.toFixed(2))
    s.setProperty('--op', hi.toFixed(2))
    s.setProperty('--tp', dur.toFixed(2) + 's')
    s.setProperty('--td', (-r() * dur).toFixed(2) + 's')
    /* glow is a box-shadow, never a blur filter */
    if (size >= 5) s.boxShadow = `0 0 ${px(size * 2.2)} ${px(size * 0.3)} ${TEMP[i % 5]}`
    frag.appendChild(d)
  }
  host.appendChild(frag)
  return n
}

// ═══ BUILD ═══ dispatches per-layer content building.
function buildLayerContent(engine, world, arc, host, L) {
  const period = authorPeriodOf(engine, L)

  if (L.id === 'far') {
    /* slow, dense star field + one wide soft wash per two stations */
    buildStars(engine, host, period, 140, 1.0, 0xA11CE)
    for (let i = 0; i < 6; i++) {
      const r = rng(i, 0xFA2)
      const st = world.stations[(i * 2) % engine.PANES]
      const lou = loudnessOf(arc, (i * 2) % engine.PANES)
      const w = lerp(620, 900, r()), h = w * (0.52 + r() * 0.22)
      const f = makePrim('blob', w, h, st.hue, lerp(0.16, 0.30, lou), r)
      f.style.left = px(i * (period / 6) + r() * (period / 6 - w))
      f.style.top = px(bandY(engine, r, h))
      host.appendChild(f)
    }
  }

  else if (L.id === 'mid') {
    /* THE COMPOSITION LAYER. mid moves exactly one frame per turn, so
       station i is authored into the frame at x = i*W and lands there
       every single time. */
    for (let i = 0; i < engine.PANES; i++) {
      const st = world.stations[i]
      const r = rng(i, 0x5EED)
      const lou = loudnessOf(arc, i)
      const x0 = i * engine.W

      const hw = lerp(576, 880, lou * 0.75 + r() * 0.25)
      const hh = st.prim === 'streak' ? hw * 0.30
        : st.prim === 'ribbon' ? hw * 0.34
          : hw * (0.62 + r() * 0.26)
      const alpha = lerp(0.34, 0.55, lou)
      const head = makePrim(st.prim, hw, hh, st.hue, alpha, r)
      // was lerp(0.06, 0.44, r()) — capped well below the frame's full
      // width, so a centroid can never land right of ~x900. Measured mean
      // centroid x = 692 against a frame center of 960 (spec §2, appendix
      // #2). Draw range must span >=0.90 of available width; measured
      // against the reference build's real render (same seed/content),
      // [0.08, 0.98] lands mean centroid x at 920 (within the 960±96
      // gate) — [0.02, 0.92] alone undershot to 848, just outside the
      // band, so this was iterated per §2's gate, not shipped on the first
      // guess.
      head.style.left = px(x0 + lerp(0.08, 0.98, r()) * (engine.W - hw))
      head.style.top = px(bandY(engine, r, hh))
      host.appendChild(head)

      /* one feature-tier companion in the opposite band */
      const others = ['blob', 'dots', 'lens', 'streak'].filter(k => k !== st.prim)
      const ck = others[Math.floor(r() * others.length)]
      const cw = lerp(230, 420, r())
      const ch = ck === 'streak' ? cw * 0.30 : cw * (0.60 + r() * 0.28)
      const comp = makePrim(ck, cw, ch, st.hue + (st.accent ? 168 : lerp(-22, 22, r())),
        lerp(0.30, 0.48, lou) * 0.8, r)
      comp.style.left = px(x0 + lerp(0.08, 0.98, r()) * (engine.W - cw))
      comp.style.top = px(bandY(engine, r, ch))
      host.appendChild(comp)

      /* detail-tier specks, count follows loudness */
      const dn = Math.round(lerp(1, 4, lou))
      for (let k = 0; k < dn; k++) {
        const dw = lerp(58, 154, r())
        const d = makePrim('dots', dw, dw * 0.9, st.hue, lerp(0.34, 0.60, lou) * 0.7, r)
        d.style.left = px(x0 + r() * (engine.W - dw))
        d.style.top = px(bandY(engine, r, dw * 0.9))
        host.appendChild(d)
      }
    }
  }

  else if (L.id === 'near') {
    /* fast and anonymous — the layer that sells the turn */
    buildStars(engine, host, period, 26, 1.5, 0xBEEF)
  }
}

const isReduced = () =>
  typeof window !== 'undefined' && window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// worldData shape: { id, type, name, phase, sky: [4 hex], qColours: [2 hex],
// stations: [12 x {key,prim,hue,accent}] } — see concepts/world-07-ring.html's
// own WORLD literal. qColours is accepted but unused here (question-colour
// styling belongs to the out-of-scope question-rendering system).
const RingAmbient = forwardRef(function RingAmbient({ worldData }, ref) {
  const stageElRef = useRef(null)
  const designElRef = useRef(null)
  const surgeElsRef = useRef({})
  const offsetRef = useRef({})
  const stationRef = useRef(0)
  const busyRef = useRef(false)
  const queuedTurnsRef = useRef(0)
  const turnTimerRef = useRef(null)

  // ── build once on mount — never re-run on worldData change. This is the
  // whole point of the task: RingAmbient will eventually live inside
  // ParticleBackground, which mounts once per show and must never rebuild
  // its DOM mid-session. ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const stage = stageElRef.current
    const design = designElRef.current
    if (!stage || !design) return

    function fit() {
      design.style.transform = `scale(${stage.clientWidth / ENGINE.W})`
    }
    const ro = new ResizeObserver(fit)
    ro.observe(stage)
    fit()

    const arc = buildArc(ENGINE, worldData)

    // sky layer — bare, never transformed, never offset
    const sky = el('ring-lyr')
    const skyInner = el('ring-surge')
    skyInner.style.transition = 'none'
    skyInner.appendChild(el('ring-void'))
    sky.appendChild(skyInner)
    design.appendChild(sky)

    const surgeEls = {}
    for (const L of ENGINE.LAYERS) {
      if (L.id === 'sky') continue
      const cyl = cylinderOf(ENGINE, L)
      const period = authorPeriodOf(ENGINE, L)
      const lyr = el('ring-lyr')
      const surge = el('ring-surge')
      surge.style.width = px(cyl + ENGINE.W)
      lyr.appendChild(surge)
      design.appendChild(lyr)

      // author one period, then repeat it m+1 times. The extra copy covers
      // the window that hangs past the cylinder just before it wraps.
      const proto = el(); proto.style.position = 'absolute'; proto.style.inset = '0'
      buildLayerContent(ENGINE, worldData, arc, proto, L)
      for (let k = 0; k <= L.m; k++) {
        const copy = k === 0 ? proto : proto.cloneNode(true)
        copy.style.position = 'absolute'
        copy.style.left = px(k * period)
        copy.style.top = '0'
        copy.style.width = px(period)
        surge.appendChild(copy)
      }
      surgeEls[L.id] = surge
      offsetRef.current[L.id] = 0
    }
    surgeElsRef.current = surgeEls

    stage.style.setProperty('--surge-ms', ENGINE.SURGE_MS + 'ms')
    worldData.sky.forEach((c, i) => stage.style.setProperty('--sky-' + (i + 1), c))

    writeOffsets()

    // React 18 StrictMode double-invokes this effect in dev; clear what we
    // built so the second invocation doesn't append a duplicate DOM tree.
    return () => {
      ro.disconnect()
      design.replaceChildren()
    }
  }, [])

  function writeOffsets() {
    const surgeEls = surgeElsRef.current
    const offset = offsetRef.current
    for (const L of ENGINE.LAYERS) {
      if (L.id === 'sky') continue
      const surgeEl = surgeEls[L.id]
      if (surgeEl) surgeEl.style.transform = `translate3d(${-offset[L.id]}px,0,0)`
    }
  }

  // Offsets wrap modulo the layer's cylinder, and because every cylinder is
  // exactly 12 surges, all layers return to phase 0 together on turn 12.
  // At the wrap we jump rather than animate: sliding back across a whole
  // cylinder would read as a rewind, and because the content at phase 0 is
  // identical to phase cylinder, the jump is invisible.
  //
  // Deliberate deviation from the reference build: the reference increments
  // `station` (and unlocks `busy`) inside land(), which the wrap branch
  // calls immediately but the animate branch defers via a SECOND setTimeout
  // at ENGINE.Q.IN_START_MS (1150ms, ahead of the SURGE_MS+60 one) — timed
  // so the question text swap lands mid-transition, and unlocking `busy`
  // ~550ms before the CSS transition visually finishes. With the question
  // system out of scope for this component, there is no such constant to
  // defer to, so here `station` updates synchronously with `offset`, and
  // `busy` unlocks once, when the transition actually completes
  // (SURGE_MS+60) — a caller-initiated turn during that window queues (see
  // below) rather than starting a second transition mid-animation. The
  // wrap-modulo math and the +1-mod-PANES increment itself are unchanged
  // from the reference.
  // A turn() received while busy queues instead of vanishing — the ring's
  // whole model depends on station always equaling slideIndex % PANES, so a
  // rapid double-advance (a real thing a host does) must never drop a turn
  // silently. See concepts/ART-DIRECTION-SPEC.md §8. unlock() is the single
  // choke point both busy-clearing sites below call through, so a queued
  // turn drains exactly once busy actually frees up.
  function unlock() {
    busyRef.current = false
    if (queuedTurnsRef.current > 0) {
      queuedTurnsRef.current--
      turn()
    }
  }

  function turn() {
    if (busyRef.current) { queuedTurnsRef.current++; return }
    busyRef.current = true
    const stage = stageElRef.current
    const offset = offsetRef.current
    const willWrap = ENGINE.LAYERS.some(L => L.id !== 'sky' &&
      offset[L.id] + L.surge >= cylinderOf(ENGINE, L))

    if (isReduced() || willWrap) {
      ENGINE.LAYERS.forEach(L => { if (L.id !== 'sky') offset[L.id] = (offset[L.id] + L.surge) % cylinderOf(ENGINE, L) })
      stage.classList.remove('go')
      writeOffsets()
      // unlock() may drain a queued turn and re-add 'go' in this same
      // tick; without a forced reflow between the remove and that re-add,
      // the browser coalesces both writes into one paint and the wrap
      // animates as a visible rewind instead of snapping.
      void stage.offsetWidth
      stationRef.current = (stationRef.current + 1) % ENGINE.PANES
      unlock()
      return
    }

    stage.classList.add('go')
    ENGINE.LAYERS.forEach(L => { if (L.id !== 'sky') offset[L.id] += L.surge })
    writeOffsets()
    stationRef.current = (stationRef.current + 1) % ENGINE.PANES
    turnTimerRef.current = setTimeout(() => {
      stage.classList.remove('go')
      unlock()
    }, ENGINE.SURGE_MS + 60)
  }

  function jumpTo(target) {
    // Authoritative resync: cancels any turn() this jump is interrupting
    // (and drops anything queued behind it), so a jump made mid-transition
    // can't be overshot by that turn still landing afterward.
    clearTimeout(turnTimerRef.current)
    busyRef.current = false
    queuedTurnsRef.current = 0
    // stationRef only ever holds 0..PANES-1 — normalize first, or an
    // out-of-range/non-integer target (a raw slide index from a future
    // caller, an off-by-one, a stray float) never equals stationRef.current
    // and this loop spins forever.
    target = ((Math.trunc(target) % ENGINE.PANES) + ENGINE.PANES) % ENGINE.PANES
    const offset = offsetRef.current
    while (stationRef.current !== target) {
      ENGINE.LAYERS.forEach(L => { if (L.id !== 'sky') offset[L.id] = (offset[L.id] + L.surge) % cylinderOf(ENGINE, L) })
      stationRef.current = (stationRef.current + 1) % ENGINE.PANES
    }
    stageElRef.current.classList.remove('go')
    writeOffsets()
  }

  // turn/jumpTo close over refs only (stable identities), so the empty dep
  // array is safe — the handle never needs to be recomputed after mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useImperativeHandle(ref, () => ({
    turn,
    jumpTo,
    get station() { return stationRef.current },
  }), [])

  return (
    <div
      ref={stageElRef}
      className="ring-stage"
      aria-hidden
      style={{ position: 'absolute', inset: 0, aspectRatio: '16/9', overflow: 'hidden', background: '#01010a', pointerEvents: 'none' }}
    >
      <style>{RING_CSS}</style>
      <div
        ref={designElRef}
        id="design"
        style={{ position: 'absolute', left: 0, top: 0, width: ENGINE.W, height: ENGINE.H, transformOrigin: '0 0', overflow: 'hidden' }}
      />
    </div>
  )
})

export default RingAmbient
