#!/usr/bin/env node
// .claude/hooks/protect-json-stores.mjs
//
// PreToolUse guard on Bash. Fixes B1 (and the screenshot half of B2) from
// concepts/design-pipeline-hardening-fix.md, plus the round-2 review findings in
// concepts/design-pipeline-hardening-review-round2.md: the Write/Edit deny list on the gate's
// protected stores only blocks the Write/Edit TOOLS — Bash was always wide open. This hook inspects
// the Bash command string itself, independent of what settings.json's allow list already granted, and
// blocks (exit 2) any write-shaped access to the paths below — regardless of how permissive the allow
// list is or ever becomes.
//
// THREE PROTECTION TIERS, because the path classes need genuinely different treatment:
//
//   JSON_STORE_PATHS — concepts/.design-attempt-counts.json, concepts/design-cases.json,
//   concepts/.design-critic-verdicts/, concepts/.design-gate-audit.log, PLUS (round 2) this hook file
//   and .claude/settings.json themselves. These are GATE-OWNED (or, for the last two, GUARD-OWNED):
//   only design-done-gate.mjs's own writeFileSync/appendFileSync calls may touch the first four; the
//   last two should only ever change via the Edit/Write TOOLS (the normal, visible, Ben-reviewed way
//   every round of this hardening work has actually happened), never via a Bash command silently
//   deleting or rewriting them. Every write verb is blocked here.
//
//   EVIDENCE_MTIME_PATHS — concepts/.audit-shots/ and concepts/*.html scene files (recursive — any
//   nested subdirectory, matching design-done-gate.mjs's own stated scope of "concepts/**.html
//   always"). Neither is gate-owned — the worker legitimately writes/renames/copies screenshots and
//   legitimately edits scene files constantly, so blocking every write verb here would break the
//   intended workflow. What must be blocked is narrower: forging an EXISTING file's mtime without a
//   real edit/re-render — touch/touch -d, or an eval-flag/heredoc interpreter call whose script
//   mentions utimes/utimesSync.
//
//   DESTRUCTIVE_GIT — git checkout/restore/stash/rm naming a protected path, any git clean (wipes
//   untracked files by directory scope — .design-critic-verdicts/ and .design-gate-audit.log are both
//   untracked), and git reset --hard (discards everything uncommitted repo-wide, never names a path at
//   all). Tolerant of common global flags (-C <dir>, -c <key>=<val>, --no-pager, -p/--paginate)
//   between `git` and the subcommand, since those are ordinary usage, not obfuscation, and a
//   first-word-only anchor missed them. None of the write-verb detection above even looks at git
//   subcommands — this was the single largest hole the round-2 review found, confirmed live before
//   this file was rewritten to close it.
//
// SEGMENT-PARSING splits on &&, ||, ;, |, and newlines, quote/backtick/$(...)-aware (see
// splitSegments) and now also HEREDOC-aware (round 2): a `python3 <<EOF ... EOF` script has no -c/-e
// flag at all, so the prior eval-flag detector never even looked at it, and an unguarded internal
// newline inside the heredoc BODY would otherwise fragment the interpreter word away from whatever the
// script actually does — the same shape of bug the quote/substitution tracking already fixed for
// quotes and $(...), just via a different shell construct.
//
// VERB DETECTION is anchored to each segment's FIRST command word (rm/mv/touch/tee/truncate/ln/dd/
// cp/install), not "does the verb appear anywhere in the segment text" (round 2 finding, found during
// this review, not in the original doc): the prior version blocked a completely ordinary
// `git commit -m "fix mv logic touching concepts/design-cases.json"` because the word "mv" appeared
// inside the quoted COMMIT MESSAGE alongside a mention of the path — a live false positive on required,
// ordinary workflow (this project's own worker instructions mandate committing before Stop), not an
// adversarial case. Segments are already split at every real (unquoted) pipe by splitSegments(), so
// the actual command a segment invokes is always its first word (sed -i is checked separately since
// its flag can trail the command name by an argument or two; redirection is a positional OPERATOR, not
// a command word, so it stays checked anywhere in the segment).
//
// PATH DETECTION runs against a QUOTE-STRIPPED copy of each segment (round 2 finding): a real bash
// command that quotes part of a path — `rm concepts/'design-cases.json'` — still resolves to the exact
// same literal path once the shell removes the quotes, but the OLD literal-substring match against the
// raw text missed it because of the embedded quote characters. Globs (`concepts/*.json`,
// `concepts/design-case?.json`) are checked separately against the RAW (not quote-stripped) segment,
// since a QUOTED glob character doesn't actually expand in real bash — quoting `'*.json'` makes rm look
// for a literal file named `*.json`, which is harmless, so quote-stripping before glob-detection would
// itself be a false-positive source.
//
// Exit 0 = allow. Exit 2 = block. (Exit-code semantics confirmed in
// concepts/design-worker-p0-p2-plan.md's research note #2: exit 1 is non-blocking, exit 2 blocks.)
// The ENTIRE body below is wrapped in a top-level try/catch that exits 2 on any uncaught error (round
// 2 finding: an unhandled exception previously fell through to Node's default uncaught-exception exit
// code, typically 1, which Claude Code treats as non-blocking — i.e. an internal bug in this file
// would have silently ALLOWED the very command it was trying to inspect). This does not, and cannot,
// cover the file being deleted outright before Node ever starts — that failure mode is why this
// hook file is now itself one of the protected JSON_STORE_PATHS above, closing the realistic version
// of that risk (a Bash rm/sed-i against this file) while leaving the normal Edit/Write-tool development
// path on this file completely open, since deny-listing .claude/** entirely would also block the
// normal, visible way every round of this hardening work has actually been done.
//
// KNOWN LIMITATIONS — this is a regex over command text, not a shell parser, and these gaps are
// accepted rather than fixed, for the reasons stated:
//
//   - Interpreter string-concatenation (e.g. building the target path as joined string fragments
//     passed to node -e / python3 -c instead of a literal) can evade the literal-substring path match.
//   - Bare shell-variable indirection, e.g. `f=concepts/design-cases.json; rm $f` — closing this
//     requires actual shell parsing / variable-expansion simulation, not regex matching.
//   - No cwd-awareness: bare or relative filenames that omit the literal `concepts/` prefix are
//     invisible to this hook (e.g. `rm design-cases.json` run from inside `concepts/`). Closing this
//     without new false positives would need real cwd-tracking.
//   - `cp`/`install` flags that take a SEPARATE value token (e.g. `cp -t DIR src`, `install -m 644 src
//     dest`) can misalign which token is checked as the destination. Rare in practice.
//   - splitSegments()'s $(...) nesting tracker is a plain depth counter: a literal unescaped `(`/`)`
//     inside a QUOTED string nested within a substitution can miscount depth.
//   - A cp/install/redirection DESTINATION deliberately wrapped in `$(...)` or backticks is invisible
//     to the destination capture regardless of an embedded separator — the capture's character class
//     stops at `$`/`(`/`)`. The whole-segment verbs (rm/mv/touch/sed-i/tee) don't share this gap.
//   - `sudo`/`env FOO=bar`-prefixed commands: the first-word verb anchor looks at the segment's actual
//     first word, so a verb invoked through a prefix command isn't recognized as the effective verb.
//     Neither `sudo` nor `env` is in this project's Bash allow-list as of this writing, so either would
//     need its own explicit permission grant first regardless.
//   - `git` operations other than the six destructive subcommands listed above (e.g. a malicious
//     rebase, or `git apply`/`git am` applying a patch that rewrites a protected file), or a git global
//     flag this hook doesn't explicitly recognize, are not inspected — this hook targets the specific
//     attacks confirmed live during the round-2 review, not an exhaustive model of every way git can
//     mutate a working tree or every global flag git accepts.
//   - Multi-hop pipe chaining (e.g. `echo '<payload>' | tee /tmp/x | bash`, or piping through
//     base64 -d / any other pass-through stage before a shell) defeats the single-hop pipe-merge
//     detection — the merge decision only looks one `|` ahead, not across an arbitrary-length
//     pipeline. Closing this fully needs real data-flow tracing across pipe stages, not a regex.
//     Requires deliberately constructing a multi-stage pipeline to route around this check — the
//     same category of gap as the others in this list.

