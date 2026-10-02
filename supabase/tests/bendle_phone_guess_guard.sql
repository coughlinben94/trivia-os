\set ON_ERROR_STOP on
-- supabase/tests/bendle_phone_guess_guard.sql
-- Run ONLY against a throwaway database that has the production schema, never production:
--   psql "$THROWAWAY_DB_URL" -v I_AM_NOT_PRODUCTION=1 -f supabase/tests/bendle_phone_guess_guard.sql
-- Run it as a superuser (it uses session_replication_role and set role).
-- ON_ERROR_STOP (line 1) makes the first failed check abort the script, so the
-- closing "all checks passed" line only prints when every check passed.
-- Everything runs in one transaction and is rolled back.
\if :{?I_AM_NOT_PRODUCTION}
\else
  \echo 'Refusing to run: pass -v I_AM_NOT_PRODUCTION=1 and point at a throwaway database.'
  \quit
\endif

begin;

create function pg_temp.expect_error(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_msg then return; end if;
    raise exception 'expected %, got %', p_msg, sqlerrm;
  end;
  raise exception 'expected %, but the statement succeeded', p_msg;
end $$;

-- Fixture: one show, a Bendle group g1 (steps s1/s2/s3) plus a matching slide q1.
-- If this insert (or the teams insert below) fails on a NOT NULL column, add
-- that column with a dummy value (\d public.shows and \d public.teams list them;
-- Join.jsx:2510 shows the columns a real team insert sends).
insert into public.shows (id, title, is_live, current_slide_index, current_slide_id, slides)
values ('bg_show', 'Bendle guard test', true, 1, 's1', jsonb_build_array(
  jsonb_build_object('id', 't1', 'type', 'shiny-title', 'order', 0, 'data', jsonb_build_object('isShiny', true, 'shinyGroupId', 'g1')),
  jsonb_build_object('id', 's1', 'type', 'question', 'order', 1, 'data', jsonb_build_object('isShiny', true, 'shinyGroupId', 'g1', 'bendleStepIndex', 0, 'shinyInputSchema', jsonb_build_object('type', 'bendle'))),
  jsonb_build_object('id', 's2', 'type', 'question', 'order', 2, 'data', jsonb_build_object('isShiny', true, 'shinyGroupId', 'g1', 'bendleStepIndex', 1, 'shinyInputSchema', jsonb_build_object('type', 'bendle'))),
  jsonb_build_object('id', 's3', 'type', 'question', 'order', 3, 'data', jsonb_build_object('isShiny', true, 'shinyGroupId', 'g1', 'bendleStepIndex', 2, 'shinyInputSchema', jsonb_build_object('type', 'bendle'))),
  jsonb_build_object('id', 'q1', 'type', 'question', 'order', 4, 'data', jsonb_build_object('isShiny', true, 'shinyInputSchema', jsonb_build_object('type', 'matching'))),
  -- A Bendle step with no shinyGroupId (index 5).
  jsonb_build_object('id', 'n1', 'type', 'question', 'order', 5, 'data', jsonb_build_object('isShiny', true, 'bendleStepIndex', 0, 'shinyInputSchema', jsonb_build_object('type', 'bendle')))
));
-- A second show whose team bg_x tries to write into bg_show.
insert into public.shows (id, title, is_live, current_slide_index, current_slide_id, slides)
values ('bg_other', 'Bendle guard other show', true, 0, null, '[]'::jsonb);
insert into public.teams (id, show_id, name) values ('bg_a', 'bg_show', 'A'), ('bg_b', 'bg_show', 'B'), ('bg_c', 'bg_show', 'C'), ('bg_x', 'bg_other', 'X');
-- bg_d is owned by a signed-in phone (owner_uid), for the checks that go through RLS.
insert into public.teams (id, show_id, name, owner_uid) values ('bg_d', 'bg_show', 'D', '00000000-0000-0000-0000-00000000000d');
-- A show whose slides is not a json array (malformed row) and a team in it.
insert into public.shows (id, title, is_live, current_slide_index, current_slide_id, slides)
values ('bg_bad', 'Bendle guard malformed show', true, 0, 'z1', '{"not":"an array"}'::jsonb);
insert into public.teams (id, show_id, name) values ('bg_y', 'bg_bad', 'Y');

-- A malformed slides value does not break the Bendle guard. The row is filed
-- under bg_other (the movie-chain trigger expands the ROW's show unguarded, a
-- separate mechanic); the Bendle guard still expands the TEAM's show, bg_bad.
insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_other', 'z1', 'bg_y', '[]');

-- A step slide with no group is refused even while live.
update public.shows set current_slide_id = 'n1' where id = 'bg_show';
select pg_temp.expect_error($$insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 'n1', 'bg_c', '{"title":"Africa"}')$$, 'bendle_no_group');
update public.shows set current_slide_id = 's1' where id = 'bg_show';

-- Wrong show_id: the show comes from the team, not the row.
select pg_temp.expect_error($$insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('nope', 's1', 'bg_c', '{"title":"Africa"}')$$, 'bendle_not_live');
select pg_temp.expect_error($$insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('nope', 's2', 'bg_c', '{"title":"Africa"}')$$, 'bendle_not_live');
-- A team from another show cannot write into this show's Bendle.
select pg_temp.expect_error($$insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 's1', 'bg_x', '{"title":"Africa"}')$$, 'bendle_not_live');

