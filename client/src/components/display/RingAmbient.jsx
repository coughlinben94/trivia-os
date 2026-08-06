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
import { el, px, hsla, makePrim, bandY, buildStars } from '../../lib/ringPrimitives.js'

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

// makePrim/bandY/buildStars now live in client/src/lib/ringPrimitives.js —
// imported above with the "ring-" classPrefix and the local ENGINE passed
// explicitly. See that module for the full primitive-rendering logic
// (blob/dots/spikes/lens/streak/ribbon/ring/binary) — ported verbatim, one
// source now shared with concepts/world-07-ring.html.

// ═══ BUILD ═══ dispatches per-layer content building.
function buildLayerContent(engine, world, arc, host, L) {
  const period = authorPeriodOf(engine, L)

  if (L.id === 'far') {
    /* slow, dense star field + one wide soft wash per two stations */
    buildStars('ring-', engine, host, period, 140, 1.0, 0xA11CE)
    for (let i = 0; i < 6; i++) {
      const r = rng(i, 0xFA2)
      const st = world.stations[(i * 2) % engine.PANES]
      const lou = loudnessOf(arc, (i * 2) % engine.PANES)
      const w = lerp(620, 900, r()), h = w * (0.52 + r() * 0.22)
      const f = makePrim('ring-', 'blob', w, h, st.hue, lerp(0.16, 0.30, lou), r)
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
      const head = makePrim('ring-', st.prim, hw, hh, st.hue, alpha, r)
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
      const comp = makePrim('ring-', ck, cw, ch, st.hue + (st.accent ? 168 : lerp(-22, 22, r())),
        lerp(0.30, 0.48, lou) * 0.8, r)
      comp.style.left = px(x0 + lerp(0.08, 0.98, r()) * (engine.W - cw))
      comp.style.top = px(bandY(engine, r, ch))
      host.appendChild(comp)

      /* detail-tier specks, count follows loudness */
      const dn = Math.round(lerp(1, 4, lou))
      for (let k = 0; k < dn; k++) {
        const dw = lerp(58, 154, r())
        const d = makePrim('ring-', 'dots', dw, dw * 0.9, st.hue, lerp(0.34, 0.60, lou) * 0.7, r)
        d.style.left = px(x0 + r() * (engine.W - dw))
        d.style.top = px(bandY(engine, r, dw * 0.9))
        host.appendChild(d)
      }
    }
  }

  else if (L.id === 'near') {
    /* fast and anonymous — the layer that sells the turn */
    buildStars('ring-', engine, host, period, 26, 1.5, 0xBEEF)
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
    const sky = el('ring-', 'lyr')
    const skyInner = el('ring-', 'surge')
    skyInner.style.transition = 'none'
    skyInner.appendChild(el('ring-', 'void'))
    sky.appendChild(skyInner)
    design.appendChild(sky)

    const surgeEls = {}
    for (const L of ENGINE.LAYERS) {
      if (L.id === 'sky') continue
      const cyl = cylinderOf(ENGINE, L)
      const period = authorPeriodOf(ENGINE, L)
      const lyr = el('ring-', 'lyr')
      const surge = el('ring-', 'surge')
      surge.style.width = px(cyl + ENGINE.W)
      lyr.appendChild(surge)
      design.appendChild(lyr)

      // author one period, then repeat it m+1 times. The extra copy covers
      // the window that hangs past the cylinder just before it wraps.
      const proto = el('ring-', ''); proto.style.position = 'absolute'; proto.style.inset = '0'
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
