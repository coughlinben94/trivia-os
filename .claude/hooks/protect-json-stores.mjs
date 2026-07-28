#!/usr/bin/env node
// .claude/hooks/protect-json-stores.mjs
//
// PreToolUse guard on Bash. Fixes B1 (and the screenshot half of B2) from
// concepts/design-pipeline-hardening-fix.md: the Write/Edit deny list on the
// gate's protected stores only blocks the Write/Edit TOOLS — Bash was always
// wide open (unscoped Bash(rm *), Bash(mv *), Bash(node *), Bash(cd *), and
// an unscoped Bash(cd /Users/.../trivia-os && *) that permits literally any
// command whatsoever once cd-prefixed). This hook is the actual enforcement:
// it inspects the Bash command string itself, independent of what
// settings.json's allow list already granted, and blocks (exit 2) any
// write-shaped access to the paths below — regardless of how permissive the
// allow list is or ever becomes.
//
// TWO PROTECTION TIERS, not one, because the two path classes need genuinely
// different treatment:
//
//   JSON_STORE_PATHS — concepts/.design-attempt-counts.json,
//   concepts/design-cases.json, concepts/.design-critic-verdicts/, and
//   concepts/.design-gate-audit.log (the audit trail added in a later pass of
//   this same plan — included here now so this file doesn't need a second
//   edit when that lands). These are GATE-OWNED: only design-done-gate.mjs's
//   own writeFileSync/appendFileSync calls may ever touch them. Every write
//   verb is blocked here — rm, mv, cp/install (destination), tee, sed -i,
//   redirection, touch, and an eval-flag interpreter invocation (node -e,
//   python3 -c, etc.) whose inline script text mentions the path.
//
//   SHOTS_DIR — concepts/.audit-shots/. This one is NOT gate-owned — the
//   worker legitimately writes, renames, and copies real screenshots there
//   constantly (that's the whole point of the directory), so blocking every
//   write verb here would break the intended workflow (e.g. `cp
//   .audit-shots/bundle/shot-t001-flame.png
//   .audit-shots/concepts_x.html__flame.png`, the documented convention for
//   getting a real capture into its slug-named final path). What must be
//   blocked here is narrower and specific to B2's actual attack: forging an
//   EXISTING file's mtime without re-rendering — `touch`/`touch -d`, or an
//   eval-flag interpreter call whose inline script mentions
//   utimes/utimesSync. Ordinary rm/mv/cp/tee/sed-i against this directory are
//   NOT blocked; they are the legitimate way screenshots get into place.
//
// Segment-parsing splits on &&, ||, ;, |, and newlines, mirroring
// design-done-gate.mjs's own BASH_SEGMENT_SPLIT_RE/BASH_STRONG_*/BASH_WEAK_*
// convention, for the reason that file's v9 changelog entry #1 documents at
// length: a per-command (not per-segment) check leaks past compound
// commands, which is how agents actually write Bash. Unlike that file's
// naive regex split, this one is quote-aware (see splitSegments below) — a
// plain regex split tears apart any command whose own quoted argument
// happens to contain one of those separator characters. Not importing
// design-done-gate.mjs's constants directly — that file runs top-level code
// on import (it is a script, not a module: it reads stdin and executes
// immediately), so importing it here would run its entire Stop-hook body as
// a side effect of loading this file. Duplicated below deliberately; it is a
// handful of small regexes, and correctness here matters more than avoiding
// a few duplicate lines.
//
// Exit 0 = allow. Exit 2 = block. (Exit-code semantics confirmed in
// concepts/design-worker-p0-p2-plan.md's research note #2: exit 1 is
// non-blocking, exit 2 blocks.) Fails toward blocking: any error reading or
// parsing the PreToolUse payload is treated as "cannot prove this command is
// safe" and blocks, matching design-done-gate.mjs's own stated fail-toward-
// blocking discipline rather than failing open.
//
// KNOWN LIMITATIONS — this is a regex over command text, not a shell parser,
// and these gaps are accepted rather than fixed, for the reasons stated:
//
//   - Interpreter string-concatenation (e.g. building the target path as
//     joined string fragments passed to node -e / python3 -c instead of a
//     literal) can evade JSON_STORE_PATH_RE's literal-substring match.
//   - Bare shell-variable indirection, e.g. `f=concepts/design-cases.json;
//     rm $f` — closing this requires actual shell parsing / variable-
//     expansion simulation, not regex matching. Out of scope for a
//     pattern-matching hook, same category as the string-concatenation gap
//     above.
//   - No cwd-awareness: bare or relative filenames that omit the literal
//     `concepts/` prefix are invisible to this hook, e.g. `rm
//     design-cases.json` run from inside `concepts/`, or `rm
//     ../design-cases.json` run from a subdirectory one level under it. The
//     hook inspects command text only — it has no knowledge of the actual
//     working directory a command would execute in — so it cannot tell
//     "design-cases.json" apart from an unrelated file of the same name in
//     an unrelated directory. Closing this without new false positives would
//     need real cwd-tracking; out of scope here.
//   - `cp`/`install` flags that take a SEPARATE value token (e.g. `cp -t
//     DIR src`/`cp --target-directory DIR src`, or `install -m 644 src
//     dest`) can misalign which token ANCHORED_WRITE_RE checks as the
//     destination, since the flag-skip logic treats every `-flag` token as
//     value-less. Rare in practice; not worth a full getopt parser for this
//     hook.
//   - splitSegments()'s $(...) nesting tracker is a plain depth counter, not
//     a real parser: a literal unescaped `(` or `)` inside a QUOTED string
//     nested within a substitution (e.g. `$(echo "(")`) can miscount depth
//     and misplace where the substitution actually ends. Same family as the
//     other gaps above — out of scope for a non-parsing pattern matcher.
//   - A cp/install/redirection DESTINATION argument deliberately wrapped in `$(...)` or backticks
//     (e.g. `cp src.png $(echo concepts/design-cases.json)`) is invisible to ANCHORED_WRITE_RE's
//     destination capture regardless of whether an embedded separator is present — the capture's
//     character class stops at `$`/`(`/`)`, so it never recognizes the destination as a destination at
//     all. Same category as the other accepted gaps: this requires deliberately constructing an unusual
//     substitution specifically to route around the check, not something ordinary usage produces. The
//     whole-segment verbs (rm/mv/touch/sed-i/tee) don't share this gap — they match the protected path
//     as a literal substring anywhere in the segment, which still works even through a substitution.