-- Live step only, first write wins, no second row, no update.
insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 's1', 'bg_a', '{"title":"Africa"}');
select pg_temp.expect_error($$insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 's1', 'bg_a', '{"title":"Other"}')$$, 'bendle_already_guessed');
-- Upsert (the client's write path) is refused the same way.
select pg_temp.expect_error($$insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 's1', 'bg_a', '{"title":"Other"}') on conflict (slide_id, team_id) do update set answer = excluded.answer$$, 'bendle_already_guessed');
select pg_temp.expect_error($$update public.phone_answers set answer = '{"title":"Other"}' where slide_id = 's1' and team_id = 'bg_a'$$, 'bendle_no_update');
select pg_temp.expect_error($$insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 's2', 'bg_b', '{"title":"Africa"}')$$, 'bendle_not_live');

-- Step 2 live: team A (already locked on step 1) is refused; team B is accepted.
update public.shows set current_slide_id = 's2' where id = 'bg_show';
select pg_temp.expect_error($$insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 's2', 'bg_a', '{"title":"Other"}')$$, 'bendle_already_guessed');
insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 's2', 'bg_b', '{"title":"Africa"}');
-- A signed-in phone that owns its team guesses through RLS (the real write path).
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000000d"}';
insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 's2', 'bg_d', '{"title":"Africa"}');
-- Non-Bendle boards still save and re-save through RLS.
insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 'q1', 'bg_d', '[]');
update public.phone_answers set answer = '[2]' where slide_id = 'q1' and team_id = 'bg_d';
reset role;
do $$ begin
  if (select answer::text from public.phone_answers where slide_id = 'q1' and team_id = 'bg_d') is distinct from '[2]' then
    raise exception 'non-Bendle update as authenticated did not save';
  end if;
end $$;
-- Moving a Bendle row to another slide (to free the team) is refused.
select pg_temp.expect_error($$update public.phone_answers set slide_id = 'q1' where slide_id = 's2' and team_id = 'bg_b'$$, 'bendle_no_update');
-- Back-dating to step 1 while step 2 is live is refused.
select pg_temp.expect_error($$insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 's1', 'bg_c', '{"title":"Africa"}')$$, 'bendle_not_live');

-- Step 3 live and locked: nobody can write.
update public.shows set current_slide_id = 's3',
  slides = jsonb_set(slides, '{3,data,bendleLocked}', 'true'::jsonb) where id = 'bg_show';
select pg_temp.expect_error($$insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 's3', 'bg_c', '{"title":"Africa"}')$$, 'bendle_locked');
-- Wrong show_id after the lock is still refused.
select pg_temp.expect_error($$insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('nope', 's1', 'bg_c', '{"title":"Africa"}')$$, 'bendle_not_live');
select pg_temp.expect_error($$insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('nope', 's3', 'bg_c', '{"title":"Africa"}')$$, 'bendle_not_live');

-- Other boards are untouched (insert and update on a non-Bendle slide work).
insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 'q1', 'bg_c', '[]');
update public.phone_answers set answer = '[1]' where slide_id = 'q1' and team_id = 'bg_c';

-- A stray row filed under the wrong show_id (written before this guard, so
-- inserted with triggers off) must still be cleared by Unlock: the RPC matches
-- by team, not by the row's show_id.
set local session_replication_role = replica;
insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('nope', 's1', 'bg_c', '{"title":"Stray"}');
set local session_replication_role = origin;

-- RPC: anon cannot call it at all.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$ begin
  begin
    perform public.clear_bendle_group_answers('bg_show', 'g1');
    raise exception 'expected permission denied for anon';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- RPC: refused without the host claim.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{}}';
do $$ begin
  begin
    perform public.clear_bendle_group_answers('bg_show', 'g1');
    raise exception 'expected not authorized';
  exception when others then
    if sqlerrm <> 'not authorized' then raise; end if;
  end;
end $$;

-- RPC: a verified host clears exactly the group's four rows (bg_a s1, bg_b s2,
-- bg_d s2, the stray bg_c s1); the q1 rows survive. A malformed show clears 0.
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"host_verified":true}}';
do $$ declare n int; begin
  n := public.clear_bendle_group_answers('bg_show', 'g1');
  if n <> 4 then raise exception 'expected 4 rows cleared, got %', n; end if;
  n := public.clear_bendle_group_answers('bg_bad', 'g1');
  if n <> 0 then raise exception 'expected 0 rows cleared on the malformed show, got %', n; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.phone_answers where team_id in ('bg_a','bg_b','bg_c','bg_d') and slide_id in ('s1','s2','s3')) <> 0 then raise exception 'group rows remain'; end if;
  if (select count(*) from public.phone_answers where team_id in ('bg_c','bg_d') and slide_id = 'q1') <> 2 then raise exception 'q1 rows were touched'; end if;
  if exists (select 1 from pg_proc where proname = 'bendle_answer_counts') then raise exception 'bendle_answer_counts still exists'; end if;
end $$;

-- Unlock flow: after the clear and the lock lifted, team A (who guessed on
-- step 1) can guess again on the live step.
update public.shows set slides = jsonb_set(slides, '{3,data,bendleLocked}', 'false'::jsonb) where id = 'bg_show';
insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 's3', 'bg_a', '{"title":"Africa"}');

\echo 'bendle_phone_guess_guard: all checks passed'
rollback;
