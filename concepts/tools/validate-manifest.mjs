// concepts/tools/validate-manifest.mjs
//
// Usage: node validate-manifest.mjs [path-to-manifest.js]  (defaults to ../manifest.js)
//
// Independently verifies concepts/manifest.js is EXACTLY what it's supposed to be:
// comments, then a single `window.MANIFEST = <JSON literal>;` assignment, nothing else —
// before the nightly agent trusts it enough to commit. This exists because, until now,
// that guarantee was purely procedural (the agent was just instructed to write it that
// way) — the gallery only checked that window.MANIFEST was an array AFTER manifest.js had
// already executed as a raw <script src>, which is too late: any executable content in
// the file runs regardless of what the gallery checks afterward. This script parses the
// SOURCE TEXT itself, never executes it, and rejects anything that isn't provably inert
// data.
//
// Run this as the last step before every manifest.js commit. A failure here must abort
// the commit, exactly like a failed sanitizer self-test.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const targetPath = resolve(process.argv[2] || join(__dirname, '..', 'manifest.js'));

// Must match concepts/index.html's `SAFE_FILENAME` regex exactly — kept in sync by hand,
// both sides comment-reference this fact. A drift between the two would mean this
// validator accepts a filename the gallery would then refuse to load, or vice versa.
const SAFE_FILENAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.html$/;

function fail(reason) {
  console.error(`INVALID: ${reason}`);
  process.exit(1);
}

let src;
try {
  src = readFileSync(targetPath, 'utf8');
} catch (err) {
  fail(`cannot read ${targetPath}: ${err.message}`);
}

// Strip //-comment-only lines and blank lines from the top. Anything else before the
// assignment is already a violation (multiple statements, a leading var, etc.).
const lines = src.split('\n');
let i = 0;
while (i < lines.length) {
  const line = lines[i].trim();
  if (line === '' || line.startsWith('//')) { i++; continue; }
  break;
}
const rest = lines.slice(i).join('\n').trim();

// The ENTIRE remaining content must be exactly one assignment statement:
//   window.MANIFEST = <json>;
// with nothing before, after, or interleaved. This regex requires the json blob to be
// everything between " = " and the FINAL ";" at end of string — deliberately strict.
const match = rest.match(/^window\.MANIFEST\s*=\s*([\s\S]*);\s*$/);
if (!match) {
  fail('content is not exactly a single "window.MANIFEST = <json>;" assignment (after stripping leading comments/blank lines). No other statements, function calls, or template literals are permitted.');
}

const jsonText = match[1];

// ONE precise pre-parse check, not a blunt keyword scan. An earlier version of this
// checked for the substrings "window"/"document"/"new "/backtick/"=>" anywhere in the
// text — which rejected entirely ordinary creative prose ("spaceship window", "new
// moon crests the hill") that JSON.parse below already proves is inert string data, not
// executable code. Once content is valid JSON, a JSON string VALUE containing the word
// "document" is just text — it can never execute, regardless of what it says. The one
// genuine risk that survives JSON-validity is the literal, unescaped byte sequence
// "</script" landing in the raw file text — that's an HTML-parser-level breakout that
// happens before any JS/JSON parser ever sees the content, so it's real and worth its
// own check, but it's the ONLY thing in this category that is.
if (/<\/script/i.test(jsonText)) {
  fail('manifest data contains a literal, unescaped "</script" sequence — this should have been escaped to "\\u003c/script" by the writer. Its raw presence here means the escaping step was skipped.');
}

let entries;
try {
  entries = JSON.parse(jsonText);
} catch (err) {
  fail(`the assigned value is not valid JSON: ${err.message}`);
}

if (!Array.isArray(entries)) {
  fail('window.MANIFEST must be a JSON array.');
}

const REQUIRED_STRING_FIELDS = ['id', 'status', 'source', 'date'];
const VALID_STATUSES = new Set(['draft', 'blocked', 'needs-revision', 'rejected', 'approved', 'shipped']);
const VALID_JOURNEY_TYPES = new Set(['same-theme', 'cross-theme']);

