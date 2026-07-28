#!/usr/bin/env node
// concepts/tools/sweep-stale-design-entries.mjs
//
// Mitigates B5 from concepts/design-pipeline-hardening-fix.md: "stale per-slug history can outlive
// a deleted or renamed scene. Nothing purges verdict/attempt-count entries for scenes that no longer
// exist." This is a HUMAN-RUN, READ-ONLY report, not an automatic prune.
//
// Round-2 review (concepts/design-pipeline-hardening-review-round2.md, finding #9) found this script
// never actually read the audit trail added alongside it, despite the gate's own comment claiming the
// log exists "so the sweep script has something to cross-check against." Fixed here: for every
// verdict/case/counts entry, report whether at least one matching audit-log line exists. An entry with
// NO matching audit-log line is not automatically suspicious — the audit log was added partway through
// this project's history, so anything written before that point legitimately predates it — but an
// entry with no audit-log match AND a recent-looking timestamp is worth a human's attention, since it
// is the signature either of a genuine pre-audit-log record or of a write that happened outside the
// gate's normal path.
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
const AUDIT_LOG_FILE = resolve(REPO_ROOT, 'concepts', '.design-gate-audit.log');

const fileExists = (relPath) => relPath && existsSync(resolve(REPO_ROOT, relPath));

// Parse the audit log once. Each line is {timestamp, store, action, detail}. Build simple lookup sets
// keyed on the fields each store's writeCase()/verdict-write call actually logs, so "does an audit
// entry exist for this specific record" is a real (if approximate) match, not just "the log is
// non-empty."
function loadAuditEntries() {
  if (!existsSync(AUDIT_LOG_FILE)) return [];
  const lines = readFileSync(AUDIT_LOG_FILE, 'utf8').split('\n').filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch { /* malformed line — skip, don't crash the sweep */ }
  }
  return entries;
}

const auditEntries = loadAuditEntries();
const auditByFile = new Map(); // file -> array of matching audit entries
for (const e of auditEntries) {
  const f = e?.detail?.file;
  if (!f) continue;
  if (!auditByFile.has(f)) auditByFile.set(f, []);
  auditByFile.get(f).push(e);
}

console.log('# Stale design-gate entry sweep\n');
console.log(`Audit log: ${existsSync(AUDIT_LOG_FILE) ? `${auditEntries.length} entries read from ${AUDIT_LOG_FILE}` : `does not exist yet at ${AUDIT_LOG_FILE} (no writes have happened since it was added, or it predates this repo's checkout)`}\n`);

// .design-attempt-counts.json — keys carry `lastCheckedFile`.
if (existsSync(COUNTS_FILE)) {
  const counts = JSON.parse(readFileSync(COUNTS_FILE, 'utf8'));
  const entries = Object.entries(counts);
  const stale = entries.filter(([, v]) => v.lastCheckedFile && !fileExists(v.lastCheckedFile));
  console.log(`## ${COUNTS_FILE}`);
  console.log(`${entries.length} total entries, ${stale.length} reference a file that no longer exists:`);
  for (const [key, v] of stale) console.log(`  - "${key}" -> ${v.lastCheckedFile} (fails: ${v.fails ?? '?'})`);
  const noAudit = entries.filter(([, v]) => v.lastCheckedFile && fileExists(v.lastCheckedFile) && !(auditByFile.get(v.lastCheckedFile)?.length));
  if (noAudit.length) {
    console.log(`${noAudit.length} entries reference a file that DOES still exist but have NO matching audit-log entry ` +
      `(predates the audit log, or was written outside the gate's normal path — not automatically suspicious, worth a look):`);
    for (const [key, v] of noAudit) console.log(`  - "${key}" -> ${v.lastCheckedFile}`);
  }
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
  const noAudit = cases.filter(c => c.file && fileExists(c.file) && !(auditByFile.get(c.file)?.length));
  if (noAudit.length) {
    console.log(`${noAudit.length} cases reference a file that DOES still exist but have NO matching audit-log entry:`);
    for (const c of noAudit) console.log(`  - "${c.noun}" (${c.date}) -> ${c.file}`);
  }
  console.log('');
} else {
  console.log(`## ${CASES_FILE} — does not exist, nothing to sweep\n`);
}

// .design-critic-verdicts/*.json — each carries `checkedFile`.
if (existsSync(VERDICT_DIR)) {
  const files = readdirSync(VERDICT_DIR).filter(f => f.endsWith('.json'));
  const stale = [];
  const noAudit = [];
  for (const f of files) {
    try {
      const v = JSON.parse(readFileSync(resolve(VERDICT_DIR, f), 'utf8'));
      if (v.checkedFile && !fileExists(v.checkedFile)) stale.push({ f, checkedFile: v.checkedFile, verdict: v.verdict });
      else if (v.checkedFile && !(auditByFile.get(v.checkedFile)?.length)) noAudit.push({ f, checkedFile: v.checkedFile, verdict: v.verdict });
    } catch { /* unparseable verdict file — not this sweep's job to flag malformed JSON */ }
  }
  console.log(`## ${VERDICT_DIR}`);
  console.log(`${files.length} total verdict files, ${stale.length} reference a file that no longer exists:`);
  for (const s of stale) console.log(`  - ${s.f} (verdict ${s.verdict}) -> ${s.checkedFile}`);
  if (noAudit.length) {
    console.log(`${noAudit.length} verdict files reference a file that DOES still exist but have NO matching audit-log entry:`);
    for (const s of noAudit) console.log(`  - ${s.f} (verdict ${s.verdict}) -> ${s.checkedFile}`);
  }
  console.log('');
} else {
  console.log(`## ${VERDICT_DIR} — does not exist, nothing to sweep\n`);
}

console.log('Nothing above was deleted. Review and clean up by hand if the STALE entries are truly dead —');
console.log('a future scene reusing an old path+element-name slug would otherwise inherit these counts.');
console.log('The NO-AUDIT-LOG entries are informational, not necessarily a problem — see the note above.');
