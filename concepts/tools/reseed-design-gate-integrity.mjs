#!/usr/bin/env node
// concepts/tools/reseed-design-gate-integrity.mjs
//
// HUMAN-INVOKED ONLY. Never called by design-done-gate.mjs itself — the whole point of the
// integrity check in design-done-gate.mjs is that it blocks and asks a human to confirm before
// anything re-baselines. This script IS that confirmation step, made concrete: run it after you
// (Ben) have looked at a BLOCKED message naming a mismatched file, decided the change was
// intentional, and want the gate to accept the current on-disk content as the new known-good
// baseline going forward.
//
// What it does: for each of the four gate-protected stores that currently exists on disk, computes
// its content hash, writes the full result to concepts/.design-gate-integrity.json (overwriting
// whatever was there), and chmod's every file it just hashed to 0o444 (read-only) — the same state
// design-done-gate.mjs's own writeProtectedFile() leaves them in after a normal gate write. Verdict
// files inside concepts/.design-critic-verdicts/ are each hashed individually, matching how
// design-done-gate.mjs records them (one sidecar entry per verdict file, not one for the whole
// directory).
//
// Run it as: node concepts/tools/reseed-design-gate-integrity.mjs

import { readFileSync, writeFileSync, existsSync, chmodSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INTEGRITY_FILE = resolve(REPO_ROOT, 'concepts', '.design-gate-integrity.json');
const VERDICT_DIR = resolve(REPO_ROOT, 'concepts', '.design-critic-verdicts');
const PROTECTED_STORE_MODE = 0o444;

const singleFilePaths = [
  resolve(REPO_ROOT, 'concepts', '.design-attempt-counts.json'),
  resolve(REPO_ROOT, 'concepts', 'design-cases.json'),
  resolve(REPO_ROOT, 'concepts', '.design-gate-audit.log'),
];

function hashFile(absPath) {
  try { return createHash('sha256').update(readFileSync(absPath)).digest('hex'); }
  catch { return null; }
}

const sidecar = {};
let seeded = 0;

for (const absPath of singleFilePaths) {
  if (!existsSync(absPath)) continue;
  const hash = hashFile(absPath);
  if (hash === null) continue;
  sidecar[relative(REPO_ROOT, absPath)] = hash;
  try { chmodSync(absPath, PROTECTED_STORE_MODE); } catch (e) {
    console.error(`reseed: WARNING — could not chmod ${absPath}: ${e.message}`);
  }
  seeded++;
}

if (existsSync(VERDICT_DIR)) {
  for (const f of readdirSync(VERDICT_DIR)) {
    if (!f.endsWith('.json')) continue;
    const absPath = resolve(VERDICT_DIR, f);
    const hash = hashFile(absPath);
    if (hash === null) continue;
    sidecar[relative(REPO_ROOT, absPath)] = hash;
    try { chmodSync(absPath, PROTECTED_STORE_MODE); } catch (e) {
      console.error(`reseed: WARNING — could not chmod ${absPath}: ${e.message}`);
    }
    seeded++;
  }
}

writeFileSync(INTEGRITY_FILE, JSON.stringify(sidecar, null, 2));
try { chmodSync(INTEGRITY_FILE, PROTECTED_STORE_MODE); } catch (e) {
  console.error(`reseed: WARNING — could not chmod ${INTEGRITY_FILE}: ${e.message}`);
}

console.log(`reseed-design-gate-integrity: recorded ${seeded} file(s) into ${INTEGRITY_FILE} and ` +
  `locked each to read-only. This is now the new baseline design-done-gate.mjs will check against.`);
