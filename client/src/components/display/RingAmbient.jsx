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
// question TEXT rendering (qLayer/qText/renderQ/showQ/hideQ/fitPx/wrapLines/
// fits — Trivia OS already has its own question-rendering system elsewhere,
// which composites on top of this component), and the reference build's own
// demo-page chrome (.notes/.ctl/header/.sub/status line, the safe-box
// `.guides` overlay, `.vig` vignette and `.grain` texture — none of these
// appear in the task's explicit "CSS you'll need" class list).
//
// The shooting-star system (spawnShoot/shootLoop/.shootLane) WAS listed
// here as out of scope too, with no reason given (unlike the two items
// above, which have real ones) — ported in 2026-08-12 once Ben asked to
// "lean more into" it; see the build effect below.
//
// The SCRIM (qScrim/layoutScrim in the reference build) is IN scope, unlike
// the rest of the question system: spec §2 requires it under any text this
// safe box carries, RingAmbient shipping without it is a real legibility
// regression (station 0 measured p99.5 99 against a 72 cap — bright content
// with nothing dimming it), and its geometry/alpha don't depend on knowing
// anything about the app's actual question text or its show/hide timing —
// only on the current station. See layoutScrim() below.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { cylinderOf, authorPeriodOf, buildArc, loudnessOf, fillOf, rng, lerp } from '../../lib/ringEngine.js'
import { EASE_SURGE } from '../../lib/easings.js'
import { ringDom, px, hsla, ringCss } from '../../lib/ringPrimitives.js'

