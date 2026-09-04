-- supabase/migrations/20260904120100_bendle_answer_counts_rpc.sql
-- Mirrors `wager_answer_counts` — returns only an aggregate, never individual guesses, so `/display` can show "N of M teams guessed" before lock without leaking answers past `phone_answers`' tightened SELECT policy.
create or replace function public.bendle_answer_counts(p_slide_id text)
returns table(answered int, total int)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.phone_answers
       where slide_id = p_slide_id and answer ? 'guess' and (answer->>'guess') is not null and trim(answer->>'guess') != ''),
    (select count(*)::int from public.teams t
       where t.show_id = (select show_id from public.phone_answers where slide_id = p_slide_id limit 1)
          or t.show_id = (select s.id::text from public.shows s, jsonb_array_elements(s.slides) sl
                            where sl->>'id' = p_slide_id limit 1))
$$;

grant execute on function public.bendle_answer_counts(text) to anon, authenticated;
