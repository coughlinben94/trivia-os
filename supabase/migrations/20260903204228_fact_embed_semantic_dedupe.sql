-- Semantic near-dup detection for the fact-hunt pipeline (pgvector).
--
-- Commit 003b358 (2026-09-03) built this directly in the live project and
-- skipped the migration file. This file makes the repo match reality; it is
-- idempotent because every object below already exists live. The one real
-- change: `questions` gets the same auto-embed trigger `fact_hunt_entries`
-- already had. Before this, a question inserted outside the fact-hunt flow
-- landed with embedding = null, and match_bank_dupes silently never saw it
-- (fail-open, no error) — council audit finding, same day.
--
-- How it fits together: an AFTER INSERT trigger POSTs the new row to the
-- `fact-embed` edge function (pg_net, async), which writes the embedding
-- back. match_bank_dupes(query_embedding, threshold, count) is what the
-- /fact-hunt orchestrator calls per candidate fact during mechanical intake.

create extension if not exists vector with schema extensions;
create extension if not exists pg_net with schema extensions;

alter table public.questions add column if not exists embedding vector(384);
alter table public.fact_hunt_entries add column if not exists embedding vector(384);

create index if not exists questions_embedding_idx
  on public.questions using hnsw (embedding vector_cosine_ops);
create index if not exists fact_hunt_entries_embedding_idx
  on public.fact_hunt_entries using hnsw (embedding vector_cosine_ops);

-- anon key is the project's public (publishable) key; it is safe in the repo
-- because the edge function is the only thing it is used to reach.
create or replace function public.trigger_fact_embed()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3dGJndXNxZm95cHZlaG51bmdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTg1NDIsImV4cCI6MjA5NzYzNDU0Mn0.qmXsrtsRf7VAvRInWlPB1F_8FPIIkn8Nhl4vHUL7p4g';
begin
  perform net.http_post(
    'https://qwtbgusqfoypvehnungr.supabase.co/functions/v1/fact-embed',
    jsonb_build_object('table', TG_TABLE_NAME, 'record', row_to_json(NEW)),
    '{}'::jsonb,
    jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||anon_key),
    30000
  );
  return new;
end;
$$;

drop trigger if exists fact_hunt_entries_embed_on_insert on public.fact_hunt_entries;
create trigger fact_hunt_entries_embed_on_insert
  after insert on public.fact_hunt_entries
  for each row execute function public.trigger_fact_embed();

-- NEW: close the asymmetry. questions now embeds on insert too.
drop trigger if exists questions_embed_on_insert on public.questions;
create trigger questions_embed_on_insert
  after insert on public.questions
  for each row execute function public.trigger_fact_embed();

create or replace function public.match_bank_dupes(
  query_embedding vector,
  match_threshold double precision default 0.90,
  match_count integer default 5
)
returns table(source text, id text, answer text, similarity double precision)
language sql
stable
as $$
  select 'questions' as source, id::text, answer, 1 - (embedding <=> query_embedding) as similarity
  from public.questions
  where embedding is not null
    and 1 - (embedding <=> query_embedding) > match_threshold
  union all
  select 'fact_hunt_entries' as source, id::text, answer, 1 - (embedding <=> query_embedding) as similarity
  from public.fact_hunt_entries
  where embedding is not null
    and status <> 'tombstoned'
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;