import { readFileSync } from 'node:fs';

try {

function readStdinJson() {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return null; }
}

// Quote/backtick/$(...)/heredoc-aware segment split — NOT a regex split, on purpose. A naive split on
// ;/|/&&/||/newline tears apart any command whose OWN quoted argument, substitution, or heredoc body
// happens to contain one of those characters. This scanner tracks bash quoting/substitution/heredoc
// state and only treats ;/|/&&/||/newline as a real separator when outside all of them. This is a real
// tracker, not a full shell parser — documented gaps above.
function splitSegments(command) {
  const segments = [];
  let current = '';
  let inSingle = false, inDouble = false, inBacktick = false, substDepth = 0;
  let heredocDelim = null, heredocStrip = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (heredocDelim !== null) {
      // Inside a heredoc body: copy verbatim, watching only for the line that closes it. Bash applies
      // no separator/quote/substitution rules inside a heredoc body either (until final expansion,
      // which this hook does not attempt) — the whole point is the interpreter reading it as one
      // script, so the SAME segment must include it whole for the interpreter+path co-occurrence
      // check further down to see both the interpreter word and whatever the script mentions.
      let eol = command.indexOf('\n', i);
      if (eol === -1) eol = command.length;
      const line = command.slice(i, eol);
      const checkLine = heredocStrip ? line.replace(/^\t+/, '') : line;
      current += line;
      if (checkLine === heredocDelim) heredocDelim = null;
      if (eol < command.length) { current += '\n'; i = eol; } else { i = eol - 1; }
      continue;
    }
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
    // Heredoc start: `<<[-]?WORD` / `<<[-]?'WORD'` / `<<[-]?"WORD"`, checked before quote/subst starts.
    if (ch === '<' && command[i + 1] === '<') {
      const m = /^<<(-)?\s*(?:'([A-Za-z0-9_]+)'|"([A-Za-z0-9_]+)"|([A-Za-z0-9_]+))/.exec(command.slice(i));
      if (m) {
        heredocDelim = m[2] || m[3] || m[4];
        heredocStrip = !!m[1];
        current += m[0];
        i += m[0].length - 1;
        continue;
      }
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
      // A pipe feeding directly into a shell interpreter (bash/sh/zsh) merges forward instead of
      // splitting, the same way a heredoc body stays attached to its interpreter above: piping into a
      // shell makes the interpreter's stdin literally whatever the left side outputs, so splitting
      // here would separate the destructive content (`echo 'rm concepts/*.json'`) from the interpreter
      // word (`bash`) across two segments that individually look harmless — the exact gap a prior round
      // of this fix left open for heredocs/`-c` but not for this plain-pipe form.
      if (/^\s*(?:\S*\/)?(?:env\s+)?(?:bash|sh|zsh)\b/.test(command.slice(i + 1))) { current += ch; continue; }
      segments.push(current); current = ''; continue;
    }
    if (ch === '&') {
      if (command[i + 1] === '&') { segments.push(current); current = ''; i++; continue; }
      current += ch; continue;
    }
    current += ch;
  }
  segments.push(current);
  return segments;
}

