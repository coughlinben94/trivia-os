import { hexToRgb, rgbToOklab, oklabToRgb, lerpOklabPolar } from '../jukebox/components/AlbumGradientMesh.jsx'

// Weighted-palette engine: 2-3 colors plus weights -> a full ring hue
// assignment and a theme color set.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: weights ALLOCATE, they do not
// BLEND. A 60/25/15 palette gives 8 of 13 stations the first colour, 3 the
// second, 2 the third — it does not tint every station 60% toward colour
// one. Averaging N weighted colours into one is precisely the mud that
// AlbumGradientMesh.jsx's header documents a week of tuning spent escaping
// ("an average of many colors structurally can't read as two colors
// colliding, it just trends toward one blended pastel"). The single place
// this file blends at all is the near-black background field, where a
// weighted mean is the correct operation and, at L about 0.06, mud is not
// physically reachable.

// HSL hue, not OKLab hue. ringPrimitives.js consumes the station hue as
// `hsla(hue, S%, L%, a)`, so it must be an HSL hue angle or the rendered
// station will not match the swatch the host picked.
export function hexToHslHue(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (d === 0) return 0
  let h
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  return h < 0 ? h + 360 : h
}

export function hueDelta(a, b) {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

// Largest-remainder (Hamilton) apportionment, with a floor of 1 per colour.
// The floor is a controllability requirement, not a rounding nicety: a
// colour the host deliberately picked must own at least one station, or
// dragging the third swatch below ~4% makes it silently vanish.
export function allocate(weights, n) {
  const total = weights.reduce((a, b) => a + b, 0) || 1
  const raw = weights.map(w => (w / total) * n)
  const counts = raw.map(Math.floor)
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  let short = n - counts.reduce((a, b) => a + b, 0)
  for (let k = 0; short > 0; k++, short--) counts[order[k % order.length].i]++
  // Floor pass: take from the largest to pay any colour sitting at zero.
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] !== 0) continue
    const big = counts.indexOf(Math.max(...counts))
    counts[big]--
    counts[i]++
  }
  return counts
}

// Exact minimum-cost ring assignment. Places counts[c] stations of each
// colour around the cyclic ring, minimizing BIG * (same-colour adjacent
// pairs) + sum of costFn(position, colour). BIG dwarfs any possible hue
// cost, so the result always lands on the arithmetic adjacency floor
// (max(0, 2c - n) pairs are forced once a colour owns more than half the
// ring — the DP hits that floor exactly, never worse) and, among all
// floor-respecting patterns, picks the one whose colours sit on the
// stations that already match them. The ring WRAPS — station n-1
// neighbours station 0 (midnightGalaxy.ring.js's own family-spacing
// comment says so), which is why the closing pair is charged too.
//
// ponytail: exhaustive memoized DP — states are (pos, remaining counts,
// prev colour) x (first colour), a few thousand at n=13, k<=3. Fine for a
// 13-station ring driven from a UI; revisit only if a much larger n ever
// exists (it doesn't — see the no-multi-world rule).
const BIG = 1e7
function minCostRingAssignment(counts, costFn) {
  const n = counts.reduce((a, b) => a + b, 0)
  const k = counts.length
  let best = null
  for (let first = 0; first < k; first++) {
    if (counts[first] === 0) continue
    const memo = new Map()
    const solve = (pos, rem, prev) => {
      if (pos === n) return { cost: prev === first ? BIG : 0, pick: -1 }
      const key = pos + '|' + rem.join(',') + '|' + prev
      const hit = memo.get(key)
      if (hit) return hit
      let bc = Infinity, bp = -1
      for (let c = 0; c < k; c++) {
        if (rem[c] === 0) continue
        rem[c]--
        const sub = solve(pos + 1, rem, c)
        rem[c]++
        const cost = costFn(pos, c) + (c === prev ? BIG : 0) + sub.cost
        if (cost < bc) { bc = cost; bp = c }
      }
      const r = { cost: bc, pick: bp }
      memo.set(key, r)
      return r
    }
    const rem = counts.slice()
    rem[first]--
    const tail = solve(1, rem, first)
    const total = costFn(0, first) + tail.cost
    if (!best || total < best.total) {
      // Reconstruct by walking the memo.
      const out = [first]
      let prev = first
      for (let pos = 1; pos < n; pos++) {
        const c = solve(pos, rem, prev).pick
        out.push(c)
        rem[c]--
        prev = c
      }
      best = { total, out }
    }
  }
  return best.out
}

