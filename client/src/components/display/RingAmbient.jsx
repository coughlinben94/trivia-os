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
// rules (the exact class list named in the task: .lyr, .surge, .void,
// .star, .pf, .b-lobe, .b-rim, .d-glow, .s-core, .s-spk, .l-disc, .l-lane,
// .l-core, .k-tail, .k-head, .r-body, @keyframes tw/pfBreathe). `.stage` is
// renamed `.ring-stage` — that class isn't part of the ring-verify.mjs
// contract (only #design, .void, .star, .surge, window.__world are), and
// "stage" is generic enough to risk colliding with unrelated app CSS. ──
const RING_CSS = `
.lyr{position:absolute;inset:0;overflow:hidden}
.surge{position:absolute;left:0;top:0;width:100%;height:100%;
  will-change:transform;transform:translate3d(0,0,0)}
.ring-stage.go .surge{transition:transform var(--surge-ms) cubic-bezier(.16,.62,.28,1)}

.void{position:absolute;inset:0;
  background:radial-gradient(ellipse 138% 128% at 50% 48%,
    var(--sky-1) 0%, var(--sky-2) 46%, var(--sky-3) 78%, var(--sky-4) 100%)}

.star{position:absolute;border-radius:50%;background:var(--sc);
  animation:tw var(--tp) ease-in-out infinite;animation-delay:var(--td)}
@keyframes tw{0%,100%{opacity:var(--ob)}50%{opacity:var(--op)}}

.pf{position:absolute;pointer-events:none;
  animation:pfBreathe var(--pb) ease-in-out infinite;animation-delay:var(--pd)}
@keyframes pfBreathe{0%,100%{opacity:var(--pa)}50%{opacity:var(--pa2)}}

.b-lobe{position:absolute;border-radius:50%}
.b-rim{position:absolute;border-radius:50%;border:2px solid var(--rim);
  border-right-color:transparent;border-bottom-color:transparent}

.d-glow{position:absolute;inset:0;border-radius:50%}

.s-core{position:absolute;left:50%;top:50%;border-radius:50%;background:#fffaf0}
.s-spk{position:absolute;left:50%;top:50%;transform-origin:50% 50%}

.l-disc{position:absolute;inset:0;border-radius:50%}
.l-lane{position:absolute;left:6%;right:6%;top:46%;height:8%;border-radius:50%;
  background:rgba(4,3,14,.62)}
.l-core{position:absolute;left:50%;top:50%;border-radius:50%;background:#fff6e6}

.k-tail{position:absolute;left:0;top:50%;border-radius:999px}
.k-head{position:absolute;right:-4px;top:50%;border-radius:50%}

.r-body{position:absolute;inset:0;border-radius:50%}

@media (prefers-reduced-motion:reduce){
  .surge{transition:none!important}
  .star,.pf{animation-play-state:paused!important}
}
`

