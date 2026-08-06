// client/src/lib/ringEngine.test.js — run: node client/src/lib/ringEngine.test.js
import assert from 'node:assert/strict'
import { cylinderOf, authorPeriodOf, buildArc, hash32, rng } from './ringEngine.js'

const ENGINE = { PANES: 12, ARC: { lo: 18, hi: 52, exp: 1.6 } }
const LAYERS = [
  { id: 'far', surge: 480, m: 1 },
  { id: 'mid', surge: 1920, m: 1 },
  { id: 'near', surge: 2880, m: 3 },
]
const WORLD = { phase: 5 }

// layer arithmetic — matches concepts/tools/ring-verify.mjs's live-DOM check
assert.equal(cylinderOf(ENGINE, LAYERS[0]), 5760, 'far cylinder')
assert.equal(cylinderOf(ENGINE, LAYERS[1]), 23040, 'mid cylinder')
assert.equal(cylinderOf(ENGINE, LAYERS[2]), 34560, 'near cylinder')
assert.equal(authorPeriodOf(ENGINE, LAYERS[2]), 11520, 'near authorPeriod (m=3)')

// value arc span — matches the 2.99x this session measured live
const arc = buildArc(ENGINE, WORLD)
const span = Math.max(...arc) / Math.min(...arc)
assert.ok(span >= 2.2 && span <= 4.0, `arc span ${span} out of 2.2-4.0 band`)

// determinism — same (i, seed) must always produce the same stream, or the
// world differs between reloads (the exact world-06 bug this engine exists to fix)
const a = rng(3, 0x4217), b = rng(3, 0x4217)
assert.equal(a(), b(), 'rng(i, seed) must be deterministic')

console.log('ringEngine.test.js: all assertions passed')
