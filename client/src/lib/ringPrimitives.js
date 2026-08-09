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

function makePrim(el, kind, w, h, hue, alpha, r, isHeadline, fill = 1) {
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
    const ring = el('rg-ring')
    const rw = w * 0.9, rh = h * 0.9
    ring.style.left = px((w - rw) / 2); ring.style.top = px((h - rh) / 2)
    ring.style.width = px(rw); ring.style.height = px(rh)
    ring.style.borderWidth = px(Math.max(4, w * 0.02))
    ring.style.borderStyle = 'solid'
    ring.style.borderColor = hsla(hue, 70, 78, 0.55)
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
    body.style.background = `radial-gradient(circle at 38% 38%, ${hsla(hue, 60, 68, A(0.9, fill))} 0%, ${hsla(hue, 50, 40, A(0.7, fill))} 70%, transparent 100%)`
    f.appendChild(body)
    // outer glow (B2 sec 2.2): `ring` had no glow at all outside its hard
    // border/planet — the whole primitive's painted surface was the
    // thinnest of the eight kinds measured. A new closest-side wash behind
    // the ring/planet, scaled by fill same as every other primitive's paint.
    const glow = el('d-glow')
    const gd = w * 0.95
    glow.style.left = px((w - gd) / 2); glow.style.top = px((h - gd) / 2)
    glow.style.width = glow.style.height = px(gd)
    glow.style.background = `radial-gradient(circle closest-side, ${hsla(hue, 55, 70, A(0.30, fill))} 0%, transparent ${E(96, fill).toFixed(0)}%)`
    f.insertBefore(glow, ring)
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

  else if (kind === 'sprite') {
    // spec §6: a closed opaque path — the noun a gradient can't carry
    // (Sonora's balloons "read at distance because they're drawn"). Two
    // wavy edges offset by a constant band-thickness, so the outline can
    // never self-intersect. 10 hand-authored anchor points (spec: 5-10),
    // solid fill + a real stroke (non-scaling so it holds >=4px on screen
    // no matter the element's own w/h tier), one lighter interior band
    // tracing the centerline. Test case: st6's own noun ("dust ribbon")
    // drawn instead of glowed, isolating whether opacity — not the arc — is
    // what perceptibility was missing (B2-luminance.md; the fill/arc gain
    // is deliberately NOT applied here, since an opaque path has nothing
    // for A()/E() to scale).
    const NS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('viewBox', '0 0 100 100')
    svg.setAttribute('preserveAspectRatio', 'none')
    svg.style.position = 'absolute'; svg.style.inset = '0'
    svg.style.width = '100%'; svg.style.height = '100%'
    const body = document.createElementNS(NS, 'path')
    body.setAttribute('d', 'M5,45 L30,25 L50,45 L70,25 L95,45 L95,61 L70,41 L50,61 L30,41 L5,61 Z')
    body.setAttribute('fill', hsla(hue, 62, 52, 1))
    body.setAttribute('stroke', hsla(hue + 10, 70, 84, 1))
    body.setAttribute('stroke-width', '4')
    body.setAttribute('vector-effect', 'non-scaling-stroke')
    svg.appendChild(body)
    const band = document.createElementNS(NS, 'path')
    band.setAttribute('d', 'M8,53 L30,33 L50,53 L70,33 L92,50')
    band.setAttribute('fill', 'none')
    band.setAttribute('stroke', hsla(hue - 12, 42, 90, 0.65))
    band.setAttribute('stroke-width', '2.5')
    band.setAttribute('vector-effect', 'non-scaling-stroke')
    svg.appendChild(band)
    f.appendChild(svg)
  }
  return f
}

// ═══ OCCLUDER ═══ §7.2 (occlusion, measured by ablation) needs a shape that
// actually blocks what's behind it - every primitive above is a translucent
// glow that only alpha-blends with the star layer, never truly occludes it.
// A near-opaque dark disc with a bright rim (same partial-border rim
// technique as .b-lobe's rim above - two solid edges, two transparent, so
// it still reads as a shape's edge rather than a flat silhouette) is dark
// enough to occlude and rimmed enough to still be visible against a dark
// sky (§6.1: "a dark shape over dark sky is invisible without one").
function makeOccluder(el, size, hue) {
  const f = el('occ')
  f.style.width = f.style.height = px(size)
  // The ablation ratio is ~D/S (occluder disc luminance / unoccluded star
  // luminance) once transmission is this low — raising alpha further
  // barely moves it, because alpha was never the limiting term. Disc
  // lightness is: measured L7/4/2 put stations 0 and 9 at 0.46x/0.49x,
  // a ~2% margin under the <=0.5x ceiling that rode on which stars'
  // seeded twinkle phase happened to freeze near their trough during
  // measurement (concepts/tools/ring-occlusion-ablation.mjs) rather than
  // real coverage. L3/2/1 drops D far enough that every station lands
  // near 0.18x-0.19x - a real ~2.5x margin, independent of twinkle phase.
  f.style.background = `radial-gradient(circle at 42% 40%,
    ${hsla(hue, 20, 3, 0.99)} 0%, ${hsla(hue, 16, 2, 0.985)} 62%, ${hsla(hue, 12, 1, 0.98)} 100%)`
  f.style.boxShadow = `inset 0 0 ${px(size * 0.2)} ${hsla(hue, 10, 0, 0.55)}`
  const rim = el('occ-rim')
  rim.style.setProperty('--rim', hsla(hue + 10, 70, 82, 0.55))
  f.appendChild(rim)
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
    makeOccluder: (size, hue) => makeOccluder(el, size, hue),
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
