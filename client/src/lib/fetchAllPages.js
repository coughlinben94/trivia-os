// Page through a Supabase select until the table is exhausted.
//
// Supabase caps a single select at 1000 rows and returns the truncated set
// WITHOUT an error, so a one-shot select on `questions` (~1,900 rows) looks
// like a complete read and silently loses half the question bank. Anything
// dumping or auditing a whole table has to page.
//
// `fetchPage(from, to)` takes an INCLUSIVE range (Supabase's `.range()`
// contract) and resolves to `{ data, error }`.
//
// The caller MUST give the query a stable sort key (`.order('id')`).
// Postgres promises no particular row order between two independent
// requests, so an unordered scan can hand back a row twice and skip
// another one entirely as pages are stitched together — a corrupted read
// that looks exactly like a clean one. Since a forgotten `.order()` is
// invisible at this boundary, `idKey` turns that silent corruption into a
// thrown error: any row id seen twice means the ordering was not stable.
// Pass `idKey: null` only for a source with genuinely no unique column.
export async function fetchAllPages(fetchPage, pageSize = 1000, { idKey = 'id' } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error(`pageSize must be a positive integer, got ${pageSize}`)
  }
  const rows = []
  const seen = idKey ? new Set() : null
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) throw new Error(error.message ?? String(error))
    if (seen) {
      for (const row of data ?? []) {
        const id = row?.[idKey]
        if (id === undefined) continue
        if (seen.has(id)) {
          throw new Error(
            `unstable paging: row ${JSON.stringify(id)} came back twice — ` +
            `the query needs an explicit .order('${idKey}')`
          )
        }
        seen.add(id)
      }
    }
    rows.push(...(data ?? []))
    // A short page means the end. A full page is ambiguous, so ask again —
    // the extra empty request on an exact multiple is the price of never
    // truncating.
    if (!data || data.length < pageSize) return rows
  }
}
