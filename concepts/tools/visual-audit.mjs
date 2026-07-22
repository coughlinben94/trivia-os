#!/usr/bin/env node
// concepts/tools/visual-audit.mjs
//
// Renders a built concepts/*.html file in real headless Chromium (via
// Playwright) and captures screenshots across its timeline — the real visual
// pass, not just the code-invariant checklist in /audit. Produces an
// "evidence bundle" (screenshots + index.json + INDEX.md) that a human or a
// second-opinion reviewer agent can scan quickly, instead of trusting prose
// claims about what renders.
//
// TIMING METHOD — real-time polling with self-correcting waits, NOT a
// running tally and NOT mocked-clock seeking. History, for whoever touches
// this next:
//   v1 waited in real time via a running "requested time so far" tally that
//   never accounted for each screenshot's real disk-write cost. It drifted
//   1s+ over 6 shots and once caused a false bug report by missing a 1.1s
//   animation beat entirely — see QUEUE.md's space-road-trip 2026-07-22
//   [CORRECTION] entry and NIGHTLY-LOG.md for the full story.
//   v2 tried Playwright's page.clock API (mocked/seekable time) on the
//   theory that a virtual clock can't drift, and it's dramatically faster.
//   Verified WRONG empirically before shipping: page.clock.fastForward()
//   tracks precisely on its own, but interleaving page.screenshot() calls
//   with it introduces real, reproducible extra time advancement in this
//   Chromium build — worse compression than the original bug, confirmed by
//   comparing against real elapsed-time ground truth with and without
//   screenshot calls in the loop. Reverted rather than ship a "fix" that
//   looks clever but isn't actually correct.
//   v3 (this version) is v1's real-time approach done right: every wait is
//   computed from actual Date.now() elapsed-since-navigation each iteration
//   (never a running tally, so nothing compounds), polled at a real cadence
//   cheap enough to not matter (no screenshot on most polls — see sampling
//   strategy below). Slower than the abandoned v2 (real ~40s for a 40s
//   animation, not ~1-2s), but actually correct, which is what matters.
//
// SAMPLING STRATEGY — generic across any file, not hand-tuned per file.
// Steps forward in small increments (--step, default 150ms) across the full
// --duration. At each step, reads the page's own #phaseLabel text (this
// pipeline's established convention — see AGENT-PROMPT.md / round-journeys.md)
// if present. Takes a screenshot whenever: (a) the phase label just changed
// (guarantees no phase, however short, is ever skipped, as long as --step is
// smaller than its duration — the default 150ms safely covers this pipeline's
// shortest observed beat, HAR_NOVA at 1100ms, with margin), or (b) at least
// --min-hold-gap ms (default 1500) have passed since the last shot within an
// unchanged phase (keeps a long ambient hold from producing dozens of near-
// identical frames), or (c) it's the very first or very last step. Files with
// no #phaseLabel element still work — sampling falls back to the (b)/(c)
// rules alone.
//
// Needs concepts/tools/ensure-xdamage-stub.sh run first this sandbox lifetime
// (see that file for why) — this script runs it itself, no separate step
// needed by the caller.
//
// Usage:
//   node visual-audit.mjs <path-to-html> [--duration=40000] [--step=150] [--min-hold-gap=1500] [--slug=name]
//
// Output: prints the evidence bundle directory, then a final JSON line:
//   {"pageErrors":[...],"consoleErrors":[...],"shots":[...],"bundleDir":"..."}
// The same data is written to <bundleDir>/index.json and, human-readable, to
// <bundleDir>/INDEX.md.

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const filePath = args.find(a => !a.startsWith('--'));
if (!filePath) {
  console.error('Usage: node visual-audit.mjs <path-to-html> [--duration=40000] [--step=150] [--min-hold-gap=1500] [--slug=name]');
  process.exit(1);
}
const getFlag = (name, def) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};
const duration = parseInt(getFlag('duration', '15000'), 10);
// Real-time poll cadence. 200ms is cheap (no screenshot most polls) and
// safely gets several polls inside this pipeline's shortest observed beat
// (HAR_NOVA at 1100ms) without producing an excessive poll count over a full
// ~40s file (~200 polls, negligible — screenshots, not polls, are the real
// cost, and those are throttled separately by --min-hold-gap below).
const step = parseInt(getFlag('step', '200'), 10);
const minHoldGap = parseInt(getFlag('min-hold-gap', '1500'), 10);
const slug = getFlag('slug', basename(filePath).replace(/\.html?$/, ''));

const absFile = resolve(filePath);
if (!existsSync(absFile)) {
  console.error(`File not found: ${absFile}`);
  process.exit(1);
}

