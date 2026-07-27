#!/usr/bin/env node
// .claude/hooks/geometry-lint.mjs
//
// Deterministic, no-DOM, no-dependency check for the two concrete bugs that
// shipped Campfire Sing-Along's flame as "a lit rectangle":
//   1. radial-gradient ellipse geometry whose center±radius overruns its own
//      box before reaching `transparent` (per CSS Images 3, an explicit
//      `ellipse RX% RY% at CX% CY%` resolves RX/CX against the gradient
//      box's WIDTH and RY/CY against its HEIGHT — each axis is already a
//      self-contained percentage, so this is pure arithmetic on the
//      gradient's own declared numbers, no box/DOM lookup needed).
//   2. `box-shadow` used as a stand-in for a soft glow on an element with no
//      border-radius, which CSS renders as a blurred RECTANGLE, not a glow.
//
// Three-tier result per check (not a single pass/fail line), because a
// binary threshold produced a real contradiction during review: a margin of
// exactly 4% is a genuine near-miss, not clearly "fine" or clearly "broken."
//   FAIL  margin < 3%  (or negative — a real overrun)
//   WARN  3% <= margin < 8%  (cutting it close; flagged, doesn't block)
//   PASS  margin >= 8%
// Only FAIL rows exit non-zero. The BOTTOM edge is never scored as FAIL/WARN
// — per this project's own established convention (DESIGN-WORKER-LESSONS.md),
// a bottom anchor blending into a ground plane is intentional, not a bug.
//
// Unparseable gradient forms (keyword sizes like `closest-side`, `var(...)`
// radii, anything not matching this codebase's own
// `ellipse RX% RY% at CX% CY%` convention) are reported as FAIL, not
// silently skipped — a check that can't read a case must not green-light it.
//
// Usage:
//   node geometry-lint.mjs <file> [<file>…]  — manual/CI/pre-commit run
//   echo '{"tool_input":{"file_path":"..."}}' | node geometry-lint.mjs --hook
// In --hook mode it reads `file_path`, `notebook_path`, or — for Bash writes,
// which named no path at all and so were linted by nothing — visual-looking
// paths parsed out of `command`.
// Exit 0 = no FAIL rows. Exit 2 = at least one FAIL row (Claude Code hook
// blocking convention — exit 1 is documented as NON-blocking, a real
// footgun; this script always uses 2 for anything that should stop the
// agent). NOTE: as a PostToolUse hook, exit 2 does NOT undo an already-
// written file — it only feeds the failure back to the model as an
// instruction to fix it before continuing. The actual hard backstop is
// design-done-gate.mjs, which re-runs this same check before allowing Stop.
//
// Scope: only files matching this project's visual-authoring surfaces.
// Everything else exits 0 immediately with no output.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VISUAL_PATH_RE = /(^|\/)concepts\/.*\.html$|(^|\/)client\/src\/components\/display\/.*\.jsx$/;

// Hook payloads name their target differently per tool, and this used to read
// `tool_input.file_path` only. Two consequences, both real: NotebookEdit uses
// `notebook_path`, and a file written through Bash (`cat > scene.html <<EOF`,
// `tee`, `sed -i`, a generator script) names no path field at all — so a whole
// class of visual writes was linted by nothing. The settings.json matcher was
// simultaneously `Edit|Write`, which also excluded MultiEdit and NotebookEdit;
// both ends are widened now. Bash commands are scanned for visual-looking
// paths, filtered to ones that exist and match VISUAL_PATH_RE, so an unrelated
// command costs at most a no-op parse.
//
// One extra filter on the Bash path, and only there: the file must have been
// modified within the last 60 seconds. A Bash command mentioning a visual file
// usually WROTE it (heredoc, `>`, `sed -i`, a generator), but it just as often
// only RENDERED or read it — `node concepts/tools/visual-audit.mjs
// concepts/legacy-scene.html`. Without the recency filter, rendering any legacy
// scene that still carries a known FAIL row made this hook exit 2 and hand the
// agent an instruction to go fix a file it never touched, on every single render
// command. A file this command actually wrote is seconds old by definition; the
// worst case of the filter is a slow generator, which the Stop-time gate
// re-lints anyway. Named-path payloads (Edit/Write/MultiEdit/NotebookEdit) are
// unaffected — there the tool told us what it wrote.
function getTargetFiles() {
  const hookMode = process.argv.includes('--hook');
  if (!hookMode) return { files: process.argv.slice(2), fromBash: false };
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { return { files: [], fromBash: false }; }
  let payload;
  try { payload = JSON.parse(raw); } catch { return { files: [], fromBash: false }; }
  const named = payload?.tool_input?.file_path || payload?.tool_input?.notebook_path;
  if (named) return { files: [named], fromBash: false };
  const cmd = payload?.tool_input?.command;
  if (typeof cmd === 'string') return { files: cmd.match(/[\w./-]+\.(?:html|jsx)/g) || [], fromBash: true };
  return { files: [], fromBash: false };
}

