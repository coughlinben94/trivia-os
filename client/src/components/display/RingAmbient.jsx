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
import { ringDom, px, hsla, ringCss } from '../../lib/ringPrimitives.js'

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

// ── CSS — the chassis/primitive/star rules (.ring-lyr, .ring-surge,
// .ring-void, .ring-star, .ring-pf, .ring-b-lobe, .ring-b-rim, .ring-d-glow,
// .ring-s-core, .ring-s-spk, .ring-l-disc, .ring-l-arm, .ring-l-arm-edge,
// .ring-l-core, .ring-k-tail, .ring-k-head, .ring-r-body, .ring-r-edge,
// .ring-rg-ring, @keyframes
// ringTw/ringPfBreathe) now come from client/src/lib/ringPrimitives.js's
// ringCss('ring-') — the same source concepts/world-07-ring.html's
// unprefixed <style> injects via ringCss(''). These were hand-duplicated
// against that page's <style> block (in sync, but nothing enforced that —
// the same bug class the makePrim extraction already fixed once).
//
// `.ring-stage` and its `.go` transition trigger stay local — that class
// isn't part of the ring-verify.mjs contract (only #design, .void, .star,
// .surge, window.__world are, and this component isn't even wired into
// that gate — see the file header), "stage" is generic enough to risk
// colliding with unrelated app CSS, and the easing here comes from this
// app's own client/src/lib/easings.js rather than the reference build's
// hardcoded curve. The reduced-motion query stays local too: it's a
// deliberate subset of the reference build's (no `.shoot`, no `.stage.rm`
// manual toggle — both belong to systems out of scope for this port, see
// the file header). ──
const RING_CSS = `
${ringCss('ring-')}
.ring-stage.go .ring-surge{transition:transform var(--surge-ms) cubic-bezier(${EASE_SURGE.join(',')})}

@media (prefers-reduced-motion:reduce){
  .ring-surge{transition:none!important}
  .ring-star,.ring-pf{animation-play-state:paused!important}
}
`

// dom.el/dom.makePrim/dom.bandY/dom.buildStars (and the plain px export)
// come from client/src/lib/ringPrimitives.js's ringDom('ring-', ENGINE)
// call below. ENGINE (unlike worldData) is module-scoped, not a prop, so
// dom can be too — every call site in this file, in buildLayerContent and
// in the mount effect, goes through it rather than ever passing the
// "ring-" prefix by hand. See that module for the full primitive-rendering
// logic (blob/dots/spikes/lens/streak/ribbon/ring/binary) — one source now
// shared with concepts/world-07-ring.html.
const dom = ringDom('ring-', ENGINE)

