// Per-show route for the haunted forest walk. Pure and deterministic, no Math.random.
//
// FOREST FIRST (Ben, 2026-10-03): forest first, barns and shacks yes (the old haunted-home interior is gone); "just ensure the
// haunted forest has plenty of variety and stations"; "like random like the galaxy stations". So the route is DRAWN
// per show from a POOL of forest stations, the way client/src/lib/ringDraw.js draws the galaxy ring:
//   FOREST_POOL: station objects { key, kind, variant, family, sil, interior, accent, natural } (37 kinds x 3 variants)
//   drawRoute(pool, { seed, stations = 36 }) -> one lap: [{ ...station, seg, bend }] (seg = straight|bendL|bendR|barn|shack)
//   assertRoute(order) throws on any broken rule;  makeRoute(seed, stations) never throws (salted retries, then the
//   authored lap), as ringWorldFor.js's autoDrawWorld;  forestStretches(seed, stations) -> the forest character per station.
//
// Rules of a lap of n stations (8..80):
//   station 0 is the gate; a calm 'moonrise' station is PINNED at 10, 23, 36, ... (the music break always lands on the same
//   calm picture; the only key allowed more than once). Every other key appears at most once per lap (drawn without
//   replacement), a kind at most twice (three times past 60 stations) and never within 3 stations of itself; a family
//   never within 3 stations of itself (cyclic); the same silhouette class never adjacent; loud set pieces (accent) at
//   most max(2, round(n/9)); at least 60% of the landmark stations natural (woodland, floor, water, clearing, creature).
//   INTERIORS (barn, shack): about one per 7-8 stations, at most 6 (the pool holds 3 layouts of each, never repeated in a
//   lap), at least one barn and one shack when there are two or more. An interior takes two stations: the APPROACH (its
//   facade grows out of the fog ahead) and the INSIDE; the station after it (you leave by the back door) is a calm
//   natural woodland station on a straight. Interiors never sit on the gate, a pin or the last station.
//   BENDS: about one left/right pair per 10 stations, equal numbers of each, at most two bends in a row, never on the
//   gate, a pin, an interior or the exit after one.
// <inline> (concepts/haunted-forest-route-v4.html carries this block byte-identically, minus the word "export ")
export function hash32(x, seed) {
  let h = (x | 0) ^ (seed | 0)
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^ (h >>> 16)) >>> 0
}
export function rng(i, seed) {
  let n = hash32(i, seed)
  return () => { n = hash32(n, 0x9E3779B9); return n / 4294967296 }
}
export function seedFrom(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}
// [kind, family, silhouette class, flags: i interior, a accent, n natural]
const FOREST_KINDS = [
  ['barn', 'interior', 'building', 'i'], ['shack', 'interior', 'building', 'i'],
  ['pine stand', 'stand', 'stand', 'n'], ['birch grove', 'stand', 'stand', 'n'], ['dead snag field', 'stand', 'stand', 'n'],
  ['old orchard', 'stand', 'stand', 'na'], ['gnarled oaks', 'stand', 'stand', 'n'], ['hanging moss', 'stand', 'stand', 'n'],
  ['fern drift', 'floor', 'low', 'n'], ['mushroom ring', 'floor', 'low', 'n'], ['hollow log', 'floor', 'wide', 'n'],
  ['fallen tree, roots up', 'floor', 'wide', 'n'], ['mossy boulders', 'floor', 'low', 'n'],
  ['creek and plank bridge', 'water', 'water', 'na'], ['will-o\'-wisps over a bog', 'water', 'light', 'na'],
  ['moonlit glade', 'clear', 'light', 'na'], ['lone apple tree', 'clear', 'tree', 'n'], ['charcoal-burner clearing', 'clear', 'light', 'a'],
  ['crow tree', 'creature', 'tree', 'n'], ['crow on a stump', 'creature', 'low', 'n'], ['deer in the trees', 'creature', 'figure', 'n'],
  ['owl on a snag', 'creature', 'tree', 'n'], ['eyes in the dark', 'creature', 'figure', 'n'],
  ['lantern on a post', 'trace', 'post', ''], ['crooked signpost', 'trace', 'post', ''], ['stone well', 'trace', 'well', ''],
  ['rusted cart', 'trace', 'wide', ''], ['lantern tree', 'trace', 'tree', ''],
  ['gravestones', 'grave', 'low', ''], ['stone wall ruin', 'grave', 'wide', ''],
  ['scarecrow', 'farm', 'post', ''], ['jack-o\'-lanterns', 'farm', 'low', ''], ['stacked cordwood', 'farm', 'wide', ''],
  ['deer-stand ladder', 'farm', 'tree', ''], ['rope swing', 'farm', 'tree', ''],
]
export const FOREST_POOL = FOREST_KINDS.flatMap(([kind, family, sil, f]) => [0, 1, 2].map(variant => ({
  key: kind + '#' + variant, kind, variant, family, sil, interior: f.includes('i'), accent: f.includes('a'), natural: f.includes('n') })))
