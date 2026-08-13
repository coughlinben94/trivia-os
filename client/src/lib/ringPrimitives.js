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
// Kinds whose makePrim branch rotates the whole returned element (f.style.
// transform = rotate(...)) AFTER bandY has already placed it — lens/streak/
// ribbon below, each from a fixed per-kind range, not a fresh draw per call.
// Keep in sync with those three rotate() calls if their ranges ever change.
const ROTATION_MAX_DEG = { lens: 30, streak: 26, ribbon: 18 }

// Worst-case post-rotation bounding-box height for a kind that may rotate
// after placement — closes the KNOWN GAP bandY's own history above flagged
// (2026-08-08 review): the clamp was sizing off styled h, "passing by seed
// luck, not by construction." Uses each kind's fixed rotation-range BOUND,
// not the actual per-instance angle (not drawn yet when bandY is called —
// drawing it early would reorder every downstream seeded value for that
// station), so the clamp holds regardless of which angle in range lands.
// Non-rotating kinds (the other 9) return h unchanged.
//
// HARDENING, not a fix for any measured regression: added 2026-08-09 while
// chasing a safe-box luminance-cap FAIL at st4/st10, on the reasonable
// assumption that this exact gap was the cause. It wasn't — killed and
// re-verified via npm run verify:ring afterward (regression tier unchanged,
// same 2 stations, same margin) before the real cause (neighbour-station
// .b-lobe bleed, unrelated to rotation) was found. Keep this — it's still a
// real, previously-documented gap the file's own comments had been asking
// to close, and it's provably non-regressing (every non-rotating call site
// is byte-identical, confirmed against the same gate run) — just don't cite
// it as the st4/st10 fix in a future session.
export function rotatedBandH(kind, w, h) {
  const maxDeg = ROTATION_MAX_DEG[kind]
  if (!maxDeg) return h
  const rad = maxDeg * Math.PI / 180
  return w * Math.abs(Math.sin(rad)) + h * Math.abs(Math.cos(rad))
}

// effH (optional): the real post-rotation bounding-box height to clamp
// against, from rotatedBandH() (see its own comment — this is hardening,
// not the fix for any specific measured regression), when it differs from
// the element's own styled h (lens/streak/ribbon rotate the whole element
// after this call). Every bound below is computed against effH so the
// constraint reflects real on-screen extent; the result is then converted
// back to a top edge for the actual (pre-rotation) box of height h. CSS
// rotate() pivots on the untransformed box's own center, so that center —
// topEdge + h/2 — is exactly what the rotated bbox shares with the
// unrotated one; effH===h (the default, every non-rotating call site) makes
// this byte-identical to the prior formula.
// 2026-08-13 (fresh customer-role critique: 8/12 stations' own headline
// amputated by a frame edge, st4 by top+left at once). Root cause per that
// critique: the MIN-bleed floor below (introduced 2026-08-12 for legitimate
// corner-hugging reasons) got tuned up three separate rounds — 0.09->0.12
// (reverted)->0.20 — chasing "move more towards corner" feedback, each round
// only checked the spec's regression gates (safe-box luminance, ink-share,
// the 35% "accidental clip" ceiling), never a plain "does the object still
// read as whole" look. Nothing capped the deep end (`minY = -h*0.30`) to
// match — that value predates all three corner-push rounds, tuned once for
// an unrelated safe-box-luminance bleed regression (see this file's history
// above), not for this. So the floor kept climbing toward a ceiling that was
// never re-examined, and by round 3 (0.20 floor, 0.30 ceiling) EVERY upper-
// band headline was forced into a 20-30% bleed band with no shallower option
// — bbox-verified directly on st4 (planet, ~29% of its own height off the
// top edge, plus box-shadow glow bleeding past the ~6px-from-edge left
// margin cornerX already places it at — cornerX itself measured NOT to push
// any box past the frame horizontally, so that's glow overflow at a tight
// margin, not a second placement bug).
//
// Both numbers now share one named ceiling instead of drifting independently:
// MAX_BLEED_FRAC caps how much of the headline's own real height (`h`, same
// term the floor already uses post-2026-08-12's rotation fix) may bleed past
// either frame edge — 16%, chosen so the object's own body stays clearly
// majority on-screen (84%+) even at the deepest allowed draw, the line
// between "artfully corner-tucked" and "amputated." MIN_BLEED_FRAC reverts to
// 0.09 — the last value in this file's own history verified NOT to trip the
// ink-share regression gate (0.12 did, at st4) — rather than inventing an
// untested number. Both are well inside the spec's own 10%-35% bleed target
// band (10% floor / 35% accidental-clip ceiling), just narrower than the
// tuning loop's own uncapped drift had made it. Applies to both the upper
// and lower band (the lower branch's old `H - h*0.70` was the same
// unexamined +0.30h ceiling, mirrored here for the same reason, still with
// no forced floor — no measured case for one, same as before).
const MAX_BLEED_FRAC = 0.16
// 2026-08-13: raised 0.09 -> 0.14 (near the 0.16 ceiling). Ben flagged st0/
// st2/st3/st4 "more towards corner" again today, on top of this same
// complaint's own repeated history (see cornerX's matching comment below —
// three prior tightening rounds before today). This time paired with an
// explicit standing principle, not just a repeated nudge: "its ok if things
// bleed off the corners. it gives more space for the question itself." The
// ceiling this morning's fix added (MAX_BLEED_FRAC, preventing true
// amputation) makes it safe to push the floor close to it — every headline
// now reliably bleeds close to the max allowed, instead of a wide low-to-
// high random range that only looked corner-hugged on the lucky high draws.
const MIN_BLEED_FRAC = 0.14

function bandY(engine, r, h, forceUpper, effH, skipMinBleed) {
  const eff = effH === undefined ? h : effH
  const H = engine.H, top = engine.SAFE.y * H, bot = (engine.SAFE.y + engine.SAFE.h) * H
  const upper = forceUpper !== undefined ? forceUpper : r() < 0.5
  const margin = 8
  let edgeEff
  if (upper) {
    // 2026-08-12 (fresh review, st11 aurora ribbon: "love this but needs
    // to be moved" — bbox-verified the wave crests sit right at/past the
    // top edge). Root cause: the allowed off-frame bleed was computed as
    // a fraction of `eff` — but for rotating kinds (lens/streak/ribbon)
    // `eff` is ALREADY inflated past the element's own real height by
    // rotatedBandH() to cover the worst-case post-rotation bbox. Sizing
    // the bleed allowance off that inflated number compounds two
    // separate margins into one, so a wide rotated shape like ribbon
    // gets pushed further off-frame than a same-height non-rotating
    // shape would be. Uses the element's real (pre-rotation) `h` for the
    // bleed term instead — `eff` still governs the safe-box clearance
    // above it, only the bleed fraction changes. Byte-identical for the
    // 9 non-rotating kinds (eff===h there already).
    const maxY = top - margin - eff / 2, minY = -h * MAX_BLEED_FRAC
    edgeEff = maxY <= minY ? maxY : minY + (maxY - minY) * r()
    // 2026-08-12 (round 2, Ben: st0 "move towards corner up more" — bbox-
    // measured directly: this seed's r() draw landed edgeEff=-5px, barely
    // bled at all, nowhere near the -h*0.30 deep-tuck end the range
    // technically allows). The old `Math.max(edgeEff, -margin)` line was a
    // MAX-bleed cap (never bleed more than 8px) — that's backwards from
    // what "hugs the corner" needs, and it's also why the spec's own bleed
    // gate reads under target (`3-5/12 stations cropped 10-35%` failing
    // low): a flat 8px cap is ~2% of a 360-500px headline, far under the
    // 10% floor the spec wants. Replaced with a MIN-bleed floor instead —
    // whatever r() draws, at least 12% of the element's own height bleeds
    // off the top, well inside the 35% ceiling — so every draw reads as
    // corner-tucked instead of only the lucky low-r() ones.
    //
    // `skipMinBleed`: verify:ring caught this floor pushing st9's asteroid
    // field (isSpanningField — already centered ON the station boundary,
    // so it's inherently ~50% cropped by that horizontal placement alone)
    // past the spec's 35% "accidental clip" ceiling once this forced
    // vertical bleed stacked on top. That station's own placement already
    // reads as corner/edge-anchored without this floor's help, so it's
    // exempted rather than the floor being watered down for every kind.
    // 0.12 initially, dialed back to 0.09 after verify:ring caught st4
    // dropping under the "largest element supplies >=55% of mid-layer
    // ink" floor (react-live: 55%->50%) — more forced bleed means less of
    // the headline's own area stays on-screen to count as ink.
    //
    // 2026-08-12 round 3: st0 flagged "move more towards corner" a THIRD
    // time despite that measured 0.09 fix landing clean. 0.09 was tuned to
    // avoid one specific spec regression, not to Ben's actual bar — pushed
    // to 0.20 (most of the -h*0.30 range this branch already allows) since
    // repeated identical feedback outweighs holding a spec number that was
    // itself just an ad-hoc balance point, not a hard requirement. Re-verify
    // after this and accept/document any new ink-share fallout rather than
    // re-capping blind — see this session's pair-bridge removal for the
    // precedent (Ben's repeated aesthetic call over spec text).
    if (!skipMinBleed) edgeEff = Math.min(edgeEff, -h * MIN_BLEED_FRAC)
  } else {
    // Same range-narrowing fix, lower band — not reported, but it's the
    // identical formula shape with the identical inflation issue (h
    // instead of eff for the bleed term), so left in place it's a
    // predictable twin bug, not a hypothetical one. No hard-floor clamp
    // added here: that needs `edgeEff + eff <= H + margin`, not the
    // simpler `edgeEff >= -margin` the upper branch uses — no measured
    // failing case to size and verify that against, so left as the
    // lower-risk range fix only rather than guessing the clamp.
    const minY = bot + margin - eff / 2, maxY = H - h * (1 - MAX_BLEED_FRAC)
    edgeEff = minY >= maxY ? minY : minY + (maxY - minY) * r()
  }
  return edgeEff + eff / 2 - h / 2
}

