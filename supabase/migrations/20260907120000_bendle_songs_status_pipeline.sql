alter table public.bendle_songs
  alter column drums_url drop not null,
  alter column bass_url drop not null,
  alter column other_url drop not null,
  alter column vocals_url drop not null,
  add column status text not null default 'ready'
    check (status in ('requested', 'processing', 'ready', 'failed')),
  add column error_text text,
  add column spotify_id text,
  add column artist text,
  add column artwork_url text;

-- Without this, Task 5's realtime subscription connects successfully but
-- receives nothing — only scoreboard_teams is in this publication today
-- (see 20260816170000_scoreboard_teams_realtime.sql), and Postgres changes
-- to a table outside the publication are silently invisible to `.channel()`
-- subscribers, not an error.
alter publication supabase_realtime add table public.bendle_songs;
