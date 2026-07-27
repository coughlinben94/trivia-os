#!/usr/bin/env node
// concepts/tools/design-case-lookup.mjs
//
// Retrieval over concepts/design-cases.json — the fix for the research
// finding that a capped prose lessons file "can't generalize ('rope failed'
// doesn't fire on vine') and actively destroys evidence" via its own
// fold-and-discard cap. No embeddings/vector DB — at n≈10-30 cases, substring
// + simple synonym matching is honest and sufficient; add real retrieval
// only if this file grows past a few hundred entries.
//
// Usage: node design-case-lookup.mjs <noun> [--category=<cat>]
// Prints every case whose noun field contains/is-contained-by the query, OR
// whose category matches (v2, 2026-07-26 — the memory-specialist think-tank
// pass found pure noun matching missed related failures: "vine" didn't fire
// "rope"'s lesson despite being the same thin-flexible-cord failure class).
// If no --category is given, pass a category guess as a second bare arg,
// e.g. `node design-case-lookup.mjs vine thin-flexible-cord`.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CASES_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'design-cases.json');
const args = process.argv.slice(2);
const categoryArg = (args.find(a => a.startsWith('--category='))?.split('=')[1] || args[1] || '').toLowerCase().trim();
const query = (args.find(a => !a.startsWith('--')) || args[0] || '').toLowerCase().trim();

const KNOWN_CATEGORIES = ['thin-flexible-cord', 'liquid-surface', 'organic-contour', 'iconic-geometry', 'glow-light', 'ground-decor'];

if (!query) {
  console.error('Usage: node design-case-lookup.mjs <noun> [category]\n' +
    `Known categories: ${KNOWN_CATEGORIES.join(', ')}\n` +
    'If unsure of the category, guess the closest one — a wrong guess just means no category-level match, not an error.');
  process.exit(1);
}
if (!existsSync(CASES_FILE)) {
  console.log('No design-cases.json found — no history to check. Proceed, but write a case record when done.');
  process.exit(0);
}

const data = JSON.parse(readFileSync(CASES_FILE, 'utf8'));
const cases = data.cases || [];
const queryWords = query.split(/\s+/).filter(Boolean);

function nounMatches(caseNoun) {
  const n = caseNoun.toLowerCase();
  return queryWords.some(w => n.includes(w) || w.includes(n));
}
function categoryMatches(caseCategory) {
  return categoryArg && caseCategory && caseCategory.toLowerCase() === categoryArg;
}
function matches(c) { return nounMatches(c.noun) || categoryMatches(c.category); }

const direct = cases.filter(matches);
const sameApproachSummary = {};
for (const c of cases) {
  sameApproachSummary[c.approach] = sameApproachSummary[c.approach] || { PASS: 0, FAIL: 0, PARTIAL: 0 };
  sameApproachSummary[c.approach][c.verdict] = (sameApproachSummary[c.approach][c.verdict] || 0) + 1;
}

if (direct.length === 0) {
  console.log(`No direct case history for "${query}"${categoryArg ? ` / category "${categoryArg}"` : ''}. ` +
    (categoryArg ? 'Genuinely new — no shortcut here.' :
      `Try again with a category guess if this noun is a KIND of something already on record ` +
      `(e.g. "vine" → thin-flexible-cord). Known categories: ${KNOWN_CATEGORIES.join(', ')}.`));
} else {
  console.log(`\n${direct.length} case(s) found for "${query}"${categoryArg ? ` / category "${categoryArg}"` : ''}:\n`);
  for (const c of direct) {
    console.log(`[${c.verdict}] ${c.noun} (${c.category || 'uncategorized'}) — ${c.approach} (${c.date}, ${c.file})`);
    console.log(`  root cause: ${c.rootCause}`);
    if (c.fixThatWorked) console.log(`  fix that worked: ${c.fixThatWorked}`);
    console.log('');
  }
  const failedHandCoded = direct.filter(c => c.approach.startsWith('hand-coded') && c.verdict === 'FAIL');
  if (failedHandCoded.length > 0) {
    console.log(`⚠️  Hand-coding "${query}" has already failed ${failedHandCoded.length} time(s) in this exact case log. ` +
      `Per the noun test's escalation rule, default to generated art unless you have a concrete, ` +
      `new reason this attempt differs from the ones on record above.`);
  }
}

console.log('\n--- overall approach track record across ALL cases (not just this noun) ---');
for (const [approach, counts] of Object.entries(sameApproachSummary)) {
  console.log(`  ${approach}: PASS=${counts.PASS || 0} FAIL=${counts.FAIL || 0} PARTIAL=${counts.PARTIAL || 0}`);
}
