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
//
// Exits 0 on success. An uncaught error before this point (e.g. a permissions problem this script
// itself can't work around) exits non-zero with a Node stack trace — acceptable for a human-run,
// one-off recovery tool, unlike the gate hooks which must fail closed with a specific message.

import { readFileSync, writeFileSync, existsSync, chmodSync, readdirSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INTEGRITY_FILE = resolve(REPO_ROOT, 'concepts', '.design-gate-integrity.json');
const VERDICT_DIR = resolve(REPO_ROOT, 'concepts', '.design-critic-verdicts');
const PROTECTED_STORE_MODE = 0o444;

const AUDIT_LOG_FILE = resolve(REPO_ROOT, 'concepts', '.design-gate-audit.log');
const singleFilePaths = [
  resolve(REPO_ROOT, 'concepts', '.design-attempt-counts.json'),
  resolve(REPO_ROOT, 'concepts', 'design-cases.json'),
  AUDIT_LOG_FILE,
];

function hashFile(absPath) {
  try { return createHash('sha256').update(readFileSync(absPath)).digest('hex'); }
  catch { return null; }
}

const sidecar = {};
let seeded = 0;

// Append a trace of this re-baseline event BEFORE hashing the stores below (AUDIT_LOG_FILE is one
// of singleFilePaths) — otherwise the sidecar would record a hash from BEFORE this append, and the
// very next gate run would immediately false-block on the audit log itself. Re-baselining is the
// single most security-relevant event in this system; it should leave the same kind of trace every
// other protected-store write does, not none at all.
if (existsSync(AUDIT_LOG_FILE)) { try { chmodSync(AUDIT_LOG_FILE, 0o644); } catch { /* not yet lockable, or already writable */ } }
try {
  appendFileSync(AUDIT_LOG_FILE, JSON.stringify({ timestamp: new Date().toISOString(), store: 'integrity', action: 'reseed' }) + '\n');
} catch (e) { console.error(`reseed: WARNING — could not append to audit log: ${e.message}`); }

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

if (existsSync(INTEGRITY_FILE)) { try { chmodSync(INTEGRITY_FILE, 0o644); } catch { /* not yet lockable, or already writable */ } }
try {
  writeFileSync(INTEGRITY_FILE, JSON.stringify(sidecar, null, 2));
} finally {
  try { chmodSync(INTEGRITY_FILE, PROTECTED_STORE_MODE); } catch (e) {
    console.error(`reseed: WARNING — could not chmod ${INTEGRITY_FILE}: ${e.message}`);
  }
}

console.log(`reseed-design-gate-integrity: recorded ${seeded} file(s) into ${INTEGRITY_FILE} and ` +
  `locked each to read-only. This is now the new baseline design-done-gate.mjs will check against.`);