const { files: candidates, fromBash } = getTargetFiles();
const files = [...new Set(candidates)]
  .filter(f => f && VISUAL_PATH_RE.test(f) && existsSync(f))
  .filter(f => !fromBash || (Date.now() - statSync(f).mtimeMs) < 60000);
if (files.length === 0) {
  process.exit(0); // not a visual file (or doesn't exist yet) — nothing to check
}
// More than one visual file in a single Bash command is possible; lint them all
// rather than picking one, and exit non-zero if ANY of them has a FAIL row.
if (files.length > 1) {
  let worst = 0;
  for (const f of files) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), f], { stdio: 'inherit' });
    // Any non-zero (or a signal kill) becomes 2, not just an exact 2. Mapping
    // `status === 2 ? 2 : 0` treated a CRASHED child — exit 1, or null status
    // from a signal — as a clean pass, which is this lint failing open on the
    // one path where it can't see the file at all.
    if (r.status !== 0) worst = 2;
  }
  process.exit(worst);
}

const file = files[0];
const text = readFileSync(file, 'utf8');

// ── balanced-paren extraction: find every `radial-gradient(...)` and
// `box-shadow`/`boxShadow` declaration's value, however deeply nested in
// JSX template-literal text or a plain CSS/HTML <style> block. ──
function extractCalls(source, name) {
  const calls = [];
  let idx = 0;
  while (true) {
    const at = source.indexOf(name + '(', idx);
    if (at === -1) break;
    let depth = 0, i = at + name.length;
    let start = i;
    for (; i < source.length; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') { depth--; if (depth === 0) { i++; break; } }
    }
    calls.push({ start: at, end: i, text: source.slice(start + 1, i - 1) });
    idx = i;
  }
  return calls;
}

// top-level comma split (doesn't split inside nested parens, e.g. rgba(...))
function splitTopLevel(str) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

const rows = []; // { name, expected, actual, status: 'PASS'|'WARN'|'FAIL', note }

// ── 1. radial-gradient ellipse margin check ──
const gradients = extractCalls(text, 'radial-gradient');
gradients.forEach((g, idx) => {
  const label = `radial-gradient #${idx + 1} (offset ${g.start})`;
  const m = g.text.match(/^\s*ellipse\s+([\d.]+)%\s+([\d.]+)%\s+at\s+([\d.]+)%\s+([\d.]+)%\s*,/i);
  if (!m) {
    rows.push({ name: label, expected: 'ellipse RX% RY% at CX% CY%, ... (this codebase\'s exclusive convention)',
      actual: g.text.slice(0, 60).replace(/\s+/g, ' ') + (g.text.length > 60 ? '…' : ''),
      status: 'FAIL', note: 'unparseable form — keyword size, var(), or non-percentage radius. Cannot verify it stays inside its box; treat as a required manual check, not a pass.' });
    return;
  }
  const [, rxS, ryS, cxS, cyS] = m;
  const rx = parseFloat(rxS), ry = parseFloat(ryS), cx = parseFloat(cxS), cy = parseFloat(cyS);

  // Find the last explicit-percentage stop before/at the end of the stop
  // list (defaults to 100, i.e. the gradient's own declared radius, if no
  // stop before the closing 'transparent'/final stop carries its own %).
  // This closes a real false-positive: a gradient that fades to transparent
  // at, say, 60% of its own declared radius is NOT overrunning by the full
  // RX/RY — its effective visible extent is smaller than the raw radius.
  const stopsText = g.text.slice(m[0].length);
  const stops = splitTopLevel(stopsText);
  let lastPct = 100;
  for (let i = stops.length - 1; i >= 0; i--) {
    const pm = stops[i].match(/([\d.]+)%\s*$/);
    if (pm) { lastPct = parseFloat(pm[1]); break; }
  }
  const scale = lastPct / 100;
  const effRx = rx * scale, effRy = ry * scale;

  const left = cx - effRx, right = cx + effRx, top = cy - effRy;
  // right margin: distance from 100; left/top margin: distance from 0
  const marginLeft = left, marginRight = 100 - right, marginTop = top;

  const tier = (margin) => margin < 3 ? 'FAIL' : margin < 8 ? 'WARN' : 'PASS';
  [
    ['left', marginLeft], ['right', marginRight], ['top', marginTop],
  ].forEach(([side, margin]) => {
    rows.push({
      name: `${label} — ${side} margin`,
      expected: '>= 8% (WARN 3-8%, FAIL <3%)',
      actual: `${margin.toFixed(1)}%`,
      status: tier(margin),
      note: side === 'left' || side === 'right'
        ? `cx=${cx} rx=${rx} lastStop=${lastPct}% effRx=${effRx.toFixed(1)}`
        : `cy=${cy} ry=${ry} lastStop=${lastPct}% effRy=${effRy.toFixed(1)}`,
    });
  });
  // bottom is intentionally never scored — established convention: bottom
  // anchor bleed into a ground plane is accepted by design, not a bug.
});

