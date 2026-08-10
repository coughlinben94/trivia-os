// concepts/tools/sentinel-selftest.mjs — proves sweep-sentinel.mjs works
// end-to-end against a REAL parameter and the REAL gate (runChecks() from
// ring-verify.mjs, not a reimplementation), per "render before you claim."
// Target: ARC.fillMin in concepts/world-07-ring.html, currently 0.35 — the
// user's own named first-real-sweep-target, so this self-test doubles as
// the sentinel's qualifying run for that future sweep.
//
// Metric: "[html] realised span outside safe box >= 80% of target span"
// (a single ratio, e.g. "rendered 2.13x") — fillMin raises the floor on how
// much fill/alpha even the quietest stations get. Expected direction,
// CORRECTED after this script's own first real run: raising fillMin makes
// the quietest stations relatively brighter, which COMPRESSES the gap
// between loudest and quietest — the realised-span ratio goes DOWN, not up
// (measured directly: base 2.12x -> kicked 1.94x at fillMin 0.35->0.55).
// The first version of this file assumed 'up' and the sentinel correctly
// caught that the metric didn't move that way — exactly what step (b) is
// for. Direction here is now the empirically-confirmed one.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { runChecks } from './ring-verify.mjs';
import { runSentinel } from './sweep-sentinel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const TARGET_HTML = path.join(REPO_ROOT, 'concepts/world-07-ring.html');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filePath = path.join(REPO_ROOT, path.normalize(urlPath));
    const data = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const targetUrl = `http://127.0.0.1:${port}/concepts/world-07-ring.html`;

const BASELINE = 'ARC: { lo:10, hi:31, exp:1.6, ref:31, fillMin:0.35, fillMax:1.00 },';
const KICKED = 'ARC: { lo:10, hi:31, exp:1.6, ref:31, fillMin:0.55, fillMax:1.00 },';

function setFillMin(text) {
  const src = readFileSync(TARGET_HTML, 'utf8');
  // BUG FOUND BY THIS SCRIPT'S OWN FIRST REAL RUN (2026-08-09): the previous
  // version of this guard was `!src.includes(BASELINE) && text === BASELINE`
  // — true (and threw) on EVERY restore() call, since by definition the file
  // contains KICKED, not BASELINE, right before a restore. That crash
  // propagated out of runSentinel's kick-failure path uncaught, left
  // world-07-ring.html sitting at fillMin:0.55 on disk, and skipped this
  // very file's own bottom-of-script safety net (never reached — the
  // process had already crashed). Correct check: only throw if the file
  // contains NEITHER known value — that's the actual "changed under us"
  // case; being in the OTHER known state is normal and expected.
  const from = src.includes(BASELINE) ? BASELINE : (src.includes(KICKED) ? KICKED : null);
  if (from === null) {
    throw new Error('setFillMin: file contains neither the baseline nor the kicked fillMin string — it changed under us');
  }
  if (from === text) return; // already in the desired state, no-op (idempotent)
  writeFileSync(TARGET_HTML, src.replace(from, text));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

let measureCount = 0;
async function measure() {
  measureCount++;
  const { spec } = await runChecks({ page, label: 'html', prefix: '', gotoUrl: targetUrl });
  const check = spec.find(r => r.name.includes('realised span outside safe box'));
  if (!check) throw new Error('measure(): "realised span outside safe box" check not found in spec results');
  const m = check.detail.match(/rendered ([\d.]+)x/);
  if (!m) throw new Error(`measure(): couldn't parse ratio from detail: ${check.detail}`);
  console.log(`  measure() #${measureCount}: ${m[0]}`);
  return parseFloat(m[1]);
}

console.log(`sentinel self-test: target=ARC.fillMin (0.35 -> 0.55), metric=realised span outside safe box, file=${TARGET_HTML}`);

const result = await runSentinel({
  measure,
  applyKick: async () => setFillMin(KICKED),
  restore: async () => setFillMin(BASELINE),
  direction: 'down',
  floor: 0.02, // ratio metric's own precision is 2 decimals (e.g. "2.13x") — see reasoning below
  label: 'realised span outside safe box (ratio, ARC.fillMin kick)',
});

// floor=0.02 override reasoning: sweep-sentinel.mjs's default floor (1.0) is
// sized for percentage-point or integer-luma metrics; this metric reports a
// bare ratio to 2 decimal places ("2.13x"), so its own rounding floor is
// 0.005, and 0.02 (4x that) is the equivalent well-above-rounding-noise
// floor for THIS metric's native precision — matches the file header's own
// "callers targeting a metric with different native precision should pass
// an explicit floor" guidance.

console.log(`\ntotal measure() calls: ${measureCount} (expected 4: base1, base2, kicked, restored)`);
console.log(JSON.stringify(result, null, 2));

await browser.close();
server.close();

// final safety net: confirm the file is back to baseline regardless of
// pass/fail above (runSentinel already calls restore() on every failure
// path, but re-assert here so a self-test bug can't leave the repo dirty).
const finalSrc = readFileSync(TARGET_HTML, 'utf8');
if (!finalSrc.includes(BASELINE)) {
  console.error('SAFETY NET TRIPPED: world-07-ring.html is NOT at baseline fillMin after self-test. Fix manually.');
  process.exit(3);
}
console.log('\nfile confirmed at baseline fillMin=0.35 after self-test.');
process.exit(result.pass ? 0 : 1);
