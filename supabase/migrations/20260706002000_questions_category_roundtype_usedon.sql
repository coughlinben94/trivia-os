-- Questions bank columns for Ben's reuse-analysis plan, added BEFORE bulk
-- entry begins (the table is empty; retrofitting these onto hundreds of
-- hand-entered rows later is the expensive path).
--
-- - category:   free-text — the taxonomy emerges from use via the entry
--               panel's suggestion combobox, not a hardcoded list.
-- - round_type: CHECK-constrained to the app's round types, matching the
--               existing `type` column's precedent (questions_type_check);
--               NULL allowed (a bare archive question may not belong to a
--               round style at all). `shiny_type` stays free-text as-is.
-- - used_on:    date[] play-date history — a question plays many times over
--               years, so an array, not a single date. NOT NULL DEFAULT '{}'
--               so consumers can always array-iterate without null checks.
--               The single show_title/show_date pair stays untouched for the
--               existing per-archive-event writers.
--
-- All columns nullable or defaulted: zero impact on existing write paths.
-- RLS is row-level, so the existing questions policies (public SELECT,
-- host_verified INSERT/UPDATE/DELETE) cover these columns automatically.

alter table public.questions
  add column category text,
  add column round_type text
    constraint questions_round_type_check
    check (round_type in ('normal', 'swing', 'pyl')),
  add column used_on date[] not null default '{}';