import { readFileSync } from 'node:fs';

function readStdinJson() {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return null; }
}

// Quote-aware segment split — NOT a regex split, on purpose. A naive split on ;/|/&&/||/newline
// tears apart any command whose OWN quoted argument happens to contain one of those characters —
// `sed -i 's/a/b/;s/c/d/' concepts/design-cases.json` (an ordinary multi-substitution sed script,
// not adversarial obfuscation) split into fragments that individually lost either the write-verb or
// the protected path, bypassing detection entirely via everyday syntax. This scanner tracks bash
// quoting state (nothing is special inside single quotes; inside double quotes, backslash can escape
// $ ` " \; outside quotes, a bare backslash escapes the next character) and only treats ;/|/&&/||
// /newline as a real separator when outside any quote. It ALSO tracks backtick command-substitution
// and $(...) command-substitution as non-splitting regions the same way — an embedded separator
// inside an unquoted `rm $(true; echo concepts/design-cases.json)` must not fragment the command
// either, since the substitution's own output becomes rm's real argument at execution time. $(...)
// nesting is tracked with a depth counter (so `$(echo $(date))` still parses correctly). This is a
// real quote/substitution tracker, not a full shell parser — it does not resolve variable expansion,
// which remains a documented, accepted limitation below (along with the depth-counter's own edge case
// with nested quotes inside a substitution, also documented below).
function splitSegments(command) {
  const segments = [];
  let current = '';
  let inSingle = false, inDouble = false, inBacktick = false, substDepth = 0;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (inSingle) {
      current += ch;
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      current += ch;
      if (ch === '\\' && i + 1 < command.length) { current += command[++i]; continue; }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inBacktick) {
      current += ch;
      if (ch === '\\' && i + 1 < command.length) { current += command[++i]; continue; }
      if (ch === '`') inBacktick = false;
      continue;
    }
    if (substDepth > 0) {
      current += ch;
      if (ch === '(') substDepth++;
      else if (ch === ')') substDepth--;
      continue;
    }
    if (ch === "'") { inSingle = true; current += ch; continue; }
    if (ch === '"') { inDouble = true; current += ch; continue; }
    if (ch === '`') { inBacktick = true; current += ch; continue; }
    if (ch === '$' && command[i + 1] === '(') { substDepth = 1; current += ch + '('; i++; continue; }
    if (ch === '\\' && i + 1 < command.length) { current += ch + command[++i]; continue; }
    if (ch === '\n') { segments.push(current); current = ''; continue; }
    if (ch === ';') { segments.push(current); current = ''; continue; }
    if (ch === '|') {
      if (command[i + 1] === '|') { segments.push(current); current = ''; i++; continue; }
      segments.push(current); current = ''; continue;
    }
    if (ch === '&') {
      if (command[i + 1] === '&') { segments.push(current); current = ''; i++; continue; }
      current += ch; continue; // single & (background) is not a segment separator this hook cares about
    }
    current += ch;
  }
  segments.push(current);
  return segments;
}

