// haunted-october hand-built art (spec §2 horizon band, §3 station 10).
// Every shape below is hand-placed geometry: no traced, vectorized or
// generated path data. Every stroke/edge is >= 7px on the 1920x1080 frame
// (spec §5.3: the 80in-at-30ft floor).

const SVG_NS = 'http://www.w3.org/2000/svg'
const svg = (tag, attrs) => {
  const n = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v))
  return n
}

// ═══ HORIZON BAND ═══ one continuous dark strip along the bottom edge, on
// the far layer (480px per turn, so it reads as distant ground). The strip
// is exactly one far-layer period wide and its ground line starts and ends
// at the same height, so the layer's repeated copies join without a seam.
//
// PASS = a fresh viewer names this as a fence (a row of fence posts).
// PASS = a fresh viewer names this as gravestones (headstones).
// PASS = a fresh viewer names this as a church steeple.
export const BAND_H = 128 // <= 12% of 1080 (129.6), all below the safe box (y 778)
export const BAND_FILL = '#050202'

// Ground surface height (band-local y) at hand-placed x stops; linear in
// between. First and last y match for the seamless wrap.
const GROUND = [[0, 100], [520, 96], [1180, 102], [1900, 94], [2600, 99], [3350, 95], [4100, 101], [4800, 97], [5450, 92], [5900, 96], [6240, 100]]
const groundY = (x) => {
  for (let i = 1; i < GROUND.length; i++) {
    const [x0, y0] = GROUND[i - 1], [x1, y1] = GROUND[i]
    if (x <= x1) return y0 + (y1 - y0) * ((x - x0) / (x1 - x0))
  }
  return GROUND[GROUND.length - 1][1]
}

// Fence runs: start x, picket count. Pickets 14px wide, 36px apart, two
// 8px rails; one picket per run is short (broken), heights vary by hand.
const FENCES = [
  { x: 260, n: 16, broken: 5 },
  { x: 2300, n: 11, broken: 7 },
  { x: 4300, n: 14, broken: 2 },
]
const PICKET_H = [48, 50, 47, 51, 49, 46, 50, 48]

// Headstones: x, width, height, tilt (deg). Rounded tops, no inscription.
const STONES = [
  [1250, 40, 58, -4], [1318, 50, 72, 2], [1392, 36, 46, 6], [1452, 44, 62, -2],
  [3240, 46, 66, 3], [3312, 38, 50, -5], [3374, 42, 58, 1],
  [5000, 38, 54, -3], [5070, 48, 68, 4],
]

// One church at the band's far end: nave with a pitched roof, a square
// tower, a spire, a cross. The belfry opening is a cut-out (sky shows).
const CHURCH_X = 5600

function stonePath(x, w, h, base) {
  const r = w / 2, top = base - h
  return `M${x - r},${base} L${x - r},${top + r} A${r},${r} 0 0 1 ${x + r},${top + r} L${x + r},${base} Z`
}

function churchPath(x, base) {
  // Nave (left of the tower): body 96x30, roof ridge 22px above the eaves.
  const nave = `M${x - 112},${base} L${x - 112},${base - 30} L${x - 64},${base - 52} L${x - 16},${base - 30} L${x - 16},${base} Z`
  // Tower 44 wide, 40 tall; spire 52 tall on a 54 base; cross 7px strokes.
  const tw = 44, tTop = base - 40, sTop = tTop - 52
  const tower = `M${x - tw / 2},${base} L${x - tw / 2},${tTop} L${x - 27},${tTop} L${x},${sTop} L${x + 27},${tTop} L${x + tw / 2},${tTop} L${x + tw / 2},${base} Z`
  const cross = `M${x - 3.5},${sTop} L${x - 3.5},${sTop - 22} L${x + 3.5},${sTop - 22} L${x + 3.5},${sTop} Z` +
    ` M${x - 9},${sTop - 16} L${x + 9},${sTop - 16} L${x + 9},${sTop - 9} L${x - 9},${sTop - 9} Z`
  return { solid: nave + ' ' + tower + ' ' + cross, belfry: { x: x - 7, y: tTop + 8, w: 14, h: 20 } }
}

