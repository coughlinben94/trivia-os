// Shared by server.test.mjs and e2e.test.mjs. Not a test file (vitest only
// picks up relay/**/*.test.mjs). Each test file keeps its own default timeout.
export const makeUntil = defaultMs => async function until(fn, ms = defaultMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const v = fn()
    if (v) return v
    await new Promise(r => setTimeout(r, 10))
  }
  throw new Error('timed out')
}