const JSON_STORE_PATH_RE = /concepts\/\.design-attempt-counts\.json|concepts\/design-cases\.json|concepts\/\.design-critic-verdicts\b|concepts\/\.design-gate-audit\.log/;
const SHOTS_DIR_RE = /concepts\/\.audit-shots\//;
// Finding #3 (round 2 review): the verdict now carries a content hash (see design-done-gate.mjs's
// sceneHash()), which correctly detects when a scene's CONTENT changed — but freshShotsFor() still
// compares screenshot mtime against the scene FILE's mtime, and until now nothing stopped that mtime
// from being forged the same way screenshot mtimes were before the prior round's fix. Confirmed live:
// `node -e "require('fs').utimesSync('concepts/scene.html',0,0)"` and `touch -d` both passed the guard.
// Attack: edit the scene for real (hash correctly goes stale, forcing a critic re-spawn), backdate its
// mtime, and every PRE-EDIT screenshot reads as fresh again — so the critic panel judges old pixels
// while the resulting verdict gets stamped with the NEW content's hash, looking bound to evidence it
// was never shown. Rather than build a second, agent-controlled hash-sidecar scheme for screenshots
// (which has the same forgeability problem the verdict hash avoided only because the GATE computes
// it, not an agent-invoked step), this closes the actual attack at its root: an agent simply cannot
// forge a scene file's mtime anymore, so editing it for real is the only way its mtime changes.
const SCENE_FILE_RE = /concepts\/[\w.-]+\.html\b/;
const EVIDENCE_MTIME_PATH_RE = new RegExp(`${SHOTS_DIR_RE.source}|${SCENE_FILE_RE.source}`);