const seenIds = new Set();
entries.forEach((entry, idx) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    fail(`entry[${idx}] is not a plain object.`);
  }
  for (const f of REQUIRED_STRING_FIELDS) {
    if (typeof entry[f] !== 'string' || entry[f].length === 0) {
      fail(`entry[${idx}] (id: ${entry.id ?? '?'}) is missing required string field "${f}".`);
    }
  }
  if (!VALID_STATUSES.has(entry.status)) {
    fail(`entry[${idx}] (id: ${entry.id}) has invalid status "${entry.status}".`);
  }
  if (entry.journeyType !== undefined && !VALID_JOURNEY_TYPES.has(entry.journeyType)) {
    fail(`entry[${idx}] (id: ${entry.id}) has invalid journeyType "${entry.journeyType}".`);
  }
  if (entry.file !== null && entry.file !== undefined) {
    if (typeof entry.file !== 'string' || !SAFE_FILENAME.test(entry.file) || entry.file.includes('..') || entry.file.includes('/') || entry.file.includes('\\')) {
      fail(`entry[${idx}] (id: ${entry.id}) has an unsafe or invalid "file" value: ${JSON.stringify(entry.file)}`);
    }
  } else if (entry.status !== 'blocked') {
    fail(`entry[${idx}] (id: ${entry.id}) has no file but status is "${entry.status}", not "blocked" — only blocked entries may have a null file.`);
  }
  // Multiple entries CAN legitimately share an `id` — that's exactly how a version
  // chain works (PLAN.md's iteration/supersedes model): iteration 1, 2, 3 of the same
  // queue id are three separate manifest entries the gallery groups and shows side by
  // side. What must be unique is the (id, iteration) PAIR, and every filename.
  const iterKey = `${entry.id}::${entry.iteration ?? 1}`;
  if (seenIds.has(iterKey)) {
    fail(`duplicate (id, iteration) pair "${iterKey}" at entry[${idx}] — two entries claiming to be the same iteration of the same design.`);
  }
  seenIds.add(iterKey);
  if (entry.sprites !== undefined) {
    if (!Array.isArray(entry.sprites)) fail(`entry[${idx}] (id: ${entry.id}) "sprites" must be an array.`);
    for (const s of entry.sprites) {
      if (!s || typeof s !== 'object' || typeof s.prompt !== 'string' || typeof s.model !== 'string') {
        fail(`entry[${idx}] (id: ${entry.id}) has a malformed sprite provenance entry.`);
      }
    }
  }
  if (entry.revisionNotes !== undefined) {
    if (!Array.isArray(entry.revisionNotes)) fail(`entry[${idx}] (id: ${entry.id}) "revisionNotes" must be an array.`);
    for (const n of entry.revisionNotes) {
      if (!n || typeof n !== 'object' || typeof n.note !== 'string') {
        fail(`entry[${idx}] (id: ${entry.id}) has a malformed revision note.`);
      }
    }
  }
});

// Filenames must be globally unique regardless of id/iteration — two different entries
// pointing at the same file would mean one of them doesn't actually have its own artifact.
const seenFiles = new Set();
entries.forEach((entry, idx) => {
  if (!entry.file) return;
  if (seenFiles.has(entry.file)) {
    fail(`file "${entry.file}" is referenced by more than one manifest entry (entry[${idx}]).`);
  }
  seenFiles.add(entry.file);
});

// Iteration chain integrity: an entry claiming iteration > 1 must point `supersedes` at
// SOME other entry sharing its id at iteration exactly one less. This doesn't prove the
// chain is semantically correct, but it catches an obviously broken link (wrong id,
// skipped iteration, dangling reference) before Ben's gallery renders a confusing chain.
//
// `.has()` is checked separately from the stored value because the stored value can
// legitimately BE null (a `blocked` iteration has no file) — using `.get() === undefined`
// to mean "no such entry" would be indistinguishable from "entry exists, file is null."
const byIdIteration = new Map(); // "id::iteration" -> file (may be null for blocked entries)
for (const e of entries) byIdIteration.set(`${e.id}::${e.iteration ?? 1}`, e.file ?? null);
entries.forEach((entry, idx) => {
  const iter = entry.iteration ?? 1;
  if (iter > 1) {
    const prevKey = `${entry.id}::${iter - 1}`;
    if (!byIdIteration.has(prevKey)) {
      fail(`entry[${idx}] (id: ${entry.id}) claims iteration ${iter} but no entry exists for iteration ${iter - 1} of the same id — the chain is missing a link.`);
    }
    const expectedPrev = byIdIteration.get(prevKey);
    const actualSupersedes = entry.supersedes ?? null;
    // supersedes must equal the PREVIOUS iteration's file exactly — including the
    // legitimate case where that previous iteration was `blocked` with a null file, in
    // which case THIS entry's supersedes should also be null (there's nothing to point
    // at). An earlier version of this check required supersedes to be truthy
    // unconditionally, which made it mathematically impossible to validly supersede a
    // blocked/file-less iteration (Gemini code review, finding #6) — a completely
    // ordinary sequence (a blocked night followed by a real retry) could never pass.
    if (actualSupersedes !== expectedPrev) {
      fail(`entry[${idx}] (id: ${entry.id}, iteration ${iter}) "supersedes" value (${JSON.stringify(actualSupersedes)}) doesn't match iteration ${iter - 1}'s actual file (${JSON.stringify(expectedPrev)}) for the same id.`);
    }
  } else if (entry.supersedes) {
    fail(`entry[${idx}] (id: ${entry.id}) is iteration 1 but has a non-null "supersedes" — iteration 1 should never supersede anything.`);
  }
});

console.log(`VALID: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}, all fields well-formed, (id,iteration) pairs and filenames unique, iteration chains consistent.`);
process.exit(0);