export function horizonBand(dom, host, period, engine) {
  const s = svg('svg', { width: period, height: BAND_H, viewBox: `0 0 ${period} ${BAND_H}` })
  s.style.position = 'absolute'
  s.style.left = '0'
  s.style.top = (engine.H - BAND_H) + 'px'
  s.style.pointerEvents = 'none'
  s.setAttribute('class', 'ring-horizon')

  // ground: ground line down to the frame's bottom edge
  let d = `M0,${BAND_H} L0,${groundY(0)}`
  for (const [x, y] of GROUND) d += ` L${x},${y}`
  d += ` L${period},${BAND_H} Z`
  const g = svg('g', { fill: BAND_FILL })
  g.appendChild(svg('path', { d }))

  for (const f of FENCES) {
    const x1 = f.x + (f.n - 1) * 36 + 14
    const railY = (x) => groundY(x)
    // rails follow the ground, 8px tall
    for (const up of [16, 36]) {
      g.appendChild(svg('path', { d: `M${f.x},${railY(f.x) - up} L${x1},${railY(x1) - up} L${x1},${railY(x1) - up + 8} L${f.x},${railY(f.x) - up + 8} Z` }))
    }
    for (let i = 0; i < f.n; i++) {
      const px0 = f.x + i * 36, base = groundY(px0 + 7) + 4
      const h = i === f.broken ? 26 : PICKET_H[(i + f.x) % PICKET_H.length]
      const top = base - h
      // pointed top: 7px rise to a centre point
      g.appendChild(svg('path', { d: `M${px0},${base} L${px0},${top + 8} L${px0 + 7},${top} L${px0 + 14},${top + 8} L${px0 + 14},${base} Z` }))
    }
  }

  for (const [x, w, h, tilt] of STONES) {
    const base = groundY(x) + 6
    const p = svg('path', { d: stonePath(x, w, h, base) })
    p.setAttribute('transform', `rotate(${tilt} ${x} ${base})`)
    g.appendChild(p)
  }

  const church = churchPath(CHURCH_X, groundY(CHURCH_X) + 4)
  // The belfry is cut with a mask. Fixed id: the layer clones this SVG, and
  // every copy carries an identical mask, so a duplicate id resolves the same.
  const maskId = 'ho-belfry'
  const mask = svg('mask', { id: maskId, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: period, height: BAND_H })
  mask.appendChild(svg('rect', { x: 0, y: 0, width: period, height: BAND_H, fill: 'white' }))
  const b = church.belfry
  mask.appendChild(svg('path', { d: `M${b.x},${b.y + b.h} L${b.x},${b.y + b.w / 2} A${b.w / 2},${b.w / 2} 0 0 1 ${b.x + b.w},${b.y + b.w / 2} L${b.x + b.w},${b.y + b.h} Z`, fill: 'black' }))
  const defs = svg('defs', {})
  defs.appendChild(mask)
  s.appendChild(defs)
  g.appendChild(svg('path', { d: church.solid, mask: `url(#${maskId})` }))

  s.appendChild(g)
  host.appendChild(s)
}