const GATE_ST = { key: 'gate', kind: 'gate', variant: 0, family: 'gate', sil: 'gate', interior: false, accent: false, natural: false }
const PIN_ST = { key: 'moonrise', kind: 'moonrise', variant: 0, family: 'calm', sil: 'calm', interior: false, accent: false, natural: true }
const pinsOf = n => { const p = []; for (let i = 10; i < n; i += 13) p.push(i); if (!p.length) p.push(n - 1); return p }
const capsOf = n => ({ perKind: n > 60 ? 3 : 2, accents: Math.max(2, Math.round(n / 9)), interiors: Math.min(6, Math.max(1, Math.round(n / 7.5))) })
const cyc = (a, b, n) => Math.min(Math.abs(a - b), n - Math.abs(a - b))
const isCalm = s => s.natural && !s.accent && !s.interior && s.family !== 'water'

export function assertRoute(order, { stations = order.length } = {}) {
  const n = stations, fail = m => { throw new Error('assertRoute: ' + m) }
  if (order.length !== n) fail(`length ${order.length} != ${n}`)
  const pins = pinsOf(n), caps = capsOf(n)
  if (order[0].key !== 'gate') fail('station 0 is not the gate')
  for (const p of pins) if (order[p].key !== 'moonrise') fail(`no moonrise pin at ${p}`)
  const keys = new Set(), kinds = {}
  let accents = 0, interiors = 0, lm = 0, nat = 0
  for (let i = 0; i < n; i++) {
    const s = order[i]
    if (s.key !== 'moonrise' && s.role !== 'approach') { if (keys.has(s.key)) fail(`duplicate key ${s.key}`); keys.add(s.key) }
    if (s.role === 'approach') { const t = order[(i + 1) % n]; if (!t.interior || t.key !== s.of) fail(`approach at ${i} not followed by its interior`); continue }
    if (s.key === 'gate' || s.key === 'moonrise') continue
    kinds[s.kind] = (kinds[s.kind] || 0) + 1; if (s.accent) accents++
    if (s.interior) {
      interiors++
      if (i === 0 || i === n - 1 || pins.includes(i)) fail(`interior at ${i}`)
      if (order[i - 1].role !== 'approach') fail(`interior at ${i} has no approach`)
      const x = order[(i + 1) % n]
      if (!(isCalm(x) || x.key === 'moonrise') || x.seg !== 'straight') fail(`exit after interior ${i} is not a calm straight`)
      if (s.seg !== s.kind) fail(`interior ${i} seg ${s.seg}`)
    } else { lm++; if (s.natural) nat++ }
    for (let j = i + 1; j < n; j++) {
      const o = order[j], d = cyc(i, j, n)
      if (o.role === 'approach' || o.key === 'gate' || o.key === 'moonrise') continue
      if (o.family === s.family && d < 3) fail(`family ${s.family} at ${i} and ${j}`)
      if (o.kind === s.kind && d < 4) fail(`kind ${s.kind} at ${i} and ${j}`)
    }
    const nx = order[(i + 1) % n]
    if (nx.sil === s.sil && nx.role !== 'approach') fail(`silhouette ${s.sil} adjacent at ${i}`)
  }
  for (const [k, c] of Object.entries(kinds)) if (c > (k === 'barn' || k === 'shack' ? 3 : caps.perKind)) fail(`kind ${k} x${c}`)
  if (accents > caps.accents) fail(`${accents} accents`)
  if (interiors < 1 || interiors > caps.interiors) fail(`${interiors} interiors`)
  const ib = order.filter(s => s.kind === 'barn').length, is = order.filter(s => s.kind === 'shack').length
  if (interiors >= 2 && (!ib || !is)) fail('two or more interiors but not both a barn and a shack')
  if (nat < Math.ceil(lm * 0.6)) fail(`only ${nat} of ${lm} landmark stations natural`)
  let run = 0, L = 0, R = 0
  for (let i = 0; i < 2 * n; i++) {
    const s = order[i % n], b = s.seg === 'bendL' || s.seg === 'bendR'
    run = b ? run + 1 : 0; if (run > 2) fail(`three bends in a row at ${i % n}`)
    if (i < n) { if (s.seg === 'bendL') L++; if (s.seg === 'bendR') R++ }
    if (i < n && b && (s.interior || s.key === 'gate' || s.key === 'moonrise' || order[(i + n - 1) % n].interior)) fail(`bend at ${i}`)
  }
  if (L !== R || L < 1) fail(`bends L${L} R${R}`)
  return true
}

