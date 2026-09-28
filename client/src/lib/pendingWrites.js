// Counts unsaved writes so a tab close can warn while any are outstanding.
export function createPendingCounter() {
  let n = 0
  return {
    begin: () => { n++ },
    end: () => { n = Math.max(0, n - 1) },
    get count() { return n },
  }
}
