// concepts/tools/test-postmessage-contract.mjs
//
// Proves postmessage-child-boilerplate.js's validation logic actually does what its
// comments claim — exact-source + nonce + schema checks, in that order, silently
// dropping anything that fails any one of them. No real browser available in this dev
// environment, so this simulates the window/message-event surface the child script
// touches and drives it directly, rather than trusting the code by inspection alone.

import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptSrc = readFileSync(join(__dirname, 'postmessage-child-boilerplate.js'), 'utf8');

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

function makeSandbox(nonce) {
  const listeners = [];
  const fakeParent = { __isFakeParent: true };
  const sandbox = {
    window: {
      location: { hash: nonce ? `#nonce=${encodeURIComponent(nonce)}` : '' },
      addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); },
      parent: fakeParent,
      __journeyControls: null,
    },
    console,
  };
  sandbox.window.__self = sandbox.window; // not used, just avoiding accidental globals
  const ctx = createContext(sandbox);
  runInContext(scriptSrc, ctx);
  return { sandbox, listeners, fakeParent };
}

function dispatch(listeners, event) {
  for (const fn of listeners) fn(event);
}

// --- Case 1: correct source + correct nonce + valid type => control fires ---
{
  const { sandbox, listeners, fakeParent } = makeSandbox('abc123');
  let played = false;
  sandbox.window.__journeyControls = { play: () => { played = true; }, pause: () => {}, replay: () => {} };
  dispatch(listeners, { source: fakeParent, data: { type: 'play', nonce: 'abc123' } });
  check('valid message from real parent triggers play()', played === true);
}

// --- Case 2: wrong source (not window.parent) => ignored ---
{
  const { sandbox, listeners } = makeSandbox('abc123');
  let played = false;
  sandbox.window.__journeyControls = { play: () => { played = true; }, pause: () => {}, replay: () => {} };
  const impostor = { __isFakeParent: false };
  dispatch(listeners, { source: impostor, data: { type: 'play', nonce: 'abc123' } });
  check('message from wrong source is ignored', played === false);
}

// --- Case 3: correct source, wrong nonce => ignored ---
{
  const { sandbox, listeners, fakeParent } = makeSandbox('abc123');
  let played = false;
  sandbox.window.__journeyControls = { play: () => { played = true; }, pause: () => {}, replay: () => {} };
  dispatch(listeners, { source: fakeParent, data: { type: 'play', nonce: 'WRONG-NONCE' } });
  check('message with wrong nonce is ignored', played === false);
}

// --- Case 4: correct source, correct nonce, malformed schema => ignored, no throw ---
{
  const { sandbox, listeners, fakeParent } = makeSandbox('abc123');
  let played = false;
  sandbox.window.__journeyControls = { play: () => { played = true; }, pause: () => {}, replay: () => {} };
  let threw = false;
  try {
    dispatch(listeners, { source: fakeParent, data: 'not-an-object' });
    dispatch(listeners, { source: fakeParent, data: { type: 123, nonce: 'abc123' } });
    dispatch(listeners, { source: fakeParent, data: null });
  } catch (e) {
    threw = true;
  }
  check('malformed message data is ignored without throwing', !threw && played === false);
}

// --- Case 5: no nonce present in URL (opened directly, not via gallery) => any message ignored ---
{
  const { sandbox, listeners, fakeParent } = makeSandbox(null);
  let played = false;
  sandbox.window.__journeyControls = { play: () => { played = true; }, pause: () => {}, replay: () => {} };
  dispatch(listeners, { source: fakeParent, data: { type: 'play', nonce: 'anything' } });
  check('prototype opened without a nonce ignores all messages (safe no-op)', played === false);
}

// --- Case 6: pause and replay route to the right control ---
{
  const { sandbox, listeners, fakeParent } = makeSandbox('xyz');
  let calls = [];
  sandbox.window.__journeyControls = {
    play: () => calls.push('play'),
    pause: () => calls.push('pause'),
    replay: () => calls.push('replay'),
  };
  dispatch(listeners, { source: fakeParent, data: { type: 'pause', nonce: 'xyz' } });
  dispatch(listeners, { source: fakeParent, data: { type: 'replay', nonce: 'xyz' } });
  check('pause and replay dispatch to the correct control, in order', calls.join(',') === 'pause,replay', calls.join(','));
}

// --- Case 7: unknown message type is ignored without touching any control ---
{
  const { sandbox, listeners, fakeParent } = makeSandbox('xyz');
  let calls = [];
  sandbox.window.__journeyControls = {
    play: () => calls.push('play'),
    pause: () => calls.push('pause'),
    replay: () => calls.push('replay'),
  };
  dispatch(listeners, { source: fakeParent, data: { type: 'launch-nuke', nonce: 'xyz' } });
  check('unrecognized message type is a silent no-op', calls.length === 0);
}

// --- Case 8: extra key beyond {type, nonce} is rejected despite otherwise-valid shape ---
{
  const { sandbox, listeners, fakeParent } = makeSandbox('xyz');
  let played = false;
  sandbox.window.__journeyControls = { play: () => { played = true; }, pause: () => {}, replay: () => {} };
  dispatch(listeners, { source: fakeParent, data: { type: 'play', nonce: 'xyz', extra: 'sneaky' } });
  check('message with an extra key is rejected (truly strict schema)', played === false);
}

// --- Case 9: array data (typeof [] === 'object' in JS) is rejected, not treated as an object ---
{
  const { sandbox, listeners, fakeParent } = makeSandbox('xyz');
  let played = false;
  sandbox.window.__journeyControls = { play: () => { played = true; }, pause: () => {}, replay: () => {} };
  dispatch(listeners, { source: fakeParent, data: ['play', 'xyz'] });
  check('array data is rejected, not coerced into the object shape', played === false);
}

console.log(`\n${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);
