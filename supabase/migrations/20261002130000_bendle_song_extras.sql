-- supabase/migrations/20261002130000_bendle_song_extras.sql
-- Bendle song fail-safe (docs/superpowers/specs/2026-10-02-bendle-phone-guess-design.md,
-- "Song list"). The phone song list is a static Wikidata file, and some songs
-- are missing from it. When the host picks a Bendle song the builder checks
-- the list and, if the song is missing, adds it here; phones merge these rows
-- into their search. Rows are never tied to a show or a night, so nothing
-- marks which entry is tonight's answer.
-- norm_key is the client's normalizeText(title) || '|' || normalizeText(artist)
-- (client/src/lib/bendleSongExtras.js), the same key the catalog build dedupes on.
-- No date column, and the table is not readable by the API roles: phones read
-- it only through list_bendle_song_extras, which returns title/artist/norm_key
-- sorted by norm_key, so neither a date, an id nor row order can show which
-- song was added last (tonight's). Only the host writes, through
-- add_bendle_song_extra (same host_verified gate as clear_bendle_group_answers).
-- No UPDATE/DELETE path: remove a row from the dashboard if ever needed.
--
-- Rollback:
--   drop function if exists public.list_bendle_song_extras();
--   drop function if exists public.add_bendle_song_extra(text, text, text);
--   drop table if exists public.bendle_song_extras;

create table if not exists public.bendle_song_extras (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(btrim(title)) between 1 and 200),
  artist     text not null check (char_length(btrim(artist)) between 1 and 200),
  norm_key   text not null unique check (norm_key <> '' and char_length(norm_key) <= 410)
);

alter table public.bendle_song_extras enable row level security;

-- Supabase default privileges grant API roles everything on new tables; take
-- it all back (RLS on with no policy also denies). Reads go through the RPC below.
revoke all on public.bendle_song_extras from public, anon, authenticated;

create or replace function public.list_bendle_song_extras()
returns table (title text, artist text, norm_key text)
language sql
stable
security definer
set search_path = public
as $$
  select e.title, e.artist, e.norm_key from public.bendle_song_extras e order by e.norm_key
$$;

revoke all on function public.list_bendle_song_extras() from public;
grant execute on function public.list_bendle_song_extras() to anon, authenticated;

-- Idempotent: true when the row was added, false when the key was already there.
create or replace function public.add_bendle_song_extra(p_title text, p_artist text, p_norm_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title  text := btrim(p_title);
  v_artist text := btrim(p_artist);
  v_rows   integer;
begin
  if not coalesce((((select auth.jwt()) -> 'app_metadata') ->> 'host_verified')::boolean, false) then
    raise exception 'not authorized';
  end if;

  if coalesce(char_length(v_title), 0) not between 1 and 200
     or coalesce(char_length(v_artist), 0) not between 1 and 200
     or coalesce(char_length(p_norm_key), 0) not between 1 and 410 then
    raise exception 'invalid song';
  end if;

  insert into public.bendle_song_extras (title, artist, norm_key)
  values (v_title, v_artist, p_norm_key)
  on conflict (norm_key) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.add_bendle_song_extra(text, text, text) from public;
revoke execute on function public.add_bendle_song_extra(text, text, text) from anon;
grant execute on function public.add_bendle_song_extra(text, text, text) to authenticated;