// ── 2. box-shadow-as-glow-on-a-square-div check ──
// Heuristic, not proof: flag a colored/blurred box-shadow if no border-radius
// implying roundness appears within a nearby window of source text (same
// style object/attribute, in practice — JSX inline styles keep both
// properties within a few hundred characters of each other in this
// codebase's style, and plain CSS rules keep them in the same block).
const WINDOW = 400;
const shadowRe = /(?:boxShadow|box-shadow)\s*[:=]\s*[`'"]?([^`'";\n]+)/g;
let sm;
while ((sm = shadowRe.exec(text))) {
  const value = sm[1].trim();
  if (/^none\b/i.test(value)) continue;
  const hasBlurAndColor = /[\d.]+(?:px|vw|cqw|em|%)\s+[\d.]+(?:px|vw|cqw|em|%)/.test(value); // offset+blur pattern present (decimal-safe — 1.5vw broke the integer-only version)
  if (!hasBlurAndColor) continue; // a plain flat shadow, not the glow-mimicking pattern we care about
  const windowText = text.slice(Math.max(0, sm.index - WINDOW), sm.index + WINDOW);
  const hasRounding = /(?:borderRadius|border-radius)\s*[:=]\s*[`'"]?\s*(?:50%|9999px|999px|[5-9]\d%|100%)/i.test(windowText);
  rows.push({
    name: `box-shadow at offset ${sm.index}`,
    expected: 'border-radius (round/pill) within ~400 chars, if used as a glow',
    actual: hasRounding ? 'rounding found nearby' : 'no rounding found nearby',
    status: hasRounding ? 'PASS' : 'FAIL',
    note: hasRounding ? '' : `value="${value.slice(0, 70)}" — on a square/rect element this renders as a blurred RECTANGLE, not a glow.`,
  });
}

// ── 3. blur-floor spot check (WARN-only — a named failure this project
// already documented but never mechanically checked; not a hard gate yet
// since false positives on non-ambient UI chrome are plausible) ──
const blurRe = /filter\s*[:=]\s*[`'"]?[^`'"]*?blur\(([\d.]+)px\)/g;
let bm;
while ((bm = blurRe.exec(text))) {
  const px = parseFloat(bm[1]);
  if (px < 1.5) {
    rows.push({ name: `blur() at offset ${bm.index}`, expected: '>= 1.5px (this project\'s established blur floor)',
      actual: `${px}px`, status: 'WARN', note: 'below the documented floor — confirm this is intentional (e.g. a sharp UI element, not an ambient scene layer).' });
  }
}

// ── print + exit ──
if (rows.length === 0) {
  console.log(`geometry-lint: ${file} — no radial-gradient/box-shadow/blur() found to check.`);
  process.exit(0);
}
const nameW = Math.max(...rows.map(r => r.name.length), 10);
const expW = Math.max(...rows.map(r => String(r.expected).length), 8);
const actW = Math.max(...rows.map(r => String(r.actual).length), 6);
console.log(`\ngeometry-lint: ${file}\n`);
console.log('ITEM'.padEnd(nameW) + '  ' + 'EXPECTED'.padEnd(expW) + '  ' + 'ACTUAL'.padEnd(actW) + '  RESULT');
console.log('-'.repeat(nameW + expW + actW + 20));
let failCount = 0, warnCount = 0;
for (const r of rows) {
  if (r.status === 'FAIL') failCount++;
  if (r.status === 'WARN') warnCount++;
  console.log(r.name.padEnd(nameW) + '  ' + String(r.expected).padEnd(expW) + '  ' + String(r.actual).padEnd(actW) + '  ' + r.status);
  if (r.note) console.log('  note: ' + r.note);
}
console.log('-'.repeat(nameW + expW + actW + 20));
console.log(`${failCount} FAIL / ${warnCount} WARN / ${rows.length} total\n`);

if (failCount > 0) {
  console.error(`geometry-lint: ${failCount} FAIL row(s) in ${file} — fix the margin/rounding issues above before continuing.`);
  process.exit(2);
}
process.exit(0);