export function drawRoute(pool, { seed, stations = 36 } = {}) {
  const n = stations
  if (!Number.isInteger(n) || n < 8 || n > 80) throw new Error('drawRoute: stations must be an integer 8..80')
  const r = rng(seed === 'authored' ? 0 : typeof seed === 'number' ? seed : seedFrom(String(seed)), 0xF0E5)
  const pins = pinsOf(n), caps = capsOf(n), pick = a => a[Math.floor(r() * a.length)]
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a }
  let lastError
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const order = new Array(n).fill(null)
      order[0] = GATE_ST; for (const p of pins) order[p] = PIN_ST
      // 1. interiors: count, kinds (both a barn and a shack from two on), distinct layouts, then their slots
      const ni = Math.max(1, Math.min(caps.interiors, Math.round(n / 7.5 + (r() - 0.5))))
      const inner = shuffle(pool.filter(s => s.interior)), barns = inner.filter(s => s.kind === 'barn'), shacks = inner.filter(s => s.kind === 'shack')
      const chosenI = ni >= 2 ? [barns[0], shacks[0], ...shuffle([...barns.slice(1), ...shacks.slice(1)]).slice(0, ni - 2)] : [pick(inner)]
      shuffle(chosenI)
      // an interior at i needs i-1 (approach) and i+1 (exit) free, i-1 >= 1, i+1 <= n-1, i <= n-2; interiors >= 4 apart
      const freeAt = i => i > 0 && i < n && order[i] === null
      const iSlots = []
      for (const st of chosenI) {
        const cand = []; for (let i = 2; i <= n - 2; i++) if (freeAt(i - 1) && freeAt(i) && freeAt(i + 1) && iSlots.every(j => cyc(i, j, n) >= 4)) cand.push(i)
        if (!cand.length) throw new Error('no room for the interiors')
        const i = pick(cand); iSlots.push(i)
        order[i - 1] = { key: st.key + '@approach', kind: 'approach', variant: st.variant, family: 'approach', sil: 'approach', interior: false, accent: false, natural: false, role: 'approach', of: st.key }
        order[i] = { ...st, seg: st.kind }
      }
      // 2. the landmark stations: kinds drawn so each is used once before any is used twice (most distinct kinds per
      // lap), at least 60% natural, accents capped, then placed by backtracking under the spacing rules
      const free = []; for (let i = 1; i < n; i++) if (order[i] === null) free.push(i)
      const exits = new Set(iSlots.map(i => i + 1))
      const lmCount = free.length, natMin = Math.ceil(lmCount * 0.6)
      const kindsN = shuffle([...new Set(pool.filter(s => !s.interior && s.natural).map(s => s.kind))])
      const kindsH = shuffle([...new Set(pool.filter(s => !s.interior && !s.natural).map(s => s.kind))])
      const variants = {}; for (const s of pool) if (!s.interior) (variants[s.kind] = variants[s.kind] || []).push(s)
      for (const k in variants) shuffle(variants[k])
      const take = (list, count) => { const out = []; let round = 0; while (out.length < count) { const k = list[out.length % list.length]; round = Math.floor(out.length / list.length); if (round >= caps.perKind) throw new Error('pool too small'); out.push(variants[k][round]) } return out }
      const nNat = natMin + Math.floor(r() * (lmCount - natMin + 1) * 0.5)
      let chosen = [...take(kindsN, nNat), ...take(kindsH, lmCount - nNat)]
      // accents over the cap swap for a calm natural station of an unused kind or variant
      let acc = chosen.filter(s => s.accent).length
      if (acc > caps.accents) { chosen = shuffle(chosen); for (let i = 0; i < chosen.length && acc > caps.accents; i++) if (chosen[i].accent) { const alt = pool.find(s => s.natural && !s.accent && !s.interior && !chosen.includes(s) && chosen.filter(c => c.kind === s.kind).length < caps.perKind); if (alt) { chosen[i] = alt; acc-- } } }
      if (acc > caps.accents) throw new Error('too many accents')
      if (chosen.filter(isCalm).length < exits.size) throw new Error('not enough calm stations for the exits')
      const used = new Array(chosen.length).fill(false), ix = chosen.map((_, i) => i)
      const fits = (s, i) => {
        if (exits.has(i) && !isCalm(s)) return false
        for (let d = -3; d <= 3; d++) {
          if (!d) continue; const o = order[((i + d) % n + n) % n]; if (!o || o.role === 'approach' || o.key === 'gate' || o.key === 'moonrise') continue
          const ad = Math.abs(d)
          if (ad < 3 && o.family === s.family) return false
          if (o.kind === s.kind) return false
          if (ad === 1 && o.sil === s.sil) return false
        }
        return true
      }
      let budget = 40000
      const bt = f => {
        if (f === free.length) return true
        if (--budget < 0) throw new Error('placement budget')
        const i = free[f]
        for (const c of shuffle(ix.slice())) {
          if (used[c] || !fits(chosen[c], i)) continue
          order[i] = { ...chosen[c], seg: 'straight' }; used[c] = true
          if (bt(f + 1)) return true
          order[i] = null; used[c] = false
        }
        return false
      }
      if (!bt(0)) throw new Error('no arrangement')
      for (let i = 0; i < n; i++) if (!order[i].seg) order[i] = { ...order[i], seg: 'straight' }
      // 3. bends: about one left/right pair per 10 stations
      const nb = Math.max(1, Math.round(n / 10)), ok = i => { const s = order[i]; return !s.interior && s.key !== 'gate' && s.key !== 'moonrise' && !order[i - 1].interior }
      const bslots = shuffle(Array.from({ length: n }, (_, i) => i).filter(i => i > 0 && ok(i))), seg = order.map(s => s.seg), bent = []
      const isB = i => seg[(i + n) % n] === 'bend'
      for (const i of bslots) { if (bent.length >= 2 * nb) break; seg[i] = 'bend'; if ((isB(i - 1) && isB(i - 2)) || (isB(i - 1) && isB(i + 1)) || (isB(i + 1) && isB(i + 2))) { seg[i] = order[i].seg; continue } bent.push(i) }
      if (bent.length < 2) throw new Error('no room for bends')
      if (bent.length % 2) { const i = bent.pop(); seg[i] = order[i].seg }
      const dirs = shuffle([...Array(bent.length / 2).fill('bendL'), ...Array(bent.length / 2).fill('bendR')])
      bent.forEach((i, j) => { order[i] = { ...order[i], seg: dirs[j], bend: Math.floor(r() * 3) } })
      assertRoute(order, { stations: n })
      return order
    } catch (e) { lastError = e }
  }
  throw lastError
}