// ENGINE — engine-fixed, identical for every world; never a prop (a world
// never sets any of this, same as the reference build's own ENGINE const).
// SAFE is included (absent from the reference's WORLD-facing exports but
// present in its own ENGINE object) because bandY() needs it to keep solid
// forms out of the safe box. Q/DWELL_MS are still omitted — they belong to
// the out-of-scope question system. SHOOT_MS is now included (2026-08-12,
// Ben: "lean more into shooting star concept" — that system is no longer
// out of scope here, see the shooting-star block in the build effect below).
const ENGINE = {
  W: 1920, H: 1080,
  PANES: 12,
  SURGE_MS: 1700,
  SAFE: { x: 0.20, y: 0.28, w: 0.60, h: 0.44 },
  SHOOT_MS: [12000, 35000],
  LAYERS: [
    { id: 'sky',  surge: 0,    m: 1 },
    { id: 'far',  surge: 480,  m: 1 },
    { id: 'mid',  surge: 1920, m: 1 },
    { id: 'near', surge: 2880, m: 3 },
  ],
  // B2-luminance.md sec 2.1/5.3: {18,52} was frame-mean luma outside what the
  // spec's own alpha/placement caps can physically reach (ceiling ~28-30 at
  // legal peak alpha) — unreachable at any ink level the spec permits, and
  // pre-fillOf() the value never reached a pixel anyway (proved: scaling it
  // 10x rendered byte-identical frames). ref/fillMin/fillMax feed fillOf()
  // below, the channel that DOES reach a pixel.
  ARC: { lo: 10, hi: 31, exp: 1.6, ref: 31, fillMin: 0.35, fillMax: 1.00 },
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
// isn't part of the ring-verify.mjs contract (only #design, .ring-void,
// .ring-star, .ring-surge, window.__world are — see the mount effect below
// for this component's own window.__world exposure), "stage" is generic
// enough to risk
// colliding with unrelated app CSS, and the easing here comes from this
// app's own client/src/lib/easings.js rather than the reference build's
// hardcoded curve. The reduced-motion query stays local too, but now
// includes `.ring-shoot` (2026-08-12 — that system is no longer out of
// scope, see the shooting-star block in the build effect below); still
// excludes the `.stage.rm` manual-toggle branch, dev-harness-only UI (a
// checkbox to force reduced-motion for testing) that neither build needs
// at runtime. ──
// .ring-scrim: full-frame geometry (left/top/width/height) is fixed once at
// build time (ART-DIRECTION-SPEC.md sec 2 — see the build effect below for
// why full-frame, not a fitted box); only the alpha-bearing background is
// per-station (see layoutScrim below). position:absolute only — no CSS
// transition, this component owns no question-visibility state to animate
// against.
const RING_CSS = `
${ringCss('ring-')}
.ring-stage.go .ring-surge{transition:transform var(--surge-ms) cubic-bezier(${EASE_SURGE.join(',')})}
.ring-scrim{position:absolute;pointer-events:none}

@media (prefers-reduced-motion:reduce){
  .ring-surge{transition:none!important}
  .ring-star,.ring-pf,.ring-pf-breathe,.ring-shoot{animation-play-state:paused!important}
  .ring-drift{animation-play-state:paused!important}
  .ring-rock-spin{animation-play-state:paused!important}
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
      const st = world.stations[(i * 2) % engine.PANES]
      // 2026-08-12: synced from world-07-ring.html — opt-out flag (st10,
      // Ben: "not needed here" / "idk what the cloud is"), same pattern as
      // `ring`/`accent`/`cornerLeft`. Skipped before the rng draw, costs
      // nothing, touches no other iteration's stream.
      if (st.noWash) continue
      const r = rng(i, 0xFA2)
      const lou = loudnessOf(arc, (i * 2) % engine.PANES)
      const fill = fillOf(engine, arc, (i * 2) % engine.PANES) * 0.62 // pushed back behind mid (B2 sec 1.3/2.2: far out-shouted mid on 7/12 stations)
      const w = lerp(620, 900, r()), h = w * (0.52 + r() * 0.22)
      const f = dom.makePrim('blob', w, h, st.hue, lerp(0.16, 0.30, lou), r, false, fill)
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
      // 2026-08-11: alpha 0.34 -> 0.15 — see world-07-ring.html's identical
      // comment (same fix, both builds).
      const anchor = dom.makePrim('lens', AW, AH, anchorHue, 0.15, ar, false, 1) // layer-level anchor, not tied to any one station's loudness -> explicit fill=1, not a dropped param
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

    // occlusion eligibility (2026-08-09, spec §7.2 amendment): a subtractive
    // element (occluder) paired with an already-quiet station is the worst
    // combination available — st6 carried both the arc's own local trough
    // AND a large dark occluder, and rendered/judged as an empty or broken
    // pane, not a deliberately quiet one (this is about presence, which is
    // never the arc's job; the arc only ever says how bright). Bottom third
    // BY LOUDNESS RANK (not by absolute arc value, which would vary in
    // count seed-to-seed on a peaked, non-uniform arc) is excluded from
    // occlusion; the remaining loud two-thirds keep the >=1-in-3 floor
    // (spec §7.2) via alternating rank instead of the old i%3 cadence,
    // which never looked at loudness at all.
    const byLoudnessDesc = [...Array(engine.PANES).keys()].sort((a, b) => arc[b] - arc[a])
    const occlusionEligible = byLoudnessDesc.slice(0, engine.PANES - Math.floor(engine.PANES / 3))
    const occluderStations = new Set(occlusionEligible.filter((_, k) => k % 2 === 0))

    for (let i = 0; i < engine.PANES; i++) {
      const st = world.stations[i]
      // Each property below draws from its OWN seeded stream, keyed by
      // station index + a distinct per-property constant — not one shared
      // stream read sequentially. See concepts/world-07-ring.html's
      // identical comment for why (2026-08-08: a bandY fix reshuffled 4 of
      // 12 stations' companion kind/hue as a pure side effect of consuming
      // a different number of r() calls upstream, with no logical
      // connection between the two — separate streams make that class of
      // bug structurally impossible).
      const rHeadline = rng(i, 0x5EED1)
      const rPairBand = rng(i, 0x5EED2) // only the shared upper/lower coin-flip (spec §7.5 — this one draw IS intentionally shared)
      const rCompanion = rng(i, 0x5EED3)
      const rDetail = rng(i, 0x5EED4)
      const lou = loudnessOf(arc, i)
      const fill = fillOf(engine, arc, i)
      const x0 = i * engine.W

      // headline form — 576-880px longest edge, full tier range regardless
      // of loudness (was lerp(576,880, lou*0.75+r()*0.25) — quiet stations
      // got stuck near the 576 floor, loud ones near 880, so a quiet
      // station read as a small/sparse frame instead of "large and dim."
      // Loudness now speaks through alpha/detail-count only, below.
      // 2026-08-12: synced from world-07-ring.html — pulsar shrunk 0.78x
      // (Ben: "can be smaller"). See that file's comment for why scaling
      // the whole box shrinks the object proportionally in one change.
      const hw = lerp(576, 880, rHeadline()) * (st.prim === 'pulsar' ? 0.78 : 1)
      const hh = st.prim === 'streak' ? hw * 0.30
        : st.prim === 'ribbon' ? hw * 0.34
          : hw * (0.62 + rHeadline() * 0.26)
      const alpha = lerp(0.34, 0.55, lou)
      const head = dom.makePrim(st.prim, hw, hh, st.hue, alpha, rHeadline, true, fill) // isHeadline: only per-station breathe (spec §8)
      // 2026-08-12: synced from world-07-ring.html — this file was still on
      // the pre-corner-bias uniform draw ([0.08,0.98] of remaining travel
      // room, the very formula that measured mean centroid x=920 but still
      // read as "top-center, not a corner" per Ben's st0 complaint on the
      // OTHER build). Now shares ringPrimitives.js's `cornerX` — a fixed
      // pixel margin from the frame edge instead of a fraction of
      // remaining space, so the corner-push effect doesn't dilute for wide
      // headlines. See that function's own comment for the full history.
      // 2026-08-12: synced from world-07-ring.html — optional per-station
      // `bandUpper` override (st11, Ben: "move to bottom right"), same
      // pattern as `cornerLeft`. Draw still always happens.
      const pairBandDraw = rPairBand() < 0.5
      const pairUpper = st.bandUpper !== undefined ? st.bandUpper : pairBandDraw // shared band draw — see bandY's forceUpper comment (spec §7.5)
      // Corner choice drawn explicitly (not inside cornerX) so the
      // occluder below can read it and place itself at the opposite corner.
      // 2026-08-12: synced from world-07-ring.html — optional per-station
      // `cornerLeft` override (st6, Ben: "needs to be on other bottom
      // corner"), same pattern as the existing `ring`/`accent` flags. The
      // draw still always happens so this station's rHeadline stream
      // count is identical whether or not it's overridden.
      const cornerDraw = rHeadline() < 0.5
      const headlineCornerLeft = st.cornerLeft !== undefined ? st.cornerLeft : cornerDraw
      const headLeft = dom.cornerX(rHeadline, hw, x0, headlineCornerLeft)
      const headTop = dom.bandY(rHeadline, hh, pairUpper, dom.rotatedBandH(st.prim, hw, hh))
      head.style.left = px(headLeft)
      head.style.top = px(headTop)
      host.appendChild(head)
      const headCx = headLeft + hw / 2, headCy = headTop + hh / 2

      // Any station with `ring:true` in its data — see world-07-ring.html's
      // identical comment (same fix, both builds, /simplify's station-data-
      // flag generalization) and makeNebulaRing's own comment in
      // ringPrimitives.js.
      // 2026-08-12: synced from world-07-ring.html — uniform 1.30x scale
      // centered exactly on the blob's own core reads as an eyeball (Ben:
      // "woah, what is that???? not a fan"). Uneven axis scale + an offset
      // off-center breaks the concentric iris/pupil read.
      if (st.ring) {
        const nrW = hw * 1.55, nrH = hh * 0.95
        const nring = dom.makeNebulaRing(nrW, nrH, st.hue, fill)
        nring.style.left = px(headCx - nrW / 2 + hw * 0.16)
        nring.style.top = px(headCy - nrH / 2 - hh * 0.10)
        host.appendChild(nring)
      }

      // one feature-tier companion — this IS the station's declared pair
      // (spec §7.5): two elements linked by a shared visual property, not
      // two independent random placements (a collage, not a pair). Shared
      // property: hue echo within ±18° for non-accent stations (inside the
      // spec's 20° budget); accent stations intentionally push the
      // companion hue ~168° away (the world's one complementary-accent
      // mechanic), so hue can't carry the pair there — the connecting
      // bridge does, drawn for accent stations regardless of hue.
      // 2026-08-12: synced from world-07-ring.html — this file was still on
      // the old proximity-orbit placement (pairAng/pairRad around the
      // headline's own centroid), never ported the st1/st3 clearance fix
      // either. Superseded entirely: Ben, fresh review, generalizing st0's
      // specific complaint — "two items squished together in the same
      // corner is no bueno — ie a spiral not by a planet." Once headlines
      // are corner-anchored, keeping the companion close means jamming two
      // objects into the same corner. The pairing signal (hue-echo/bridge)
      // never depended on physical closeness, so companion now takes the
      // OPPOSITE corner from its headline — same treatment as the
      // occluder below.
      const others = ['blob', 'dots', 'lens', 'streak'].filter(k => k !== st.prim)
      const ck = others[Math.floor(rCompanion() * others.length)]
      const cw = lerp(230, 420, rCompanion())
      const ch = ck === 'streak' ? cw * 0.30 : cw * (0.60 + rCompanion() * 0.28)
      const compHue = st.hue + (st.accent ? 168 : lerp(-18, 18, rCompanion()))
      const comp = dom.makePrim(ck, cw, ch, compHue, lerp(0.30, 0.48, lou) * 0.8, rCompanion, false, fill)
      const compLeft = dom.cornerX(rCompanion, cw, x0, !headlineCornerLeft)
      const compTop = dom.bandY(rCompanion, ch, !pairUpper, dom.rotatedBandH(ck, cw, ch))
      comp.style.left = px(compLeft)
      comp.style.top = px(compTop)
      host.appendChild(comp)
      const compCx = compLeft + cw / 2, compCy = compTop + ch / 2

      const bdx = compCx - headCx, bdy = compCy - headCy
      // 2026-08-12: synced from world-07-ring.html (was lagging — see that
      // file's fuller history comment). Two ports in one pass, both driven
      // by the same fresh bbox-verified review: (1) alpha dialed back
      // 0.34/0.18 -> 0.18/0.07 (commit 6eefbb6, "cross-cutting stray line"
      // — height was already shared/unified via ringCss, only this inline
      // gradient had drifted); (2) scoped to `st.accent` on top of the
      // existing elongated-kind skip — st4/st8/st9 (all non-accent) still
      // read as a stray line even at the reduced alpha, because non-accent
      // stations already carry a hue-echo pairing signal (compHue above)
      // and the bridge there was pure redundant clutter, not under-dialed.
      // Accent stations push companion hue ~168° away specifically so hue
      // can't carry the signal — bridge stays the sole §7.5 cue there.
      if (st.accent && !dom.isElongatedKind(st.prim)) {
        const bridge = dom.el('pair-bridge')
        bridge.style.left = px(headCx); bridge.style.top = px(headCy)
        bridge.style.width = px(Math.hypot(bdx, bdy))
        bridge.style.transform = `rotate(${(Math.atan2(bdy, bdx) * 180 / Math.PI).toFixed(1)}deg)`
        bridge.style.background = `linear-gradient(90deg, ${hsla(st.hue, 40, 70, 0.18)} 0%, ${hsla(st.hue, 40, 70, 0.07)} 100%)`
        host.appendChild(bridge)
      }

      // detail-tier specks, count follows loudness. k===0 is forced toward
      // the tier floor (spec §7.3 scale ladder): the worst-case headline
      // (576px) divided by a detail element that happened to draw near the
      // old ceiling (154px) measured at 3.7x — under the required >=6x.
      // Forcing one detail element per station into [58,70] guarantees
      // 576/70 = 8.2x even in the worst-case headline draw; the ladder no
      // longer depends on two independent random draws going its way.
      const dn = Math.round(lerp(1, 4, lou))
      for (let k = 0; k < dn; k++) {
        const dw = k === 0 ? lerp(58, 70, rDetail()) : lerp(58, 154, rDetail())
        const d = dom.makePrim('dots', dw, dw * 0.9, st.hue, lerp(0.34, 0.60, lou) * 0.7, rDetail, false, fill)
        d.style.left = px(x0 + rDetail() * (engine.W - dw))
        d.style.top = px(dom.bandY(rDetail, dw * 0.9))
        host.appendChild(d)
      }

      // occlusion (spec §7.2), measured by ablation, on the loud two-thirds
      // only (occluderStations, computed above — 4 of 12, the required
      // >=1-in-3 floor). Every primitive
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
      if (occluderStations.has(i)) {
        const orr = rng(i, 0x0CC1)
        // 2026-08-11 object-fix round: shrunk from 260-340px/loudness-driven
        // fill to 100-140px/fixed 0.30 — see world-07-ring.html's identical
        // comment (same fix, both builds).
        // 2026-08-12: nudged again, size 100-140 -> 150-190 / fill 0.30 ->
        // 0.40 (still fixed, not loudness-driven) — see world-07-ring.html's
        // identical comment (same fix, both builds, "doesn't look like
        // anything" on the moon, not the headline body).
        const os = lerp(150, 190, orr())
        // 2026-08-12: was a uniform draw across the whole frame width —
        // see world-07-ring.html's identical comment (same fix, both
        // builds; bbox-verified against Ben's fresh review at st2/st10).
        // Second pass: the companion just moved to the diagonal-opposite
        // corner too (see its own comment above) — occluder now takes the
        // THIRD corner (same horizontal side as the headline, opposite
        // vertical band) so all three objects land in distinct corners.
        const ox = dom.cornerX(orr, os, x0, headlineCornerLeft)
        const oy = dom.bandY(orr, os, !pairUpper)
        const occ = dom.makeOccluder(os, st.hue, 0.40)
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
  const scrimElRef = useRef(null)
  const arcRef = useRef(null)
  const offsetRef = useRef({})
  const stationRef = useRef(0)
  const busyRef = useRef(false)
  const queuedTurnsRef = useRef(0)
  const turnTimerRef = useRef(null)
  const shootLaneRef = useRef(null)
  const shootSideRef = useRef(1)
  const shootTimerRef = useRef(null)

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
    arcRef.current = arc

    // shooting-star lane — 2026-08-12, ported from world-07-ring.html (Ben:
    // "lean more into shooting star concept"). Appended before the scrim
    // below, same relative order as the reference build's own
    // `design.insertBefore(shootLane, qScrim)` — the scrim still dims
    // shoots the same as every other ring layer.
    const shootLane = dom.el('shootLane')
    design.appendChild(shootLane)
    shootLaneRef.current = shootLane

    // scrim (ART-DIRECTION-SPEC.md sec 2: "alpha must reach exactly zero
    // strictly inside its own element bounds, on every axis"). Appended
    // last, so it paints above every ring content layer (matches
    // world-07-ring.html's own insertBefore(layer, qScrim) ordering — every
    // layer lands before the scrim in DOM order, this component just gets
    // there by being last to append instead). FULL FRAME, no fitted box —
    // a 2026-08-08 fitted box (-14% inset, y230-850, ~4:1 aspect) clipped
    // the ellipse's own falloff at the box edge before it reached
    // transparent (confirmed by rendering it: a hard horizontal seam,
    // exactly the "dead stripe" the old elliptical-never-a-band rule meant
    // to prevent). A full 1920x1080 element has no boundary inside the
    // frame to expose — its boundary IS the frame's — so the gradient
    // below just needs to fade out before ITS edges, not some inner box's.
    const scrim = dom.el('scrim')
    scrim.style.left = '0'
    scrim.style.top = '0'
    scrim.style.width = px(ENGINE.W)
    scrim.style.height = px(ENGINE.H)
    design.appendChild(scrim)
    scrimElRef.current = scrim
    layoutScrim(stationRef.current)

    stage.style.setProperty('--surge-ms', ENGINE.SURGE_MS + 'ms')
    worldData.sky.forEach((c, i) => stage.style.setProperty('--sky-' + (i + 1), c))

    writeOffsets()
    shootLoop()

    // Exposed for concepts/tools/ring-verify.mjs's live-route pass — mirrors the
    // reference build's own window.__world contract (concepts/world-07-ring.html,
    // bottom of its <script>) so the gate can drive/measure the component that
    // actually ships instead of only the standalone HTML file. turn/jumpTo are
    // function declarations elsewhere in this component body (hoisted, so they
    // exist by the time this effect runs); station/offset stay live getters so the
    // gate always reads current state, not a snapshot from mount time.
    // cylinderOf/authorPeriodOf are re-curried to the reference build's own
    // single-argument shape (`cylinderOf(L)`, closing over ENGINE) rather than
    // exposed as ringEngine.js's real two-argument `(engine, layer)` signature —
    // the gate calls `w.cylinderOf(L)` identically against both passes, and this
    // is the one place that has to bridge the difference, not the gate.
    window.__world = {
      ENGINE, WORLD: worldData, ARC: arc,
      cylinderOf: (L) => cylinderOf(ENGINE, L),
      authorPeriodOf: (L) => authorPeriodOf(ENGINE, L),
      get station() { return stationRef.current },
      get offset() { return offsetRef.current },
      jumpTo, turn,
    }

    // React 18 StrictMode double-invokes this effect in dev; clear what we
    // built so the second invocation doesn't append a duplicate DOM tree.
    return () => {
      ro.disconnect()
      clearTimeout(shootTimerRef.current)
      design.replaceChildren()
      if (window.__world && window.__world.WORLD === worldData) delete window.__world
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

  // ── SHOOTING STAR ── ported from world-07-ring.html's spawnShoot()/
  // shootLoop() verbatim (2026-08-12, Ben: "lean more into shooting star
  // concept"), adapted to refs instead of module-level `let`s/`window.
  // __shootLane` since this is a React component, not a page script.
  function spawnShoot() {
    if (isReduced()) return
    const lane = shootLaneRef.current
    if (!lane) return
    const rot = dom.el('shootRot'), s = dom.el('shoot'), d = shootSideRef.current
    shootSideRef.current = -d
    if (d < 0) s.classList.add('rev') // see ringCss's own .shoot.rev comment — keeps the bright head leading
    rot.style.left = px(d > 0 ? 140 + Math.random() * 500 : 1180 + Math.random() * 500)
    rot.style.top = px(70 + Math.random() * 760)
    rot.style.setProperty('--sa', (d > 0 ? 1 : -1) * (14 + Math.random() * 16) + 'deg')
    s.style.setProperty('--sd2', px((d > 0 ? 1 : -1) * (640 + Math.random() * 380)))
    s.style.setProperty('--sdu', (1.5 + Math.random() * 1.2) + 's')
    rot.appendChild(s); lane.appendChild(rot)
    s.addEventListener('animationend', () => rot.remove())
  }
  function shootLoop() {
    clearTimeout(shootTimerRef.current)
    const [a, b] = ENGINE.SHOOT_MS
    shootTimerRef.current = setTimeout(() => { spawnShoot(); shootLoop() }, a + Math.random() * (b - a))
  }

  // scrim alpha only — geometry is fixed at mount (full frame, see the
  // build effect). Alpha formula mirrors world-07-ring.html's layoutScrim()
  // exactly: scale-free via loudnessOf(), so it moves with the arc
  // regardless of what ENGINE.ARC.lo/hi are.
  //
  // Ellipse 70%/62% of a 1920x1080 box: radii 1344x670px from centre.
  // Tuned empirically in two rounds against gates pulling opposite ways —
  // not derived from one formula, and not stable at either round-1 value:
  //   - rx (70%, unchanged since round 1) and the transparent stop (74%,
  //     994px) hold the frame-edge boundary-alpha check (must reach zero
  //     strictly inside the element's own 1920x1080 bounds — verified live,
  //     diff 0.9-1.0) while getting the safe box's own corner pixels
  //     (which sit past the 45% stop) into the gradient's reach at all.
  //   - ry alone (round 1: 50%, ry=540) got the OLD cap (p99.5<=72) to
  //     EXACTLY 72/72 — zero headroom, which is what the cap's own
  //     2026-08-09 retarget (<=68, WARN inside 4pts) exists to catch. 50%
  //     couldn't be pushed further without more room: it already equalled
  //     the frame's own half-height. Growing to 62% (670px, 130px past the
  //     frame's own 540px half-height on that axis) needs no compensating
  //     change to the transparent stop — the STOP is a fraction of ry too,
  //     so growing ry alone deepens near-safe-box coverage without moving
  //     where the vertical falloff completes in absolute pixels enough to
  //     threaten that axis's own edge (still verified live, not assumed).
  //     Round 2 measured: st0 p99.5 72 -> 62, six points of real margin
  //     under the new 68 cap, same bandY-style zero-headroom caveat this
  //     project has been burned by before — don't let a future change eat
  //     it back to zero without re-measuring.
  function layoutScrim(station) {
    const scrim = scrimElRef.current, arc = arcRef.current
    if (!scrim || !arc) return
    const a = lerp(0.30, 0.68, loudnessOf(arc, station))
    scrim.style.background = `radial-gradient(ellipse 70% 62% at 50% 50%,
      rgba(2,2,10,${a.toFixed(2)}) 0%, rgba(2,2,10,${(a * 0.75).toFixed(2)}) 45%,
      transparent 74%)`
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
    dom.clampSafeBoxStarPeaks(designElRef.current) // item 3: re-clamp at rest, new station
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
      layoutScrim(stationRef.current)
      unlock()
      return
    }

    stage.classList.add('go')
    ENGINE.LAYERS.forEach(L => { if (L.id !== 'sky') offset[L.id] += L.surge })
    writeOffsets()
    stationRef.current = (stationRef.current + 1) % ENGINE.PANES
    layoutScrim(stationRef.current)
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
    layoutScrim(stationRef.current)
    dom.clampSafeBoxStarPeaks(designElRef.current) // item 3: re-clamp at rest, new station
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
