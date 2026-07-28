#!/usr/bin/env node
// concepts/tools/sweep-stale-design-entries.mjs
//
// Mitigates B5 from concepts/design-pipeline-hardening-fix.md: "stale per-slug history can outlive
// a deleted or renamed scene. Nothing purges verdict/attempt-count entries for scenes that no longer
// exist." This is a HUMAN-RUN, READ-ONLY report, not an automatic prune — the doc's own fix #10 asks
// for "a periodic human-run sweep flagging entries," not silent deletion. Deleting history
// automatically at Stop-time risks removing real, load-bearing two-strike counts under a bug or a
// race; flagging for a human to review and clean up by hand is the safer, doc-specified shape.
//
// Usage: node concepts/tools/sweep-stale-design-entries.mjs
// Exit code is always 0 — this never blocks anything, it only reports.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COUNTS_FILE = resolve(REPO_ROOT, 'concepts', '.design-attempt-counts.json');
const CASES_FILE = resolve(REPO_ROOT, 'concepts', 'design-cases.json');
const VERDICT_DIR = resolve(REPO_ROOT, 'concepts', '.design-critic-verdicts');

const fileExists = (relPath) => relPath && existsSync(resolve(REPO_ROOT, relPath));

console.log('# Stale design-gate entry sweep\n');

// .design-attempt-counts.json — keys carry `lastCheckedFile`.
if (existsSync(COUNTS_FILE)) {
  const counts = JSON.parse(readFileSync(COUNTS_FILE, 'utf8'));
  const stale = Object.entries(counts).filter(([, v]) => v.lastCheckedFile && !fileExists(v.lastCheckedFile));
  console.log(`## ${COUNTS_FILE}`);
  console.log(`${Object.keys(counts).length} total entries, ${stale.length} reference a file that no longer exists:`);
  for (const [key, v] of stale) console.log(`  - "${key}" -> ${v.lastCheckedFile} (fails: ${v.fails ?? '?'})`);
  console.log('');
} else {
  console.log(`## ${COUNTS_FILE} — does not exist, nothing to sweep\n`);
}

// design-cases.json — records carry `file`.
if (existsSync(CASES_FILE)) {
  const cases = JSON.parse(readFileSync(CASES_FILE, 'utf8')).cases || [];
  const stale = cases.filter(c => c.file && !fileExists(c.file));
  console.log(`## ${CASES_FILE}`);
  console.log(`${cases.length} total cases, ${stale.length} reference a file that no longer exists:`);
  for (const c of stale) console.log(`  - "${c.noun}" (${c.date}, verdict ${c.verdict}) -> ${c.file}`);
  console.log('');
} else {
  console.log(`## ${CASES_FILE} — does not exist, nothing to sweep\n`);
}

// .design-critic-verdicts/*.json — each carries `checkedFile`.
if (existsSync(VERDICT_DIR)) {
  const files = readdirSync(VERDICT_DIR).filter(f => f.endsWith('.json'));
  const stale = [];
  for (const f of files) {
    try {
      const v = JSON.parse(readFileSync(resolve(VERDICT_DIR, f), 'utf8'));
      if (v.checkedFile && !fileExists(v.checkedFile)) stale.push({ f, checkedFile: v.checkedFile, verdict: v.verdict });
    } catch { /* unparseable verdict file — not this sweep's job to flag malformed JSON */ }
  }
  console.log(`## ${VERDICT_DIR}`);
  console.log(`${files.length} total verdict files, ${stale.length} reference a file that no longer exists:`);
  for (const s of stale) console.log(`  - ${s.f} (verdict ${s.verdict}) -> ${s.checkedFile}`);
  console.log('');
} else {
  console.log(`## ${VERDICT_DIR} — does not exist, nothing to sweep\n`);
}

console.log('Nothing above was deleted. Review and clean up by hand if these entries are truly dead —');
console.log('a future scene reusing an old path+element-name slug would otherwise inherit these counts.');
