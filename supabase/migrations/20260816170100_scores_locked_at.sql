-- Replaces the scores_locked boolean (applied by hand to prod 2026-08-16,
-- backfilled here) with a timestamp. A boolean flipped true on mount /
-- false on unmount has no recovery path if the host's laptop crashes,
-- sleeps, or loses wifi while ScoreboardModal is open — phones stay locked
-- out of the scoreboard for the rest of the night with nothing to clear it.
-- A timestamp lets the phone-side check treat a lock older than ~10 minutes
-- as expired (self-healing against exactly that failure, no heartbeat or
-- server job needed) while a live show still refreshes it continuously.
alter table public.shows drop column if exists scores_locked;
alter table public.shows add column scores_locked_at timestamptz;
