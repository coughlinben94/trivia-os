-- supabase/migrations/20261002140000_bendle_answer_privacy.sql
-- Bendle answer privacy (phase 1). Phones and the TV (anon until the host PIN)
-- could read tonight's Bendle song before the reveal two ways:
--   a) every Bendle step slide carried `answer` (the song title) in
--      shows.slides, which phones load with select('*') and Realtime;
--   b) bendle_songs was readable by everyone (20260904120000, "public read").
-- This migration:
--   1. lets only the host (host_verified JWT claim) read bendle_songs. The
--      table stays in the Realtime publication: the host's status listeners
--      (BendleAdmin, Host.jsx) need it, and Realtime applies this RLS policy,
--      so other subscribers get no rows. The worker uses the service role.
--   2. strips `answer` from Bendle step slides, now and on every later write
--      (a trigger, so a stale host tab cannot put it back). Everything else in
--      the slide, and every non-Bendle slide, is left as is.
--   3. adds get_bendle_song_for_show(show, slide) for the TV: stem URLs and
--      start/end marks always; title and artist only once the group is
--      revealed (bendleRevealed on any step slide of the group, or
--      answer_reveal while a step of the group is the current slide, the
--      same flags ShinyBendleQuestion.jsx reveals on).
-- Residual (not fixed here): stem files are public storage objects at
-- bendle/<song id>/<stem>.mp3 and the song id is still in the slide, so the
-- vocals file can be fetched by a determined phone.
--
-- Rollback:
--   drop trigger if exists shows_strip_bendle_answers on public.shows;
--   drop function if exists public.strip_bendle_answers_trigger();
--   drop function if exists public.bendle_strip_answers(jsonb);
--   drop function if exists public.get_bendle_song_for_show(text, text);
--   drop policy if exists "host read bendle_songs" on public.bendle_songs;
--   create policy "public read bendle_songs" on public.bendle_songs for select to public using (true);
--   (stripped `answer` values are not restored; the song row still has them.)

-- 1. Host-only reads.
drop policy if exists "public read bendle_songs" on public.bendle_songs;
drop policy if exists "host read bendle_songs" on public.bendle_songs;
create policy "host read bendle_songs" on public.bendle_songs
  for select to public
  using (coalesce((((select auth.jwt()) -> 'app_metadata') ->> 'host_verified')::boolean, false));

-- 2. Strip `answer` from Bendle step slides. A slides value that is not a
-- json array passes through untouched.
create or replace function public.bendle_strip_answers(p_slides jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p_slides) is distinct from 'array' then p_slides
    when not exists (
      select 1 from jsonb_array_elements(p_slides) sl
      where sl->'data'->'shinyInputSchema'->>'type' = 'bendle' and sl->'data' ? 'answer'
    ) then p_slides
    else (
      select jsonb_agg(
        case when sl->'data'->'shinyInputSchema'->>'type' = 'bendle' and sl->'data' ? 'answer'
             then jsonb_set(sl, '{data}', (sl->'data') - 'answer')
             else sl end
        order by ord)
      from jsonb_array_elements(p_slides) with ordinality as t(sl, ord)
    )
  end
$$;

create or replace function public.strip_bendle_answers_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.slides := public.bendle_strip_answers(new.slides);
  return new;
end;
$$;

drop trigger if exists shows_strip_bendle_answers on public.shows;
create trigger shows_strip_bendle_answers
  before insert or update of slides on public.shows
  for each row
  execute function public.strip_bendle_answers_trigger();

-- One-off clean of every saved show (the trigger does the work).
update public.shows
set slides = slides
where jsonb_typeof(slides) = 'array'
  and exists (
    select 1 from jsonb_array_elements(slides) sl
    where sl->'data'->'shinyInputSchema'->>'type' = 'bendle' and sl->'data' ? 'answer'
  );

-- 3. The TV's read. Null unless p_slide_id is a Bendle step of p_show_id.
create or replace function public.get_bendle_song_for_show(p_show_id text, p_slide_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slide    jsonb;
  v_group    text;
  v_slides   jsonb;
  v_current  text;
  v_reveal   boolean;
  v_revealed boolean;
  v_song     public.bendle_songs%rowtype;
begin
  v_slide := public.bendle_step_slide(p_show_id, p_slide_id);
  if v_slide is null then
    return null;
  end if;

  select * into v_song from public.bendle_songs b where b.id = v_slide->'data'->>'bendleSongId';
  if not found then
    return null;
  end if;

  v_group := v_slide->'data'->>'shinyGroupId';
  select case when jsonb_typeof(s.slides) = 'array' then s.slides else '[]'::jsonb end, s.current_slide_id::text, coalesce(s.answer_reveal, false)
    into v_slides, v_current, v_reveal
  from public.shows s where s.id::text = p_show_id;

  -- A slide with no group is its own group.
  select coalesce(bool_or(
           sl->'data'->>'bendleRevealed' = 'true'
           or (v_reveal and sl->>'id' = v_current)), false)
    into v_revealed
  from jsonb_array_elements(v_slides) sl
  where sl->>'type' = 'question'
    and sl->'data'->'shinyInputSchema'->>'type' = 'bendle'
    and (sl->>'id' = p_slide_id or (v_group is not null and sl->'data'->>'shinyGroupId' = v_group));

  return jsonb_build_object(
    'id', v_song.id,
    'drums_url', v_song.drums_url,
    'bass_url', v_song.bass_url,
    'other_url', v_song.other_url,
    'guitar_url', v_song.guitar_url,
    'vocals_url', v_song.vocals_url,
    'start_offset_seconds', v_song.start_offset_seconds,
    'end_offset_seconds', v_song.end_offset_seconds,
    'title', case when v_revealed then v_song.title end,
    'artist', case when v_revealed then v_song.artist end
  );
end;
$$;

revoke all on function public.get_bendle_song_for_show(text, text) from public;
grant execute on function public.get_bendle_song_for_show(text, text) to anon, authenticated;