// Ensure the libXdamage stub exists and get its dir onto LD_LIBRARY_PATH for
// this process only (does not mutate the parent shell's environment).
const exportLine = execSync(`"${HERE}/ensure-xdamage-stub.sh"`, { encoding: 'utf8' }).trim();
const stubDirMatch = exportLine.match(/LD_LIBRARY_PATH="([^$"]+)/);
if (stubDirMatch) {
  process.env.LD_LIBRARY_PATH = `${stubDirMatch[1]}${process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : ''}`;
}

// Never delete inside concepts/ — the connected folder's delete-permission
// wall blocks unlink/rmdir there for an unattended run (see
// nightly-checkout.sh's header comment for the original discovery). Fix is
// the same pattern used throughout this pipeline: never delete, always write
// to a fresh directory.
const bundleDir = resolve(HERE, '..', '.audit-shots', `${slug}-${Date.now()}`);
mkdirSync(bundleDir, { recursive: true });

const pageErrors = [];
const consoleErrors = [];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  const navStart = Date.now();
  await page.goto(`file://${absFile}`, { waitUntil: 'load' });

  const readLabel = async () => {
    try {
      return await page.evaluate(() => document.getElementById('phaseLabel')?.textContent?.trim() || '');
    } catch { return ''; }
  };

  const shots = [];
  let lastLabel = null;
  let lastShotAt = -Infinity;

  const takeShot = async (t, label, reason, realMs) => {
    const labelSlug = (label || 'nolabel').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'nolabel';
    const shotPath = resolve(bundleDir, `shot-t${String(t).padStart(6, '0')}-${labelSlug}.png`);
    await page.screenshot({ path: shotPath });
    shots.push({ path: shotPath, ms: t, realMs, label, reason });
    lastShotAt = t;
  };

  for (let t = 0; t <= duration; t += step) {
    // Wait computed from REAL elapsed-since-navigation each iteration, never
    // a running tally — this is what prevents drift from compounding across
    // iterations (see header comment history for why that matters here).
    const realElapsed = Date.now() - navStart;
    const wait = Math.max(t - realElapsed, 0);
    if (wait > 0) await page.waitForTimeout(wait);
    const label = await readLabel();
    const isFirst = t === 0;
    const isLast = t + step > duration;
    const phaseChanged = label !== lastLabel;
    const holdGapElapsed = (t - lastShotAt) >= minHoldGap;
    if (isFirst || isLast || phaseChanged || holdGapElapsed) {
      const realAtCapture = Date.now() - navStart;
      await takeShot(t, label, isFirst ? 'first' : isLast ? 'last' : phaseChanged ? 'phase-change' : 'hold-gap', realAtCapture);
    }
    lastLabel = label;
  }

  const bundle = {
    file: absFile,
    slug,
    duration,
    step,
    minHoldGap,
    generatedAt: new Date().toISOString(),
    pageErrors,
    consoleErrors,
    shots: shots.map(s => ({ path: s.path, requestedMs: s.ms, realMs: s.realMs, label: s.label, reason: s.reason })),
  };
  writeFileSync(resolve(bundleDir, 'index.json'), JSON.stringify(bundle, null, 2));

  const md = [
    `# Visual audit — ${slug}`,
    ``,
    `Source: \`${absFile}\``,
    `Generated: ${bundle.generatedAt}`,
    `Duration sampled: ${duration}ms, poll step ${step}ms, min hold gap ${minHoldGap}ms`,
    `Page errors: ${pageErrors.length}${pageErrors.length ? ' — ' + pageErrors.join('; ') : ''}`,
    `Console errors: ${consoleErrors.length}${consoleErrors.length ? ' — ' + consoleErrors.join('; ') : ''}`,
    ``,
    `requested = timestamp this shot was scheduled for; real = actual elapsed ms since`,
    `navigation at capture time (ground truth — check this against requested, don't`,
    `assume the request was honored exactly).`,
    ``,
    `| requested (ms) | real (ms) | phase | why captured | frame |`,
    `|---|---|---|---|---|`,
    ...shots.map(s => `| ${s.ms} | ${s.realMs} | ${s.label || '(no label)'} | ${s.reason} | ${basename(s.path)} |`),
  ].join('\n');
  writeFileSync(resolve(bundleDir, 'INDEX.md'), md);

  console.log(bundleDir);
  for (const s of shots) console.log(`  requested=${s.ms}ms  real=${s.realMs}ms  ${s.label || '(no label)'}  [${s.reason}]  ${basename(s.path)}`);
  console.log(JSON.stringify({ pageErrors, consoleErrors, shots: shots.map(s => s.path), bundleDir }));
} finally {
  await browser.close();
}