// Destructive git verbs — CRITICAL finding #2 (round 2 review): git checkout/restore/stash/rm/clean
// touching a protected path, or git reset --hard at all, silently reverts or wipes the protected
// stores with zero relationship to protect-json-stores.mjs's write-verb detection above (none of
// those regexes look at git subcommands at all). Confirmed live: `git checkout HEAD~3 --
// concepts/design-cases.json`, `git clean -fdx concepts/`, `git stash push -- concepts/design-
// cases.json`, `git reset --hard HEAD~1`, and `git restore concepts/.design-attempt-counts.json` all
// returned exit 0 (allowed) before this fix. This was the single largest hole in the whole guard —
// bigger than anything the write-verb detection covered, since design-cases.json and
// .design-attempt-counts.json are both git-tracked and Bash(git *) is unrestricted.
const GIT_DESTRUCTIVE_RE = /^\s*git\s+(checkout|restore|stash|rm|clean|reset)\b/;
function segmentIsDestructiveGit(seg) {
  const m = GIT_DESTRUCTIVE_RE.exec(seg);
  if (!m) return false;
  const subcommand = m[1];
  const dequoted = seg.replace(/['"]/g, '');
  // `git clean` wipes untracked files by DIRECTORY scope, not by naming a specific file — it can
  // never be scoped to "does this segment mention the exact protected filename" the way rm/mv can,
  // because it doesn't need to. .design-critic-verdicts/ and .design-gate-audit.log are BOTH
  // untracked (design-cases.json and .design-attempt-counts.json are git-tracked, so `clean` doesn't
  // touch those two, but does touch the other two) — block any `git clean` outright rather than try
  // to prove a particular invocation is safe.
  if (subcommand === 'clean') return true;
  // `git reset --hard` discards ALL uncommitted changes repo-wide and never names a path at all —
  // there is nothing to co-occurrence-check against. This project's own global instructions already
  // say never run this without explicit request; enforcing that mechanically here is consistent, not
  // an extra restriction invented for this file.
  if (subcommand === 'reset') return /--hard\b/.test(seg);
  // checkout/restore/stash/rm: dangerous specifically when they name a protected path, or when they
  // target the whole tree (a bare "." or "-- ." with nothing more specific narrows "everything",
  // which trivially includes the protected paths).
  if (JSON_STORE_PATH_RE.test(dequoted)) return true;
  if (/(?:^|\s)(?:--\s+)?\.\s*$/.test(seg.trimEnd())) return true;
  return false;
}

const WHOLE_SEGMENT_WRITE_RE = /\brm\b|\bmv\b|\btouch\b|\bsed\s+-i\b|\btee\b/;
const ANCHORED_WRITE_RE = /(?:>>?\s*|\bcp\s+(?:-\S+\s+)*\S+\s+|\binstall\s+(?:-\S+\s+)*\S+\s+)(['"]?)([\w./-]+)\1/g;
const INTERPRETER_RE = /\b(?:node|python3?|deno|bun|perl|ruby)\b/;
const EVAL_FLAG_RE = /(?:^|\s)(?:-e|--eval|-p|--print|-c)(?=[\s'"]|$)/;
const MTIME_TAMPER_HINT_RE = /\butimes(?:Sync)?\b/; // node fs.utimesSync / fs.promises.utimes

// Full write-protection for the three gate-owned JSON stores + audit log.
function segmentTampersWithJsonStore(seg) {
  if (WHOLE_SEGMENT_WRITE_RE.test(seg) && JSON_STORE_PATH_RE.test(seg)) return true;
  for (const m of seg.matchAll(ANCHORED_WRITE_RE)) {
    if (JSON_STORE_PATH_RE.test(m[2])) return true;
  }
  if (INTERPRETER_RE.test(seg) && EVAL_FLAG_RE.test(seg) && JSON_STORE_PATH_RE.test(seg)) return true;
  return false;
}

// Narrower mtime-forgery-only protection — screenshots AND scene .html files. Neither of these is
// gate-owned (the worker legitimately writes/renames/copies screenshots, and legitimately edits scene
// files — that's the entire point of this repo's concepts/ build lab), so only mtime-forgery verbs are
// blocked here, not ordinary writes/renames/deletes.
function segmentForgesShotMtime(seg) {
  if (/\btouch\b/.test(seg) && EVIDENCE_MTIME_PATH_RE.test(seg)) return true;
  if (INTERPRETER_RE.test(seg) && EVAL_FLAG_RE.test(seg) && MTIME_TAMPER_HINT_RE.test(seg) && EVIDENCE_MTIME_PATH_RE.test(seg)) return true;
  return false;
}

const payload = readStdinJson();
if (!payload) {
  console.error('protect-json-stores: could not read/parse the PreToolUse payload from stdin — blocking, not guessing.');
  process.exit(2);
}
if (payload.tool_name !== 'Bash') process.exit(0);

const command = payload.tool_input?.command;
if (typeof command !== 'string') process.exit(0);

for (const seg of splitSegments(command)) {
  if (segmentTampersWithJsonStore(seg)) {
    console.error(`protect-json-stores: BLOCKED — this Bash segment writes (or could write) to a ` +
      `gate-owned store: "${seg.trim()}". concepts/.design-attempt-counts.json, ` +
      `concepts/design-cases.json, concepts/.design-critic-verdicts/, and ` +
      `concepts/.design-gate-audit.log are written ONLY by design-done-gate.mjs itself — no Bash ` +
      `command may touch them (rm, mv, cp/install as destination, tee, sed -i, redirection, touch, ` +
      `or an inline eval mentioning the path are all blocked here, regardless of what settings.json's ` +
      `allow list otherwise permits). Reads via cat/grep are unaffected. An interpreter one-liner ` +
      `(node -e, python3 -c, etc.) that merely MENTIONS one of these paths is blocked outright whether ` +
      `it reads or writes — this hook cannot safely tell the two apart from pattern-matching alone. ` +
      `Use cat/grep, or a real script file, instead of an inline eval flag if you need to read one of ` +
      `these files programmatically. If you need to change one of these files, stop and ask Ben — do ` +
      `not route around this.`);
    process.exit(2);
  }
  if (segmentIsDestructiveGit(seg)) {
    console.error(`protect-json-stores: BLOCKED — this Bash segment is a destructive git operation ` +
      `touching a gate-protected path (or the whole tree): "${seg.trim()}". git checkout/restore/stash/rm ` +
      `naming one of the protected stores, any git clean (wipes untracked files by directory scope, ` +
      `including .design-critic-verdicts/ and .design-gate-audit.log), and git reset --hard (discards ` +
      `everything uncommitted repo-wide) are all blocked here. Reverting these files through git history ` +
      `is not a Bash-guard bypass — if you genuinely need to roll one back, stop and ask Ben.`);
    process.exit(2);
  }
  if (segmentForgesShotMtime(seg)) {
    console.error(`protect-json-stores: BLOCKED — this Bash segment forges a screenshot's mtime instead ` +
      `of re-rendering: "${seg.trim()}". concepts/.audit-shots/ is normally writable (copying/renaming a ` +
      `real capture into its slug-named path is the documented workflow) — what is blocked specifically ` +
      `is touch/touch -d and an inline eval using fs.utimesSync, which fake freshness without a real ` +
      `render. Re-capture the screenshot for real instead.`);
    process.exit(2);
  }
}
process.exit(0);
