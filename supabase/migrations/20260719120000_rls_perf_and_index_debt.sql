-- Perf/clarity debt cleanup — zero functional or security change.
--
-- 1) The 2026-07-19 Cowork audit's Supabase performance advisor flagged
--    every "host write X" policy for re-evaluating auth.jwt() once PER ROW
--    instead of once per statement. Wrapping the call as (select auth.jwt())
--    lets Postgres's planner treat it as an initplan (evaluated once) —
--    this is Supabase's own documented RLS performance recommendation.
--    Read-only tables (SELECT "public read X") are untouched — they don't
--    call auth.jwt() at all.
--
-- 2) team_scores.show_id has a foreign key to shows(id) with no covering
--    index (advisor: unindexed_foreign_keys) — every score write/read
--    filtered or joined by show_id was doing a full scan of team_scores.
--    Harmless at tonight's row counts, cheap to fix now before it isn't.
--
-- 3) "service role write questions" was registered with role list {public}
--    but gated entirely by auth.role() = 'service_role' in its qual —
--    functionally unreachable by anon/authenticated (never a security gap),
--    but its broad role list was tripping the advisor's
--    multiple_permissive_policies warning on every questions query.
--    Restating the role list as {service_role} is cosmetic/perf-only.

alter policy "host write shows" on public.shows
  using ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'host_verified'::text)::boolean = true)
  with check ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'host_verified'::text)::boolean = true);

alter policy "host write team_scores" on public.team_scores
  using ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'host_verified'::text)::boolean = true)
  with check ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'host_verified'::text)::boolean = true);

alter policy "host write scoreboard_teams" on public.scoreboard_teams
  using ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'host_verified'::text)::boolean = true)
  with check ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'host_verified'::text)::boolean = true);

alter policy "host write shiny_formats" on public.shiny_formats
  using ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'host_verified'::text)::boolean = true)
  with check ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'host_verified'::text)::boolean = true);

alter policy "host insert questions" on public.questions
  with check ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'host_verified'::text)::boolean = true);

alter policy "host update questions" on public.questions
  using ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'host_verified'::text)::boolean = true)
  with check ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'host_verified'::text)::boolean = true);

alter policy "host delete questions" on public.questions
  using ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'host_verified'::text)::boolean = true);

alter policy "service role write questions" on public.questions
  to service_role;

-- Follow-up in the same session: the advisor re-flagged this policy's own
-- auth.role() call for the same per-row re-evaluation reason once the role
-- list narrowed enough to surface it. Same fix, same rationale as above.
alter policy "service role write questions" on public.questions
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

create index if not exists team_scores_show_id_idx on public.team_scores (show_id);
