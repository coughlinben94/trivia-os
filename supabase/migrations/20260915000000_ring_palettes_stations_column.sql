-- Adds the "world" shape to the existing palette-only shelf. A row with
-- stations = null means "the authored 13," the same meaning every existing
-- certified/failed row already carries — nothing re-certifies for this
-- schema change alone (docs/superpowers/plans/2026-09-05-ring-unified-noun-color-draw-design.md
-- §7.1, Ben-confirmed 2026-09-14 §11b item 7). RING_VERSION is not bumped by
-- this migration.
alter table public.ring_palettes
  add column stations jsonb;
