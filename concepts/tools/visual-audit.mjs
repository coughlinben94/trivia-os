#!/usr/bin/env node
// concepts/tools/visual-audit.mjs
//
// Renders a built concepts/*.html file in real headless Chromium (via
// Playwright) and captures a timed sequence of screenshots to
// concepts/.audit-shots/<slug>/ — a real visual pass, not just the
// code-invariant checklist in /audit. This is what closes the gap Ben
// flagged: the pipeline could build an animation but never actually looked
// at it. The screenshots are for the agent (or Ben) to read with the Read
// tool afterward and write a genuine visual critique from — this script's
// job stops at "produce accurate frames," it does not judge them itself.
//
// Needs concepts/tools/ensure-xdamage-stub.sh run first this sandbox lifetime
// (see that file for why) — this script runs it itself, no separate step
// needed by the caller.
//
// Usage:
//   node visual-audit.mjs <path-to-html> [--duration=40000] [--interval=2500] [--slug=name]
//
// Prints one line per screenshot: "<absPath>  requested=<t>ms  real=<real>ms  <domLabel>",
// then a final JSON line: {"pageErrors":[...],"consoleErrors":[...],"shots":[...]}
//
// TIMING CORRECTNESS — read this before trusting output from a fast/narrow beat
// (anything under ~2s, e.g. a burst/flash/impact moment): early versions of this
// script scheduled screenshot N+1 by adding to a running "requested time so far"
// tally that never accounted for the real wall-clock cost of taking screenshot N
// (PNG encode + disk write, ~100-300ms each here). Over 5-6 shots that drift
// compounds to 1s+ — enough to skip a sub-2s beat ENTIRELY while still reporting
// a plausible-looking nominal timestamp. This produced a real false-positive bug
// report once (see QUEUE.md space-road-trip's 2026-07-22 correction entry) —
// a burst that was actually rendering correctly got reported as never firing,
// because every "sample" landed after it had already ended. Fixed two ways,
// both required:
//   1. Every wait is computed from actual Date.now() elapsed-since-navigation,
//      never from a running tally — this alone eliminates compounding drift.
//   2. Each screenshot's filename AND the printed line include the real elapsed
//      ms at capture time, plus the page's own #phaseLabel text if present —
//      ground truth you can check against your requested timestamp, instead of
//      trusting the request was honored.
// For any beat narrower than ~2s, don't rely on a single nominal-timestamp
// sample — either use a small `--interval` relative to that beat's own duration,
// or poll the page's own phase/label element directly (see the git history of
// this file's original probe script for the pattern) rather than trusting a
// fixed schedule to land inside a window that narrow.

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const filePath = args.find(a => !a.startsWith('--'));
if (!filePath) {
  console.error('Usage: node visual-audit.mjs <path-to-html> [--duration=40000] [--interval=2500] [--slug=name]');
  process.exit(1);
}
const getFlag = (name, def) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};
const duration = parseInt(getFlag('duration', '15000'), 10);
const interval = parseInt(getFlag('interval', '2000'), 10);
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
// wall blocks unlink/rmdir there for an unattended run (confirmed live: an
// earlier version of this script that did `rm -rf` an old output dir before
// writing new shots hit EPERM, same failure class as the git .git/index.lock
// problem this pipeline already worked around once — see nightly-checkout.sh).
// Fix is the same pattern: never delete, always write to a fresh directory.
const outDir = resolve(HERE, '..', '.audit-shots', `${slug}-${Date.now()}`);
mkdirSync(outDir, { recursive: true });

const pageErrors = [];
const consoleErrors = [];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  const navStart = Date.now();
  await page.goto(`file://${absFile}`, { waitUntil: 'load' });

  // Best-effort: this file's own convention (see AGENT-PROMPT.md / round-journeys.md)
  // is a #phaseLabel element showing "phase: <name>" — read it if present, don't
  // fail if a given file doesn't have one.
  const readLabel = async () => {
    try {
      return await page.evaluate(() => document.getElementById('phaseLabel')?.textContent?.trim() || '');
    } catch { return ''; }
  };

  const shots = [];
  // Always grab an early frame, then step every `interval` ms through `duration`,
  // then a final frame just before the end.
  const timestamps = [Math.min(500, duration)];
  for (let t = interval; t < duration; t += interval) timestamps.push(t);
  timestamps.push(Math.max(duration - 300, 0));

  for (const t of timestamps) {
    // Compute the wait from REAL elapsed time each iteration, never from a
    // running tally — this is what prevents drift from compounding across
    // screenshots (see header comment).
    const realElapsed = Date.now() - navStart;
    const wait = Math.max(t - realElapsed, 0);
    if (wait > 0) await page.waitForTimeout(wait);
    const realAtCapture = Date.now() - navStart;
    const label = await readLabel();
    const labelSlug = label.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'nolabel';
    const shotPath = resolve(outDir, `shot-req${String(t).padStart(6, '0')}-real${String(realAtCapture).padStart(6, '0')}-${labelSlug}.png`);
    await page.screenshot({ path: shotPath });
    shots.push({ path: shotPath, requestedMs: t, realMs: realAtCapture, label });
  }

  for (const s of shots) console.log(`${s.path}  requested=${s.requestedMs}ms  real=${s.realMs}ms  ${s.label}`);
  console.log(JSON.stringify({ pageErrors, consoleErrors, shots }));
} finally {
  await browser.close();
}
