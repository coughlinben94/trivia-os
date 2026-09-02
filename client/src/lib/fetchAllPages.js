// Page through a Supabase select until the table is exhausted.
//
// Supabase caps a single select at 1000 rows and returns the truncated set
// WITHOUT an error, so a one-shot select on `questions` (~1,900 rows) looks
// like a complete read and silently loses half the question bank. Anything
// dumping or auditing a whole table has to page.
//
// `fetchPage(from, to)` takes an INCLUSIVE range (Supabase's `.range()`
// contract) and resolves to `{ data, error }`.
export async function fetchAllPages(fetchPage, pageSize = 1000) {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error(`pageSize must be a positive integer, got ${pageSize}`)
  }
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) throw new Error(error.message ?? String(error))
    rows.push(...(data ?? []))
    // A short page means the end. A full page is ambiguous, so ask again —
    // the extra empty request on an exact multiple is the price of never
    // truncating.
    if (!data || data.length < pageSize) return rows
  }
}
