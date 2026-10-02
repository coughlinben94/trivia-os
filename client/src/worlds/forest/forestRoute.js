// Per-show route for the haunted forest walk (spec 2026-10-01 section 4). Pure and deterministic:
// makeRoute(seed, n) -> [{ kind, variant }], one segment per station. Segment i is the stretch walked INTO
// station i. concepts/haunted-forest-route-v4.html carries a byte-identical copy of makeRoute (it is a
// file:// page and cannot import modules); forestRoute.test.js fails if the two drift apart.
//
// Kinds: straight, bendL, bendR, and two INTERIORS you walk into and out of: barn and house (variant = layout).
// Rules: segment 0 is straight (the gate); station 10 (jukebox break) is a calm straight; no two interiors in a
// row, and the segment after an interior is always straight (you leave through the far door walking straight);
// at most two bends in a row; bendL/bendR at most 3 each and equal in number (net heading zero, so the loop
// closes); 1 to 3 interiors, barn and house at most 2 each; the last segment is never an interior (12 flows
// into the straight segment 0).
export function makeRoute(seed, n = 13) {
  let a = (seed >>> 0) ^ 0x9e3779b9
  const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
  const CALM = 10
  const ok = ks => {
    const cnt = k => ks.filter(x => x === k).length
    const inner = k => k === 'barn' || k === 'house', bend = k => k === 'bendL' || k === 'bendR'
    if (ks[0] !== 'straight' || ks[CALM] !== 'straight' || inner(ks[n - 1])) return false
    const ni = cnt('barn') + cnt('house')
    if (ni < 1 || ni > 3 || cnt('barn') > 2 || cnt('house') > 2 || cnt('bendL') < 1 || cnt('bendL') > 3 || cnt('bendL') !== cnt('bendR')) return false
    for (let i = 0; i < n; i++) {
      const k = ks[i], p = ks[(i + n - 1) % n], pp = ks[(i + n - 2) % n]
      if (inner(p) && k !== 'straight') return false
      if (bend(k) && bend(p) && bend(pp)) return false
    }
    return true
  }
  const KINDS = ['straight', 'straight', 'bendL', 'bendR', 'barn', 'house']
  for (let tries = 0; tries < 5000; tries++) {
    const ks = Array.from({ length: n }, (_, i) => i === 0 || i === CALM ? 'straight' : KINDS[Math.floor(rnd() * KINDS.length)])
    if (ok(ks)) return ks.map(kind => ({ kind, variant: Math.floor(rnd() * 3) }))
  }
  throw new Error('makeRoute: no valid route for seed ' + seed)
}