// ═══ BUILD ═══ dispatches per-layer content building.
function buildLayerContent(engine, world, arc, host, L) {
  const period = authorPeriodOf(engine, L)

  if (L.id === 'far') {
    /* slow, dense star field + one wide soft wash per two stations */
    dom.buildStars(host, period, 140, 1.0, 0xA11CE)
    for (let i = 0; i < 6; i++) {
      const r = rng(i, 0xFA2)
      const st = world.stations[(i * 2) % engine.PANES]
      const lou = loudnessOf(arc, (i * 2) % engine.PANES)
      const w = lerp(620, 900, r()), h = w * (0.52 + r() * 0.22)
      const f = dom.makePrim('blob', w, h, st.hue, lerp(0.16, 0.30, lou), r)
      f.style.left = px(i * (period / 6) + r() * (period / 6 - w))
      f.style.top = px(dom.bandY(r, h))
      host.appendChild(f)
    }

    // far-layer anchor (spec §7.6): one nameable form, authored ONCE per
    // far-layer author-period (not per-station), sized off the layer's own
    // real arithmetic — visibleStations = (frameWidth + anchorWidth) /
    // farSurge, not a guessed pane count. At AW=760, farSurge=480:
    // (1920+760)/480 = 5.58, so the far layer's own scroll carries it
    // through view for ~5 of the ring's 12 stations as it passes — inside
    // the required 4-6 band. `lens` chosen per this session's own finding
    // that it reads more legibly than the other glow primitives.
    // hueAnchors[1] (214, cool blue), not [0] (276, violet): hueAnchors[0]
    // is the exact hue+primitive station 3 (spiral galaxy) uses as its own
    // headline (lens@276) — the anchor's visible window (stations 1-5,
    // which includes station 3) rendered a second, indistinguishable
    // spiral galaxy at 760px vs the headline's <=576-880px (1.3x apart) —
    // a duplicate, not an anchor (spec §6.2/§7.6 violation). No station
    // uses `lens` at 214 — checked against every entry in
    // midnightGalaxy.ring.js's stations list, not just this anchor's
    // visible window.
    {
      const ar = rng(0, 0xA4C7)
      const AW = 760, AH = Math.round(AW * 0.62)
      const anchorHue = world.hueAnchors[1].deg
      const anchor = dom.makePrim('lens', AW, AH, anchorHue, 0.34, ar)
      anchor.style.left = px(period * 0.42 - AW / 2)
      anchor.style.top = px(dom.bandY(ar, AH))
      host.appendChild(anchor)
    }

    // one trackable drifter (spec §7.7): the only element in this world
    // carrying its own continuous transform, so the up-to-75s gap between
    // turns isn't a freeze-frame with only twinkle for company. The
    // transform lives on THIS element (.ring-drift's own CSS animation,
    // see ringCss) nested INSIDE far's already-transformed .ring-surge —
    // never a second transform on the layer itself. A rail-style layer
    // transform was deliberately deleted earlier this session for causing
    // visible pops at turn boundaries; this can't reintroduce that bug
    // class because .ring-surge's own transform is never touched here.
    // 3600px/480s = 7.5px/s (was 1800px/480s = 3.75px/s — technically
    // above the 2.7px/s floor but too subtle to notice unprompted;
    // doubling the travel at the same duration clears the floor with real
    // margin), crossing time = 3600/7.5 = 480s = 8min, unchanged and still
    // inside the 4-12min band; linear+alternate so it reverses cleanly at
    // each end instead of snapping back to the start. Size bumped 9->14px
    // and given a warmer color + a bigger/stronger glow than any star can
    // reach (far-layer stars top out at size 8 with box-shadow blur
    // 17.6px/spread 2.4px — see ringPrimitives.js's .drift, blur
    // 32px/spread 10px) so it reads as an object, not one more star.
    {
      const dr = rng(0, 0xD817)
      const drift = dom.el('drift')
      const ds = 14
      drift.style.width = drift.style.height = px(ds)
      drift.style.left = px(period * 0.12)
      drift.style.top = px(dom.bandY(dr, ds))
      host.appendChild(drift)
    }
  }

  else if (L.id === 'mid') {
    /* THE COMPOSITION LAYER. mid moves exactly one frame per turn, so
       station i is authored into the frame at x = i*W and lands there
       every single time. */

    /* third star layer (spec §5: >=3 star layers, surge distances
       differing per §0's ratio) — see concepts/world-07-ring.html's
       identical comment for the reasoning: mid's surge (1920) already
       sits between far (480) and near (2880) in the engine's 1:4:6
       ratio family, so reusing it needs no new surge value.
       sizeMul 1.25 (not far's 1.0): far:mid:near size ramps 1.0:1.25:1.5
       against the 1:4:6 speed ramp, so depth reads from a static frame
       too, not just from differential motion. */
    dom.buildStars(host, period, 40, 1.25, 0xCAFE1)

    for (let i = 0; i < engine.PANES; i++) {
      const st = world.stations[i]
      const r = rng(i, 0x5EED)
      const lou = loudnessOf(arc, i)
      const x0 = i * engine.W

      // headline form — 576-880px longest edge, full tier range regardless
      // of loudness (was lerp(576,880, lou*0.75+r()*0.25) — quiet stations
      // got stuck near the 576 floor, loud ones near 880, so a quiet
      // station read as a small/sparse frame instead of "large and dim."
      // Loudness now speaks through alpha/detail-count only, below.
      const hw = lerp(576, 880, r())
      const hh = st.prim === 'streak' ? hw * 0.30
        : st.prim === 'ribbon' ? hw * 0.34
          : hw * (0.62 + r() * 0.26)
      const alpha = lerp(0.34, 0.55, lou)
      const head = dom.makePrim(st.prim, hw, hh, st.hue, alpha, r)
      // was lerp(0.06, 0.44, r()) — capped well below the frame's full
      // width, so a centroid can never land right of ~x900. Measured mean
      // centroid x = 692 against a frame center of 960 (spec §2, appendix
      // #2). Draw range must span >=0.90 of available width; measured
      // against the reference build's real render (same seed/content),
      // [0.08, 0.98] lands mean centroid x at 920 (within the 960±96
      // gate) — [0.02, 0.92] alone undershot to 848, just outside the
      // band, so this was iterated per §2's gate, not shipped on the first
      // guess.
      const pairUpper = r() < 0.5 // shared band draw — see bandY's forceUpper comment (spec §7.5)
      const headLeft = x0 + lerp(0.08, 0.98, r()) * (engine.W - hw)
      const headTop = dom.bandY(r, hh, pairUpper)
      head.style.left = px(headLeft)
      head.style.top = px(headTop)
      host.appendChild(head)
      const headCx = headLeft + hw / 2, headCy = headTop + hh / 2

      // one feature-tier companion — this IS the station's declared pair
      // (spec §7.5): two elements linked by proximity plus a shared visual
      // property, not two independent random placements (a collage, not a
      // pair). Proximity is forced by construction: same vertical band as
      // the headline (pairUpper — independent draws could land ~470px
      // apart, the full gap between bands) plus a bounded offset from its
      // own centroid, not a fresh frame-wide draw. Shared property: hue
      // echo within ±18° for non-accent stations (inside the spec's 20°
      // budget); accent stations intentionally push the companion hue
      // ~168° away (the world's one complementary-accent mechanic), so hue
      // can't carry the pair there — the connecting bridge below does,
      // drawn for every station regardless of hue.
      const others = ['blob', 'dots', 'lens', 'streak'].filter(k => k !== st.prim)
      const ck = others[Math.floor(r() * others.length)]
      const cw = lerp(230, 420, r())
      const ch = ck === 'streak' ? cw * 0.30 : cw * (0.60 + r() * 0.28)
      const compHue = st.hue + (st.accent ? 168 : lerp(-18, 18, r()))
      const comp = dom.makePrim(ck, cw, ch, compHue, lerp(0.30, 0.48, lou) * 0.8, r)
      const pairAng = r() * Math.PI * 2, pairRad = lerp(160, 380, r())
      let compCx = headCx + Math.cos(pairAng) * pairRad
      compCx = Math.min(x0 + engine.W - cw / 2, Math.max(x0 + cw / 2, compCx))
      const compTop = dom.bandY(r, ch, pairUpper)
      comp.style.left = px(compCx - cw / 2)
      comp.style.top = px(compTop)
      host.appendChild(comp)
      const compCy = compTop + ch / 2

      const bdx = compCx - headCx, bdy = compCy - headCy
      const bridge = dom.el('pair-bridge')
      bridge.style.left = px(headCx); bridge.style.top = px(headCy)
      bridge.style.width = px(Math.hypot(bdx, bdy))
      bridge.style.transform = `rotate(${(Math.atan2(bdy, bdx) * 180 / Math.PI).toFixed(1)}deg)`
      // was alpha 0.16→0.10, height 3px (ringPrimitives.js) — dimmer/
      // thinner than the faintest star, so on accent stations (hue delta
      // ~168°, this bridge is the ONLY declared-pair signal, spec §7.5)
      // the pair read as unconnected. Bumped to 0.34→0.18 + 5px height,
      // checked against a real render on an accent station.
      bridge.style.background = `linear-gradient(90deg, ${hsla(st.hue, 40, 70, 0.34)} 0%, ${hsla(st.hue, 40, 70, 0.18)} 100%)`
      host.appendChild(bridge)

      // detail-tier specks, count follows loudness. k===0 is forced toward
      // the tier floor (spec §7.3 scale ladder): the worst-case headline
      // (576px) divided by a detail element that happened to draw near the
      // old ceiling (154px) measured at 3.7x — under the required >=6x.
      // Forcing one detail element per station into [58,70] guarantees
      // 576/70 = 8.2x even in the worst-case headline draw; the ladder no
      // longer depends on two independent random draws going its way.
      const dn = Math.round(lerp(1, 4, lou))
      for (let k = 0; k < dn; k++) {
        const dw = k === 0 ? lerp(58, 70, r()) : lerp(58, 154, r())
        const d = dom.makePrim('dots', dw, dw * 0.9, st.hue, lerp(0.34, 0.60, lou) * 0.7, r)
        d.style.left = px(x0 + r() * (engine.W - dw))
        d.style.top = px(dom.bandY(r, dw * 0.9))
        host.appendChild(d)
      }

      // occlusion (spec §7.2), measured by ablation, on every third
      // station (4 of 12 — the required >=1-in-3 floor). Every primitive
      // above is a translucent glow that only alpha-blends with what's
      // behind it; this is a genuinely dark, rimmed disc (makeOccluder,
      // reusing the b-lobe rim's partial-border contrast treatment) placed
      // to dim REAL star content behind it — far/mid/near's own real
      // `.star` elements from buildStars, never synthetic ones injected
      // just for the measurement. (An earlier version spawned 6 fake
      // `.occ-star` dots inside the occluder's own box so the ablation
      // test always had something to find — they were never visible in the
      // real render, always covered, and sat on the occluder's own plane
      // with no real parallax relationship to it. That made the ablation
      // number pass without proving anything about actual content.) Sized
      // up from the original 150-210px band to 260-340px — large enough
      // that real star density (measured ~214 visible stars/frame across
      // far+mid+near, concepts/tools/ring-verify.mjs check #10) reliably
      // puts several real stars under the footprint instead of leaving it
      // to chance at the smaller size; see concepts/tools/
      // ring-occlusion-ablation.mjs for the actual measured before/after
      // luminance ratios per station.
      if (i % 3 === 0) {
        const orr = rng(i, 0x0CC1)
        const os = lerp(260, 340, orr())
        const ox = x0 + orr() * (engine.W - os)
        const oy = dom.bandY(orr, os)
        const occ = dom.makeOccluder(os, st.hue)
        occ.style.left = px(ox)
        occ.style.top = px(oy)
        host.appendChild(occ)
      }
    }
  }

  else if (L.id === 'near') {
    /* fast and anonymous — the layer that sells the turn */
    dom.buildStars(host, period, 26, 1.5, 0xBEEF)
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
    const sky = dom.el('lyr')
    const skyInner = dom.el('surge')
    skyInner.style.transition = 'none'
    skyInner.appendChild(dom.el('void'))
    sky.appendChild(skyInner)
    design.appendChild(sky)

    const surgeEls = {}
    for (const L of ENGINE.LAYERS) {
      if (L.id === 'sky') continue
      const cyl = cylinderOf(ENGINE, L)
      const period = authorPeriodOf(ENGINE, L)
      const lyr = dom.el('lyr')
      const surge = dom.el('surge')
      surge.style.width = px(cyl + ENGINE.W)
      lyr.appendChild(surge)
      design.appendChild(lyr)

      // author one period, then repeat it m+1 times. The extra copy covers
      // the window that hangs past the cylinder just before it wraps.
      const proto = dom.el(''); proto.style.position = 'absolute'; proto.style.inset = '0'
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