// ═══ HARVEST MOON (station 10, the music station) ═══ iconic: a large
// warm-orange disc with darker maria, crossed low by one thin dark cloud.
// PASS = a fresh viewer names this as a (harvest) moon behind a cloud.
//
// Dispatched as `planet` + variant 'harvestMoon' (world.prims.planet), so
// RingAmbient's planet placement (disc pushed to the corner margin, glow
// masked at the station boundary) applies unchanged, and ring-verify's
// locked drawn-kind list is not touched.
export function harvestMoon(dom, w, h, hue, alpha, r, isHeadline, fill) {
  const f = dom.el(isHeadline ? 'pf pf-breathe' : 'pf')
  f.style.width = w + 'px'; f.style.height = h + 'px'
  // A lit source is never dim: floor the breathe range (the shared makePrim
  // scales every headline by loudness alpha 0.34-0.55).
  const a = Math.max(alpha, 0.86)
  if (isHeadline) {
    f.style.setProperty('--pa', a.toFixed(3))
    f.style.setProperty('--pa2', Math.min(1, a * 1.08).toFixed(3))
    f.style.setProperty('--pb', (47 + Math.floor(r() * 26)) + 's')
    f.style.setProperty('--pd', (-r() * 40).toFixed(1) + 's')
  } else f.style.opacity = a.toFixed(3)

  // Slot 10 is the upper-right corner. The disc is 0.745 of the box's short
  // side and pushed up and right inside the box, so it bleeds off the top
  // and right edges and stays clear of the text safe box (x<=1536, y>=297);
  // measured on the render, not assumed.
  const M = Math.min(w, h), D = M * 0.745
  const cx = w / 2 + M * 0.21, cy = h / 2 - M * 0.125
  const dl = cx - D / 2, dt = cy - D / 2
  const at = (el, x, y, ew, eh) => { el.style.position = 'absolute'; el.style.left = (x - ew / 2) + 'px'; el.style.top = (y - eh / 2) + 'px'; el.style.width = ew + 'px'; el.style.height = eh + 'px'; return el }

  // halo (class d-glow so RingAmbient's boundary mask finds it)
  const glow = at(dom.el('d-glow'), cx, cy, D * 1.35, D * 1.35)
  glow.style.background = `radial-gradient(circle, hsla(${hue},90%,55%,0.30) 36%, hsla(${hue},85%,45%,0.10) 52%, transparent 70%)`
  f.appendChild(glow)

  // disc: warm, limb-darkened, lit a touch from upper left
  const disc = at(dom.el(''), cx, cy, D, D)
  disc.style.borderRadius = '50%'
  disc.style.overflow = 'hidden'
  disc.style.background = `radial-gradient(circle at 42% 38%, hsl(${hue + 8},92%,70%) 0%, hsl(${hue + 2},88%,60%) 45%, hsl(${hue - 6},80%,46%) 88%, hsl(${hue - 10},76%,38%) 100%)`
  // maria: hand-placed, uneven soft patches (fractions of D)
  const MARIA = [[0.34, 0.30, 0.30, 0.22, -18], [0.60, 0.40, 0.22, 0.30, 24], [0.46, 0.60, 0.34, 0.18, 8], [0.72, 0.66, 0.14, 0.12, 0]]
  for (const [mx, my, mw, mh, rot] of MARIA) {
    const m = at(dom.el(''), mx * D, my * D, mw * D, mh * D)
    m.style.borderRadius = '50%'
    m.style.transform = `rotate(${rot}deg)`
    m.style.background = `radial-gradient(ellipse, hsla(${hue - 12},70%,30%,0.42) 30%, hsla(${hue - 12},70%,30%,0.16) 62%, transparent 76%)`
    disc.appendChild(m)
  }
  f.appendChild(disc)

  // thin cloud across the lower third: long overlapping ellipses whose ends
  // taper (a stratus streak), dark and nearly opaque so the disc cuts out.
  const CLOUD = [[0.46, 0.69, 1.25, 0.07], [0.70, 0.655, 0.62, 0.05], [0.26, 0.73, 0.56, 0.045]]
  for (const [ox, oy, cw, ch] of CLOUD) {
    const c = at(dom.el(''), dl + ox * D, dt + oy * D, cw * D, Math.max(ch * D, 22))
    c.style.borderRadius = '50%'
    c.style.background = 'hsla(18,35%,5%,0.94)'
    f.appendChild(c)
  }
  return f
}
