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
// inside engine.SAFE, for any element height h, with an 8px margin (see
// ART-DIRECTION-SPEC.md §2: "Never a geometric exclusion zone... Overlap is
// allowed, provided the luminance cap holds" - a full-bbox exclusion is a
// spec violation, not a stricter safety margin).
//
// 2026-08-07 briefly switched this to full-bbox clearance (margin applied to
// the whole box, not h/2) to chase a measured safe-box p99.5 overage on
// stations 0/9. That traded one bug for two spec violations: it directly
// contradicts §2's explicit ban on geometric exclusion zones, and measured
// 2026-08-08 to be the sole cause of a bleed regression (0 -> 7 stations
// "accidentally clipped" >35% by the frame edge - full A/B isolated via a
// throwaway worktree at the pre-change commit). Centroid clearance restored
// the same day - NOT a byte-identical revert: the off-frame bounds
// (minY=-h*0.30 upper / maxY=H-h*0.70 lower) are new, tighter than the
// pre-3304681 values (-h*0.10 / H-h*0.88). Loosening them further reopens
// the accidental-clip defect (see caveat below); tightening them further
// starves the still-unmet vertical-spread/ink floor (spec §2/§1) the
// build already can't hit. This is the balance point measured to clear
// both, not an arbitrary choice. The actual luminance overage came from
// real bright-edge ink on 4 elements sitting close to their own
// primitive's declared edge - occluder's rim border (flush, inset:0),
// blob's rim (traces the rotated lobe cluster's own bbox) and its core
// (small hot-spot + blurred boxShadow - a p99.5 metric's favorite
// target), and ring's border (~90% of its bbox, near-full alpha). Fixed
// each at the source (dimmed alpha) rather than by excluding geometry, so
// overlap into the safe box stays legal and the box itself stops reading
// as a dead stripe. CAVEAT (2026-08-08 review, unresolved): st0 clears the
// p99.5 cap at exactly 72/72 - zero headroom. Any future change that adds
// ink to st0 (the ink-per-station floor is still unmet on 11/12 stations,
// st0 included at the time of writing) will need to re-earn that margin,
// not assume it's still there.
//
// KNOWN GAP (2026-08-08 review, not yet fixed): this clamp sizes off the
// element's STYLED h, not its post-rotation bounding box. `lens`/`streak`/
// `ribbon` rotate the whole element after bandY places it - a large enough
// rotation angle can push the real on-screen extent past the 35%
// accidental-clip line this fix exists to hold, even though the styled h
// clears it. Currently passing by seed luck, not by construction (st3's
// lens measured 33.8% against a computed rotated-AABB worst case of
// 35.3%). Needs the clamp to size off the rotated AABB height, not h,
// before this can be trusted under a different seed or content change.
//
// Reverting which branch (upper/lower) fires per station reshuffles every
// downstream seeded draw for that station (companion kind/hue, pair angle,
// detail specks all pull from the same rng stream after the headline's
// bandY call) - expected, not a bug on its own; diff per-station output
// before/after if chasing an unrelated content-budget regression here.
//
// forceUpper (optional): pins the upper/lower band choice instead of
// drawing it (still consumes one r() call either way - callers that pass
// forceUpper still burn the coin-flip draw upstream so the seeded sequence
// stays stable). Added for §7.5 declared pairs - a headline and its
// companion drawn onto INDEPENDENT random bands can land ~470px apart
// vertically (the full gap between the two bands), which makes "declared
// pair" a lie no bridge/hue-echo can fix. Forcing both onto the same band
// keeps their vertical gap inside one band's own (much smaller) variance
// without weakening the safe-box guarantee - the band itself is still the
// same safe-box-respecting geometry below, just shared by two callers
// instead of drawn twice.
function bandY(engine, r, h, forceUpper) {
  const H = engine.H, top = engine.SAFE.y * H, bot = (engine.SAFE.y + engine.SAFE.h) * H
  const upper = forceUpper !== undefined ? forceUpper : r() < 0.5
  const margin = 8
  if (upper) {
    const maxY = top - margin - h / 2, minY = -h * 0.30
    return maxY <= minY ? maxY : minY + (maxY - minY) * r()
  }
  const minY = bot + margin - h / 2, maxY = H - h * 0.70
  return minY >= maxY ? minY : minY + (maxY - minY) * r()
}

// ═══ PRIMITIVES ═══ the engine renders these; a world picks one and a hue.
// Each guarantees a hard edge structurally, so nothing can turn to mush.
// `el` is a bound element factory (see ringDom below) that already carries
// its consumer's class prefix - every call in this function is just
// el('some-class').
// isHeadline (spec §8: "sub-visible animation is banned as dead weight" —
// every primitive used to breathe at a ~1.18x alpha swing, mostly under the
// 22-luma perceptibility floor the spec bans as render cost nobody can see).
// Only the station's actual headline element (the one call per station built
// from st.prim/st.hue at full 576-880px tier - see buildLayerContent in both
// concepts/world-07-ring.html and RingAmbient.jsx) may breathe; every other
// call (far-wash blob, far-layer anchor, companion, detail-tier dots) passes
// isHeadline=false/omitted and gets a static, non-animated opacity instead -
// cheaper to render and correct per spec, since a swing nobody can see was
// never buying anything. r() is still drawn twice unconditionally for --pb/
// --pd even when unused, so skipping them wouldn't reorder every downstream
// seeded draw in the caller (position/size/hue jitter for elements authored
// after this one in the same station) - only whether the result gets used.
// B2-luminance.md §2.2: the arc's units reach the pixel through `fill`
// (client/src/lib/ringEngine.js's fillOf()), which scales every interior
// gradient stop's alpha AND its painted extent. Extent is the stronger
// lever (measured: 1->2 on extent alone moves a station's frame-mean +93%,
// 1->3 on alpha alone +41%) — a headline box was occupying 20-27% of the
// frame while its own gradient painted 0.9-24% of that box's interior; the
// box was never the problem, the paint inside it was.
// E() scales a gradient's own ending-shape size and terminal stop (how far
// the paint reaches WITHIN the element's box) — never the element's own w/h/
// position. B2's own blob-lobe note is explicit about why: "box is legal;
// the paint grows" — the placement/safe-box/bleed geometry throughout this
// file was independently, expensively tuned (see bandY's history above) and
// stays untouched here.
const ALPHA_GAIN = 2.6
const EXTENT_GAIN = 1.9
const A = (a, fill) => Math.min(1, a * ALPHA_GAIN * fill)
const E = (e, fill) => Math.min(100, e * EXTENT_GAIN * fill)

