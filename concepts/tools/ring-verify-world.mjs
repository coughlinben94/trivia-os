// Per-world gate config for ring-verify.mjs (Halloween spec §4.7). Pure — no
// browser, no fs — so client/src/lib/ringVerifyWorld.test.js can run the
// known-answer probes for every gate that reads it.
import { RING_WORLDS } from '../../client/src/lib/ringWorldFor.js';

export const DEFAULT_WORLD_ID = 'midnight-galaxy';

// What ring-verify expects of the world under test, read off the registered
// world object itself (not a second hand-kept table).
export function worldGate(id = DEFAULT_WORLD_ID) {
  const world = RING_WORLDS[id];
  if (!world) throw new Error(`ring-verify: unknown world "${id}" (registered: ${Object.keys(RING_WORLDS).join(', ')})`);
  return {
    id,
    keys: world.stations.map(s => s.key),
    stars: world.layers?.stars !== false,
  };
}

// Live-route URL for a world. The default world keeps the exact URL the gate
// always used.
export function liveUrl(base, id = DEFAULT_WORLD_ID) {
  return base + '/ambient?ring=1' + (id === DEFAULT_WORLD_ID ? '' : `&world=${encodeURIComponent(id)}`);
}

// Rendered world vs the expected one: wrong id or wrong/reordered station keys.
export function worldIdentityProblems(WORLD, gate) {
  const problems = [];
  if (WORLD?.id !== gate.id) problems.push(`world id "${WORLD?.id}" != expected "${gate.id}"`);
  const keys = (WORLD?.stations ?? []).map(s => s.key);
  if (keys.join('|') !== gate.keys.join('|')) problems.push(`station keys [${keys.join(',')}] != expected [${gate.keys.join(',')}]`);
  return problems;
}

// Check 10's star band (150-260 visible stars/frame; 120-300 WARN). null =
// skipped because the world draws no star layer. The skip keys off the world
// flag only, never off the measured count.
export function starBandStatus(mean, gate) {
  if (!gate.stars) return null;
  return mean >= 150 && mean <= 260 ? 'PASS' : mean >= 120 && mean <= 300 ? 'WARN' : 'FAIL';
}

// Peak-forcing self-check, per station: true = forcing did not land. Zero
// targets counts as not landed (a broken selector reads as 0) — except zero
// stars on a world that declares no star layer, the only case that changes.
export function forceProbeBad(fp, gate) {
  return (gate.stars && fp.starTotal === 0) || fp.starForced < fp.starTotal ||
    fp.pfTotal === 0 || fp.pfForced < fp.pfTotal;
}

// Kind names ringPrimitives.js's makePrim has a branch for (source-text scan,
// same regex the parity check always used).
export function sharedPrimKinds(primitivesSrc) {
  const kinds = new Set();
  const re = /\bkind\s*===\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(primitivesSrc))) kinds.add(m[1]);
  return kinds;
}

// Per-world dispatch parity: each station's prim must be a world-supplied
// kind (world.prims) or a shared makePrim branch. Returns the missing ones as
// "worldId:stN(prim)".
export function missingPrims(world, sharedKinds) {
  const own = world.prims ?? {};
  return world.stations
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !Object.hasOwn(own, s.prim) && !sharedKinds.has(s.prim))
    .map(({ s, i }) => `${world.id}:st${i}(${s.prim})`);
}

export { RING_WORLDS };
