\set ON_ERROR_STOP on
-- supabase/tests/bendle_answer_privacy.sql
-- Run ONLY against a throwaway database that has the production schema, never production:
--   psql "$THROWAWAY_DB_URL" -v I_AM_NOT_PRODUCTION=1 -f supabase/tests/bendle_answer_privacy.sql
-- Run it as a superuser (it uses set role). ON_ERROR_STOP (line 1) makes the
-- first failed check abort the script, so "all checks passed" prints only if
-- every check passed. Everything runs in one transaction and is rolled back.
\if :{?I_AM_NOT_PRODUCTION}
\else
  \echo 'Refusing to run: pass -v I_AM_NOT_PRODUCTION=1 and point at a throwaway database.'
  \quit
\endif

begin;

create function pg_temp.check(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAILED: %', p_msg; end if;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;

insert into public.bendle_songs (id, title, answer, artist, status, drums_url, bass_url, other_url, vocals_url, start_offset_seconds, end_offset_seconds)
values ('bnd_priv', 'Crazy On You', 'Crazy On You', 'Heart', 'ready', 'https://s/d.mp3', 'https://s/b.mp3', 'https://s/o.mp3', 'https://s/v.mp3', 95, 122);

-- A show saved WITH the answer on each Bendle step (what the old wizard wrote).
-- The insert itself is stripped by the trigger; q1 (not Bendle) keeps its answer.
insert into public.shows (id, title, is_live, current_slide_index, current_slide_id, slides)
values ('bp_show', 'Bendle privacy test', true, 0, 's1', jsonb_build_array(
  jsonb_build_object('id', 's1', 'type', 'question', 'data', jsonb_build_object('isShiny', true, 'shinyGroupId', 'g1', 'bendleStepIndex', 0, 'bendleSongId', 'bnd_priv', 'answer', 'Crazy On You', 'shinyInputSchema', jsonb_build_object('type', 'bendle'))),
  jsonb_build_object('id', 's2', 'type', 'question', 'data', jsonb_build_object('isShiny', true, 'shinyGroupId', 'g1', 'bendleStepIndex', 1, 'bendleSongId', 'bnd_priv', 'answer', 'Crazy On You', 'shinyInputSchema', jsonb_build_object('type', 'bendle'))),
  jsonb_build_object('id', 's3', 'type', 'question', 'data', jsonb_build_object('isShiny', true, 'shinyGroupId', 'g1', 'bendleStepIndex', 2, 'bendleSongId', 'bnd_priv', 'answer', 'Crazy On You', 'shinyInputSchema', jsonb_build_object('type', 'bendle'))),
  jsonb_build_object('id', 'q1', 'type', 'question', 'data', jsonb_build_object('text', 'Capital of France?', 'answer', 'Paris'))
));
insert into public.shows (id, title, slides) values ('bp_other', 'Other show', '[]'::jsonb);
insert into public.shows (id, title, slides) values ('bp_bad', 'Malformed slides', '{"not":"an array"}'::jsonb);

select pg_temp.check(not exists (
  select 1 from public.shows s, jsonb_array_elements(s.slides) sl
  where s.id = 'bp_show' and sl->'data'->'shinyInputSchema'->>'type' = 'bendle' and sl->'data' ? 'answer'
), 'insert kept an answer on a Bendle step');
select pg_temp.check((select sl->'data'->>'answer' from public.shows s, jsonb_array_elements(s.slides) sl where s.id = 'bp_show' and sl->>'id' = 'q1') = 'Paris', 'non-Bendle answer was touched');
select pg_temp.check((select sl->'data'->>'bendleSongId' from public.shows s, jsonb_array_elements(s.slides) sl where s.id = 'bp_show' and sl->>'id' = 's2') = 'bnd_priv', 'bendleSongId was lost');
select pg_temp.check((select slides from public.shows where id = 'bp_bad') = '{"not":"an array"}'::jsonb, 'malformed slides changed');

-- An update that puts the answer back (a stale host tab) is stripped too.
update public.shows set slides = jsonb_set(slides, '{1,data,answer}', '"Crazy On You"') where id = 'bp_show';
select pg_temp.check(not (select slides->1->'data' ? 'answer' from public.shows where id = 'bp_show'), 'update kept an answer on a Bendle step');
-- Every saved show is clean (the migration's one-off strip ran).
select pg_temp.check(not exists (
  select 1 from public.shows s, jsonb_array_elements(case when jsonb_typeof(s.slides) = 'array' then s.slides else '[]'::jsonb end) sl
  where sl->'data'->'shinyInputSchema'->>'type' = 'bendle' and sl->'data' ? 'answer'
), 'a saved show still has a Bendle answer');

-- anon (phones, the TV before PIN): no rows from bendle_songs.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.check((select count(*) from public.bendle_songs) = 0, 'anon can read bendle_songs');
-- The TV's function: stems and marks always, title/artist only after the reveal.
select pg_temp.check((select r->>'title' is null and r->>'artist' is null and r->>'answer' is null and r->>'aliases' is null
  and r->>'drums_url' = 'https://s/d.mp3' and r->>'vocals_url' = 'https://s/v.mp3' and (r->>'start_offset_seconds')::int = 95 and r->>'id' = 'bnd_priv'
  from public.get_bendle_song_for_show('bp_show', 's1') r), 'unrevealed: wrong fields');
select pg_temp.check(public.get_bendle_song_for_show('bp_show', 'q1') is null, 'non-Bendle slide returned a song');
select pg_temp.check(public.get_bendle_song_for_show('bp_other', 's1') is null, 'slide from another show returned a song');
select pg_temp.check(public.get_bendle_song_for_show('bp_bad', 's1') is null, 'malformed show returned a song');
reset role;

-- Signed-in phone without the host claim: no rows either.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{}}';
select pg_temp.check((select count(*) from public.bendle_songs) = 0, 'non-host authenticated can read bendle_songs');
select pg_temp.check(public.get_bendle_song_for_show('bp_show', 's2')->>'title' is null, 'non-host got the title before reveal');
-- Host: reads the table (editor, grading).
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"host_verified":true}}';
select pg_temp.check((select title from public.bendle_songs where id = 'bnd_priv') = 'Crazy On You', 'host cannot read bendle_songs');
reset role;

-- answer_reveal counts only while a step of this group is on screen.
update public.shows set answer_reveal = true, current_slide_id = 'q1' where id = 'bp_show';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.check(public.get_bendle_song_for_show('bp_show', 's1')->>'title' is null, 'answer_reveal on another slide revealed the song');
reset role;
update public.shows set current_slide_id = 's2' where id = 'bp_show';
set local role anon;
select pg_temp.check(public.get_bendle_song_for_show('bp_show', 's1')->>'title' = 'Crazy On You', 'answer_reveal on a group step did not reveal');
reset role;

-- bendleRevealed on the step-3 slide reveals the whole group.
update public.shows set answer_reveal = false, slides = jsonb_set(slides, '{2,data,bendleRevealed}', 'true') where id = 'bp_show';
set local role anon;
select pg_temp.check((select r->>'title' = 'Crazy On You' and r->>'artist' = 'Heart' from public.get_bendle_song_for_show('bp_show', 's1') r), 'bendleRevealed did not reveal title/artist');
reset role;

\echo 'bendle_answer_privacy: all checks passed'
rollback;
