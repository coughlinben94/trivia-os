// concepts/tools/test-sanitizer.mjs
//
// Verifies sanitize-svg.mjs against every fixture in fixtures/. This is the gate the
// PLAN.md sanitizer is required to pass before the supervised first agent run — a
// sanitizer with untested fixtures is a sanitizer nobody has actually checked.
//
// Convention: fixtures/valid-*.svg MUST be accepted. fixtures/bad-*.svg MUST be rejected.
// Two additional cases (oversized input, depth bomb) are generated in-memory here rather
// than committed as giant fixture files.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeSVG, DEFAULT_LIMITS } from './sanitize-svg.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

let pass = 0;
let fail = 0;

function report(name, expected, result) {
  const gotOk = result.ok === true;
  const ok = gotOk === expected;
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}  (expected ${expected ? 'accept' : 'reject'}, got ${gotOk ? 'accept' : 'reject'}${result.ok ? '' : ` — "${result.reason}"`})`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}  (expected ${expected ? 'accept' : 'reject'}, got ${gotOk ? 'accept' : 'reject'}${result.ok ? '' : ` — "${result.reason}"`})`);
  }
}

console.log('--- Fixture files ---');
const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.svg'));
if (files.length === 0) {
  console.error('No fixtures found — aborting.');
  process.exit(1);
}
for (const file of files) {
  const svg = readFileSync(join(fixturesDir, file), 'utf8');
  const expected = file.startsWith('valid-');
  if (!file.startsWith('valid-') && !file.startsWith('bad-')) {
    console.warn(`  SKIP  ${file} — filename doesn't start with valid-/bad-, can't infer expectation`);
    continue;
  }
  const result = sanitizeSVG(svg);
  report(file, expected, result);
}

console.log('\n--- Generated: oversized input ---');
{
  // One legitimate path repeated until well past the byte cap.
  const bigPath = 'M10 10 L90 10 L50 90 Z '.repeat(20000);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${bigPath}" fill="#000"/></svg>`;
  const result = sanitizeSVG(svg);
  report('generated-oversized', false, result);
}

console.log('\n--- Generated: depth bomb ---');
{
  const depth = DEFAULT_LIMITS.maxDepth + 20;
  let svg = '<path d="M0 0 L1 1" fill="#000"/>';
  for (let i = 0; i < depth; i++) svg = `<g>${svg}</g>`;
  svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${svg}</svg>`;
  const result = sanitizeSVG(svg);
  report('generated-depth-bomb', false, result);
}

console.log('\n--- Generated: node-count bomb (shallow but wide) ---');
{
  const n = DEFAULT_LIMITS.maxNodes + 500;
  let inner = '';
  for (let i = 0; i < n; i++) inner += `<circle cx="${i % 100}" cy="${i % 100}" r="1" fill="#000"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${inner}</svg>`;
  const result = sanitizeSVG(svg);
  report('generated-node-count-bomb', false, result);
}

console.log(`\n${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);