// 2026-08-12: factored out of the headline placement block in both
// world-07-ring.html and RingAmbient.jsx (identical inline formula, now one
// source) so makeOccluder's placement call site below can reuse it instead
// of drifting its own copy.
//
// Original formula (superseded, kept here as the record of what was wrong):
// `x0 + lerp(0.74,0.98,r())*(engine.W - w)` — a FRACTION of the box's own
// remaining travel room. That coupling is the bug: travel room shrinks as
// w grows, so the corner-push effect dilutes for exactly the objects that
// most need it. Measured directly on st0 (bbox-verified against Ben's
// fresh review): a 739px headline landed 277px (14% of frame width) from
// the right edge at the zone's own low end — nowhere near "hugs the
// corner." Replaced with a fixed pixel margin from the frame edge,
// independent of w: the object's OWN EDGE stays within [20,120]px of the
// corner regardless of how wide it is. That's what "hugs a corner" is
// actually about (edge distance to frame boundary), not centroid position.
//
// `cornerLeft` is a required, caller-decided boolean (not drawn internally,
// unlike bandY's optional forceUpper) — the occluder call site needs to
// know the headline's own corner choice so it can place itself at the
// opposite corner (Ben, st0: "needs to be on opposite corner of the big
// planet"), which only works if one shared decision feeds both call sites
// instead of each drawing its own independent coin flip.
function cornerX(engine, r, w, x0, cornerLeft) {
  // 2026-08-12 (fresh review, st4: "move towards corner more"; Ben's own
  // general framing: "things spaced apart into the corners is key").
  // Tightened 20-120px -> 8-50px — st4's own render at the old range's
  // high end still left visible daylight between the object and the true
  // corner. General tightening, not a st4-only special case, since Ben's
  // note wasn't scoped to one station.
  //
  // 2026-08-12 round 2 (Ben, st4 again: "more towards corner" — bbox-
  // measured: this seed drew 44px, near the old range's own high end,
  // still visible daylight). 8-50 -> 8-28: halves the ceiling so even a
  // high r() draw stays close, instead of only the low-r() draws looking
  // corner-hugged.
  //
  // 2026-08-12 round 3: st0/st2/st4/st11 all flagged "move more towards
  // corner" a third time on the same 8-28 range — same call as bandY's
  // matching round-3 tightening above: this was tuned to a measured
  // number, not to Ben's actual bar, and repeated identical feedback
  // wins. 8-28 -> 2-12.
  const margin = lerp(2, 12, r())
  return cornerLeft ? x0 + margin : x0 + engine.W - w - margin
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

// smoothEdgePath/closedSilhouettePath: quadratic-through-midpoint smoothing
// for a twin-edge (top+bottom) filled SVG silhouette. Factored out
// 2026-08-13 rather than hand-copied a second time — 'ribbon' originated
// this exact construction (see its own 2026-08-12 history below: "same
// quadratic-through-midpoint smoothing... a closed path with an
// independently-wavy TOP edge and BOTTOM edge"), 'streak' now needs the
// identical shape (two parallel edges, smoothed, filled) for its tapered
// comet tail. This file's own opening comment is built around exactly this
// failure class - two call sites hand-duplicating the same logic and
// drifting apart - so the second call site reuses the first's math instead
// of re-deriving it.
function smoothEdgePath(pts) {
  let dd = `M ${((pts[0].x + pts[1].x) / 2).toFixed(1)} ${((pts[0].y + pts[1].y) / 2).toFixed(1)}`
  for (let k = 1; k < pts.length; k++) {
    const p = pts[k], np = pts[k + 1] || pts[k]
    dd += ` Q ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${((p.x + np.x) / 2).toFixed(1)} ${((p.y + np.y) / 2).toFixed(1)}`
  }
  return dd
}
// topPts left-to-right, botPts already reversed (right-to-left) so the
// path closes without crossing itself.
function closedSilhouettePath(topPts, botPts) {
  return `${smoothEdgePath(topPts)} L ${botPts[0].x.toFixed(1)} ${botPts[0].y.toFixed(1)} ${smoothEdgePath(botPts).slice(1)} Z`
}

function makePrim(el, kind, w, h, hue, alpha, r, isHeadline, fill, variant) {
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
  // shared alpha-floor / lightness-boost helpers (rose/magenta and similar
  // hues are green-starved under Rec.709 luma at any alpha — the real lever
  // is lightness, fill-gated so a loud station isn't affected). Hoisted
  // here (was defined byte-identically inside both `blob` and
  // `nebulaCloud`, /simplify catching the duplication) so any future kind
  // needing the same treatment reuses this instead of copy-pasting again.
  const AB = (a, f2) => Math.max(a * 0.85, A(a, f2))
  const LB = (base) => Math.min(95, base + (1 - Math.min(1, fill)) * 26)
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
    // 2026-08-11 object-fix round (st6, rose nebula — both reviews FAIL/weak,
    // "dimmest object in the suite... collapses to nothing at distance"):
    // every alpha in this kind was pure A(x,fill) with no presence floor
    // (unlike drawPlanetDisc's silhouette or asteroidField's rock base,
    // which both have one) — at a quiet station's low fill value, alpha
    // shrinks linearly toward zero with nothing to hold it up. AB() adds a
    // floor at 55% of each term's own target alpha; only raises low-fill
    // stations, never lowers high-fill ones (st3's orange nebula, already
    // fine, is unaffected in practice since its own A(x,fill) already clears
    // the floor).
    // Second pass, after blind critique confirmed st6 was still "the
    // faintest hero... near-invisible at 20ft" post-fix: raised the alpha
    // floor multiplier 0.55->0.85. AB() is a max(), so this is still safe
    // at high fill — at fill=1, A(a,1) already exceeds a*0.85, so st3 is
    // unaffected by construction (re-verified via the gate below anyway).
    // (AB/LB themselves now hoisted to makePrim's own top scope — see there
    // for why — this comment block keeps the tuning history that led to
    // their specific constants.)
    // Measured on a real render (st6, hue=330): the alpha floor alone barely
    // moved anything visually — rose/magenta has inherently low luma
    // (0.2126R+0.7152G+0.0722B weights green heavily; magenta is green-
    // starved at any alpha) so the real lever is LIGHTNESS, not alpha.
    // FIRST attempt bumped lightness flat/unconditionally (62/46/30 ->
    // 76/60/42) — verified via the real gate this broke st3 (also `blob`,
    // already fine): p99.5 went 61->73, a NEW cap violation (68). Corrected
    // to fill-gated: boost scales with (1-fill), so a loud station (st3,
    // fill near 1) gets ~0 boost — cap violation confirmed gone on re-run,
    // not just assumed — while a quiet one (st6) still gets most of it.
    // Boost multiplier 16->26, same second pass.
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, domArea = -1, domLobe = null
    for (let i = 0; i < 3; i++) {
      const L = el('b-lobe')
      const lw = w * (0.62 + r() * 0.38), lh = h * (0.55 + r() * 0.45)
      const lx = (w - lw) * r(), ly = (h - lh) * r()
      L.style.left = px(lx); L.style.top = px(ly)
      L.style.width = px(lw); L.style.height = px(lh)
      // 2026-08-12 round 5: same hard-clip bug as l-disc/makeNebulaRing —
      // E(56,fill)/E(44,fill) can reach their 100-cap (at fill close to
      // 1), sizing the radius to the box's FULL dimension instead of its
      // half, clipping the outer fade before it renders. Halved, same fix.
      const lRadX = E(56, fill) / 2, lRadY = E(44, fill) / 2
      L.style.background = `radial-gradient(ellipse ${lRadX.toFixed(0)}% ${lRadY.toFixed(0)}% at ${40 + r() * 20}% 50%,
        ${hsla(hue, 72, LB(62), AB(0.42, fill))} 0%, ${hsla(hue - 8, 64, LB(46), AB(0.20, fill))} 40%,
        ${hsla(hue - 14, 56, LB(30), AB(0.07, fill))} 66%, transparent ${E(82, fill).toFixed(0)}%)`
      const rot = -30 + r() * 60
      L.style.transform = `rotate(${rot.toFixed(0)}deg)`
      f.appendChild(L)
      bx0 = Math.min(bx0, lx); by0 = Math.min(by0, ly)
      bx1 = Math.max(bx1, lx + lw); by1 = Math.max(by1, ly + lh)
      const area = lw * lh
      // domArea/domLobe: which lobe is visually biggest, used below to
      // merge the core into it at headline scale. Used to also drive a
      // rim-outline rotation, removed 2026-08-12 round 5 (Ben: rim can't
      // fade, always reads hard-edged) — the dominance tracking itself
      // stayed dead code until the fix below gave it a real job again.
      if (area > domArea) { domArea = area; domLobe = { node: L, lx, ly, lw, lh } }
    }
    // core: same w()/lerp() draws happen either way so the r() stream this
    // station's headline placement reads AFTER makePrim returns (corner/
    // band coin-flips, world-07-ring.html ~line 559) never silently
    // reshuffles based on which branch below runs — only what the draws
    // are USED for differs.
    const cs = w * (0.08 + r() * 0.06)
    const ccx = lerp(bx0, bx1, 0.3 + r() * 0.4), ccy = lerp(by0, by1, 0.3 + r() * 0.4)
    if (isHeadline) {
      // 2026-08-13 (Ben, repeated 2026-08-12 AND 2026-08-13: "still three
      // circles, only need one" / "three circles here, only need middle
      // one" — st3 orange nebula, the ONLY headline use of `blob`).
      // Tuning each circle individually (alpha floors, lightness boosts,
      // ring axes/offset — see this branch's own history above and
      // makeNebulaRing's) never fixed it because the defect was never any
      // one circle's parameters: `blob` drew its 3 lobes (the smudge)
      // PLUS a separate `s-core` div (its own hard circle, plus its own
      // box-shadow halo — a second, concentric soft circle around THAT)
      // PLUS the st3 call site layering makeNebulaRing's donut ring on
      // top — three to four independently-drawn circular elements no
      // amount of per-element tuning turns into one gestalt. Fix: no
      // separate core element at headline scale. The "hot knot" becomes
      // an EXTRA radial-gradient layer stacked onto the dominant lobe's
      // own `background` (CSS multi-background, comma-joined, first-
      // listed paints on top) — one continuously-painted shape, not a
      // second circle sitting on it. The ring donut is removed at its
      // call site instead of here (world-07-ring.html: `ring:true`
      // dropped from st3's station data) since it's a standalone
      // accessory a caller layers around blob, not part of makePrim
      // itself — see makeNebulaRing's own header comment.
      // Gated to isHeadline: `blob` is used elsewhere only as a small
      // 230-420px companion (no complaint on record there AT THE TIME —
      // superseded 2026-08-13, Ben's review marked st4's blob companion;
      // the else branch below now carries the same core-merge fix).
      const hx = Math.min(85, Math.max(15, (ccx - domLobe.lx) / domLobe.lw * 100))
      const hy = Math.min(85, Math.max(15, (ccy - domLobe.ly) / domLobe.lh * 100))
      const hRadX = Math.min(70, Math.max(18, (cs / domLobe.lw) * 100 * 1.4))
      const hRadY = Math.min(70, Math.max(18, (cs / domLobe.lh) * 100 * 1.4))
      domLobe.node.style.background = `radial-gradient(ellipse ${hRadX.toFixed(0)}% ${hRadY.toFixed(0)}% at ${hx.toFixed(0)}% ${hy.toFixed(0)}%,
        ${hsla(hue, 30, 96, AB(0.70, fill))} 0%, ${hsla(hue, 70, 80, AB(0.35, fill))} 40%, transparent 78%),
        ${domLobe.node.style.background}`
    } else {
      // 2026-08-13 (Ben's live review, st4 — bbox-verified to THIS
      // companion, not the station's planet headline: a marked "relook at"
      // on the bottom-right green smudge, which hit-tested as 3 .b-lobe +
      // this .s-core). The "no complaint on record there" note above is no
      // longer true: at companion scale the separate hard-edged s-core ball
      // (own div + its own box-shadow halo) reads as a stray bright pearl
      // sitting ON a smudge — the exact "circles + core, no gestalt" defect
      // the isHeadline branch above already fixed for st3. Same fix,
      // mirrored: the hot knot becomes an extra radial-gradient layer
      // stacked onto the dominant lobe's own background (one continuously-
      // painted shape), no separate element. Same cs/ccx/ccy draws as
      // before (r() stream untouched); knot alpha kept below the headline
      // version's (0.55 vs 0.70) — a companion is dressing, its core
      // shouldn't outshine its own cloud the way the old white ball did.
      const hx = Math.min(85, Math.max(15, (ccx - domLobe.lx) / domLobe.lw * 100))
      const hy = Math.min(85, Math.max(15, (ccy - domLobe.ly) / domLobe.lh * 100))
      const hRadX = Math.min(70, Math.max(18, (cs / domLobe.lw) * 100 * 1.4))
      const hRadY = Math.min(70, Math.max(18, (cs / domLobe.lh) * 100 * 1.4))
      domLobe.node.style.background = `radial-gradient(ellipse ${hRadX.toFixed(0)}% ${hRadY.toFixed(0)}% at ${hx.toFixed(0)}% ${hy.toFixed(0)}%,
        ${hsla(hue, 34, 92, AB(0.55, fill))} 0%, ${hsla(hue, 70, 78, AB(0.28, fill))} 45%, transparent 80%),
        ${domLobe.node.style.background}`
    }
    // rim (traced the lobe cluster's bbox as a border) removed outright
    // 2026-08-12 round 5 — a `border` is a solid CSS line, can't fade, so
    // its mere presence read as hard-edged regardless of gradient tuning.
    // Not reinstated here; unrelated to the three-circles fix above.
  }

  else if (kind === 'nebulaCloud') {
    // st6 rose nebula ONLY (see world-07-ring.html/RingAmbient.jsx station
    // wiring). A DISTINCT kind from `blob` on purpose, not a rewrite of it:
    // `blob` is shared with st3's orange nebula, fixed this same round by
    // adding a ring layer around the EXISTING blob construction (see
    // makeNebulaRing) and separately verified — rewriting `blob` itself
    // would re-open and re-risk that already-verified fix for a station
    // with an unrelated, already-closed complaint. Ben's review: "too much
    // going on" — this construction had already failed two prior tuning
    // rounds (see the alpha-floor/lightness-boost history on `blob` above,
    // both aimed at THIS station) as a parameter problem; the actual defect
    // was the recipe itself (3 same-shaped overlapping circles reads as
    // blobby chaos, not a cloud). Ben's fix direction at the time: "an
    // asymmetric single-path/multi-lobe silhouette with real internal
    // gradient variation (a dust-lane dark band, uneven lobe sizes)" —
    // attempted in full as construction #2 below and retired after three
    // failed render passes; the internal-variation half of that direction
    // (dark rift, uneven lobes, real density hierarchy) survives in
    // construction #3, the single-path half is what kept failing.
    // CONSTRUCTION HISTORY, kept so no retired recipe gets re-attempted:
    //  #1 (as `blob`): 3 same-size overlapping circles + core dot — Ben:
    //     "blobby chaos / too much going on." Retired.
    //  #2 (2026-08-12/13, three sub-passes): one irregular closed
    //     silhouette + clip-path, first hard-edged ("gem/guitar-pick" at
    //     N=8, then "torn paper scrap / spilled paint" at N=14), then
    //     blur-softened (adversarial critique: still "a large, flat,
    //     hard-edged lumpy purple mass"), then multi-knot fill + restored
    //     size + unclipped spill-puffs (better, but the clip boundary
    //     remained ONE continuous traceable curve — the final render read
    //     as a face-in-profile splat; Ben's live review the same day:
    //     "idk what this is" on the station). The structural lesson from
    //     all three: any single clip-path yields a single closed contour,
    //     and a single closed contour reads as an OBJECT cut-out, not gas
    //     — no edge treatment changes that.
    //  #3 (2026-08-13, this build): no clip-path at all. The mass is a
    //     hierarchy of soft elliptical gradient puffs along a randomly-
    //     angled spine — one dominant + shrinking flanks, each fading to
    //     true 0 alpha inside its own box — so the union's boundary is
    //     ragged and nowhere traceable as one curve. #1's real defect
    //     was never overlap itself but the LACK OF HIERARCHY (same size,
    //     same alpha, uniform random placement); this keeps overlap and
    //     fixes the hierarchy. Heart knot + spark keep AB()'s distance-
    //     presence floor (the "collapses to nothing at 20ft" history);
    //     fringe puffs use plain A() so they genuinely vanish outward.
    //     Dark rift crosses the middle as its own soft-edged rotated
    //     gradient (no clip needed — its edges are gradient-soft).
    // Rose/magenta luma lesson (AB/LB, hoisted at makePrim top scope)
    // still applies throughout — see `blob`'s comment for that history.
    const cx = w / 2, cy = h / 2
    const spineAng = r() * Math.PI // spine direction, 0..180deg
    const cosA = Math.cos(spineAng), sinA = Math.sin(spineAng)
    const spineX = w * 0.34, spineY = h * 0.30 // spine half-extent
    const spineDeg = spineAng * 180 / Math.PI
    // spine is ARCED, not straight (render check on the straight version:
    // a linear chain of spine-aligned puffs with a bright core reads as an
    // edge-on GALAXY — a noun collision with st1's spiral galaxy, which
    // the >=3-stations-apart silhouette-family rule exists to prevent).
    // The bend displaces each puff perpendicular to the spine by t^2, so
    // the mass bows like a cumulus bank instead of lining up.
    const arcSign = r() < 0.5 ? -1 : 1
    const arcK = h * (0.14 + r() * 0.10) * arcSign
    const NP = 6
    for (let i = 0; i < NP; i++) {
      const t = (i / (NP - 1)) * 2 - 1 // -1..1 along the spine
      const cen = 1 - Math.abs(t) // 1 at spine center, 0 at ends
      const pxc = cx + cosA * t * spineX - sinA * arcK * t * t / h * w * 0.5 + (r() - 0.5) * w * 0.13
      const pyc = cy + sinA * t * spineY + cosA * arcK * t * t + (r() - 0.5) * h * 0.17
      const pw = w * (0.24 + 0.30 * cen) * (0.85 + r() * 0.3)
      const ph = pw * (0.62 + r() * 0.30)
      const puff = el('')
      puff.style.position = 'absolute'
      puff.style.left = px(pxc - pw / 2); puff.style.top = px(pyc - ph / 2)
      puff.style.width = px(pw); puff.style.height = px(ph)
      puff.style.transform = `rotate(${(spineDeg - 55 + r() * 110).toFixed(0)}deg)`
      puff.style.background = `radial-gradient(ellipse 50% 50% at 50% 50%,
        ${hsla(hue - 4 + r() * 10, 60 + cen * 10, LB(38 + cen * 18), A(0.13 + cen * 0.13, fill))} 0%,
        ${hsla(hue - 10, 52, LB(30), A(0.06 + cen * 0.05, fill))} 55%, transparent 100%)`
      f.appendChild(puff)
    }
    // heart knot: compact bright ember region riding the spine slightly
    // off-center — the one piece that keeps AB()'s floor so the station
    // stays present at distance even with the fringes now truly fading.
    const heartT = -0.25 + r() * 0.5
    const heartX = cx + cosA * heartT * spineX, heartY = cy + sinA * heartT * spineY
    const hkW = w * 0.34, hkH = hkW * 0.62
    const heart = el('')
    heart.style.position = 'absolute'
    heart.style.left = px(heartX - hkW / 2); heart.style.top = px(heartY - hkH / 2)
    heart.style.width = px(hkW); heart.style.height = px(hkH)
    heart.style.transform = `rotate(${(spineDeg - 12 + r() * 24).toFixed(0)}deg)`
    heart.style.background = `radial-gradient(ellipse 50% 50% at 50% 50%,
      ${hsla(hue + 8, 76, LB(72), AB(0.50, fill))} 0%, ${hsla(hue, 66, LB(52), AB(0.24, fill))} 48%, transparent 100%)`
    f.appendChild(heart)
    // dark rift: soft-edged dark band crossing the mass near the heart at
    // an angle oblique to the spine — the internal structure Ben's
    // original fix direction named ("a dust-lane dark band"). A rotated
    // ellipse gradient, so its edges are inherently soft — the clipped
    // linear-gradient band this replaces needed the (now retired) stencil.
    const riftW = w * 0.52, riftH = w * 0.10
    const rift = el('')
    rift.style.position = 'absolute'
    rift.style.left = px(heartX - riftW / 2 + (r() - 0.5) * w * 0.08)
    rift.style.top = px(heartY - riftH / 2 + (r() - 0.5) * h * 0.10)
    rift.style.width = px(riftW); rift.style.height = px(riftH)
    rift.style.transform = `rotate(${(spineDeg + 20 + r() * 30).toFixed(0)}deg)`
    rift.style.background = `radial-gradient(ellipse 50% 50% at 50% 50%,
      ${hsla(hue - 22, 45, 8, A(0.42, fill))} 0%, ${hsla(hue - 22, 45, 8, A(0.22, fill))} 55%, transparent 100%)`
    f.appendChild(rift)
    // (2) THE BALL. Was near-white (L97, sat 30) fading straight to
    // TRANSPARENT at its own 100% stop, sized 7-11% of the headline's
    // width — large and colourless enough, against a now-softer but still
    // visually flat cloud, to read as a literal second circle stacked on
    // top ("fried egg," "white ball") instead of a glowing heart of the
    // nebula. Two changes, not one: shrunk to roughly half its prior size
    // (a spark, not a disc), and its own gradient stops now interpolate
    // THROUGH the cloud's own inner colour (hue,64,LB(46) — the same stop
    // `cloud`'s background already uses at its 42% ring) instead of
    // dropping straight to transparent — so the core's edge dissolves into
    // the surrounding cloud colour rather than leaving a sharp value/
    // saturation jump for the eye to read as a second boundary. Peak
    // lightness capped at 88 (not 97) with real hue saturation (55, not
    // 30) so it reads as a warm ember, not a colourless sphere. box-shadow
    // trimmed to match (smaller, dimmer) so it reads as bloom, not a halo
    // ring around a ball.
    const core = el('s-core')
    const cs = w * (0.035 + r() * 0.02)
    core.style.left = px(heartX - cs / 2)
    core.style.top = px(heartY - cs / 2)
    core.style.width = core.style.height = px(cs)
    core.style.background = `radial-gradient(circle, ${hsla(hue + 12, 55, LB(88), AB(0.80, fill))} 0%, ${hsla(hue + 6, 62, LB(68), AB(0.42, fill))} 50%, ${hsla(hue, 64, LB(46), AB(0.16, fill))} 100%)`
    core.style.boxShadow = `0 0 ${px(cs * 1.4)} ${px(cs * 0.4)} ${hsla(hue, 78, 72, AB(0.14, fill))}`
    f.appendChild(core)
    // 2026-08-12 (fresh review, st6: "add dust psrticlaes" [sic]). The dust
    // RIFT above is a dark band, not particles — this is a literal scatter
    // of small specks. Construction #3 has no clip path to inherit, so the
    // scatter is kept inside the visible mass by drawing each speck's
    // position along the spine itself (uniform t, perpendicular jitter)
    // instead of uniformly over the box and clipping the strays. Mostly
    // dark/cool (dust, not stars) with a few warm-lit ones catching the
    // core light, same "a few bright, most dim" bias every other
    // detail-tier scatter in this file already uses.
    const dust = el('')
    dust.style.position = 'absolute'; dust.style.inset = '0'
    const dn = 16 + Math.floor(r() * 14)
    for (let i = 0; i < dn; i++) {
      const dt = r() * 2 - 1 // -1..1 along the spine
      const dPerp = (r() - 0.5) * 2 // perpendicular spread
      const dx = cx + cosA * dt * spineX - sinA * dPerp * h * 0.16
      const dy = cy + sinA * dt * spineY + cosA * dPerp * h * 0.16
      const ds = w * (0.009 + r() * 0.013)
      const lit = r() < 0.25
      const p = el('')
      p.style.position = 'absolute'; p.style.borderRadius = '50%'
      p.style.left = px(dx - ds / 2); p.style.top = px(dy - ds / 2)
      p.style.width = p.style.height = px(ds)
      p.style.background = lit
        ? hsla(hue + 10, 50, 74, A(0.5 + r() * 0.3, fill))
        : hsla(hue - 25, 35, 10, A(0.35 + r() * 0.25, fill))
      dust.appendChild(p)
    }
    f.appendChild(dust)
  }

  else if (kind === 'dots') {
    // 2026-08-11 object-fix round (st2, star cluster — both blind reviews:
    // the real cluster idea "buried in a tiny speckle motif... never given
    // headline weight anywhere"). `dots` is shared between this headline use
    // and small ambient detail flecks (58-154px boxes elsewhere) — the fixed
    // 26-48 dot count read fine as a detail fleck but was sparse to the
    // point of invisibility spread across a 576-880px headline box, and
    // individually indistinguishable from the real ambient star field
    // (buildStars) behind it. isHeadline-gated boost: extra dots and a
    // stronger halo ONLY above w=300px, so detail-scale `dots` elsewhere are
    // completely unchanged (extra=0 below that size) — this is additive at
    // headline scale, not a global density change.
    // 2026-08-12 round 3 (Ben, st8: "need a star cluster here" — bbox
    // pointed at exactly where the binary pair's own companion already
    // sits: a `dots` cluster, just faint enough at companion scale to
    // read as empty space rather than a deliberate object). Companion
    // glow alpha nudged up (0.16/0.06 -> 0.22/0.09) so the cluster
    // registers regardless of which random draw lands.
    const g = el('d-glow')
    const glowA = isHeadline ? 0.30 : 0.22, glowA2 = isHeadline ? 0.13 : 0.09
    g.style.background = `radial-gradient(circle closest-side,
      ${hsla(hue, 58, 66, A(glowA, fill))} 0%, ${hsla(hue, 50, 52, A(glowA2, fill))} 48%, transparent ${E(76, fill).toFixed(0)}%)`
    f.appendChild(g)
    const extra = isHeadline ? Math.max(0, Math.round((w - 300) * 0.15)) : 0
    const n = 26 + Math.floor(r() * 22) + extra
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2
      // 2026-08-12 (Ben's review: "not anything" / "too chaotic" x2, still
      // failing after the 2026-08-11 density boost above): rendered
      // isolated and confirmed the real problem isn't count, it's
      // distribution. The old radius draw, Math.pow(r(), 0.55) with an
      // exponent BELOW 1, biases r() UPWARD (toward 1) before scaling by
      // the box radius — that pushes MORE dots toward the outer edge, the
      // literal opposite of "concentrated toward a center." isHeadline-
      // gated fix (detail-scale dots elsewhere untouched, same pattern as
      // `extra` above): exponent raised to 2.2 (>1, biases r() toward 0),
      // so most draws land near the middle with a real sparse falloff
      // outward — an actual center of mass instead of uniform scatter.
      const radExp = isHeadline ? 2.2 : 0.55
      const radMax = isHeadline ? 0.48 : 0.46
      const rad = Math.pow(r(), radExp) * radMax
      // size and brightness now fall off with distance from center too (at
      // headline scale only) — a handful of big bright anchor stars near
      // the middle, fading to small dim specks outward, instead of every
      // dot the same size regardless of position.
      const near = isHeadline ? Math.max(0, 1 - rad / radMax) : 0
      const s = isHeadline ? (1.6 + r() * 1.3) + near * near * 3.6 : 2.0 + r() * 3.4
      const d = el(''); d.style.position = 'absolute'; d.style.borderRadius = '50%'
      d.style.left = px((0.5 + Math.cos(a) * rad) * w)
      d.style.top = px((0.5 + Math.sin(a) * rad) * h)
      d.style.width = d.style.height = px(s)
      d.style.background = i % 4 ? '#ffffff' : hsla(hue, 70, 84, 1)
      d.style.opacity = (isHeadline ? Math.min(1, 0.42 + near * 0.58 + r() * 0.12) : 0.55 + r() * 0.45).toFixed(2)
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
    // 2026-08-12 (fresh review, st10, second/separate note: "too much
    // going on" — distinct from the corner-placement note handled
    // elsewhere). Rays already halved once this session ("lines need to
    // be shorter"); this is a second, later complaint on the same
    // station, so a further length trim risked chasing the same lever
    // twice for diminishing return. Cut ray count 6->4 instead — the
    // proven pattern this session already used for the identical
    // complaint at st5 (pulsar's sweep ring was cut outright, not
    // dimmed further, "too much going on is Ben's single most repeated
    // complaint," ringPrimitives.js's own pulsar comment).
    //
    // 2026-08-13 (fresh review, st10: "look at sun rays"; standing critique
    // on record: "8 clean spikes... slightly clip-arty"). Rendered fresh and
    // confirmed still true: each "ray" was a full-length CONSTANT-THICKNESS
    // bar through the center (4 bars = 8 symmetric tips at perfectly even
    // 45/22.5 angles), which is the anatomy of an asterisk dingbat, not
    // light. Three properties separate a real radiant burst from clip-art,
    // all three now built in: (1) TAPER — each ray is its own single-sided
    // arm, widest at the core, clipped to a point at the tip (same clip-path
    // move that fixed st5's "wtf is that" beam — alpha fade alone never
    // changes the silhouette); (2) UNEQUAL LENGTHS — one dominant opposing
    // pair plus shorter minors, like a diffraction flare, instead of
    // long/long/short/short symmetry; (3) BROKEN ANGULAR REGULARITY — hand-
    // authored irregular angles (slightly off 180° for the main pair). The
    // table is deliberately constants, not r() draws: this branch previously
    // consumed zero r() in the loop, and new draws here would silently
    // reshuffle the caller's own post-makePrim corner/band coin flips
    // (rHeadline stream) for whichever station uses `spikes` — the exact
    // stream-reorder bug class this file warns about at the `blob` core
    // draws. 7 single-sided arms vs the old 8 bar-tips: slightly FEWER
    // visible rays, each with less painted area, so this does not re-open
    // the "too much going on" complaint the 6->4 cut above addressed.
    // Round 2, same session, rendered-and-looked: the first table's 8°/192°
    // dominant pair sat only 4° off true opposition — near-collinear, so the
    // two longest rays fused into ONE straight line running through the
    // star, the exact "weird line" read Ben has flagged repeatedly on other
    // stations. Main pair now 8°/205° (25° off opposition — clearly two rays
    // from one source, not a rod through it), the second-longest minor
    // shortened to keep the hierarchy. Tip clip also fixed: the first
    // trapezoid (42%-58% at the tip) left a flat squared end — now a true
    // point. Bases thickened so the taper is actually visible at distance
    // instead of collapsing back into a uniform stick.
    ;[
      { ang: 8,   len: 0.46, th: 0.027 },
      { ang: 205, len: 0.34, th: 0.022 },
      { ang: 52,  len: 0.24, th: 0.016 },
      { ang: 118, len: 0.17, th: 0.013 },
      { ang: 240, len: 0.20, th: 0.014 },
      { ang: 305, len: 0.28, th: 0.017 },
      { ang: 158, len: 0.12, th: 0.012 },
    ].forEach(({ ang, len, th }) => {
      const s = el('s-spk')
      const L = w * len, T = Math.max(5, w * th)
      s.style.width = px(L); s.style.height = px(T)
      s.style.marginTop = px(-T / 2)
      s.style.transformOrigin = '0 50%' // pivot at the core end, not the bar's own center
      s.style.transform = `rotate(${ang}deg)`
      // widest at the core, sharp point at the tip — the actual ray shape
      s.style.clipPath = 'polygon(0% 0%, 100% 50%, 0% 100%)'
      // brightness peaks at the core end and dies before the geometric tip,
      // so the point reads as light fading, not a drawn stroke ending
      s.style.background = `linear-gradient(90deg, ${hsla(hue, 40, 92, 0.9)} 0%, ${hsla(hue, 82, 78, 0.5)} 38%, transparent 96%)`
      f.appendChild(s)
    })
    const c = el('s-core')
    const cs = Math.max(16, w * 0.055)
    c.style.width = c.style.height = px(cs)
    c.style.marginLeft = px(-cs / 2); c.style.marginTop = px(-cs / 2)
    c.style.boxShadow = `0 0 ${px(cs * 2.4)} ${px(cs * 0.8)} ${hsla(hue, 84, 74, A(0.55, fill))}`
    f.appendChild(c)
  }

  // 2026-08-13: reverted to the pre-redesign build (same-day) — the
  // continuous-ribbon rework fixed the discrete-bead "gumball caterpillar"
  // complaint but introduced a worse one: a hard diagonal clip-cut through
  // the arms near the core, reading as a corporate logo rather than a
  // galaxy. Ben, live on the real render: "so wrong... it was right"
  // before this redesign. Reverting rather than re-tuning the new
  // construction — the clip-cut is a real geometry defect (confirmed under
  // brightness boost, not a rendering artifact), not a parameter this
  // branch's own knobs can fix. Needs a fresh attempt, not a patch.
  else if (kind === 'lens') {
    // was a full inset:0 ellipse spanning the ENTIRE headline box - the
    // literal "flattened ellipse disc" this fix exists to move away from
    // (a fill-black test that treats any-nonzero-alpha as "on" turns a
    // full-box wash into one giant ellipse regardless of what's drawn on
    // top of it). Bounded to roughly the arm cluster's own footprint
    // instead, so it reads as a soft galactic bulge behind the arms, not
    // the dominant shape of the whole primitive.
    // 2026-08-11 object-fix round (st1, spiral galaxy — both blind reviews
    // FAIL, "no spiral structure, reads as a bead-chain smudge"): the bulge
    // was too faint (0.16/0.08 alpha) to read as a galactic core at all, so
    // the whole primitive collapsed to just its arm lobes — a chain of dots
    // with nothing for them to visibly wind AROUND. Doubled to make an
    // unmistakable bright centre.
    //
    // CORRECTION, same round, after the first blind-critique pass: the
    // brightness boost was NOT isHeadline-gated, so `lens` companions (this
    // kind is also used for other stations' companion element) got brighter
    // too — both critique agents independently flagged a "bead-chain" prop
    // now recurring as background dressing at st2/3/4/5, and specifically
    // that st1's own headline reads as indistinguishable from that dressing.
    // Gated to isHeadline: companions revert to the original, dimmer values;
    // only the actual headline (st1) gets the boost.
    const boost = isHeadline
    const d = el('l-disc')
    // 2026-08-12 (fresh review, st1: "looks worse than earlier, i want the
    // oval more blurry gradient dimmed"): dims the isHeadline boost back
    // down (0.32/0.16 -> 0.22/0.11 — a real reduction, not all the way back
    // to the pre-2026-08-11 0.16/0.08 that caused THAT round's separate
    // "reads as a bead-chain smudge" complaint, which was about the arms
    // losing a core to wind around, not about this gradient's brightness).
    // "More blurry" done as a softer, more gradual falloff (wider box, 0%/
    // 62%/100% stops instead of 0%/50%/80%) rather than a CSS blur filter —
    // this codebase avoids blur filters on primitives (buildStars' own
    // comment, FAILURE-LEDGER #14: a blur wider than ~1/4 of an element
    // deletes it outright).
    // 2026-08-12 round 2 (Ben, st1: "need to make the oval more blurry....
    // ie, dense in middle, then fades as get towards edge" — same request
    // as the prior round, still not landing). Prior fix widened the
    // falloff (0%/50%/80% -> 0%/62%/100%) but kept it a 2-stage plateau-
    // then-fade, which reads as fairly flat through the middle rather than
    // a clear bright peak. Adds a real peak (center alpha boosted further)
    // and a 3-stage curve (0%/38%/72%/100%) so the density visibly peaks
    // at the core and tapers continuously, instead of holding roughly flat
    // out to 62% and only then dropping.
    const dw = w * 0.85, dh = h * 0.85
    d.style.left = px(w * 0.5 - dw / 2); d.style.top = px(h * 0.5 - dh / 2)
    d.style.width = px(dw); d.style.height = px(dh)
    // 2026-08-12 round 5 (Ben, direct, repeated 5x: "there is no fade out
    // as you go further towards the edge... for the ones surrounding
    // assets" — DOM-measured on st0's companion: E(62,fill) reached its
    // 100-cap here, so the radius sized to the box's FULL width/height
    // instead of its half — the exact same makeNebulaRing hard-clip bug
    // fixed earlier tonight, never applied here because this is a
    // different gradient. Box edge landed at only 50% of the gradient's
    // own scale, clipping the 72%/100% fade stops entirely — the visible
    // edge shows whatever color sits at the 50% mark, cut off flat, no
    // fade ever rendering. Halved so the box edge lands at the
    // gradient's own 100% regardless of what E() returns.
    const dRadius = E(62, fill) / 2
    d.style.background = `radial-gradient(ellipse ${dRadius.toFixed(0)}% ${dRadius.toFixed(0)}% at 50% 50%,
      ${hsla(hue, 40, 46, A(boost ? 0.32 : 0.16, fill))} 0%, ${hsla(hue, 38, 40, A(boost ? 0.17 : 0.08, fill))} 38%,
      ${hsla(hue, 36, 32, A(boost ? 0.07 : 0.04, fill))} 72%, transparent 100%)`
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

    if (isHeadline) {
      // 2026-08-13, third construction for the st1 headline, built from BOTH
      // prior failures rather than re-attempting either:
      //  - discrete 10-lobe arms (the construction kept below for companions)
      //    read as "a caterpillar made of gumballs" — countable solid
      //    spheres, not a dust lane. Reverted-to, then re-flagged same day.
      //  - the 2026-08-13 continuous-ribbon rework (ec37ab3, reverted in
      //    7c0534a) fixed the beads but introduced a hard diagonal clip-cut
      //    near the core. Root cause, read from that commit's own code, not
      //    guessed: each arm's closed path ends in a straight cross-section
      //    edge at the CORE end (the `Z` closure), and its lengthwise
      //    gradient put PEAK alpha (up to 0.68) at the 0% stop right on that
      //    edge — a fully-bright straight vector edge, x4 nested layers x2
      //    arms = the "corporate logo" cut. The tip end had the identical
      //    straight closure but its 100% stop was alpha 0, which is exactly
      //    why the cut only ever showed near the core.
      // This version keeps what worked in the ribbon attempt (continuous
      // filled band, 4 nested feather layers, quadratic-smoothed edges) and
      // removes the defect structurally, two ways at once:
      //  1. band WIDTH tapers to ~0 at BOTH ends (sin-bump profile peaking
      //     ~40% along) — there is no cross-section edge left to see;
      //  2. the lengthwise gradient's 0% stop is TRANSPARENT (fade-in from
      //     the core, peak at ~24%, fade-out to the tip) — so userSpaceOnUse
      //     chord-projection clamping (any point projecting before x1,y1)
      //     clamps to invisible, never to bright. Arms now emerge from the
      //     bulge's glow the way real spiral arms do, instead of butting
      //     into the core at full brightness.
      // RNG parity: this branch consumes exactly the same number of r()
      // draws as the companion construction below (baseAng above; per arm:
      // maxRad, pitch, 10 jitter draws; rotation at the bottom of the kind)
      // — the ec37ab3 rework's own post-mortem measured that changing this
      // count relocates st1 and shifts every downstream r() consumer
      // (bleed moved 28%->45.8% purely from stream drift). Deliberately
      // matched so placement stays exactly where the current build puts it.
      const NS = 'http://www.w3.org/2000/svg'
      const svg = document.createElementNS(NS, 'svg')
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
      svg.style.position = 'absolute'; svg.style.inset = '0'
      svg.style.width = '100%'; svg.style.height = '100%'
      const defs = document.createElementNS(NS, 'defs')
      svg.appendChild(defs)
      const M = 26
      ;[0, Math.PI].forEach((phase, ai) => {
        const maxRad = w * (0.30 + r() * 0.08)
        const r0 = maxRad * 0.12
        const pitch = 1.15 + r() * 0.35 // ~140-182deg sweep/arm, same as companions
        // 10 draws, matching the companion loop's per-lobe ls draw count
        // exactly (see RNG parity note above). Two are used as wobble
        // phases; the rest exist only to keep the stream aligned.
        const jit = []
        for (let k = 0; k < 10; k++) jit.push(r())
        const pts = []
        for (let k = 0; k < M; k++) {
          const t = k / (M - 1)
          const rad = maxRad * (0.12 + 0.88 * Math.pow(t, 0.9))
          const ang = baseAng + phase + pitch * Math.log(rad / r0)
          pts.push({ x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad * (h / w), t })
        }
        const norm = pts.map((p, k) => {
          const p0 = pts[Math.max(0, k - 1)], p1 = pts[Math.min(M - 1, k + 1)]
          const tx = p1.x - p0.x, ty = p1.y - p0.y
          const tl = Math.hypot(tx, ty) || 1
          return { nx: -ty / tl, ny: tx / tl }
        })
        // one shared low-frequency undulation per arm (two soft bulges over
        // the whole length — the ribbon attempt already learned that
        // per-point jitter reads as a scalloped hard edge, not dust)
        const wobble = pts.map(p =>
          1 + 0.10 * Math.sin(p.t * 3.1 + jit[0] * 4) + 0.06 * Math.sin(p.t * 5.7 + jit[1] * 4))
        // width profile: zero at both ends, peak ~40% along. This is fix #1
        // — the closed path's two end "cross-sections" have ~zero width, so
        // the straight L/Z closures that cut the ec37ab3 version are
        // sub-pixel points here, structurally incapable of reading as edges.
        const hwMax = w * 0.055, hwMin = w * 0.006
        const prof = (t) => Math.pow(Math.max(0, t), 0.45) * Math.pow(Math.max(0, 1 - t), 0.62)
        const profPeak = prof(0.42)
        // 7-layer ramp instead of ec37ab3's 4: with lengthwise-only
        // gradients there is no cross-band falloff INSIDE a layer, so each
        // layer boundary is a crisp vector edge — at 4 layers the alpha
        // steps were big enough to read as concentric stripes (rendered and
        // seen, first pass of this rework: each arm read as a glossy
        // 4-band "swoosh"). More, closer layers shrink each step below
        // what reads as a boundary; total stacked center alpha kept in the
        // same ballpark, and the innermost layer stops short of the
        // near-white l0=86 the swoosh version peaked at.
        // (second render pass: 7 layers still showed fine contour striping
        // up close — every layer edge is a crisp vector boundary, so the
        // real requirement is that no single layer's alpha step exceeds
        // what the eye picks out as a line, ~0.05. 12 layers, each <=0.16
        // peak alpha, steps of ~0.01 between neighbours: brightness comes
        // from the stack, not any one layer.)
        const layers = []
        for (let li = 0; li < 12; li++) {
          const u = li / 11
          layers.push({
            frac: 1 - 0.90 * Math.pow(u, 0.9),
            aPk: 0.05 + 0.11 * Math.pow(u, 1.4),
            l0: 58 + 20 * u,
          })
        }
        layers.forEach(({ frac, aPk, l0 }, li) => {
          const outer = [], inner = []
          for (let k = 0; k < M; k++) {
            const hw = (hwMin + hwMax * prof(pts[k].t) / profPeak) * frac * wobble[k]
            const { nx, ny } = norm[k]
            outer.push({ x: pts[k].x + nx * hw, y: pts[k].y + ny * hw })
            inner.push({ x: pts[k].x - nx * hw, y: pts[k].y - ny * hw })
          }
          const d = closedSilhouettePath(outer, inner.slice().reverse())
          const gradId = `spiralArmGrad${occCounter++}`
          const grad = document.createElementNS(NS, 'linearGradient')
          grad.setAttribute('id', gradId)
          grad.setAttribute('gradientUnits', 'userSpaceOnUse')
          grad.setAttribute('x1', pts[0].x.toFixed(1)); grad.setAttribute('y1', pts[0].y.toFixed(1))
          grad.setAttribute('x2', pts[M - 1].x.toFixed(1)); grad.setAttribute('y2', pts[M - 1].y.toFixed(1))
          // fix #2: 0% stop is transparent. Chord-projection clamp regions
          // (anything before x1,y1 on the gradient axis — which for this
          // spiral is exactly the near-core region) render invisible.
          // (pass 6, rendered: peak at 24% left each arm's visible start too
          // far from center — two disconnected crescents with a dead gap
          // where the galaxy's middle should be. Peak moved to 10%: arms now
          // visibly emerge near the bulge. Still transparent AT 0%, so the
          // ec37ab3 clip-cut can't return — and the width taper already
          // makes the closure edge sub-pixel there regardless.)
          const stops = [
            [0, hsla(hue + ai * 6, 58 - li * 4, l0, 0)],
            [10, hsla(hue + ai * 6, 58 - li * 4, l0, A(aPk, fill))],
            [55, hsla(hue, 52, l0 - 10, A(aPk * 0.6, fill))],
            [100, hsla(hue, 46, l0 - 20, 0)],
          ]
          stops.forEach(([off, col]) => {
            const st = document.createElementNS(NS, 'stop')
            st.setAttribute('offset', `${off}%`); st.setAttribute('stop-color', col)
            grad.appendChild(st)
          })
          defs.appendChild(grad)
          const path = document.createElementNS(NS, 'path')
          path.setAttribute('d', d)
          path.setAttribute('fill', `url(#${gradId})`)
          svg.appendChild(path)
        })
      })
      f.appendChild(svg)
      // nucleus: a soft hot-center glow ABOVE the arms, small relative to
      // the bulge. Placed here (not an l-core element) after two rendered
      // failures with core discs — see the l-core comment below. The bulge
      // behind this spot is dim mid-teal, so a high-lightness monotonic
      // falloff can only brighten — no rim, no shaded-sphere read.
      const nuc = el('l-arm')
      const ns = w * 0.30
      nuc.style.width = nuc.style.height = px(ns)
      nuc.style.left = px(cx - ns / 2); nuc.style.top = px(cy - ns / 2)
      nuc.style.background = `radial-gradient(circle,
        #fff3e0 0%, ${hsla(hue, 55, 88, A(0.75, fill))} 12%,
        ${hsla(hue, 48, 70, A(0.28, fill))} 38%, transparent 68%)`
      f.appendChild(nuc)
    } else {
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
      // 2026-08-11, second pass: 6 -> 10 lobes. The touching-but-distinct
      // ratio (ARM_TARGET_RATIO, spec §6.2's cited 0.7-1.05 band) is NOT
      // being touched — that's a cited spec threshold, not mine to move.
      // But diameter is DERIVED from gap distance at that same ratio, so
      // packing more, smaller lobes into the same arc length shrinks both
      // lobe size and absolute gap together, reading as a smoother
      // continuous band at the SAME relative ratio — addressing "discrete
      // beads" (both blind critiques, independently) without moving the
      // number that band is defined by.
      const lobes = 10
      const maxRad = w * (0.30 + r() * 0.08)
      const r0 = maxRad * 0.12 // innermost lobe radius, ln() reference point
      // 2026-08-11 object-fix round: was 0.85+r()*0.25 (~103-134deg sweep) —
      // both arms combined never covered enough of a full turn to read as a
      // pinwheel, just a gentle bend (both blind reviews: "no spiral
      // structure"). Widened so each arm sweeps ~140-182deg — most of a full
      // half-turn — the two mirrored arms now visibly wind around the core
      // instead of reading as two short dot-chains.
      const pitch = 1.15 + r() * 0.35 // ln(maxRad/r0) ~= 2.12 -> ~140-182deg sweep/arm
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
        // 2026-08-11: base alpha 0.42/0.16 -> 0.60/0.28 — arm lobes were too
        // faint against the (now brighter) bulge and the space background,
        // part of why the whole primitive read as a flat smudge. isHeadline-
        // gated (see `boost` above) so companions keep the original values.
        //
        // 2026-08-12 round 3: tried steepening this same falloff + a small
        // per-lobe blur here, aimed at "spirals need to blur towards their
        // edges." Reverted (round 4) — Ben clarified what he actually meant
        // was the RING/HALO bands around objects (drawPlanetDisc's glow,
        // makeNebulaRing) jumping straight to full brightness instead of
        // ramping up, not these individual bead-dots. See makeNebulaRing
        // and drawPlanetDisc's own comments for the fix that actually
        // targets what he described.
        const loA = boost ? 0.60 - t * 0.20 : 0.42 - t * 0.20
        const loA2 = boost ? 0.28 - t * 0.08 : 0.16 - t * 0.08
        lobe.style.background = `radial-gradient(circle,
          ${hsla(hue + ai * 6, 62 - t * 10, 72 - t * 16, A(loA, fill))} 0%,
          ${hsla(hue, 52, 46, A(loA2, fill))} 55%, transparent ${E(82, fill).toFixed(0)}%)`
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
    } // end companion-only discrete-lobe construction
    // 2026-08-11: size 0.036->0.052, glow alpha 0.45->0.75 — the nucleus
    // the arms wind around needs to read as unmistakably the brightest
    // point in the primitive, not a faint dot lost among the arm lobes.
    // isHeadline-gated, same as the rest of this kind's boost.
    // 2026-08-13 headline rework: NO separate l-core element on the
    // headline. Rendered and seen, two failed variants in this session
    // alone: the shared .l-core class is a SOLID #fff6e6 disc (reads as a
    // hard-edged pearl — the one surviving gumball of the old bead
    // construction), and a semi-transparent radial replacement composited
    // DARKER than the bulge's own bright center behind it, reading as a
    // shaded sphere with a rim. The bulge (l-disc, tuned across three
    // 2026-08-12 rounds to peak dense-in-middle) already supplies a bright
    // nucleus at the exact same spot — a galaxy's core is a glow, and the
    // glow is already there. Companions keep their small solid core.
    if (!boost) {
      const c = el('l-core')
      const cs = Math.max(14, w * 0.036)
      c.style.width = c.style.height = px(cs)
      c.style.marginLeft = px(-cs / 2); c.style.marginTop = px(-cs / 2)
      c.style.boxShadow = `0 0 ${px(cs * 2.6)} ${px(cs * 0.7)} ${hsla(hue, 70, 80, A(0.45, fill))}`
      f.appendChild(c)
    }
    f.style.transform = `rotate(${(-30 + r() * 24).toFixed(0)}deg)`
  }

  else if (kind === 'streak') {
    // 2026-08-13 (fresh customer-role critique: "a circle on a straight
    // stick — a lollipop or a thermometer"). Root cause, confirmed by
    // rendering before touching anything: the old `.k-tail` was a single
    // <div>, fixed 100% width x constant `tailH` height — ONLY its
    // background-gradient opacity varied along the length, the actual box
    // silhouette a viewer's eye tracks was a uniform-width rounded bar
    // (`.k-tail`'s own `border-radius:999px`) the whole way, which is
    // exactly the stick/thermometer shape being described. A real comet
    // tail's WIDTH tapers, not just its brightness — rebuilt as a filled SVG
    // silhouette (shares `closedSilhouettePath`/`smoothEdgePath` with
    // 'ribbon' above, module scope) whose two edges both narrow toward the
    // far end, plus small per-point width noise (this file's own seeded
    // `r()`, never Math.random — see ring-verify's math-random check) so the
    // edge reads as a wispy dust trail rather than a geometrically perfect
    // wedge. Opacity still fades along the same axis via the gradient fill,
    // same stops as the old background-gradient — width and brightness now
    // taper together instead of only the latter.
    // 2026-08-13 round 2 (Ben: st7 "doesn't have a major asset — make them
    // bigger/more prominent, redesign like st3"). Rendered first: the head
    // sat at the box's own right edge (.k-head right:-4px) and cornerX
    // parks that edge 2-12px from the FRAME edge — half the head and most
    // of its glow were literally cropped off-frame; the tail read as one
    // faint straight line. Three real changes, not a size multiplier:
    //  - head/coma pulled fully INSIDE the box (headCx inset by its own
    //    diameter) so the brightest element is never amputated by the
    //    corner-hugging placement every headline shares.
    //  - dust tail widened + brightened and given a gentle droop curve
    //    (a dead-straight wedge was half of what read as a stick), and a
    //    second thinner ION tail added, diverging upward from the same
    //    head — the two-diverging-tails silhouette is THE comet signature
    //    and no single-streak recipe can produce it. Both tails reuse the
    //    same closedSilhouettePath machinery this branch already
    //    validated today.
    //  - coma layered (outer envelope + inner bright coma, swept slightly
    //    tailward) instead of one flat radial.
    const N = 8
    const tailH = Math.max(6, h * 0.20 * EXTENT_GAIN * fill)
    const tipH = Math.max(1.5, tailH * 0.14)
    const hs = Math.max(20, h * 0.36)
    const headCx = w - hs * 1.15
    const tailEnd = headCx - hs * 0.1
    // t in [0,1]: 0 = far end (thin), 1 = head end (thick). Power >1 keeps
    // most of the length narrow, flaring only near the coma.
    const halfW = (tt) => (tipH + (tailH - tipH) * Math.pow(tt, 1.7)) / 2
    // dust-tail centerline droops toward the far end (real dust tails arc
    // away from the orbit line).
    const yc = (tt) => h / 2 + Math.pow(1 - tt, 2) * h * 0.12
    const topPts = [], botPtsFwd = []
    for (let k = 0; k <= N; k++) {
      const tt = k / N, x = tt * tailEnd, hw2 = halfW(tt)
      // noise scales with local half-width so the thin far tip doesn't
      // jitter wider than its own body; top/bottom drawn independently so
      // the band's thickness itself wobbles a little too.
      const jTop = (r() - 0.5) * hw2 * 0.7
      const jBot = (r() - 0.5) * hw2 * 0.7
      topPts.push({ x, y: yc(tt) - hw2 + jTop })
      botPtsFwd.push({ x, y: yc(tt) + hw2 + jBot })
    }
    const d = closedSilhouettePath(topPts, botPtsFwd.slice().reverse())
    const NS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    svg.style.position = 'absolute'; svg.style.inset = '0'
    svg.style.width = '100%'; svg.style.height = '100%'
    const defs = document.createElementNS(NS, 'defs')
    const mkGrad = (stops) => {
      const gid = `cometTailGrad${occCounter++}`
      const grad = document.createElementNS(NS, 'linearGradient')
      grad.setAttribute('id', gid)
      grad.setAttribute('gradientUnits', 'userSpaceOnUse')
      grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0')
      grad.setAttribute('x2', String(tailEnd)); grad.setAttribute('y2', '0')
      stops.forEach(([off, color]) => {
        const stop = document.createElementNS(NS, 'stop')
        stop.setAttribute('offset', `${off}%`)
        stop.setAttribute('stop-color', color)
        grad.appendChild(stop)
      })
      defs.appendChild(grad)
      return gid
    }
    const dustGrad = mkGrad([[0, 'transparent'], [18, hsla(hue, 60, 70, A(0.14, fill))],
      [70, hsla(hue, 66, 78, A(0.48, fill))], [100, hsla(hue, 70, 90, A(0.80, fill))]])
    // ion tail: thinner, straighter, bluer, lower alpha.
    const ionH = Math.max(3, tailH * 0.38)
    const ionTip = Math.max(1, ionH * 0.2)
    const ionHalf = (tt) => (ionTip + (ionH - ionTip) * Math.pow(tt, 1.5)) / 2
    const yIon = (tt) => h / 2 - (1 - tt) * h * 0.15
    const iTop = [], iBotFwd = []
    for (let k = 0; k <= N; k++) {
      const tt = k / N, x = tt * tailEnd, hw2 = ionHalf(tt)
      const j = (r() - 0.5) * hw2 * 0.5
      iTop.push({ x, y: yIon(tt) - hw2 + j })
      iBotFwd.push({ x, y: yIon(tt) + hw2 + j })
    }
    const ionGrad = mkGrad([[0, 'transparent'], [22, hsla(hue + 12, 70, 76, A(0.08, fill))],
      [75, hsla(hue + 12, 74, 82, A(0.24, fill))], [100, hsla(hue + 12, 78, 90, A(0.46, fill))]])
    svg.appendChild(defs)
    const mkTail = (pathD, gid) => {
      const p = document.createElementNS(NS, 'path')
      p.setAttribute('d', pathD)
      p.setAttribute('fill', `url(#${gid})`)
      svg.appendChild(p)
    }
    mkTail(d, dustGrad)
    mkTail(closedSilhouettePath(iTop, iBotFwd.slice().reverse()), ionGrad)
    // soft blur: masks the smoother's own segment joints and reads as a
    // diffuse dust trail rather than a crisp cut silhouette — same
    // treatment 'ribbon' already uses on its curtain path.
    svg.style.filter = `blur(${Math.max(2, tailH * 0.10).toFixed(1)}px)`
    f.appendChild(svg)
    // coma, two layers: a wide soft envelope plus an inner bright coma
    // swept slightly tailward — marks this as a comet, not a point-source
    // shooting star.
    const comaW = h * 0.95
    const coma = el('d-glow')
    coma.style.left = px(headCx - comaW / 2); coma.style.top = '0'; coma.style.width = px(comaW); coma.style.height = '100%'
    coma.style.background = `radial-gradient(circle, ${hsla(hue, 70, 85, A(0.35, fill))} 0%, transparent ${E(72, fill).toFixed(0)}%)`
    f.appendChild(coma)
    const innerD = h * 0.5
    const inner = el('d-glow')
    inner.style.left = px(headCx - hs * 0.18 - innerD / 2); inner.style.top = px(h / 2 - innerD / 2)
    inner.style.width = inner.style.height = px(innerD)
    inner.style.background = `radial-gradient(circle, ${hsla(hue, 68, 88, A(0.55, fill))} 0%, transparent ${E(70, fill).toFixed(0)}%)`
    f.appendChild(inner)
    const hd = el('k-head')
    hd.style.left = px(headCx - hs / 2); hd.style.right = 'auto'
    hd.style.width = hd.style.height = px(hs); hd.style.marginTop = px(-hs / 2)
    // was a flat #f2fbff disc + one giant box-shadow. Both failed on
    // render at the new size: the flat fill read as a matte moon, not a
    // glowing nucleus, and Chromium paints a ~250px-blur box-shadow as a
    // visible HARD-EDGED SQUARE (isolated by hiding .k-head — the square
    // vanished with it). Nucleus is a hot-core radial gradient now; the
    // wide soft glow lives in the coma gradient divs above — the
    // technique every other primitive in this file already uses.
    hd.style.background = `radial-gradient(circle, #ffffff 0%, #eaf5ff 34%, ${hsla(hue, 70, 86, A(0.75, fill))} 62%, transparent 100%)`
    hd.style.boxShadow = `0 0 ${px(hs * 0.9)} ${px(hs * 0.18)} ${hsla(hue, 72, 82, A(0.55, fill))}`
    // 2026-08-13 live review (Ben, st7: "put holes in it like a moon") —
    // crater pockmarks on the nucleus. Each crater is a soft radial divot:
    // a darker off-center core (offset toward upper-left, a consistent
    // fake-relief light direction across all craters — uniform-random
    // shading would read as dirt smudges, not depth) fading out before its
    // own edge, plus for the larger craters a faint bright rim arc on the
    // opposite side. Alphas kept low and every divot placed within the
    // inner ~62% of the head's radius, where its gradient is still bright
    // — so at distance the head stays a glowing ball and the craters read
    // as surface mottling, not as dimming the core (per the same "bright
    // at distance, textured up close" balance the task named).
    // (first render: center-biased placement piled the divots into one
    // connected beige clump on the hot core — read as a smudge, and dulled
    // the nucleus's brightest point. Annulus placement instead: nothing in
    // the innermost ~14% radius, so the white-hot center stays clean, plus
    // a min-distance skip so craters read as separate pocks, not a blob.)
    const nCr = 6 + Math.floor(r() * 3)
    const placed = []
    for (let ci = 0; ci < nCr; ci++) {
      const ca = r() * Math.PI * 2
      const cdist = hs * (0.14 + Math.pow(r(), 0.8) * 0.28)
      const crR = hs * (0.06 + r() * 0.10)
      const crx = hs / 2 + Math.cos(ca) * cdist, cry = hs / 2 + Math.sin(ca) * cdist
      if (placed.some(pp => Math.hypot(pp.x - crx, pp.y - cry) < (pp.r + crR) * 0.8)) continue
      placed.push({ x: crx, y: cry, r: crR })
      const cr = el('')
      cr.style.position = 'absolute'; cr.style.borderRadius = '50%'
      cr.style.left = px(crx - crR); cr.style.top = px(cry - crR)
      cr.style.width = cr.style.height = px(crR * 2)
      const rim = crR > hs * 0.10
        ? `, radial-gradient(circle at 62% 64%, transparent 42%, rgba(255,255,255,${(0.10 + r() * 0.06).toFixed(2)}) 58%, transparent 74%)`
        : ''
      cr.style.background = `radial-gradient(circle at 42% 38%, ${hsla(hue, 24, 42, A(0.38, fill))} 0%, ${hsla(hue, 26, 54, A(0.20, fill))} 48%, transparent 72%)${rim}`
      hd.appendChild(cr)
    }
    f.appendChild(hd)
    // 2026-08-11: rotation range -26..-10deg -> -12..-4deg. .k-head sits at
    // this box's right edge (top:50% unrotated); for a shallow wide box
    // (hh=hw*0.30) a -26deg tilt swings the head ~126-193px above the box's
    // own vertical center, which bandY's own crop allowance (up to 30% of
    // effective height, by design, for the spec's bleed requirement) could
    // then legitimately push off the top edge — confirmed on today's
    // render, the actual defect Fable-5 flagged. Halving the tilt range
    // roughly halves that displacement without losing the streaked-comet
    // read.
    f.style.transform = `rotate(${(-12 + r() * 8).toFixed(0)}deg)`
  }

  else if (kind === 'ribbon') {
    // 2026-08-11 object-fix round (st11, aurora ribbon — FAIL both blind
    // reviews: "a flat horizontal oval/smear does not read as an aurora
    // specifically — an aurora reads through an undulating wave/curtain
    // contour, which this has none of"). Real redesign #1: separate body
    // segments strung along a sine wave + a curved stroke line.
    //
    // 2026-08-12, Ben's own review, still failing: "good idea but needs to
    // be diff" — rendered and confirmed the segments-on-a-string read as
    // scattered blobs and the stroke line read as a scribble/wind line, not
    // a curtain — thin STROKES (a 1-D line, wherever it's drawn) can't
    // become a 2-D curtain no matter how the segments are arranged; the
    // wave needs to be the outline of a filled SHAPE, not a line traced
    // through or over one. Real reconstruction #2, single filled silhouette
    // this time: a closed path with an independently-wavy TOP edge and
    // BOTTOM edge (same wave, phase-shifted and damped on the bottom edge
    // so the band's width breathes rather than staying constant), same
    // quadratic-through-midpoint smoothing `nebulaCloud`/the old stroke
    // already use. Filled with a vertical linear-gradient — bright/saturate
    // at the top edge, feathering to transparent below — the standard
    // aurora-curtain construction (light hangs down from the top, not
    // radiating from a center point the way every other primitive's glow
    // does). `clip-path: path(...)` is not used here (unlike
    // `nebulaCloud`) because the gradient only needs to run along one
    // global axis (top-to-bottom), not follow an arbitrary silhouette
    // interior — a plain filled SVG path with a single background gradient
    // does the whole job in one element.
    const NS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    svg.style.position = 'absolute'; svg.style.inset = '0'
    svg.style.width = '100%'; svg.style.height = '100%'
    const N = 10, waveAmp = h * 0.16, waveCycles = 1.4
    const topY = (t) => h * 0.30 + Math.sin(t * Math.PI * 2 * waveCycles) * waveAmp
    const botY = (t) => h * 0.30 + h * (0.42 + 0.10 * Math.sin(t * Math.PI * 2 * waveCycles * 0.7 + 1.1))
      + Math.sin(t * Math.PI * 2 * waveCycles + 0.6) * waveAmp * 0.7
    const topPts = Array.from({ length: N + 1 }, (_, k) => ({ x: (k / N) * w, y: topY(k / N) }))
    const botPts = Array.from({ length: N + 1 }, (_, k) => ({ x: (k / N) * w, y: botY(k / N) })).reverse()
    // shared with 'streak' below — see smoothEdgePath/closedSilhouettePath's
    // own comment, module scope, above makePrim.
    const d = closedSilhouettePath(topPts, botPts)
    // gradientTransform / userSpaceOnUse so the gradient runs top-to-bottom
    // of the whole box regardless of the path's own local wavy bounds —
    // objectBoundingBox (the default) would stretch it to the path's own
    // tight bbox, which isn't what "hangs from the top" should mean here.
    const gradId = `auroraGrad${occCounter++}`
    const defs = document.createElementNS(NS, 'defs')
    const grad = document.createElementNS(NS, 'linearGradient')
    grad.setAttribute('id', gradId)
    grad.setAttribute('gradientUnits', 'userSpaceOnUse')
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0')
    grad.setAttribute('x2', '0'); grad.setAttribute('y2', String(h))
    const stops = [
      [0, hsla(hue + 14, 68, 66, A(0.55, fill))],
      [30, hsla(hue, 62, 54, A(0.42, fill))],
      [65, hsla(hue - 20, 50, 42, A(0.20, fill))],
      [100, hsla(hue - 20, 50, 30, 0)],
    ]
    stops.forEach(([off, color]) => {
      const stop = document.createElementNS(NS, 'stop')
      stop.setAttribute('offset', `${off}%`)
      stop.setAttribute('stop-color', color)
      grad.appendChild(stop)
    })
    defs.appendChild(grad)
    svg.appendChild(defs)
    const curtain = document.createElementNS(NS, 'path')
    curtain.setAttribute('d', d)
    curtain.setAttribute('fill', `url(#${gradId})`)
    // A filled SVG path has a crisp geometric edge everywhere the fill
    // gradient hasn't already faded to zero — rendered and confirmed the
    // bottom edge (wavy but still a hard boundary) read as a sharp cutoff
    // rather than "feathered," since the gradient's own fade-to-transparent
    // zone didn't fully complete before the shape's actual bottom boundary.
    // A soft blur on the whole path is the simpler, more robust fix than
    // hand-tuning gradient stops to chase a wavy per-column edge — also
    // brings this primitive in line with every other one in this file,
    // none of which use a crisp hard-edged fill.
    svg.style.filter = `blur(${Math.max(5, w * 0.012).toFixed(1)}px)`
    svg.appendChild(curtain)
    // An internal brighter "streak" accent (a rectangular div, independent
    // of the curtain's own wavy clip and blur) was tried here and removed
    // same-day: rendered and it showed up as a visible hard-edged rectangle
    // breaking the curtain's smooth gradient — a real, confirmed defect,
    // not a matter of taste. The curtain shape alone already reads as an
    // aurora; re-attempt internal ray texture later by clipping to the same
    // `d` path (`clip-path: path(...)`, the technique `nebulaCloud` already
    // uses for its dust lane) rather than a freestanding rectangle.
    f.appendChild(svg)
    f.style.transform = `rotate(${(-10 + r() * 20).toFixed(0)}deg)`
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
    // 2026-08-12: an earlier version of this fix tried to widen rx to
    // 1.34*bodySize so the ring's near-vertical reach (ry) would exceed the
    // body's own radius. REVERTED — caught by an adversarial render review
    // (Fable-5), confirmed by re-deriving the arithmetic by hand: (1) that
    // rx hard-clipped against this function's own SVG box (viewBox 0 0 w h,
    // no margin) — the arc's true unclipped endpoints landed outside the
    // box and got cut into dangling ends that never closed the ellipse, a
    // real regression, not a matter of taste. (2) The clearance goal itself
    // was geometrically impossible to hit inside this box at this body
    // size: ry>bodyRadius requires rx > 0.8125*min(w,h), but the box only
    // has room for rx <= ~0.48*min(w,h) before clipping — no rx value
    // satisfies both. (3) The premise was likely wrong anyway: a real
    // shallow-tilt Saturn-ring image DOES show the ring's near-vertical
    // extent passing behind/through the planet's silhouette — that's
    // correct perspective, not a defect the front/back-half split (below)
    // already exists to sell. Net change kept small and box-safe: rx nudged
    // 0.98->1.08*bodySize (clamped so cx+rx never exceeds the box) for a
    // slightly more open major-axis gap, without the false clearance claim.
    // variant === 'dust' (2026-08-13, st3 — Ben: "that saturn like planet
    // needs a reworking... take inspiration from the other planets that
    // weve already shipped"): st3's old blob+makeNebulaRing construction
    // never survived a critique pass (three-circles / coffee-stain — see
    // the `blob` isHeadline comment and makeNebulaRing's header). Rebuilt
    // on THIS branch's already-accepted anatomy instead (drawPlanetDisc
    // body + back/front ring halves), differing only in ring treatment so
    // st0 and st3 don't read as the same object 3 stations apart: st0
    // keeps its thin crisp stroke; dust gets a WIDE soft gold band
    // (makeNebulaRing's own approved gold tint, hue+14) with a slight
    // blur — Saturn's rings as a dust sheet, not a wire. Gated on a new
    // trailing `variant` param (station-data flag, same dispatch pattern
    // as `accent`/`greenWash`); every existing call site passes nothing,
    // so st0 renders byte-identical by construction.
    const dust = variant === 'dust'
    const rx = Math.min(bodySize * (dust ? 1.22 : 1.08), w / 2 - 4), ry = rx * 0.32
    const tilt = -10
    const NS = 'http://www.w3.org/2000/svg'
    const ringHalf = (sweepFlag, isBack) => {
      const svg = document.createElementNS(NS, 'svg')
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
      svg.style.position = 'absolute'; svg.style.inset = '0'
      svg.style.width = '100%'; svg.style.height = '100%'
      const arc = (arx, ary) => {
        const p = document.createElementNS(NS, 'path')
        p.setAttribute('d', `M ${(cx - arx).toFixed(1)},${cy.toFixed(1)} A ${arx.toFixed(1)},${ary.toFixed(1)} 0 0,${sweepFlag} ${(cx + arx).toFixed(1)},${cy.toFixed(1)}`)
        p.setAttribute('fill', 'none')
        p.setAttribute('transform', `rotate(${tilt} ${cx.toFixed(1)} ${cy.toFixed(1)})`)
        return p
      }
      // back half dimmer (it's behind the lit body, in its own shadow-side
      // read) and thinner; front half is the bright, full-width edge.
      if (dust) {
        // two concentric arcs per half: a wide faint sheet plus a narrower
        // brighter band inside it — Saturn's rings read as banded, and one
        // uniform blurred tube read flat on a real render (v1, 2026-08-13).
        const sheet = arc(rx, ry)
        sheet.setAttribute('stroke', hsla(hue + 14, 70, isBack ? 58 : 68, A(isBack ? 0.20 : 0.36, fill)))
        sheet.setAttribute('stroke-width', px(Math.max(3, w * (isBack ? 0.040 : 0.048))))
        svg.appendChild(sheet)
        const band = arc(rx * 0.90, ry * 0.90)
        band.setAttribute('stroke', hsla(hue + 18, 74, isBack ? 62 : 74, A(isBack ? 0.26 : 0.48, fill)))
        band.setAttribute('stroke-width', px(Math.max(2, w * (isBack ? 0.012 : 0.016))))
        svg.appendChild(band)
        // blur softens the band's edges into a gas sheet; ~1% of the box,
        // nowhere near the ledger's "blur wider than 1/4 of an element
        // deletes it" caution (that was small stars).
        svg.style.filter = `blur(${Math.max(3, w * 0.010).toFixed(1)}px)`
      } else {
        const path = arc(rx, ry)
        path.setAttribute('stroke', hsla(hue, 65, isBack ? 55 : 78, A(isBack ? 0.30 : 0.55, fill)))
        path.setAttribute('stroke-width', px(Math.max(3, w * (isBack ? 0.010 : 0.016))))
        svg.appendChild(path)
      }
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
    // 2026-08-11 object-fix round (st8 — DIVERGED, Fable-5's harsher FAIL:
    // "visually identical to generic background stars... no visual cue that
    // reads as a pair specifically"). Size ratio widened 0.62/0.40 (1.55x)
    // -> 0.68/0.32 (2.1x) for a clearer big/small read, and a connecting
    // line added below (the halo alone, at 0.20 alpha, wasn't enough of a
    // cue). A straight connecting line, not an elliptical orbit — `ring`
    // already owns the elliptical-orbit anatomy (spec §6.2: two distinct
    // nouns must not share one), so this stays a different shape family.
    const sizes = [0.68, 0.32] // two unequal bodies, not two identical dots
    // 2026-08-12 (round 2, Ben, st8: "can we adjust the angle between the
    // two planets to of kilter a bit" — bbox-measured: both bodies sat at
    // the same y, a level horizontal pair). Tilted off-axis instead of
    // dead-level — real binaries orbit a common barycenter on an
    // inclined plane, not a perfectly flat line.
    // 2026-08-13 round 2 (Ben: st8 "doesn't have a major asset — make them
    // bigger/more prominent, redesign like st3"). Earlier cold critique
    // called this the emptiest station in the ring. Three prior tuning
    // rounds (size ratio, tilt, bridge added/removed) never satisfied the
    // complaint — the ceiling was the SCALE and the shared-light cue, not
    // the anatomy. Body diameter multiplier doubled (0.22 -> 0.44 of box
    // width: primary now planet-tier, ~0.30w, matching the scale st0/st4's
    // shipped headline bodies actually occupy), positions spread slightly
    // to keep clear separation at the new size, and the shared halo
    // changed from a small circle to an ELLIPSE elongated along the pair's
    // own tilt axis — a shared envelope of light around both stars, the
    // pairing cue the deleted bridge was never able to be (soft light, not
    // a mechanical rod).
    const positions = [[0.34, 0.42], [0.68, 0.60]]
    // 2026-08-12 (Ben's own review: "looks off" — rendered and confirmed:
    // the connecting bridge, even softened to a blurred 6px bar, still
    // reads as a rigid rod joining two circles — a dumbbell/barbell, not a
    // star system. Deleted entirely, per Ben's explicit fix direction: two
    // unequal stars with real per-star hue variance, sharing one
    // overlapping glow, reads as "a pair" through proximity and shared
    // light — no visible mechanical link needed. This drops the two prior
    // rounds' "connecting line" premise altogether rather than softening
    // it a third time.
    // halo scoped to the two dots' own span (not .d-glow's inset:0 default,
    // which fills the entire headline box) - unsized it merged the two dots
    // and their oversized halo into one solid oval on a real render, reading
    // as another blob rather than a distinct binary-pair silhouette. Alpha
    // raised (0.20->0.28) now that it's the ONLY shared-light pairing cue —
    // it has to carry what the bridge used to help carry.
    const halo = el('d-glow')
    const midX = (positions[0][0] + positions[1][0]) / 2 * w
    const midY = (positions[0][1] + positions[1][1]) / 2 * h
    const axDeg = Math.atan2((positions[1][1] - positions[0][1]) * h,
      (positions[1][0] - positions[0][0]) * w) * 180 / Math.PI
    const haloW = w * 0.78, haloH = w * 0.36
    halo.style.left = px(midX - haloW / 2); halo.style.top = px(midY - haloH / 2)
    halo.style.width = px(haloW); halo.style.height = px(haloH)
    halo.style.transform = `rotate(${axDeg.toFixed(1)}deg)`
    halo.style.background = `radial-gradient(ellipse closest-side, ${hsla(hue, 60, 72, A(0.30, fill))} 0%, transparent ${E(78, fill).toFixed(0)}%)`
    f.appendChild(halo)
    // per-star hue variance (real binary systems pair a hot and a cool
    // star): bigger body pushed cooler/bluer, smaller body pushed
    // warmer/redder — a temperature contrast, not just a size contrast, so
    // the two dots read as two different STARS rather than one star drawn
    // twice at different sizes.
    const starHues = [hue - 18, hue + 28]
    sizes.forEach((sz, i) => {
      const d = el(''); d.style.position = 'absolute'; d.style.borderRadius = '50%'
      // 0.22 -> 0.44: see the 2026-08-13 comment above — planet-tier scale.
      const s = w * sz * 0.44
      // corona as a gradient div, not a giant box-shadow: at this scale a
      // box-shadow blur of s*2 (~400px) renders as a visible hard-edged
      // square in Chromium (same defect isolated on the comet's head this
      // round — hid the element, the square vanished). Primary's corona
      // brighter and wider than the companion's: a real luminosity
      // contrast on top of the size/temperature contrast.
      const sHue = starHues[i]
      const cd = s * (i === 0 ? 2.4 : 2.1)
      const corona = el('d-glow')
      corona.style.left = px(positions[i][0] * w - cd / 2)
      corona.style.top = px(positions[i][1] * h - cd / 2)
      corona.style.width = corona.style.height = px(cd)
      corona.style.background = `radial-gradient(circle closest-side, ${hsla(sHue, 70, 80, A(i === 0 ? 0.34 : 0.26, fill))} 0%, transparent ${E(85, fill).toFixed(0)}%)`
      f.appendChild(corona)
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
        ${hsla(sHue, 25, 97, A(1, fill))} 0%, ${hsla(sHue, 60, 72, A(0.55, fill))} 45%, transparent 100%)`
      // modest shadow only — the wide glow is the corona div above (the
      // old s*2 blur shadow was the hard-edged-square defect).
      d.style.boxShadow = `0 0 ${px(s * 0.5)} ${px(s * 0.12)} ${hsla(sHue, 70, 80, A(0.40, fill))}`
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
    // scattered-cluster family: was 3 rocks (6 DOM elements, exact) — see
    // the 2026-08-11 comment further down for why this went to 10 rocks
    // (20 elements) instead; the "exact" budget framing below is the
    // superseded reasoning, kept for the measured lessons it still records.
    // §7 (>=2 separately positioned parts): trivially satisfied. Presence
    // floor: each rock's own base
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
    // 2026-08-11 object-fix round (st9, asteroid field — PASS/borderline
    // both reviews, Fable-5: "only three hexagons, wrapped in soft halos
    // that read as bokeh rather than rock"). Elements-per-station (spec §1,
    // 2-5 band) counts composed FORMS at the world-07-ring.html/RingAmbient
    // call-site level (one count per dom.makePrim() call), not this
    // primitive's own internal DOM nodes — confirmed by reading that check
    // (ring-verify.mjs #14) before changing this, not assumed — so going
    // from 3 to 10 sectors here does not touch that budget. Smaller rocks
    // (rs shrunk ~40%) and a much smaller, dimmer glow per rock (gd
    // 2.2x->1.4x, alpha 0.55->0.35) so the polygon silhouette itself reads
    // as the dominant shape instead of its halo.
    // 2026-08-12 third pass, after three independent blind reviews all
    // ranked this the worst station ("Catan tiles," "honeycomb," "twelve
    // flat, identical, evenly-spaced hexagons"): the two prior rounds tuned
    // BRIGHTNESS (glow size/alpha, fill lightness) but every rock was still
    // generated by one identical recipe — always 6 points on a k*60 hexagon
    // skeleton with the same ±11°/40-50% jitter, always the same narrow
    // 0.08-0.135w size band, always roughly circular. The sameness ACROSS
    // rocks, not the regularity within one, is what stamped a tile pattern.
    // Four generation changes, same 20-element budget (still one glow div +
    // one rock div per sector, 10 sectors):
    //  - facet count 5-9 per rock, and NO regular-polygon skeleton at all:
    //    vertex angles come from random-width angular steps normalized to
    //    360°, so no rock is "a hexagon plus jitter" — there is no hexagon.
    //  - size classes baked into SECTORS (s: 0.5-1.9) so the field is
    //    GUARANTEED a couple of big anchor rocks, a mid tier, and small
    //    shards on every seed, instead of hoping the RNG spreads a narrow
    //    band. (Deterministic composition, seeded variation — same idea as
    //    the fixed sector layout itself.)
    //  - per-rock elongation (1.0-2.1x, r()*r()-skewed so most stay
    //    chunky, a few go slab-shaped) + a random rotation. clip-path
    //    percentages scale with the box, so the stretch is free.
    //  - per-rock roughness: each rock draws its own radius band (outer
    //    40-49%, span 7-23%), so some rocks are smooth boulders and others
    //    jagged fragments.
    // Rotating the rock element rotates its background gradient with it, so
    // the lit-edge gradient angle is compensated by -rot below — the
    // highlight stays on the LIGHT_DEG-facing edge in SCREEN space, keeping
    // the shared scene-light convention (channel 4) intact.
    const cssLightDeg = (LIGHT_DEG + 90) % 360 // my atan2 convention (0=+x) -> CSS gradient convention (0=up)
    const SECTORS = [
      { x: 0.10, y: 0.60, s: 0.70 }, { x: 0.24, y: 0.30, s: 1.00 }, { x: 0.38, y: 0.68, s: 1.90 }, { x: 0.50, y: 0.22, s: 0.55 },
      { x: 0.60, y: 0.55, s: 1.00 }, { x: 0.70, y: 0.32, s: 1.55 }, { x: 0.80, y: 0.62, s: 0.80 }, { x: 0.90, y: 0.40, s: 0.60 },
      { x: 0.18, y: 0.45, s: 0.50 }, { x: 0.55, y: 0.75, s: 0.75 },
    ]
    SECTORS.forEach(sec => {
      const rs = w * (0.075 + r() * 0.03) * sec.s        // ~0.04w shards up to ~0.20w anchors
      const stretch = 1 + r() * r() * 1.1                // 1.0-2.1, skewed toward round
      const rw = rs * stretch, rh = rs
      const rot = r() * 360
      const m = Math.max(rw, rh)                         // clamp by the rotated worst case
      let cx = sec.x * w + (r() * 0.05 - 0.025) * w, cy = sec.y * h + (r() * 0.05 - 0.025) * h
      cx = Math.min(w - m / 2, Math.max(m / 2, cx)); cy = Math.min(h - m / 2, Math.max(m / 2, cy))
      const rockHue = hue - 8 + r() * 16
      // Second pass, after blind critique: the first pass over-corrected
      // ("wrapped in soft halos that read as bokeh") into "too dark... melts
      // to faint blobs at 20ft" — both critiques independently. The glow was
      // never the real problem, the ROCK's OWN fill was: base lightness 19
      // (near-black) and highlight 34 were both too dark to register at
      // headline scale. Glow nudged back up partway (1.4x->1.7x,
      // 0.35->0.42, still well under the original 2.2x/0.55 that read as
      // bokeh); rock fill lightness raised 19->32 / 34->52 — the actual
      // silhouette, not its halo, now carries the contrast.
      const glow = el('d-glow')
      const gd = m * 1.7
      glow.style.left = px(cx - gd / 2); glow.style.top = px(cy - gd / 2)
      glow.style.width = glow.style.height = px(gd)
      glow.style.background = `radial-gradient(circle closest-side, ${hsla(rockHue + 15, 50, 62, A(0.42, fill))} 0%, transparent ${E(80, fill).toFixed(0)}%)`
      f.appendChild(glow)
      // 2026-08-12 (Ben's direct chat request: "the asteroids could slowly
      // be turning, diff rates and diff directions"). `rot` was a single
      // static angle set once via inline `transform`; now it's the STARTING
      // angle (`--r0`) for a per-rock CSS animation instead, so each rock
      // keeps its own independent rotation going. `--rspin` (+-360deg) and
      // `--rd` (18-40s, seeded so it's reproducible, not Math.random) give
      // each rock its own rate AND direction — not synchronized, per the
      // ask. See `.rock-spin`/`@keyframes` in ringCss() for the shared
      // animation rule, and the reduced-motion blocks (both builds) for
      // where this joins `.star`/`.pf`/`.drift` on the paused list.
      const rock = el('rock-spin')
      rock.style.position = 'absolute'
      rock.style.left = px(cx - rw / 2); rock.style.top = px(cy - rh / 2)
      rock.style.width = px(rw); rock.style.height = px(rh)
      rock.style.setProperty('--r0', `${rot.toFixed(0)}deg`)
      rock.style.setProperty('--rspin', r() < 0.5 ? '360deg' : '-360deg')
      rock.style.setProperty('--rd', `${(18 + r() * 22).toFixed(1)}s`)
      const n = 5 + Math.floor(r() * 5)                  // 5-9 facets
      const steps = Array.from({ length: n }, () => 0.35 + r()) // min width keeps vertices from coinciding
      const total = steps.reduce((a, b) => a + b, 0)
      const radHi = 40 + r() * 9                         // per-rock outer reach, 40-49% (<=50: stays in-box)
      const radLo = radHi - (7 + r() * 16)               // per-rock roughness: span 7-23%
      let acc = r() * 360
      const pts = steps.map(st => {
        acc += (st / total) * 360
        const rad = radLo + r() * (radHi - radLo)
        return `${(50 + rad * Math.cos(acc * Math.PI / 180)).toFixed(0)}% ${(50 + rad * Math.sin(acc * Math.PI / 180)).toFixed(0)}%`
      }).join(',')
      rock.style.clipPath = `polygon(${pts})`
      // base (presence floor, constant alpha) + lit-edge highlight blended
      // in via a second, fill-driven gradient layer on top. Gradient angle
      // is in the element's own (rotated) frame, hence the -rot.
      const litDeg = ((cssLightDeg - rot) % 360 + 360) % 360
      rock.style.background =
        `linear-gradient(${litDeg.toFixed(0)}deg, ${hsla(rockHue + 12, 30, 52, A(0.8, fill))} 0%, transparent 55%), ` +
        `${hsla(rockHue, 20, 32, 0.97)}`
      f.appendChild(rock)
    })
  }

  else if (kind === 'pulsar') {
    // radiant-burst family, elongated geometry: a compact core + a soft
    // ambient glow + 2 opposing beams along the shared light axis
    // (LIGHT_DEG/+180) — not a fresh hand-picked angle, reusing the one
    // scene-wide direction convention every object in this build agrees on
    // (channel 4). 5 DOM elements (glow + core + 2 beams + sweep ring, added
    // 2026-08-12), still under the planet primitive's 6-element precedent.
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
      // 2026-08-11 object-fix round (st5, pulsar — DIVERGED: one review
      // clean pass, Fable-5 borderline, "beam lines thin enough to vanish
      // at real 20-foot bar TV distance, leaving a generic star." Fable-5's
      // own estimate: 5-10x current weight. Went 5x (0.006 -> 0.03) — the
      // linear-gradient taper (opaque at core, transparent at tip) keeps it
      // reading as a ray rather than a solid blocky line even at this
      // weight, since only the near-core end is at full width/alpha.
      //
      // 2026-08-12 (Ben's own review: "wtf is that" — rendered ISOLATED
      // from the companion/pair-bridge, which the earlier 2026-08-11 blind
      // reviews never did, confirming this was really this primitive's own
      // shape, not a neighbouring-element confound): a uniform-width bar
      // that only tapers in ALPHA reads as a comet tail or a stray line at
      // any width — a real lighthouse beam's silhouette itself flares
      // outward from the source, it doesn't stay a constant-width band.
      // Rebuilt as a triangular CONE via clip-path: a point at the core,
      // widening to a full-height base at the tip — the actual shape that
      // reads as "beam sweeping outward," which no amount of bar-thickness
      // could fix.
      const tipTh = Math.max(28, w * 0.11)
      beam.style.width = px(len); beam.style.height = px(tipTh)
      beam.style.marginTop = px(-tipTh / 2)
      beam.style.transformOrigin = '0 50%'
      beam.style.transform = `rotate(${ang.toFixed(1)}deg)`
      beam.style.clipPath = 'polygon(0% 50%, 100% 0%, 100% 100%)'
      beam.style.background = `linear-gradient(90deg, ${hsla(hue, 30, 90, A(0.85, fill))} 0%, ${hsla(hue, 30, 88, A(0.45, fill))} 45%, transparent 100%)`
      f.appendChild(beam)
    })
    // A thin "sweep ring" around the core (the classic pulsar-diagram
    // rotation cue) was tried here and cut same-day: the cone beams alone
    // already read as a pulsar (Fable-5's render review), and "too much
    // going on" is Ben's single most repeated complaint across this
    // station suite — the ring's payoff didn't clear that bar. Ben's call,
    // 2026-08-12.
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
// Occlusion is preserved by keeping the disc's ALPHA at 0.99 (fully opaque)
// throughout — that's what actually matters to the ablation gate, which
// diffs a real star's luminance with/without the occluder present, not the
// disc's own color. STALE (superseded 2026-08-12, st0 "doesn't look like
// anything" fix): this comment used to also claim the lit crescent had to
// stay dark (10-18% lightness) for occlusion to hold, and that the "planet"
// read had to come from shape/rim alone, never from brightening the fill.
// That constraint was never actually required by the gate — confirmed by
// running concepts/tools/ring-occlusion-ablation.mjs before and after
// giving the lit circle a real bright-limb gradient (up to ~62% lightness
// at its brightest stop): identical result both times, because every
// gradient stop stays alpha=1. Coverage, not darkness, is what occlusion
// needs.
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
  // 2026-08-12 round 4 (Ben: "ovals and circles of pure color around the
  // asset" need to fade from the center out, not read as a solid ring).
  // transparent -> transparent -> BRIGHT in one 6%-wide jump was a hard
  // edge — the glow appeared instantly at full strength instead of
  // ramping up, which is what read as a "pure color" band rather than a
  // fade. Added a half-bright stop partway through that same 6% window
  // (a real ramp, not just a wider gap) so the peak comes up gradually.
  // Peak's own position/value is unchanged (still at +6%, still the
  // number the ablation gate's fill->E() relationship depends on per the
  // comment above) — only how it's approached changed.
  // 2026-08-12 round 5 (Ben, direct, repeated: "there is no fade out as
  // you go further towards the edge... for the ones surrounding assets").
  // The outer half of this gradient was PEAK -> transparent in one
  // 2-stop jump — mathematically a fade, but with no intermediate stops
  // the alpha drop reads as sudden rather than gradual, same issue as
  // makeNebulaRing's outer band. Two intermediate decay stops added
  // between the peak and the final transparent edge.
  const glowPeak = hsla(hue + 10, 55, 72, A(0.55, fill))
  const glowHalf = hsla(hue + 10, 55, 72, A(0.28, fill))
  const peakPct = Number(glowInnerPct) + 6, outerPct = E(125, fill)
  const q1Pct = peakPct + (outerPct - peakPct) * 0.4
  const q2Pct = peakPct + (outerPct - peakPct) * 0.72
  glow.style.background = `radial-gradient(circle closest-side, transparent 0%, transparent ${glowInnerPct}%, ${glowHalf} ${(Number(glowInnerPct) + 3).toFixed(1)}%, ${glowPeak} ${peakPct.toFixed(1)}%,
    ${hsla(hue + 10, 52, 60, A(0.22, fill))} ${q1Pct.toFixed(1)}%,
    ${hsla(hue + 10, 48, 50, A(0.08, fill))} ${q2Pct.toFixed(1)}%, transparent ${outerPct.toFixed(0)}%)`
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
  //
  // 2026-08-12 (st0 ringed-planet body — "doesn't look like anything," both
  // review passes): the `lit` circle used to be a FLAT hsla(hue,30,14,0.99)
  // fill — lightness 14, and the `shadow` circle covering the rest of the
  // disc is lightness 3. 14 vs 3 is not a visible difference at any viewing
  // distance; the whole disc read as one near-black void with only a thin
  // 4px rim stroke for contrast. Root cause: there was no real terminator
  // GRADIENT, only a flat dark tone plus an offset dark circle. Fixed with a
  // radialGradient centered toward LIGHT_DEG (the light-facing side of the
  // disc) — a genuinely bright limb near the light source, fading through
  // the disc's own mid-tone down to the original near-black value at the
  // terminator edge, where the `shadow` circle then covers the rest. Same
  // presence-floor rule preserved: every stop is alpha=1 (opaque), so
  // occlusion is unaffected — only the color ramps, never the coverage.
  const litGradId = `occLitGrad${occCounter}`
  const litGrad = document.createElementNS(NS, 'radialGradient')
  litGrad.setAttribute('id', litGradId)
  litGrad.setAttribute('gradientUnits', 'userSpaceOnUse')
  litGrad.setAttribute('cx', (cx + Lx * R * 0.45).toFixed(2))
  litGrad.setAttribute('cy', (cy + Ly * R * 0.45).toFixed(2))
  litGrad.setAttribute('r', (R * 1.35).toFixed(2))
  const litStops = [
    [0, hsla(hue + 8, 42, 62, 1)],
    [38, hsla(hue + 2, 36, 40, 1)],
    [72, hsla(hue - 4, 32, 22, 1)],
    [100, hsla(hue, 30, 14, 1)],
  ]
  litStops.forEach(([off, color]) => {
    const stop = document.createElementNS(NS, 'stop')
    stop.setAttribute('offset', `${off}%`)
    stop.setAttribute('stop-color', color)
    litGrad.appendChild(stop)
  })
  defs.appendChild(litGrad)
  const lit = document.createElementNS(NS, 'circle')
  lit.setAttribute('cx', String(cx)); lit.setAttribute('cy', String(cy)); lit.setAttribute('r', String(R))
  lit.setAttribute('fill', `url(#${litGradId})`)
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
  // 2026-08-12 (st0 "too much going on" — bbox-verified against the actual
  // review mark, not the moon complaint): this quadrant converges the rim
  // arc, these 2 band strokes, the ring's own crossing, the layer-level
  // anchor arc, and the pair-bridge line — 5 line elements in one small
  // area. Only these bands are safely dial-back-able without touching
  // shared cross-station code (the ring/anchor/bridge are separate
  // systems/stations). Ben's call: dial back, don't remove — alpha
  // 0.6->0.28, stroke-width 5->3, so the texture read survives at a
  // fraction of the visual weight instead of disappearing.
  bands.setAttribute('stroke', hsla(hue - 15, 25, 20, A(0.28, fill)))
  bands.setAttribute('stroke-width', '3')
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

// makeNebulaRing: 2026-08-12, st3 orange nebula only ("doesn't look like a
// nebula" / "needs a ring around it" — Ben's literal fix direction). NOT
// added inside makePrim's `blob` branch — `blob` is shared with st6's rose
// nebula, whose own open complaint ("too much going on") is the opposite
// direction (needs LESS, a full reconstruction, not another layer bolted
// on). This is a standalone extra element a caller positions around an
// existing blob headline, wired only at the st3 call site.
//
// Deliberately NOT `ring`'s crisp SVG-stroke ellipse technique — that reads
// as Saturn-style planetary rings (confirmed the risk two independent
// reviewers flagged: a hard-edged ring around a round core reads as a
// planet). A hazy radial-gradient DONUT instead — transparent hole,
// soft bright band, fading tail — the actual look of a real ring nebula
// (M57): a glowing gas shell, no hard edges anywhere. Sized as an ellipse
// that auto-matches the caller's own w:h aspect (CSS radial-gradient
// defaults to `ellipse` shape sized to the element's own box), so it wraps
// whatever aspect the blob's own headline box happens to be, not a fixed
// circle.
function makeNebulaRing(el, w, h, hue, fill) {
  const ring = el('')
  ring.style.position = 'absolute'
  ring.style.left = '0'; ring.style.top = '0'
  ring.style.width = px(w); ring.style.height = px(h)
  // 2026-08-12 (fresh review round 2, Ben: "whats going on here with the
  // square?" — rendered and measured directly: red-outlining this exact
  // div showed the gold band clipping FLAT at the box's top/bottom edges
  // instead of curving shut, reading as a rectangle). Root cause: the
  // `100% 100%` explicit size from the PRIOR fix (see git history) sizes
  // each radius to the box's FULL width/height, not half — so the box
  // edge sits at only 50% of that radius, well short of where the 66-92%
  // color stops even begin. The gold band's mathematical curve extends
  // far outside the box and gets clipped flat before it can close. `50%
  // 50%` sizes each radius to the box's HALF-width/half-height (i.e. the
  // literal distance from center to edge), so the box edge lands at the
  // gradient's own 100% mark — same target the (mistaken) old comment
  // described, achieved with the right number this time. Matches the
  // proportions the `lens`/`l-disc` core gradient already uses (55-70%
  // range) rather than the outlier 100% this replaces.
  // 2026-08-12 round 4 (Ben, mocked both options side by side: "option a
  // looks like nothing, b looks like an actual planet. keep b" — the
  // hollow ring/donut shape reads correctly as a Saturn-style planetary
  // ring, not a defect; a solid continuous glow (option A, briefly tried
  // here) lost the planet read entirely). Kept the round-4 ramp-up
  // smoothing (transparent -> half-bright -> peak, instead of a hard
  // jump) since that part WAS a real improvement Ben didn't object to.
  // 2026-08-12 round 5 (Ben, direct: "there is no fade out as you go
  // further towards the edge... for the ones surrounding assets" —
  // repeated after round 4's ramp-up fix, which only addressed the
  // INNER approach to the peak, not the OUTER fade past it. Measured:
  // the old 66%->78%->92% outer fade only had ONE intermediate stop
  // (0.34->0.16 alpha) before an abrupt final drop to transparent over
  // just 14 points — reads as the color stopping, not fading. Spread
  // over a much longer distance (66% all the way to 100%, the box's own
  // edge) with three intermediate stops instead of one, so alpha
  // decays continuously and visibly rather than holding then dropping.
  ring.style.background = `radial-gradient(ellipse 50% 50% at 50% 50%,
    transparent 0%, transparent 52%, ${hsla(hue + 14, 70, 68, A(0.17, fill))} 59%,
    ${hsla(hue + 14, 70, 68, A(0.34, fill))} 66%,
    ${hsla(hue + 10, 66, 62, A(0.20, fill))} 76%,
    ${hsla(hue + 8, 62, 58, A(0.10, fill))} 86%,
    ${hsla(hue + 8, 60, 55, A(0.04, fill))} 94%, transparent 100%)`
  return ring
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
    // --opBase: the star's true authored peak, never mutated after this.
    // clampSafeBoxStarPeaks() below reads FROM this and writes TO --op
    // (the live value the breathe animation and the gate's peak-forcing
    // both use) every time the ring moves, so a star that scrolls back out
    // of the safe box recovers its full peak instead of staying dimmed.
    s.setProperty('--opBase', hi.toFixed(2))
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

// clampSafeBoxStarPeaks: item 3 (FAILURE-LEDGER.md, st4/st10 regression),
// SCOPED TO st4 ONLY — st10's overage is dominated by its headline glow,
// not stars (same ledger entry), and is explicitly NOT touched by this.
//
// Reduces --op (the live peak the breathe animation and the gate's
// peak-forcing both read) for stars whose CURRENT on-screen position falls
// inside engine.SAFE, ramped by depth from the box edge (RAMP_PX) so there
// is no visible hard line at the boundary. Only ever lowers toward
// MAX_SAFE_OP, and only for stars whose own --opBase already exceeds
// whatever the ramp allows at their current depth — a star already dimmer
// than the ceiling is untouched, at any depth. Recomputed from --opBase
// every call (never from the previous --op), so a star that scrolls back
// out of the box on a later turn recovers its full authored peak instead of
// staying dimmed. Does not touch density, size, colour, base (--ob) alpha,
// or timing — the only property this ever writes is --op.
//
// Position is read via getBoundingClientRect() (not derived from `offset`
// arithmetic) so it's correct regardless of layer nesting/repeat-copy
// structure (surge -> per-copy wrapper -> star) without this function
// needing to know that structure. All rects are read in one batch before
// any style writes, so this never interleaves layout reads with writes.
const MAX_SAFE_OP = 0.30
const RAMP_PX = 80 // authored (1920-wide) px, matches SPEC.perceptibility.marginPx
function clampSafeBoxStarPeaks(prefix, engine, designEl) {
  const dRect = designEl.getBoundingClientRect()
  const scale = dRect.width / engine.W
  const bx0 = dRect.left + engine.SAFE.x * engine.W * scale
  const by0 = dRect.top + engine.SAFE.y * engine.H * scale
  const bx1 = dRect.left + (engine.SAFE.x + engine.SAFE.w) * engine.W * scale
  const by1 = dRect.top + (engine.SAFE.y + engine.SAFE.h) * engine.H * scale
  const rampPx = RAMP_PX * scale

  const stars = designEl.querySelectorAll('.' + prefix + 'star')
  const reads = Array.from(stars, (el) => ({ el, rect: el.getBoundingClientRect() }))

  for (const { el, rect } of reads) {
    const cx = (rect.left + rect.right) / 2, cy = (rect.top + rect.bottom) / 2
    const inside = cx > bx0 && cx < bx1 && cy > by0 && cy < by1
    const depth = inside ? Math.min(cx - bx0, bx1 - cx, cy - by0, by1 - cy) : 0
    const rampFactor = Math.min(1, depth / rampPx)
    const rampCeiling = 1 - rampFactor * (1 - MAX_SAFE_OP)
    const cs = getComputedStyle(el)
    const opBase = parseFloat(cs.getPropertyValue('--opBase')) || 1
    // Never clamp below this star's own --ob (floor): MAX_SAFE_OP (0.30) sits
    // under STAR_ALPHA_FLOOR's range (--ob is 0.28-0.42), so a plain
    // min(opBase, rampCeiling) could push --op under --ob and invert the
    // breathe range — CSS still interpolates between the two numbers
    // regardless of which one is "low"/"high", so an inverted star's real
    // peak stays its ORIGINAL --ob, uncapped. max() here means the range can
    // collapse to zero width but never invert.
    const ob = parseFloat(cs.getPropertyValue('--ob')) || 0
    const effectiveCeiling = Math.max(rampCeiling, ob)
    el.style.setProperty('--op', Math.min(opBase, effectiveCeiling).toFixed(2))
  }
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
    makePrim: (kind, w, h, hue, alpha, r, isHeadline, fill, variant) => makePrim(el, kind, w, h, hue, alpha, r, isHeadline, fill, variant),
    bandY: (r, h, forceUpper, effH, skipMinBleed) => bandY(engine, r, h, forceUpper, effH, skipMinBleed),
    cornerX: (r, w, x0, cornerLeft) => cornerX(engine, r, w, x0, cornerLeft),
    rotatedBandH,
    buildStars: (host, period, perFrame, sizeMul, seed) => buildStars(el, engine, host, period, perFrame, sizeMul, seed),
    makeOccluder: (size, hue, fill) => makeOccluder(el, size, hue, fill),
    makeNebulaRing: (w, h, hue, fill) => makeNebulaRing(el, w, h, hue, fill),
    clampSafeBoxStarPeaks: (designEl) => clampSafeBoxStarPeaks(prefix, engine, designEl),
    // derives from ROTATION_MAX_DEG (the file's own "which kinds rotate
    // after placement" classification, already used by rotatedBandH) —
    // exposed so composition-layer call sites (e.g. the pair-bridge skip
    // for elongated headlines) read the one existing table instead of
    // hand-writing a second, narrower kind list (/simplify caught the
    // duplication: an earlier version of the pair-bridge skip listed
    // 'streak'/'ribbon' only, missing 'lens', which this table already had).
    isElongatedKind: (kind) => kind in ROTATION_MAX_DEG,
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
//   - the `.stage.rm` manual-toggle branch - HTML-only demo-controls UI
//     (a checkbox to force reduced-motion for testing), not a real system
//     either build needs at runtime.
//
// 2026-08-12 (Ben: "lean more into shooting star concept"): the shooting-
// star rules (`.shootLane`/`.shootRot`/`.shoot`/`@keyframes shootGo`) used
// to be listed here as HTML-only too - moved IN below instead of hand-
// duplicating them once a second call site needed them, the exact
// "hand-duplicated, went stale" bug class this function exists to prevent
// (see this module's own opening comment). Each consumer still owns its
// OWN spawnShoot()/shootLoop() JS and shootLane DOM element/host wiring -
// only the CSS shape moved here.
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
  const tw = kfName(p, 'Tw'), pfBreathe = kfName(p, 'PfBreathe'), driftMove = kfName(p, 'DriftMove'), rockSpin = kfName(p, 'RockSpin'), shootGo = kfName(p, 'ShootGo')
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

.${p}pair-bridge{position:absolute;height:2px;transform-origin:0 50%;pointer-events:none}

.${p}occ{position:absolute;border-radius:50%}
.${p}occ-rim{position:absolute;inset:0;border-radius:50%;border:5px solid var(--rim);
  border-right-color:transparent;border-bottom-color:transparent}

.${p}drift{position:absolute;border-radius:50%;background:#ffd9a0;
  animation:${driftMove} 480s linear infinite alternate;
  box-shadow:0 0 32px 10px rgba(255,183,110,0.75)}
@keyframes ${driftMove}{0%{transform:translateX(0)}100%{transform:translateX(3600px)}}

.${p}rock-spin{animation:${rockSpin} var(--rd) linear infinite}
@keyframes ${rockSpin}{from{transform:rotate(var(--r0))}to{transform:rotate(calc(var(--r0) + var(--rspin)))}}

.${p}shootLane{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.${p}shootRot{position:absolute;transform:rotate(var(--sa))}
/* 2026-08-12 (Ben: "lean more into shooting star concept") — trail
   lengthened 210->270px and thickened 2.6->3.4px, mid-stop brightened
   .6->.72, alongside a frequency bump in each consumer's own SHOOT_MS. */
.${p}shoot{width:270px;height:3.4px;border-radius:2px;opacity:0;
  background:linear-gradient(90deg,transparent 0%,rgba(255,246,226,0) 14%,
    rgba(255,246,226,.72) 72%,#fff8ec 100%);
  animation:${shootGo} var(--sdu) linear both}
/* Ben (earlier): "shooting stars are sometimes going the wrong way." Root
   cause: the gradient above always brightens toward LOCAL x=100% regardless
   of travel direction, but each consumer's spawnShoot() flips the actual
   translate3d direction via its own side variable - for a left-going star
   (negative side), local x=100% is the TRAILING end, not the leading one,
   so the bright head drags behind the faded tail instead of leading it.
   Reversed here is the same gradient with its stops mirrored (100-x),
   applied via .rev when going left, so the bright end always leads
   whichever screen direction the star is actually travelling. */
.${p}shoot.rev{background:linear-gradient(90deg,#fff8ec 0%,
    rgba(255,246,226,.6) 28%,rgba(255,246,226,0) 86%,transparent 100%)}
@keyframes ${shootGo}{
  0%{transform:translate3d(0,0,0);opacity:0}
  10%{opacity:.95} 74%{opacity:.85}
  100%{transform:translate3d(var(--sd2),0,0);opacity:0}
}
`
}
