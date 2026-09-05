-- supabase/migrations/20260905150156_bendle_answer_counts_drop_total.sql
-- `total` was never consumed by ShinyBendleQuestion.jsx (explicitly discarded
-- there — see its comment), yet its subquery ran a jsonb_array_elements scan
-- over the whole `shows` table every 2s for the entire round. Drop it; the
-- return shape changes (table(answered int, total int) -> table(answered
-- int)), so the function must be dropped and recreated rather than replaced
-- in place. 2026-09-05 whole-branch review, Fix 3.
drop function if exists public.bendle_answer_counts(text);

create function public.bendle_answer_counts(p_slide_id text)
returns table(answered int)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.phone_answers
       where slide_id = p_slide_id and answer ? 'guess' and (answer->>'guess') is not null and trim(answer->>'guess') != '')
$$;

grant execute on function public.bendle_answer_counts(text) to anon, authenticated;
