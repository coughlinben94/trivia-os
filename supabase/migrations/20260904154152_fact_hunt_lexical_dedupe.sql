-- Trigram lexical pre-filter, complementary to the cosine-embedding dedupe check.
-- Additive only: does not touch match_bank_dupes or its 0.90 default threshold.
create extension if not exists pg_trgm with schema extensions;

create index if not exists questions_answer_trgm_idx
  on public.questions using gin (lower(answer) gin_trgm_ops);

create index if not exists fact_hunt_entries_answer_trgm_idx
  on public.fact_hunt_entries using gin (lower(answer) gin_trgm_ops);

create or replace function public.match_bank_dupes_lexical(
  query_answer text,
  match_threshold double precision default 0.4,
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