// ── Protected-path patterns ──
const JSON_STORE_PATH_RE = /concepts\/\.design-attempt-counts\.json|concepts\/design-cases\.json|concepts\/\.design-critic-verdicts\b|concepts\/\.design-gate-audit\.log|concepts\/\.design-gate-integrity\.json|\.claude\/settings\.json|\.claude\/hooks\/protect-json-stores\.mjs|\.claude\/hooks\/design-done-gate\.mjs|\.claude\/hooks\/geometry-lint\.mjs/;
// Round-3 adversarial review finding: concepts/tools/reseed-design-gate-integrity.mjs is the ONLY
// sanctioned way to re-baseline the integrity sidecar after a human confirms a legitimate
// out-of-band change — but nothing stopped an agent from simply running it itself via Bash (no
// verb/eval-flag/heredoc pattern matched a bare `node script.mjs` invocation), which would silently
// re-baseline the sidecar to whatever tampered content is currently on disk. This blocks ANY Bash
// mention of the tool by name — reading it, running it, piping into it — regardless of verb, since
// there is no legitimate reason an agent's Bash tool call should ever reference it at all; it exists
// to be run by Ben directly, from his own terminal. This is the same category of defense as
// everything else in this file: it raises the bar, it does not make the recovery path
// unbypassable — a sufficiently motivated agent with broad Bash access can still route around a
// filename-based block the same way it can route around any of this file's other checks. Honest
// about that, not pretending otherwise.
const RESEED_TOOL_RE = /reseed-design-gate-integrity/;
const RESEED_TOOL_INVOKE_RE = /\b(?:node|bash|sh|zsh|python3?|perl|ruby|deno|bun|cat|less|more|head|tail|vim|vi|nano|emacs|source)\b[^;|&\n]*reseed-design-gate-integrity/;
function segmentInvokesReseedTool(seg) {
  const dequoted = seg.replace(/['"]/g, '');
  if (RESEED_TOOL_INVOKE_RE.test(dequoted)) return true;
  // Shell-wrapped nested invocation (bash -c '...', piped into a shell, heredoc) — same loosened
  // fallback pattern this file already uses elsewhere for shell-wrapped segments, since the real
  // verb is hidden one level inside and the outer segment's first word is just bash/sh/zsh itself.
  if (segmentPipesIntoShell(seg) && RESEED_TOOL_RE.test(dequoted)) return true;
  return false;
}
const SHOTS_DIR_RE = /concepts\/\.audit-shots\//;
// Recursive — matches concepts/foo.html AND concepts/any/nested/path/foo.html, matching
// design-done-gate.mjs's own stated scope ("concepts/**.html always").
const SCENE_FILE_RE = /concepts\/.*\.html\b/;
const EVIDENCE_MTIME_PATH_RE = new RegExp(`${SHOTS_DIR_RE.source}|${SCENE_FILE_RE.source}`);
// A concepts/ path with an UNQUOTED glob character — checked primarily for the unquoted case, where
// the glob genuinely expands; a quoted glob substring may still match here too (the character classes
// just exclude the quote characters themselves, not the substring between them), which is safe
// over-blocking, not a documented carve-out.
const CONCEPTS_GLOB_RE = /concepts\/[^\s'"]*[*?[][^\s'"]*/;
const CLAUDE_HOOKS_GLOB_RE = /\.claude\/(?:hooks\/[^\s'"]*[*?[][^\s'"]*|settings\.json)/;
// `rm`/`rm -rf` targeting the bare `concepts` directory itself (no further path) deletes every
// protected store as a side effect without ever naming one — the specific-path regex above requires a
// specific filename/subdir and, correctly, does not match this.
const BARE_CONCEPTS_RE = /(?:^|\s)concepts\/?(?:\s|$)/;

const WHOLE_SEGMENT_WRITE_VERBS = new Set(['rm', 'mv', 'touch', 'tee', 'truncate', 'ln', 'dd']);
const ANCHORED_DEST_RE = /(?:\bcp\s+(?:-\S+\s+)*|\binstall\s+(?:-\S+\s+)*)\S+\s+([\w./-]+)/g;
const REDIRECT_DEST_RE = />>?\s*([\w./-]+)/g;
const INTERPRETER_RE = /\b(?:node|python3?|deno|bun|perl|ruby)\b/;
const EVAL_FLAG_RE = /(?:^|\s)(?:-e|--eval|-p|--print|-c)(?=[\s'"]|$)/;
const HEREDOC_MARKER_RE = /<</;
const MTIME_TAMPER_HINT_RE = /\butimes(?:Sync)?\b/;

// bash/sh/zsh as an interpreter (via -c, a heredoc, or piping into it) hides whatever it runs one
// level inside the segment — the outer segment's first word is `bash`/`cat`/whatever piped into it,
// not the real command. First-word anchoring cannot see through that, so once a segment is detected
// as shell-wrapped, fall back to a loose bare-co-occurrence check (the pre-anchoring style) for THAT
// segment only — safe to loosen here specifically because triggering this path requires the segment
// to actually mention bash/sh/zsh as an interpreter/pipe-destination, which an ordinary command (a
// git commit message, an unrelated pipeline) essentially never does.
const SHELL_INTERPRETER_RE = /\b(?:bash|sh|zsh)\b/;
// Same broadened path-prefix/env-wrapper tolerance as splitSegments()'s pipe-merge trigger above —
// firstWord(seg) can't recognize `/bin/bash` or `env bash` as the shell invocation (its capture group
// excludes `/`, and `env` is a distinct leading word), so this tests the segment's start directly
// instead of relying on firstWord's plain-word capture.
const SHELL_INVOKE_START_RE = /^\s*(?:\S*\/)?(?:env\s+)?(?:bash|sh|zsh)\b/;
function segmentPipesIntoShell(seg) {
  if (!SHELL_INTERPRETER_RE.test(seg)) return false;
  return SHELL_INVOKE_START_RE.test(seg) || /\|\s*(?:\S*\/)?(?:env\s+)?(?:bash|sh|zsh)\b/.test(seg) || HEREDOC_MARKER_RE.test(seg);
}
const LOOSE_WRITE_VERB_RE = /\brm\b|\bmv\b|\btouch\b|\bsed\s+-i\b|\btee\b|\btruncate\b|\bln\b|\bdd\b|\bchmod\b|\bchown\b|\bchflags\b/;

function firstWord(seg) {
  const m = /^\s*(?:\.\/)?([\w.-]+)/.exec(seg);
  return m ? m[1] : '';
}

// Full write-protection for the gate/guard-owned stores.
function segmentTampersWithJsonStore(seg) {
  const dequoted = seg.replace(/['"]/g, '');
  const fw = firstWord(seg);

  if (WHOLE_SEGMENT_WRITE_VERBS.has(fw) && JSON_STORE_PATH_RE.test(dequoted)) return true;
  // Round-3 adversarial review finding: chmod/chown/chflags were not in WHOLE_SEGMENT_WRITE_VERBS at
  // all, so `chmod 644 concepts/design-cases.json` silently stripped the new chmod-444 OS-level lock
  // (design-done-gate.mjs's writeProtectedFile()) in one allowed command — verified live during
  // review. Scoped narrowly to JSON_STORE_PATH_RE only (not added to WHOLE_SEGMENT_WRITE_VERBS
  // itself, which is shared with the concepts-glob/bare-directory checks below and would over-block
  // ordinary scene-file permission changes, which were never the concern here).
  if ((fw === 'chmod' || fw === 'chown' || fw === 'chflags') && JSON_STORE_PATH_RE.test(dequoted)) return true;
  // Second-pass review finding: chmod -R 644 concepts (bare directory) and chmod 644 concepts/*.json
  // (glob) both still passed — the check above only covers NAMED paths. Unlike rm/mv/tee, there is no
  // legitimate reason a worker would ever need to change permissions on scene files at all
  // (permissions aren't part of the design-review content model), so safe to block broadly here in a
  // way that would be over-blocking for rm/mv/tee.
  if ((fw === 'chmod' || fw === 'chown' || fw === 'chflags') &&
      (CONCEPTS_GLOB_RE.test(seg) || CLAUDE_HOOKS_GLOB_RE.test(seg) || BARE_CONCEPTS_RE.test(dequoted))) return true;
  if (fw === 'sed' && /-i\b/.test(seg) && JSON_STORE_PATH_RE.test(dequoted)) return true;
  if (fw === 'cp' || fw === 'install') {
    for (const m of dequoted.matchAll(ANCHORED_DEST_RE)) {
      if (JSON_STORE_PATH_RE.test(m[1])) return true;
    }
  }
  // Redirection is a positional OPERATOR, not a command word — checked anywhere in the segment.
  for (const m of dequoted.matchAll(REDIRECT_DEST_RE)) {
    if (JSON_STORE_PATH_RE.test(m[1])) return true;
  }
  if (INTERPRETER_RE.test(seg) && EVAL_FLAG_RE.test(seg) && JSON_STORE_PATH_RE.test(dequoted)) return true;
  if (INTERPRETER_RE.test(seg) && HEREDOC_MARKER_RE.test(seg) && JSON_STORE_PATH_RE.test(dequoted)) return true;
  if (WHOLE_SEGMENT_WRITE_VERBS.has(fw) && (CONCEPTS_GLOB_RE.test(seg) || CLAUDE_HOOKS_GLOB_RE.test(seg))) return true;
  if ((fw === 'rm' || fw === 'mv') && BARE_CONCEPTS_RE.test(dequoted)) return true;
  // Shell-wrapped nested command — see segmentPipesIntoShell's comment. Must mirror ALL of the
  // direct-invocation checks above (named-path, bare-concepts-directory, AND glob), not just the
  // named-path one — a prior round of this same fix only covered named paths here, so `bash -c
  // 'rm -rf concepts'` / `bash -c 'rm .claude/hooks/*.mjs'` still bypassed even though their
  // unwrapped equivalents correctly blocked two lines above.
  if (segmentPipesIntoShell(seg)) {
    if (LOOSE_WRITE_VERB_RE.test(dequoted) && JSON_STORE_PATH_RE.test(dequoted)) return true;
    if (/\brm\b|\bmv\b|\bchmod\b|\bchown\b|\bchflags\b/.test(dequoted) && BARE_CONCEPTS_RE.test(dequoted)) return true;
    if (/\brm\b|\bmv\b|\bcp\b|\btee\b|\bchmod\b|\bchown\b|\bchflags\b/.test(dequoted) && (CONCEPTS_GLOB_RE.test(seg) || CLAUDE_HOOKS_GLOB_RE.test(seg))) return true;
  }
  return false;
}

// Narrower mtime-forgery-only protection — screenshots and scene .html files.
function segmentForgesShotMtime(seg) {
  const dequoted = seg.replace(/['"]/g, '');
  const fw = firstWord(seg);
  if (fw === 'touch' && EVIDENCE_MTIME_PATH_RE.test(dequoted)) return true;
  if (INTERPRETER_RE.test(seg) && EVAL_FLAG_RE.test(seg) && MTIME_TAMPER_HINT_RE.test(seg) && EVIDENCE_MTIME_PATH_RE.test(seg)) return true;
  if (INTERPRETER_RE.test(seg) && HEREDOC_MARKER_RE.test(seg) && MTIME_TAMPER_HINT_RE.test(seg) && EVIDENCE_MTIME_PATH_RE.test(seg)) return true;
  if (segmentPipesIntoShell(seg) && /\btouch\b/.test(dequoted) && EVIDENCE_MTIME_PATH_RE.test(dequoted)) return true;
  return false;
}

// Tolerant of common git global flags between `git` and the destructive subcommand — a bare
// first-word anchor missed `git -C <dir> reset --hard` / `git -c user.name=x clean -fdx` / `git
// --no-pager reset --hard`, which are ordinary usage (not obfuscation) and are reachable through this
// project's unscoped `Bash(git *)` allow rule. Not attempting a fully general "skip any number of
// arbitrary flags" — that risks matching a subcommand-shaped WORD appearing as some OTHER flag's
// value (e.g. `git -c core.editor=clean commit`) and misfiring on an unrelated commit. Handling the
// specific, common global flags by name avoids that ambiguity; an exotic/uncommon global flag this
// list doesn't name is a documented, accepted residual gap above.
const GIT_DESTRUCTIVE_RE = /^\s*git\s+(?:(?:-C\s+\S+|-c\s+\S+|--git-dir=\S+|--work-tree=\S+|--no-pager|-p|--paginate)\s+)*(checkout|restore|stash|rm|clean|reset)\b/;
function segmentIsDestructiveGit(seg) {
  const m = GIT_DESTRUCTIVE_RE.exec(seg);
  const dequoted = seg.replace(/['"]/g, '');
  if (m) {
    const subcommand = m[1];
    if (subcommand === 'clean') return true;
    if (subcommand === 'reset') return /--hard\b/.test(seg);
    if (JSON_STORE_PATH_RE.test(dequoted)) return true;
    if (/(?:^|\s)(?:--\s+)?\.\s*$/.test(seg.trimEnd())) return true;
  }
  // Shell-wrapped nested git command (heredoc/pipe/bash -c body) — the destructive verb never
  // appears as the OUTER segment's first word in this case, so the anchored regex above can't see
  // it; fall back to a loose in-body check specifically when a shell wrapper is present.
  if (segmentPipesIntoShell(seg)) {
    if (/\bgit\s+clean\b/.test(dequoted)) return true;
    if (/\bgit\s+reset\b(?:(?!\n).)*--hard\b/.test(dequoted)) return true;
    if (/\bgit\s+(?:checkout|restore|stash|rm)\b/.test(dequoted) &&
        (JSON_STORE_PATH_RE.test(dequoted) || /(?:^|\s)(?:--\s+)?\.\s*$/.test(dequoted.trimEnd()))) return true;
  }
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
  if (segmentInvokesReseedTool(seg)) {
    console.error(`protect-json-stores: BLOCKED — this Bash segment references the integrity-sidecar ` +
      `recovery tool: "${seg.trim()}". concepts/tools/reseed-design-gate-integrity.mjs must be run by ` +
      `Ben directly, in his own terminal, never through an agent's Bash tool call. If the gate just ` +
      `blocked on an integrity mismatch, stop and tell Ben exactly which file(s) mismatched — do not ` +
      `attempt to resolve it yourself.`);
    process.exit(2);
  }
  if (segmentTampersWithJsonStore(seg)) {
    console.error(`protect-json-stores: BLOCKED — this Bash segment writes (or could write) to a ` +
      `gate/guard-owned store: "${seg.trim()}". concepts/.design-attempt-counts.json, ` +
      `concepts/design-cases.json, concepts/.design-critic-verdicts/, concepts/.design-gate-audit.log, ` +
      `.claude/settings.json, and the hook files themselves are written/changed ONLY through their ` +
      `normal path (the gate's own writes, or the Edit/Write tools for the hooks/settings) — no Bash ` +
      `command may touch them (rm, mv, cp/install as destination, tee, sed -i, redirection, touch, an ` +
      `inline eval or heredoc mentioning the path, or a glob/bare-directory reference are all blocked ` +
      `here). Reads via cat/grep are unaffected. An interpreter one-liner or heredoc script that merely ` +
      `MENTIONS one of these paths is blocked outright whether it reads or writes — this hook cannot ` +
      `safely tell the two apart from pattern-matching alone. If you need to change one of these files, ` +
      `stop and ask Ben (for the JSON stores) or use the Edit/Write tools directly (for the hooks/` +
      `settings) — do not route around this via Bash.`);
    process.exit(2);
  }
  if (segmentForgesShotMtime(seg)) {
    console.error(`protect-json-stores: BLOCKED — this Bash segment forges a screenshot's or scene ` +
      `file's mtime instead of re-rendering/re-editing for real: "${seg.trim()}". concepts/.audit-shots/ ` +
      `and concepts/*.html scene files are normally fully writable (copying/renaming a real capture, or ` +
      `editing a scene, is the documented workflow) — what is blocked specifically is touch/touch -d and ` +
      `an inline eval or heredoc using fs.utimesSync, which fake freshness without a real change. Edit ` +
      `or re-render for real instead.`);
    process.exit(2);
  }
  if (segmentIsDestructiveGit(seg)) {
    console.error(`protect-json-stores: BLOCKED — this Bash segment is a destructive git operation ` +
      `touching a gate-protected path (or the whole tree): "${seg.trim()}". git checkout/restore/stash/rm ` +
      `naming one of the protected stores, any git clean (wipes untracked files by directory scope, ` +
      `including .design-critic-verdicts/ and .design-gate-audit.log), and git reset --hard (discards ` +
      `everything uncommitted repo-wide) are all blocked here. If you genuinely need to roll one of ` +
      `these back through git history, stop and ask Ben.`);
    process.exit(2);
  }
}
process.exit(0);

} catch (e) {
  // Fail CLOSED, not open (round 2 finding #7): an uncaught exception anywhere above previously fell
  // through to Node's default uncaught-exception behavior — typically exit 1, which Claude Code
  // treats as non-blocking. A bug in this file would have silently ALLOWED the exact command it was
  // trying to inspect. Any error here is treated as "cannot prove this command is safe."
  console.error(`protect-json-stores: CRASHED (${e && e.stack ? e.stack : e}) — blocking rather than ` +
    `allowing an uninspected command through.`);
  process.exit(2);
}
