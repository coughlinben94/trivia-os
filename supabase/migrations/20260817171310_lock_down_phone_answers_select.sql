-- Closes the read-side gap left open by 20260806191416_team_owner_uid_rls's
-- "SELECT stays fully public — reading names/answers was never the
-- vulnerability" call. That was true for `teams`; it was wrong for
-- `phone_answers` once wager questions shipped (2026-08-16): a wager is
-- scored RELATIVE TO THE ROOM, so reading another team's tier/guess before
-- locking in your own is a real, directly-exploitable edge (no devtools
-- sophistication needed beyond opening the network tab). Ben's call
-- (2026-08-17): tighten this one specifically.
--
-- New rule: a phone_answers row is readable only by (a) the owning team
-- (same owner_uid = auth.uid() check the write policies already use), or
-- (b) a PIN-verified host (host_verified JWT claim, same predicate the
-- 20260719182736 perf migration already uses for shows/scoreboard_teams/etc).
--
-- /display (the TV) is neither of those — it's a fully anonymous browser
-- that never goes through the host PIN gate (see 20260705234714's own
-- comment: "the TV browser never goes through the PIN gate"). It has two
-- legitimate real needs against this table: a submitted-count
-- (ShinyMatchingQuestion.jsx) and a wagered/answered count
-- (ShinyWagerQuestion.jsx) — both aggregate-only, neither ever reads or
-- displays an individual team's tier or guess. Rather than widen the SELECT
-- policy back open to satisfy that (which reopens the exact hole this
-- migration exists to close), it gets two narrow SECURITY DEFINER RPCs that
-- return only the aggregate counts it actually uses — same pattern this
-- schema already established for advance_show() in 20260705234714.

drop policy "public read phone_answers" on public.phone_answers;

create policy "team or host read phone_answers"
  on public.phone_answers for select
  to public
  using (
    ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'host_verified'::text)::boolean = true)
    or exists (
      select 1 from public.teams t
      where t.id = phone_answers.team_id and t.owner_uid = (select auth.uid())
    )
  );

create or replace function public.phone_answers_count(p_slide_id text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.phone_answers where slide_id = p_slide_id;
$$;

revoke all on function public.phone_answers_count(text) from public;
grant execute on function public.phone_answers_count(text) to anon, authenticated;

-- 'guess' is written through parseWagerNumber() client-side before it's ever
-- upserted (WagerBoard.jsx's save()), so a stored guess is already guaranteed
-- either a clean parsed number or JSON null — "->> is not null" here is
-- exactly the same condition the old client-side parseWagerNumber(...) != null
-- re-check was gating on, not a looser approximation of it.
create or replace function public.wager_answer_counts(p_slide_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'wagered', count(*) filter (where answer ->> 'tier' is not null),
    'answered', count(*) filter (where answer ->> 'guess' is not null)
  )
  from public.phone_answers
  where slide_id = p_slide_id;
$$;

revoke all on function public.wager_answer_counts(text) from public;
grant execute on function public.wager_answer_counts(text) to anon, authenticated;
