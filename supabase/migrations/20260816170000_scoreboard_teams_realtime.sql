-- scoreboard_teams was added to the app (scoreboard-rebuild) but never to
-- the supabase_realtime publication — so the TV overlay's and phone
-- drawer's postgres_changes subscriptions on it never fired. Both surfaces
-- fell back to polling as a workaround. This is the real fix; both polls
-- were removed once this landed. Applied by hand to prod 2026-08-16,
-- backfilled here so schema history matches what's actually live.
alter publication supabase_realtime add table public.scoreboard_teams;
