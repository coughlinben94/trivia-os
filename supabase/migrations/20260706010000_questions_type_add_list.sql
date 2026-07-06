-- Adds 'list' to questions.type — the shape for a bulk-pasted round/appendix
-- that Ben wants archived as ONE entry with all its items kept together
-- (e.g. "Appendix A"'s 27-item name-that-thing list), as opposed to
-- exploding into one row per item. Sibling to the existing 'swing'
-- convention (one row, questions_data holds the full item array).

alter table public.questions drop constraint questions_type_check;
alter table public.questions add constraint questions_type_check
  check (type = ANY (ARRAY['regular'::text, 'shiny'::text, 'swing'::text, 'pyl'::text, 'bonus'::text, 'list'::text]));