// Never throws: salted retries of the show seed (as ringWorldFor.js's autoDrawWorld), then the authored lap.
export function makeRoute(seed, stations = 36) {
  for (let attempt = 0; attempt < 20; attempt++) { try { return drawRoute(FOREST_POOL, { seed: hash32(seed >>> 0, 0x464f5245 ^ attempt), stations }) } catch { /* next salt */ } }
  try { return drawRoute(FOREST_POOL, { seed: 'authored', stations }) } catch { /* the plain loop below */ }
  return Array.from({ length: stations }, (_, i) => i === 0 ? { ...GATE_ST, seg: 'straight' } : { ...PIN_ST, seg: 'straight' })
}

// The forest's character per station: stretches of 5 to 8 stations, each a woodland type, the first one the seed's own
// (the type changes between stretches; the page blends tree mix, density and the sky tint over a station).
export const BIOMES = ['pine', 'birch', 'oak', 'deadwood', 'bog', 'ridge']
export function forestStretches(seed, stations = 36) {
  const r = rng(seed >>> 0, 0xB10E), base = BIOMES[Math.floor(r() * 4)], out = []
  let cur = base, prev = null
  while (out.length < stations) {
    const len = 5 + Math.floor(r() * 4)
    for (let i = 0; i < len && out.length < stations; i++) out.push(cur)
    const others = BIOMES.filter(b => b !== cur && b !== prev); prev = cur; cur = others[Math.floor(r() * others.length)]
  }
  // the lap closes: a last stretch shorter than 3 stations joins its neighbour, and it never matches the first
  const runStart = () => { let k = stations - 1; while (k > 0 && out[k - 1] === out[stations - 1]) k--; return k }
  let k = runStart()
  if (k > 0 && stations - k < 3) { for (let i = k; i < stations; i++) out[i] = out[k - 1]; k = runStart() }
  if (k > 0 && out[stations - 1] === base) { const b = BIOMES.find(x => x !== base && x !== out[k - 1]); for (let i = k; i < stations; i++) out[i] = b }
  return { base, biome: out }
}
// </inline>