// Position-only spread (no station-identity information): every colour
// interleaved around the ring at the adjacency floor. Used directly by
// derivePalette only when no currentHues are supplied.
export function spread(counts) {
  return minCostRingAssignment(counts, () => 0)
}

// k evenly-spaced offsets across +/- halfWindow, so a colour owning 8
// stations renders 8 related-but-distinct hues rather than 8 identical
// ones. At k=7, halfWindow=18 the step is exactly 6 degrees — the same
// separation the shipped world already uses between comet (208) and
// binary pair (214).
export function hueLadder(k, halfWindow) {
  if (k <= 1) return [0]
  const step = (2 * halfWindow) / (k - 1)
  return Array.from({ length: k }, (_, i) => -halfWindow + i * step)
}

// ADVISORY ONLY — never a prediction of ring-verify's verdict. Blind to
// alpha, layer stacking, the scrim, LB()'s up-to-+26 lightness boost at
// low fill, the ~104 distinct S/L combinations ringPrimitives.js actually
// uses, and the breathe/twinkle peak the safeBox cap is measured at. Its
// only honest claim is directional: "this palette pushes stations toward
// brighter hues than the shipped one." Run the gate.
export function lumaProxy(hue) {
  const s = 0.72, l = 0.62
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  let r, g, b
  if (hue < 60) [r, g, b] = [c, x, 0]
  else if (hue < 120) [r, g, b] = [x, c, 0]
  else if (hue < 180) [r, g, b] = [0, c, x]
  else if (hue < 240) [r, g, b] = [0, x, c]
  else if (hue < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return (0.2126 * (r + m) + 0.7152 * (g + m) + 0.0722 * (b + m)) * 255
}

const ANCHOR_WINDOW = 25   // spec section 4's stated maximum
const LADDER_HALF   = 18   // stay inside the window with 7 degrees of margin

// In-gamut check by round-trip: oklabToRgb clamps out-of-range channels,
// so a colour survives the round trip unchanged iff it fits in sRGB.
// Reuses the proven conversions rather than reimplementing OKLab.
function inGamut(lab) {
  const back = rgbToOklab(oklabToRgb(lab))
  return Math.abs(back[0] - lab[0]) < 1e-4
    && Math.abs(back[1] - lab[1]) < 1e-4
    && Math.abs(back[2] - lab[2]) < 1e-4
}

function labToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')
}

// Set a colour's OKLab lightness while keeping its hue, gamut-mapping the
// chroma. Teleporting L while holding chroma fixed can leave sRGB — and a
// naive channel clip then hue-shifts or washes the colour out, which is
// the exact "muddy" failure AlbumGradientMesh.jsx's header documents a
// week of tuning escaping. Instead: hold L and hue, binary-search the
// chroma down only as far as the gamut requires. Used to drop a picked
// colour into a role (accent, highlight, background) whose lightness the
// theme already had right — allocation again, not blending.
export function atLightness(hex, targetHex) {
  const [, a, b] = rgbToOklab(hexToRgb(hex))
  const [L] = rgbToOklab(hexToRgb(targetHex))
  let scale = 1
  if (!inGamut([L, a, b])) {
    let lo = 0, hi = 1
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (inGamut([L, a * mid, b * mid])) lo = mid
      else hi = mid
    }
    scale = lo
  }
  return labToHex(oklabToRgb([L, a * scale, b * scale]))
}

