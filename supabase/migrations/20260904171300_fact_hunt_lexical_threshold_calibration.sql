-- Lexical dedupe threshold calibration (fable build review finding).
-- The 0.4 default was set from a single pair (Yeti/Yetis at 0.57) with no
-- real sample. A real calibration run (references/fact-hunt/dedup-threshold-
-- calibration.md, "Lexical (pg_trgm) calibration") found 0.4 catches ~16%
-- false positives (Monkey/Donkey, Ireland/Iceland, Mr. Rogers/Kenny Rogers,
-- Burt Reynolds/Ryan Reynolds, Gumball machine/Machine gun) and even 0.6
-- (fable's own suggested number) sits in a false-positive-majority band.
-- 0.7 is the true-dup-dominant floor with zero observed false positives in
-- the calibration sample. Idempotent: create-or-replace only, no data change.
create or replace function public.match_bank_dupes_lexical(
  query_answer text,
  match_threshold double precision default 0.7,
  match_count integer default 5
)
returns table(source text, id text, answer text, similarity double precision)
language sql
stable
as $function$
  select 'questions' as source, id::text, answer,
         similarity(lower(answer), lower(query_answer)) as similarity
  from public.questions
  where similarity(lower(answer), lower(query_answer)) > match_threshold
  union all
  select 'fact_hunt_entries' as source, id::text, answer,
         similarity(lower(answer), lower(query_answer)) as similarity
  from public.fact_hunt_entries
  where status <> 'tombstoned'
    and similarity(lower(answer), lower(query_answer)) > match_threshold
  order by similarity desc
  limit match_count;
$function$;
