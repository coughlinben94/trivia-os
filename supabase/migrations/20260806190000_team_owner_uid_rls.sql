-- Ties team-owned writes (a team's own row, its phone_answers) to an actual
-- authenticated identity instead of "knows the team_id" — closes SEC-2
-- (audited 2026-07-19, extended by phone-answer scoring 2026-07-30): teams
-- SELECT is public, so team_id was never actually secret, and the old
-- with check(true) policies let anyone holding the anon key overwrite ANY
-- team's row or ANY team's phone_answers, not just their own. Ben's call
-- (2026-08-06): tighten this specifically; host PIN itself stays as-is.
--
-- Same mechanism the host side already uses (HostPinGate.jsx's
-- signInAnonymously() + a JWT claim) — Join.jsx now does the same on first
-- registration, stamping owner_uid = auth.uid() on the team's own row. A
-- browser's anon session persists in its own localStorage across reloads
-- (supabase-js default), so a returning team's session restore needs no
-- extra code — the existing session is already there.
--
-- SELECT stays fully public on both tables — reading names/answers was
-- never the vulnerability, writing as someone else was. Existing rows from
-- past shows get owner_uid=null and simply become frozen (no live session
-- currently references them) rather than retroactively reassigned.

alter table public.teams add column owner_uid uuid;

drop policy "anon register team" on public.teams;
create policy "team registers own row"
  on public.teams for insert
  to public
  with check (owner_uid = (select auth.uid()));

drop policy "anon update team status" on public.teams;
create policy "team updates own row"
  on public.teams for update
  to public
  using (owner_uid = (select auth.uid()))
  with check (owner_uid = (select auth.uid()));

drop policy "public insert phone_answers" on public.phone_answers;
create policy "team inserts own phone_answers"
  on public.phone_answers for insert
  to public
  with check (exists (
    select 1 from public.teams t
    where t.id = phone_answers.team_id and t.owner_uid = (select auth.uid())
  ));

drop policy "public update phone_answers" on public.phone_answers;
create policy "team updates own phone_answers"
  on public.phone_answers for update
  to public
  using (exists (
    select 1 from public.teams t
    where t.id = phone_answers.team_id and t.owner_uid = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.teams t
    where t.id = phone_answers.team_id and t.owner_uid = (select auth.uid())
  ));
