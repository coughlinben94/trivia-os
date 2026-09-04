-- ring_palettes_source_seed_version_idx was a PARTIAL unique index
-- (where seed is not null). PostgREST's upsert onConflict target
-- (concepts/tools/palette-sweep.mjs's runSeedBatch) emits a bare
-- ON CONFLICT (source, seed, ring_version) with no WHERE clause, and
-- Postgres can only infer a partial index from an onConflict target that
-- repeats its exact predicate — a bare column list can't infer it, so
-- every runSeedBatch upsert hard-failed against the original index.
--
-- Dropping the partial predicate changes nothing for null-seed rows:
-- Postgres already treats every NULL as distinct from every other NULL in
-- a unique index, partial or not, so manual/pending rows (seed is null)
-- still coexist freely without the WHERE clause.
drop index public.ring_palettes_source_seed_version_idx;
create unique index ring_palettes_source_seed_version_idx
  on public.ring_palettes (source, seed, ring_version);