// The one legitimate blend in this file. Folds the palette into a single
// weighted OKLab mean via lerpOklabPolar — the proven function, not a
// per-channel RGB lerp (which is exactly what produces a muddy grey
// midpoint between two near-complementary picks; lerpOklabPolar's own
// header documents that bug and its fix). Correct here specifically
// because the result is then crushed to the theme's own near-black
// background lightness, where only a faint hue cast survives.
function foldOklab(colors, weights) {
  let acc = rgbToOklab(hexToRgb(colors[0]))
  let accW = weights[0]
  for (let i = 1; i < colors.length; i++) {
    const w = weights[i]
    const t = (accW + w) > 0 ? w / (accW + w) : 0
    acc = lerpOklabPolar(acc, rgbToOklab(hexToRgb(colors[i])), t)
    accW += w
  }
  return labToHex(oklabToRgb(acc))
}

export function derivePalette({ colors, weights, stationCount = 13, baseTheme, currentHues = [] }) {
  const counts  = allocate(weights, stationCount)
  const anchors = colors.map(hex => ({ deg: Math.round(hexToHslHue(hex)), window: ANCHOR_WINDOW }))

  // Station-identity-aware assignment: each palette colour goes to the
  // stations whose CURRENT hue is nearest its anchor (so a station named
  // and built around amber never draws pure purple just because of its
  // seat on the ring), with the cyclic adjacency floor guaranteed by the
  // DP. With no currentHues this degrades to a pure positional interleave.
  const assignment = minCostRingAssignment(counts, (i, c) =>
    currentHues[i] == null ? 0 : hueDelta(currentHues[i], anchors[c].deg))

  // Ladder offsets, handed out so that ring-CONSECUTIVE members of the same
  // colour get the FURTHEST-APART offsets (outside-in alternation). Two
  // neighbours forced to share a colour at least read as two distinct
  // shades of it rather than as one 2-station-wide smear.
  const ladders = counts.map(k => hueLadder(k, LADDER_HALF))
  const seen    = counts.map(() => 0)
  const hues    = assignment.map(c => {
    const k = counts[c]
    const j = seen[c]++
    const pick = j % 2 === 0 ? Math.floor(j / 2) : k - 1 - Math.floor(j / 2)
    const h = anchors[c].deg + ladders[c][pick]
    return ((Math.round(h) % 360) + 360) % 360
  })

  // Accent/highlight follow the HEAVIEST swatch — recomputed from the live
  // weights, never hard-wired to swatch #1, or dragging the weight bar
  // would not move the colour the host actually sees. Ties go to the
  // earlier swatch.
  const heaviest = weights.indexOf(Math.max(...weights))
  const fold = foldOklab(colors, weights)
  const themeColors = {
    accent:    atLightness(colors[heaviest], baseTheme.colors.accent),
    highlight: atLightness(colors[heaviest], baseTheme.colors.highlight),
    bg:        atLightness(fold, baseTheme.colors.bg),
    bgDeep:    atLightness(fold, baseTheme.colors.bgDeep),
  }

  const advisory = hues.map((h, i) => {
    const from = currentHues[i] ?? h
    return {
      index: i,
      fromHue: from, toHue: h,
      fromLuma: Math.round(lumaProxy(from)),
      toLuma: Math.round(lumaProxy(h)),
      delta: Math.round(lumaProxy(h) - lumaProxy(from)),
    }
  })

  const warnings = []
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      if (hueDelta(anchors[i].deg, anchors[j].deg) < 2 * ANCHOR_WINDOW) {
        warnings.push(`Colors ${i + 1} and ${j + 1} are ${Math.round(hueDelta(anchors[i].deg, anchors[j].deg))}° apart — their anchor windows overlap, so the world will read as one family.`)
      }
    }
  }
  let adjacent = 0
  for (let i = 0; i < stationCount; i++) {
    if (assignment[i] === assignment[(i + 1) % stationCount]) adjacent++
  }
  if (adjacent > 0) {
    warnings.push(`${adjacent} neighbouring station pair${adjacent === 1 ? '' : 's'} share a color — unavoidable at these weights, since one color owns ${Math.max(...counts)} of ${stationCount} stations. Even out the weights to reduce it.`)
  }
  const rising = advisory.filter(a => a.delta > 25).length
  if (rising > 0) {
    warnings.push(`${rising} station${rising === 1 ? '' : 's'} move toward a brighter hue (proxy only — run the gate).`)
  }

  return { hues, hueAnchors: anchors, themeColors, assignment, counts, advisory, warnings }
}