// ═══ PRIMITIVES ═══ the engine renders these; a world picks one and a hue.
// Ported verbatim from concepts/world-07-ring.html's makePrim — every
// inline style/gradient/transform is load-bearing for how the ambient
// actually looks (Ben has already reviewed and approved this appearance).
function makePrim(kind, w, h, hue, alpha, r) {
  const f = el('pf')
  f.style.width = px(w); f.style.height = px(h)
  f.style.setProperty('--pa', alpha.toFixed(3))
  f.style.setProperty('--pa2', Math.min(alpha * 1.18, 1).toFixed(3))
  f.style.setProperty('--pb', (47 + Math.floor(r() * 26)) + 's')
  f.style.setProperty('--pd', (-r() * 40).toFixed(1) + 's')

  if (kind === 'blob') {
    for (let i = 0; i < 3; i++) {
      const L = el('b-lobe')
      const lw = w * (0.62 + r() * 0.38), lh = h * (0.55 + r() * 0.45)
      L.style.left = px((w - lw) * r()); L.style.top = px((h - lh) * r())
      L.style.width = px(lw); L.style.height = px(lh)
      L.style.background = `radial-gradient(ellipse 56% 44% at ${40 + r() * 20}% 50%,
        ${hsla(hue, 72, 62, 0.42)} 0%, ${hsla(hue - 8, 64, 46, 0.20)} 40%,
        ${hsla(hue - 14, 56, 30, 0.07)} 66%, transparent 82%)`
      L.style.transform = `rotate(${(-30 + r() * 60).toFixed(0)}deg)`
      f.appendChild(L)
    }
    const rim = el('b-rim')
    const rw = w * 0.52, rh = h * 0.52
    rim.style.left = px(w * 0.16); rim.style.top = px(h * 0.18)
    rim.style.width = px(rw); rim.style.height = px(rh)
    rim.style.setProperty('--rim', hsla(hue + 6, 88, 78, 0.34))
    rim.style.transform = `rotate(${(-40 + r() * 80).toFixed(0)}deg)`
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
    const sh = el('d-glow')
    sh.style.background = `radial-gradient(circle closest-side,
      ${hsla(hue, 80, 74, 0.34)} 0%, ${hsla(hue - 10, 70, 58, 0.16)} 26%,
      ${hsla(hue - 30, 60, 44, 0.08)} 52%, transparent 76%)`
    f.appendChild(sh)
    for (let i = 0; i < 6; i++) {
      const s = el('s-spk')
      const len = w * (i < 2 ? 0.86 : 0.54), th = i < 2 ? 3 : 2
      s.style.width = px(len); s.style.height = px(th)
      s.style.marginLeft = px(-len / 2); s.style.marginTop = px(-th / 2)
      s.style.background = `linear-gradient(90deg,transparent 0%,${hsla(hue, 86, 86, 0.46)} 50%,transparent 100%)`
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
    const d = el('l-disc')
    d.style.background = `radial-gradient(ellipse 54% 24% at 50% 50%,
      ${hsla(hue, 60, 74, 0.30)} 0%, ${hsla(hue, 54, 58, 0.15)} 42%, transparent 74%)`
    f.appendChild(d)
    const lane = el('l-lane'); f.appendChild(lane)
    const c = el('l-core')
    const cs = Math.max(11, w * 0.032)
    c.style.width = c.style.height = px(cs)
    c.style.marginLeft = px(-cs / 2); c.style.marginTop = px(-cs / 2)
    c.style.boxShadow = `0 0 ${px(cs * 2.6)} ${px(cs * 0.7)} ${hsla(hue, 70, 80, 0.45)}`
    f.appendChild(c)
    f.style.transform = `rotate(${(-30 + r() * 24).toFixed(0)}deg)`
  }

  else if (kind === 'streak') {
    const t = el('k-tail')
    t.style.width = '100%'; t.style.height = px(Math.max(5, h * 0.10))
    t.style.marginTop = px(-Math.max(5, h * 0.10) / 2)
    t.style.background = `linear-gradient(90deg,transparent 0%,${hsla(hue, 60, 70, 0.08)} 22%,
      ${hsla(hue, 66, 78, 0.28)} 74%,${hsla(hue, 70, 90, 0.55)} 100%)`
    f.appendChild(t)
    const hd = el('k-head')
    const hs = Math.max(14, h * 0.30)
    hd.style.width = hd.style.height = px(hs); hd.style.marginTop = px(-hs / 2)
    hd.style.background = '#f2fbff'
    hd.style.boxShadow = `0 0 ${px(hs * 2.2)} ${px(hs * 0.6)} ${hsla(hue, 72, 80, 0.5)}`
    f.appendChild(hd)
    f.style.transform = `rotate(${(-26 + r() * 16).toFixed(0)}deg)`
  }

  else if (kind === 'ribbon') {
    const b = el('r-body')
    b.style.background = `radial-gradient(ellipse 60% 18% at 50% 50%,
      ${hsla(hue, 44, 26, 0.72)} 0%, ${hsla(hue, 40, 20, 0.40)} 44%, transparent 76%)`
    f.appendChild(b)
    const rim = el('b-rim')
    rim.style.left = '4%'; rim.style.top = '34%'; rim.style.width = '92%'; rim.style.height = '32%'
    rim.style.setProperty('--rim', hsla(hue + 10, 60, 70, 0.22))
    f.appendChild(rim)
    f.style.transform = `rotate(${(-18 + r() * 36).toFixed(0)}deg)`
  }
  return f
}

// ═══ PLACEMENT ═══ keep solid forms out of the safe box. Atmosphere may
// cross it; a form may not. Bands are derived from engine.SAFE so the box
// is declared once.
function bandY(engine, r, h) {
  const H = engine.H, top = engine.SAFE.y * H, bot = (engine.SAFE.y + engine.SAFE.h) * H
  const upper = r() < 0.5
  if (upper) return Math.max(-h * 0.10, (top - h) * (0.25 + r() * 0.75))
  return Math.min(H - h * 0.88, bot + (H - bot - h) * (r() * 0.72))
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
    const d = el('star'), s = d.style
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
      head.style.left = px(x0 + lerp(0.06, 0.44, r()) * (engine.W - hw))
      head.style.top = px(bandY(engine, r, hh))
      host.appendChild(head)

      /* one feature-tier companion in the opposite band */
      const others = ['blob', 'dots', 'lens', 'streak'].filter(k => k !== st.prim)
      const ck = others[Math.floor(r() * others.length)]
      const cw = lerp(230, 420, r())
      const ch = ck === 'streak' ? cw * 0.30 : cw * (0.60 + r() * 0.28)
      const comp = makePrim(ck, cw, ch, st.hue + (st.accent ? 168 : lerp(-22, 22, r())),
        lerp(0.30, 0.48, lou) * 0.8, r)
      comp.style.left = px(x0 + lerp(0.10, 0.62, r()) * (engine.W - cw))
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
    const sky = el('lyr')
    const skyInner = el('surge')
    skyInner.style.transition = 'none'
    skyInner.appendChild(el('void'))
    sky.appendChild(skyInner)
    design.appendChild(sky)

    const surgeEls = {}
    for (const L of ENGINE.LAYERS) {
      if (L.id === 'sky') continue
      const cyl = cylinderOf(ENGINE, L)
      const period = authorPeriodOf(ENGINE, L)
      const lyr = el('lyr')
      const surge = el('surge')
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
  // (SURGE_MS+60) — a caller can't start a new turn while the previous one
  // is still visually animating. The wrap-modulo math and the
  // +1-mod-PANES increment itself are unchanged from the reference.
  function turn() {
    if (busyRef.current) return
    busyRef.current = true
    const stage = stageElRef.current
    const offset = offsetRef.current
    const willWrap = ENGINE.LAYERS.some(L => L.id !== 'sky' &&
      offset[L.id] + L.surge >= cylinderOf(ENGINE, L))

    if (isReduced() || willWrap) {
      ENGINE.LAYERS.forEach(L => { if (L.id !== 'sky') offset[L.id] = (offset[L.id] + L.surge) % cylinderOf(ENGINE, L) })
      stage.classList.remove('go')
      writeOffsets()
      stationRef.current = (stationRef.current + 1) % ENGINE.PANES
      busyRef.current = false
      return
    }

    stage.classList.add('go')
    ENGINE.LAYERS.forEach(L => { if (L.id !== 'sky') offset[L.id] += L.surge })
    writeOffsets()
    stationRef.current = (stationRef.current + 1) % ENGINE.PANES
    setTimeout(() => {
      stage.classList.remove('go')
      busyRef.current = false
    }, ENGINE.SURGE_MS + 60)
  }

  function jumpTo(target) {
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
      style={{ position: 'absolute', inset: 0, aspectRatio: '16/9', overflow: 'hidden', background: '#01010a' }}
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
