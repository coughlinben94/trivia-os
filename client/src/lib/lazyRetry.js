// A dynamic import() can reject on a plain transient network blip, not just a
// stale deploy chunk hash -- but main.jsx's vite:preloadError handler only
// reloads ONCE per session (sessionStorage guard), so a second failure in
// that window throws for real (TRIVIA-OS-5/6, live 2026-09-15: a real user
// hit this on /join with no reload left to recover). Retrying the import a
// couple times before it ever reaches that handler fixes the common
// transient case without touching the stale-chunk reload fallback.
export function lazyRetry(importFn, retries = 2, delayMs = 500) {
  return () =>
    importFn().catch((err) => {
      if (retries <= 0) throw err
      return new Promise((resolve) => setTimeout(resolve, delayMs)).then(() =>
        lazyRetry(importFn, retries - 1, delayMs)()
      )
    })
}