function makePrim(el, kind, w, h, hue, alpha, r, isHeadline, fill) {
  // required, no default: a silent `fill = 1` here is exactly how the same
  // dropped-parameter bug got shipped 3 separate times (fillOf never wired
  // into the far-anchor call, makePrim itself defaulting fill away when a
  // caller forgot it, makeOccluder's own call sites dropping it entirely) —
  // each one invalidating whatever fill-channel measurement was taken
  // against it without anyone finding out until it was measured directly.
  // Every real call site passes fill explicitly, including layer-level
  // elements not tied to any one station's loudness (those pass 1 on
  // purpose, not by omission — see world-07-ring.html's far-anchor call).
  if (fill === undefined) throw new Error(`makePrim('${kind}'): fill is required (pass 1 explicitly if this element isn't loudness-linked)`)
  const f = el(isHeadline ? 'pf pf-breathe' : 'pf')
  f.style.width = px(w); f.style.height = px(h)
  const pb = (47 + Math.floor(r() * 26)) + 's' // 47-72s, already clears the >=30s floor
  const pd = (-r() * 40).toFixed(1) + 's'
  if (isHeadline) {
    f.style.setProperty('--pa', alpha.toFixed(3))
    f.style.setProperty('--pa2', Math.min(alpha * 1.6, 1).toFixed(3))
    f.style.setProperty('--pb', pb)
    f.style.setProperty('--pd', pd)
  } else {
    f.style.opacity = alpha.toFixed(3)
  }

  if (kind === 'blob') {
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, domRot = 0, domArea = -1
    for (let i = 0; i < 3; i++) {
      const L = el('b-lobe')
      const lw = w * (0.62 + r() * 0.38), lh = h * (0.55 + r() * 0.45)
      const lx = (w - lw) * r(), ly = (h - lh) * r()
      L.style.left = px(lx); L.style.top = px(ly)
      L.style.width = px(lw); L.style.height = px(lh)
      L.style.background = `radial-gradient(ellipse ${E(56, fill).toFixed(0)}% ${E(44, fill).toFixed(0)}% at ${40 + r() * 20}% 50%,
        ${hsla(hue, 72, 62, A(0.42, fill))} 0%, ${hsla(hue - 8, 64, 46, A(0.20, fill))} 40%,
        ${hsla(hue - 14, 56, 30, A(0.07, fill))} 66%, transparent ${E(82, fill).toFixed(0)}%)`
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
    core.style.background = `radial-gradient(circle, ${hsla(hue, 30, 96, A(0.70, fill))} 0%, ${hsla(hue, 70, 80, A(0.35, fill))} 55%, transparent 100%)`
    core.style.boxShadow = `0 0 ${px(cs * 2.4)} ${px(cs * 0.8)} ${hsla(hue, 84, 78, A(0.22, fill))}`
    f.appendChild(core)
    // rim: traces the ACTUAL lobe cluster's bounding box, inset to the
    // gradient's own visible radii (56%/44%, matching each lobe's own
    // `ellipse 56% 44%` gradient above), rotated with the dominant lobe.
    const rim = el('b-rim')
    const rw = (bx1 - bx0) * 0.56, rh = (by1 - by0) * 0.44
    const rcx = (bx0 + bx1) / 2, rcy = (by0 + by1) / 2
    rim.style.left = px(rcx - rw / 2); rim.style.top = px(rcy - rh / 2)
    rim.style.width = px(rw); rim.style.height = px(rh)
    rim.style.setProperty('--rim', hsla(hue + 6, 90, 82, 0.55))
    rim.style.transform = `rotate(${domRot.toFixed(0)}deg)`
    f.appendChild(rim)
  }

  else if (kind === 'dots') {
    const g = el('d-glow')
    g.style.background = `radial-gradient(circle closest-side,
      ${hsla(hue, 58, 66, A(0.16, fill))} 0%, ${hsla(hue, 50, 52, A(0.06, fill))} 48%, transparent ${E(76, fill).toFixed(0)}%)`
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
      ${hsla(hue, 80, 74, A(0.34, fill))} 0%, ${hsla(hue - 10, 70, 58, A(0.16, fill))} 26%,
      ${hsla(hue - 30, 60, 44, A(0.08, fill))} 52%, transparent ${E(76, fill).toFixed(0)}%)`
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
    c.style.boxShadow = `0 0 ${px(cs * 2.4)} ${px(cs * 0.8)} ${hsla(hue, 84, 74, A(0.55, fill))}`
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
    d.style.background = `radial-gradient(ellipse ${E(62, fill).toFixed(0)}% ${E(62, fill).toFixed(0)}% at 50% 50%,
      ${hsla(hue, 40, 44, A(0.16, fill))} 0%, ${hsla(hue, 36, 32, A(0.08, fill))} 50%, transparent ${E(80, fill).toFixed(0)}%)`
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
    // touching-but-distinct band: consecutive lobes' centre-distance /
    // mean-diameter must land in ~0.7-1.05 (spec §6.2 silhouette test) -
    // measured, overlapping enough to read as one continuous curved band,
    // separated enough to still be individual lobes. Sizing lobes off a
    // formula unrelated to how far apart they actually land (the prior
    // approach: radius from a t^0.9 falloff, diameter from an independent
    // linear taper) put NO radius band in range - inner lobes clumped
    // (ratio 0.32-0.5, tangential spacing tiny relative to their own size)
    // while outer lobes gapped (ratio 0.9-1.5, tangential spacing (r*dTheta)
    // grows with radius while the independent taper kept shrinking
    // diameter). Fix: compute lobe POSITIONS first, then derive each
    // lobe's diameter from its actual neighbouring gap distances / a target
    // ratio - the size follows the geometry instead of fighting it.
    // Verified over 30 seed x aspect-ratio combinations (see PR notes):
    // ratio band [0.71, 0.97], inside 0.7-1.05 throughout.
    const ARM_TARGET_RATIO = 0.85 // midpoint of the required 0.7-1.05 band
    ;[0, Math.PI].forEach((phase, ai) => {
      // 6 lobes stepped along a TRUE logarithmic spiral (angle grows with
      // ln(radius), not linearly with k). Both arms sweep the SAME
      // rotational direction now - no dir=+1/-1 sign flip - and start
      // pi apart (opposite sides of the core). Two arms mirroring sweep
      // *direction* from the same start angle used to close a ~206-264deg
      // combined arc into a horseshoe/ring silhouette (a §6.2 anatomy
      // collision with `dots`) - same direction + opposite start angles
      // reads as an actual pinwheel/S-spiral instead.
      const lobes = 6
      const maxRad = w * (0.30 + r() * 0.08)
      const r0 = maxRad * 0.12 // innermost lobe radius, ln() reference point
      const pitch = 0.85 + r() * 0.25 // ln(maxRad/r0) ~= 2.12 -> ~103-134deg sweep/arm
      const pos = []
      for (let k = 0; k < lobes; k++) {
        const t = k / (lobes - 1)
        const rad = maxRad * (0.12 + 0.88 * Math.pow(t, 0.9))
        // ang grows with ln(rad/r0) instead of a constant per-lobe step:
        // tangential spacing (rad * dAng) now tracks radial spacing
        // instead of ballooning with radius, so the gap-derived diameter
        // below tapers toward the tip for free. A post-hoc multiplier on
        // diam alone was tried first and rejected - shrinking diameter
        // without also shrinking gap pushes the ratio straight out of the
        // 0.7-1.05 band near the tip (verified by hand, see PR notes).
        const ang = baseAng + phase + pitch * Math.log(rad / r0)
        pos.push({ x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad * (h / w), ang, t })
      }
      // gap[k] = centre distance between lobe k and lobe k+1 along the curve.
      const gap = []
      for (let k = 0; k < lobes - 1; k++) {
        gap.push(Math.hypot(pos[k + 1].x - pos[k].x, pos[k + 1].y - pos[k].y))
      }
      // diameter derived from the neighbouring gap(s), not tuned
      // independently - guarantees the ratio lands near target regardless
      // of the maxRad/pitch jitter above (unchanged mechanism from the
      // prior fix - do not decouple this from the geometry above it).
      const diam = pos.map((_, k) => {
        const g0 = gap[k - 1], g1 = gap[k]
        const avg = (g0 !== undefined && g1 !== undefined) ? (g0 + g1) / 2 : (g0 ?? g1)
        return avg / ARM_TARGET_RATIO
      })
      pos.forEach((p, k) => {
        const { x: lx, y: ly, t, ang } = p
        const ls = diam[k] * (0.9 + r() * 0.2)
        const lobe = el('l-arm')
        lobe.style.width = lobe.style.height = px(Math.max(10, ls))
        lobe.style.left = px(lx - ls / 2); lobe.style.top = px(ly - ls / 2)
        lobe.style.background = `radial-gradient(circle,
          ${hsla(hue + ai * 6, 62 - t * 10, 72 - t * 16, A(0.42 - t * 0.20, fill))} 0%,
          ${hsla(hue, 52, 46, A(0.16 - t * 0.08, fill))} 55%, transparent ${E(82, fill).toFixed(0)}%)`
        f.appendChild(lobe)
        // edge highlight rotates to the spiral's local TANGENT, not its
        // radial angle - for r = r0*e^(ang/pitch), tangent-to-radial
        // offset is atan(pitch) (~40-48deg here). Using the raw radial
        // `ang` pointed the highlight across the arm instead of along it.
        if (k <= 1 && ls > domEdgeArea) { domEdgeArea = ls; domEdge = { lx, ly, ls, ang: ang + Math.atan(pitch) } }
      })
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
    c.style.boxShadow = `0 0 ${px(cs * 2.6)} ${px(cs * 0.7)} ${hsla(hue, 70, 80, A(0.45, fill))}`
    f.appendChild(c)
    f.style.transform = `rotate(${(-30 + r() * 24).toFixed(0)}deg)`
  }

  else if (kind === 'streak') {
    const t = el('k-tail')
    // tail bar's own thickness, not the headline box's w/h — same "paint
    // grows inside an unchanged box" rule as every other primitive above.
    const tailH = Math.max(6, h * 0.14 * EXTENT_GAIN * fill)
    t.style.width = '100%'; t.style.height = px(tailH)
    t.style.marginTop = px(-tailH / 2)
    t.style.background = `linear-gradient(90deg,transparent 0%,${hsla(hue, 60, 70, A(0.10, fill))} 18%,
      ${hsla(hue, 66, 78, A(0.32, fill))} 70%,${hsla(hue, 70, 90, A(0.62, fill))} 100%)`
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
    coma.style.background = `radial-gradient(circle, ${hsla(hue, 70, 85, A(0.5, fill))} 0%, transparent ${E(70, fill).toFixed(0)}%)`
    f.appendChild(coma)
    const hd = el('k-head')
    hd.style.width = hd.style.height = px(hs); hd.style.marginTop = px(-hs / 2)
    hd.style.background = '#f2fbff'
    hd.style.boxShadow = `0 0 ${px(hs * 2.2)} ${px(hs * 0.6)} ${hsla(hue, 72, 80, A(0.5, fill))}`
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
      ${hsla(hue, 42, 30, A(0.38, fill))} 0%, ${hsla(hue, 38, 24, A(0.22, fill))} 46%,
      ${hsla(hue, 34, 18, A(0.09, fill))} 70%, transparent ${E(88, fill).toFixed(0)}%)`
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
    // Saturn-style ringed planet. Fixed 2026-08-09 (Ben's call, quality bar
    // for this round's other objects): the old body (bw=w*0.42) never
    // overlapped the old ring (inner edge well outside it) — a small disc
    // floating inside a big circular outline, a bullseye/target, not a
    // ringed PLANET. Two real fixes:
    //  - body sized so the ring genuinely wraps around it, and now reuses
    //    drawPlanetDisc/LIGHT_DEG for a real terminator (was a fixed
    //    `at 38% 38%` radial gradient with no relationship to the shared
    //    light convention every other object in this build now follows).
    //  - the ring is a tilted ellipse split into a back half (appended
    //    BEFORE the body — paints behind it) and a front half (appended
    //    AFTER — paints in front) instead of one flat circular border. This
    //    is what actually makes it pass behind the body; a single ring
    //    element can't do that regardless of z-order, since it either
    //    covers the whole body or none of it.
    const bodySize = Math.min(w, h) * 0.52
    const cx = w / 2, cy = h / 2
    const rx = bodySize * 0.98, ry = rx * 0.32
    const tilt = -10
    const NS = 'http://www.w3.org/2000/svg'
    const ringHalf = (sweepFlag, isBack) => {
      const svg = document.createElementNS(NS, 'svg')
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
      svg.style.position = 'absolute'; svg.style.inset = '0'
      svg.style.width = '100%'; svg.style.height = '100%'
      const path = document.createElementNS(NS, 'path')
      path.setAttribute('d', `M ${(cx - rx).toFixed(1)},${cy.toFixed(1)} A ${rx.toFixed(1)},${ry.toFixed(1)} 0 0,${sweepFlag} ${(cx + rx).toFixed(1)},${cy.toFixed(1)}`)
      path.setAttribute('fill', 'none')
      // back half dimmer (it's behind the lit body, in its own shadow-side
      // read) and thinner; front half is the bright, full-width edge.
      path.setAttribute('stroke', hsla(hue, 65, isBack ? 55 : 78, A(isBack ? 0.30 : 0.55, fill)))
      path.setAttribute('stroke-width', px(Math.max(3, w * (isBack ? 0.010 : 0.016))))
      path.setAttribute('transform', `rotate(${tilt} ${cx.toFixed(1)} ${cy.toFixed(1)})`)
      svg.appendChild(path)
      return svg
    }
    // outer glow (B2 sec 2.2): `ring` had no glow at all outside its hard
    // border/planet — the whole primitive's painted surface was the
    // thinnest of the eight kinds measured. A closest-side wash behind
    // everything, scaled by fill same as every other primitive's paint.
    const glow = el('d-glow')
    const gd = w * 0.95
    glow.style.left = px((w - gd) / 2); glow.style.top = px((h - gd) / 2)
    glow.style.width = glow.style.height = px(gd)
    glow.style.background = `radial-gradient(circle closest-side, ${hsla(hue, 55, 70, A(0.30, fill))} 0%, transparent ${E(96, fill).toFixed(0)}%)`
    f.appendChild(glow)
    f.appendChild(ringHalf(1, true)) // back half — behind the body
    const bodyContainer = el('')
    bodyContainer.style.position = 'absolute'
    bodyContainer.style.left = px(cx - bodySize / 2); bodyContainer.style.top = px(cy - bodySize / 2)
    bodyContainer.style.width = bodyContainer.style.height = px(bodySize)
    drawPlanetDisc(el, bodyContainer, bodySize, hue, fill, LIGHT_DEG)
    f.appendChild(bodyContainer)
    f.appendChild(ringHalf(0, false)) // front half — in front of the body
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
    halo.style.background = `radial-gradient(circle closest-side, ${hsla(hue, 60, 70, A(0.20, fill))} 0%, transparent ${E(75, fill).toFixed(0)}%)`
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
      //
      // was `at 36% 36%` (an off-center light source with a dark
      // unlit remainder) - the exact same recipe `ring`'s planet body uses
      // for lit-sphere shading, so binary and ring shared an anatomy (spec
      // §6.2: two distinct nouns must not share an anatomy). A star isn't
      // lit from one side, it emits from its own centre - `at 50% 50%`
      // with a symmetric hot-core-fading-outward falloff (the same
      // treatment blob/spikes/lens already use for their cores) reads as a
      // glowing star instead of a shadowed planet.
      d.style.background = `radial-gradient(circle at 50% 50%,
        ${hsla(hue, 25, 97, A(1, fill))} 0%, ${hsla(hue, 60, 72, A(0.55, fill))} 50%, transparent 100%)`
      d.style.boxShadow = `0 0 ${px(s * 2)} ${px(s * 0.3)} ${hsla(hue, 70, 80, A(0.5, fill))}`
      f.appendChild(d)
    })
  }

  else if (kind === 'planet') {
    // headline-tier lit planet (radial-mass family) — same terminator/rim/
    // glow geometry as the accessory occluder (drawPlanetDisc), sized to
    // fit inside this kind's w×h box. Kept circular (min(w,h)) rather than
    // stretched to w×h like blob/lens — a stretched sphere reads as an
    // ellipse, not a planet. Deliberately NOT the `.occ` class (own inline
    // position/radius instead): the occlusion-ablation gate does
    // `document.querySelectorAll('.occ')` and picks the first on-screen
    // match per station — sharing the class with a much larger headline
    // element at a station that also happens to carry an accessory
    // occluder would make that gate silently measure the wrong element.
    const discSize = Math.min(w, h)
    const disc = el('')
    disc.style.position = 'absolute'; disc.style.borderRadius = '50%'
    disc.style.left = px((w - discSize) / 2); disc.style.top = px((h - discSize) / 2)
    disc.style.width = disc.style.height = px(discSize)
    drawPlanetDisc(el, disc, discSize, hue, fill, LIGHT_DEG)
    f.appendChild(disc)
  }

  else if (kind === 'asteroidField') {
    // scattered-cluster family: 3 rocks, each with its own companion glow
    // = 6 DOM elements (budget, exact). §7 (>=2 separately positioned
    // parts): trivially satisfied. Presence floor: each rock's own base
    // fill alpha is constant, never fill-scaled. Fill-driven: each rock's
    // own glow (A()/E()) and its lit-edge highlight alpha. Light: each
    // rock's highlight sits on the LIGHT_DEG-facing edge (a linear-gradient
    // angle computed from LIGHT_DEG, not hand-picked) — same shared
    // convention the planet's terminator uses.
    //
    // Three measured fixes, in order:
    //  - signal flat (25.0 -> 26.0) with ONE shared central glow: its peak
    //    luma at fill=1 landed about equal to the rocks' own constant-alpha
    //    base — a fill-driven region has to clearly out-brighten whatever's
    //    invariant, not just exist (same lesson as the planet's glow).
    //  - visually read as one blob with dark bites, not a SCATTERED field:
    //    that one shared glow visually fused every rock into a single soft
    //    mass, the opposite of "scattered." Tried per-rock filter:drop-
    //    shadow next (glows the true clipped silhouette, zero extra DOM) —
    //    it rendered as literally nothing in Chromium here (screenshot
    //    confirmed: no halo at either fill level, on any rock), so it's not
    //    a viable technique in this render path regardless of why.
    //  - landed on a real sibling glow div per rock (proven — same
    //    radial-gradient technique every other primitive already uses).
    //    That costs a DOM element per rock, so rock count came down from 5
    //    to 3 to stay inside the 6-element budget — still a legitimate
    //    "field," each rock now separated and independently readable.
    const cssLightDeg = (LIGHT_DEG + 90) % 360 // my atan2 convention (0=+x) -> CSS gradient convention (0=up)
    const SECTORS = [{ x: 0.14, y: 0.55 }, { x: 0.50, y: 0.20 }, { x: 0.84, y: 0.58 }]
    SECTORS.forEach(sec => {
      const rs = w * (0.14 + r() * 0.09)
      const cx = sec.x * w + (r() * 0.05 - 0.025) * w, cy = sec.y * h + (r() * 0.05 - 0.025) * h
      const rx = Math.min(w - rs, Math.max(0, cx - rs / 2)), ry = Math.min(h - rs, Math.max(0, cy - rs / 2))
      const rockHue = hue - 8 + r() * 16
      const glow = el('d-glow')
      const gd = rs * 2.2
      glow.style.left = px(cx - gd / 2); glow.style.top = px(cy - gd / 2)
      glow.style.width = glow.style.height = px(gd)
      glow.style.background = `radial-gradient(circle closest-side, ${hsla(rockHue + 15, 50, 62, A(0.55, fill))} 0%, transparent ${E(80, fill).toFixed(0)}%)`
      f.appendChild(glow)
      const rock = el('')
      rock.style.position = 'absolute'
      rock.style.left = px(rx); rock.style.top = px(ry)
      rock.style.width = rock.style.height = px(rs)
      const pts = Array.from({ length: 6 }, (_, k) => {
        const ang = k * 60 + (r() * 22 - 11)
        const rad = 40 + r() * 10
        return `${(50 + rad * Math.cos(ang * Math.PI / 180)).toFixed(0)}% ${(50 + rad * Math.sin(ang * Math.PI / 180)).toFixed(0)}%`
      }).join(',')
      rock.style.clipPath = `polygon(${pts})`
      // base (presence floor, constant alpha) + lit-edge highlight blended
      // in via a second, fill-driven gradient layer on top.
      rock.style.background =
        `linear-gradient(${cssLightDeg.toFixed(0)}deg, ${hsla(rockHue + 12, 30, 34, A(0.8, fill))} 0%, transparent 55%), ` +
        `${hsla(rockHue, 16, 19, 0.97)}`
      f.appendChild(rock)
    })
  }

  else if (kind === 'pulsar') {
    // radiant-burst family, elongated geometry: a compact core + a soft
    // ambient glow + 2 opposing beams along the shared light axis
    // (LIGHT_DEG/+180) — not a fresh hand-picked angle, reusing the one
    // scene-wide direction convention every object in this build agrees on
    // (channel 4). 4 DOM elements (glow + core + 2 beams), under budget.
    // Presence floor: the core and a short beam stub are always visible
    // (fixed base length/alpha); fill drives beam A()/E() reach.
    //
    // Measured first pass (core+beams only, no glow): signal barely moved
    // (11.0 -> 14.0) even though beam LENGTH changed 1.7x, because a beam
    // this thin (~4px) covers too little of the box's area for a
    // percentile-based metric to register regardless of how far it
    // reaches — same lesson twice over now (planet, asteroid field): a
    // thin/precise identity feature needs a separate large-area glow to
    // carry the measurable fill response, it can't carry it itself.
    const glow = el('d-glow')
    glow.style.background = `radial-gradient(circle closest-side, ${hsla(hue, 40, 78, A(0.45, fill))} 0%, transparent ${E(80, fill).toFixed(0)}%)`
    f.appendChild(glow)
    const core = el('s-core')
    const cs = Math.max(14, w * 0.05)
    core.style.width = core.style.height = px(cs)
    core.style.marginLeft = px(-cs / 2); core.style.marginTop = px(-cs / 2)
    core.style.boxShadow = `0 0 ${px(cs * 2.6)} ${px(cs * 0.9)} ${hsla(hue, 20, 92, A(0.9, fill))}`
    f.appendChild(core)
    const beamLen = w * 0.5 // fixed reach for the always-on stub half; E() extends past it below
    const beamAng = LIGHT_DEG
    ;[beamAng, beamAng + 180].forEach(ang => {
      const beam = el('')
      beam.style.position = 'absolute'
      beam.style.left = '50%'; beam.style.top = '50%' // anchor at the core's own center, not f's static position
      const len = beamLen * (0.30 + E(70, fill) / 100) // stub always present, fill throws it further
      const th = Math.max(3, w * 0.006)
      beam.style.width = px(len); beam.style.height = px(th)
      beam.style.marginTop = px(-th / 2)
      beam.style.transformOrigin = '0 50%'
      beam.style.transform = `rotate(${ang.toFixed(1)}deg)`
      beam.style.background = `linear-gradient(90deg, ${hsla(hue, 30, 90, A(0.85, fill))} 0%, transparent 100%)`
      f.appendChild(beam)
    })
  }
  return f
}
// `sprite` kind (deleted 2026-08-09): a single hardcoded zigzag reused
// verbatim at st6 and st10 — both measured ~16% extent because it was
// literally the same shape twice. In a space world it read as a chart, not
// an object (visual audit finding). st6 and st10 are back on their original
// glow primitives until real objects exist for a headline tier — see
// concepts/PART-KIT.md for the parametric-part rebuild plan (no generated/
// vectorized art — hand-coded parts only, clean-room from game-icons.net
// silhouette reference text notes, per Ben's 2026-08-09 direction change).
//
// ═══ LIGHT ═══ one direction for every primitive in the scene (house-style
// channel 4: "takes a light-direction parameter; terminator, core shadow
// and rim are COMPUTED from it, never hand-placed"). Standard atan2(dy,dx)
// convention, degrees: 0=+x, 90=+y (down, since SVG y grows downward),
// increasing clockwise on screen. 225 = upper-left, matching st9 ring's
// existing `at 38% 38%` lit-body convention (kept identical so every object
// in this build agrees on where the sun is).
const LIGHT_DEG = 225
function ptOnCircle(cx, cy, r, deg) {
  const rad = deg * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// ═══ OCCLUDER / PLANET ═══ §7.2 (occlusion, measured by ablation) needs a
// shape that actually blocks what's behind it - every primitive above is a
// translucent glow that only alpha-blends with the star layer, never truly
// occludes it. Rebuilt 2026-08-09 (visual audit finding: the old flat-black-
// disc-plus-uniform-border read as an occluder, not an object; then a first
// pass hand-placed a crescent/rim at fixed coordinates that only coincidentally
// matched a light direction instead of being derived from one — this pass
// replaces every hand-placed coordinate with LIGHT_DEG-derived trig, per the
// house-style light channel) to be a real planet: a lit crescent + terminator
// (offset shadow circle, the standard technique — no reference image needed,
// this is pure radial geometry), 2 surface bands, a rim arc peaking on the lit
// side.
//
// Exactly 3 tonal values (house-style rule 7): base (lit crescent), shade
// (shadow overlay — hue-shifted cooler, not just darker, though at ~3%
// lightness the shift is subtle by construction: occlusion needs it near-
// black regardless), rim (bright limb highlight). Bands are 2 interior marks
// (detail budget: silhouette + <=3 marks). DOM parts: glow, lit circle,
// shadow circle, bands (1 path, 2 subpaths), rim (1 path) = 5, plus the svg/
// clipPath/g wrapper every SVG-based primitive needs = 6 total elements.
// Path nodes: bands 2+2=4, rim 2 — 6 total, well under the 40 budget.
//
// Occlusion is preserved by keeping the LIT crescent itself dark (10-18%
// lightness, not a bright surface) — the visual "planet" read comes from the
// terminator SHAPE and the thin bright rim line (small area), not from
// brightening the disc's fill the way a real photo would. Verified against
// concepts/tools/ring-occlusion-ablation.mjs.
let occCounter = 0 // deterministic per-call id for the SVG clipPath — DOM
// plumbing only, not seeded content, so this doesn't touch the no-Math.random
// rule above (multiple occluders coexist in the DOM at once and each needs
// its own clip id, or later ones would clip using an earlier one's circle).
// Disc radius, viewBox units (100-unit box): 50 — the FULL container radius,
// same coverage the pre-terminator-rebuild flat disc had (the last state
// station 0's occlusion gate is known to have passed: aggregate 0.296x,
// keyed on one bright real star at d=66px). Two things were tried and
// measurably broke that gate before landing here:
//  - R=36 (72% coverage, freeing glow margin INSIDE the container): station
//    0's aggregate went 0.296x -> 0.734x FAIL — a much smaller/less reliable
//    real-star sample.
//  - R=46 (92%, this file's own inherited value before this session):
//    0.296x -> 0.588x FAIL — subtler, but the same mechanism: 92% coverage
//    has a real ~8% radius deficit against what the gate's known-good
//    baseline actually covered, and it excludes exactly the one strong star
//    (d=66px, unoccluded=81.1) that carried the old passing aggregate.
// R=50 has zero inset and exactly touches the 100-unit viewBox's own edges
// (a circle of radius 50 centered at 50,50) — safe, no overflow risk. The
// glow's room comes entirely from GLOW_FRAC overflowing the container, not
// from insetting the disc.
// RING_OCCLUSION_DISC_FRAC documents disc-radius/container-radius for
// ring-occlusion-ablation.mjs, which infers this element's true occluding
// radius from its container box and needs it kept in sync.
export const RING_OCCLUSION_DISC_FRAC = 1.0
const GLOW_FRAC = 1.35 // glow container as a multiple of size — overflows the disc's own box on purpose
// Shared by makeOccluder (accessory-tier occlusion disc) and makePrim's
// 'planet' kind (headline-tier lit planet, spec task 5) — same terminator/
// rim/glow geometry, two different callers/sizes/fill-invariance needs.
// Appends glow + svg (clip/lit/shadow/bands/rim) into `container`, which
// must already be exactly `size`x`size` (the caller positions/sizes it).
function drawPlanetDisc(el, container, size, hue, fill, lightDeg) {
  const cx = 50, cy = 50, R = 50 * RING_OCCLUSION_DISC_FRAC
  const Lx = Math.cos(lightDeg * Math.PI / 180), Ly = Math.sin(lightDeg * Math.PI / 180)

  // fill channel (spec: rim intensity, detail alpha and glow extent scale
  // with fill; the disc's own occluding silhouette does not — see
  // presence-floor note below). Outer glow mirrors `ring`'s d-glow/E()
  // treatment, overflowing the disc's own box (GLOW_FRAC) for real ring room.
  //
  // The gradient's bright stop is anchored at the DISC'S OWN EDGE (glowInnerPct
  // below), not at 0%/center like every other primitive's glow. A center-anchored
  // stop's brightest ring sits directly under the opaque disc — completely
  // hidden — so only its already-fading tail was ever visible outside it,
  // no matter how strong A()/E() made the underlying values (measured: signal
  // stayed flat at 28.0 across fill=0.35..1.00 with that version, because the
  // box's own p95 never left the constant-alpha crescent). Anchoring the peak
  // at the edge instead means fill's E() genuinely controls how far a REAL
  // bright ring reaches past the disc, which is what moves the box's own p95.
  const glow = el('d-glow')
  const gd = size * GLOW_FRAC
  const glowInnerPct = (R * 2 / GLOW_FRAC).toFixed(1) // disc radius as % of glow's own closest-side radius
  glow.style.left = px((size - gd) / 2); glow.style.top = px((size - gd) / 2)
  glow.style.width = glow.style.height = px(gd)
  glow.style.background = `radial-gradient(circle closest-side, transparent 0%, transparent ${glowInnerPct}%, ${hsla(hue + 10, 55, 72, A(0.55, fill))} ${(Number(glowInnerPct) + 6).toFixed(1)}%, transparent ${E(125, fill).toFixed(0)}%)`
  container.appendChild(glow)

  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.style.position = 'absolute'; svg.style.inset = '0'
  svg.style.width = '100%'; svg.style.height = '100%'
  const clipId = `occclip${occCounter++}`
  const defs = document.createElementNS(NS, 'defs')
  const clip = document.createElementNS(NS, 'clipPath')
  clip.setAttribute('id', clipId)
  const clipCircle = document.createElementNS(NS, 'circle')
  clipCircle.setAttribute('cx', String(cx)); clipCircle.setAttribute('cy', String(cy)); clipCircle.setAttribute('r', String(R))
  clip.appendChild(clipCircle)
  defs.appendChild(clip)
  svg.appendChild(defs)

  const g = document.createElementNS(NS, 'g')
  g.setAttribute('clip-path', `url(#${clipId})`)
  // presence floor: the lit/shadow silhouette's own alpha is CONSTANT,
  // never scaled by fill — a quiet station still holds a readable disc,
  // per spec ("no object may be entirely fill-invariant, and none entirely
  // fill-driven"; this is the invariant half, rim/bands/glow are the driven
  // half below). Position (not alpha) is what LIGHT_DEG drives.
  const lit = document.createElementNS(NS, 'circle')
  lit.setAttribute('cx', String(cx)); lit.setAttribute('cy', String(cy)); lit.setAttribute('r', String(R))
  lit.setAttribute('fill', hsla(hue, 30, 14, 0.99))
  g.appendChild(lit)
  // terminator: a shadow disc offset AWAY from the light (the standard
  // offset-circle technique) — computed from LIGHT_DEG, not a hand-picked
  // coordinate. Same near-black tone the old flat disc used, so total light
  // output stays low enough to still occlude.
  const shadowOff = R * 0.55, shadowR = R * 1.13
  const shC = { x: cx - Lx * shadowOff, y: cy - Ly * shadowOff }
  const shadow = document.createElementNS(NS, 'circle')
  shadow.setAttribute('cx', shC.x.toFixed(2)); shadow.setAttribute('cy', shC.y.toFixed(2)); shadow.setAttribute('r', shadowR.toFixed(2))
  shadow.setAttribute('fill', hsla(hue - 12, 22, 3, 0.99))
  g.appendChild(shadow)
  // 2 surface bands (detail budget), arcs at decreasing radius centered on
  // the light angle so they always sit inside the lit crescent regardless
  // of where LIGHT_DEG points.
  const bandA = ptOnCircle(cx, cy, R * 0.87, lightDeg - 34), bandB = ptOnCircle(cx, cy, R * 0.87, lightDeg + 8)
  const bandC = ptOnCircle(cx, cy, R * 0.72, lightDeg - 42), bandD = ptOnCircle(cx, cy, R * 0.72, lightDeg + 14)
  const bands = document.createElementNS(NS, 'path')
  bands.setAttribute('d',
    `M ${bandA.x.toFixed(2)},${bandA.y.toFixed(2)} A ${(R * 0.87).toFixed(2)},${(R * 0.87).toFixed(2)} 0 0,1 ${bandB.x.toFixed(2)},${bandB.y.toFixed(2)} ` +
    `M ${bandC.x.toFixed(2)},${bandC.y.toFixed(2)} A ${(R * 0.72).toFixed(2)},${(R * 0.72).toFixed(2)} 0 0,1 ${bandD.x.toFixed(2)},${bandD.y.toFixed(2)}`)
  bands.setAttribute('fill', 'none')
  bands.setAttribute('stroke', hsla(hue - 15, 25, 20, A(0.6, fill)))
  bands.setAttribute('stroke-width', '5')
  bands.setAttribute('vector-effect', 'non-scaling-stroke')
  g.appendChild(bands)
  svg.appendChild(g)

  // rim / limb highlight: an open arc over ONLY the lit crescent's outer
  // edge, centered on LIGHT_DEG (peaks on the lit side, by construction —
  // there is no other side it could peak on), round-capped so both ends
  // taper instead of stopping dead. Outside the clip, tracing the disc's
  // true edge.
  const rimA = ptOnCircle(cx, cy, R, lightDeg - 48), rimB = ptOnCircle(cx, cy, R, lightDeg + 48)
  const rim = document.createElementNS(NS, 'path')
  rim.setAttribute('d', `M ${rimA.x.toFixed(2)},${rimA.y.toFixed(2)} A ${R},${R} 0 0,1 ${rimB.x.toFixed(2)},${rimB.y.toFixed(2)}`)
  rim.setAttribute('fill', 'none')
  rim.setAttribute('stroke', hsla(hue + 10, 70, 82, A(0.85, fill)))
  rim.setAttribute('stroke-width', '4')
  rim.setAttribute('stroke-linecap', 'round')
  rim.setAttribute('vector-effect', 'non-scaling-stroke')
  svg.appendChild(rim)

  container.appendChild(svg)
}

function makeOccluder(el, size, hue, fill, lightDeg = LIGHT_DEG) {
  // required, no default — see makePrim's identical guard for why.
  // lightDeg keeps a default: it's a genuine scene-wide constant (house
  // style: "one light direction per scene"), not a per-call value a caller
  // could silently forget to compute, so defaulting it isn't the same risk.
  if (fill === undefined) throw new Error('makeOccluder: fill is required')
  const f = el('occ')
  f.style.width = f.style.height = px(size)
  drawPlanetDisc(el, f, size, hue, fill, lightDeg)
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
    // space-separated names each get their own prefix (e.g. 'pf pf-breathe'
    // -> 'ring-pf ring-pf-breathe') so a headline element can carry the
    // static .pf base plus the animated .pf-breathe modifier without a
    // second call site threading the literal prefix by hand.
    if (name) d.className = name.split(' ').map(n => prefix + n).join(' ')
    return d
  }
  return {
    el,
    makePrim: (kind, w, h, hue, alpha, r, isHeadline, fill) => makePrim(el, kind, w, h, hue, alpha, r, isHeadline, fill),
    bandY: (r, h, forceUpper) => bandY(engine, r, h, forceUpper),
    buildStars: (host, period, perFrame, sizeMul, seed) => buildStars(el, engine, host, period, perFrame, sizeMul, seed),
    makeOccluder: (size, hue, fill) => makeOccluder(el, size, hue, fill),
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
  const tw = kfName(p, 'Tw'), pfBreathe = kfName(p, 'PfBreathe'), driftMove = kfName(p, 'DriftMove')
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

.${p}pf{position:absolute;pointer-events:none}
.${p}pf-breathe{animation:${pfBreathe} var(--pb) ease-in-out infinite;animation-delay:var(--pd)}
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

.${p}pair-bridge{position:absolute;height:5px;transform-origin:0 50%;pointer-events:none}

.${p}occ{position:absolute;border-radius:50%}
.${p}occ-rim{position:absolute;inset:0;border-radius:50%;border:5px solid var(--rim);
  border-right-color:transparent;border-bottom-color:transparent}

.${p}drift{position:absolute;border-radius:50%;background:#ffd9a0;
  animation:${driftMove} 480s linear infinite alternate;
  box-shadow:0 0 32px 10px rgba(255,183,110,0.75)}
@keyframes ${driftMove}{0%{transform:translateX(0)}100%{transform:translateX(3600px)}}
`
}
