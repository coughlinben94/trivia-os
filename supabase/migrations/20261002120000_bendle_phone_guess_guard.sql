-- supabase/migrations/20261002120000_bendle_phone_guess_guard.sql
-- Bendle phone guess (docs/superpowers/specs/2026-10-02-bendle-phone-guess-design.md).
-- phone_answers is unique on (slide_id, team_id), but a Bendle is three step
-- slides with different ids, RLS only checks that the team owns the row, and
-- slide ids are public in shows.slides — the UI alone cannot hold a team to
-- one guess at the live step. This trigger does, for Bendle step slides only:
--   1. only the slide on screen right now (no back-dating to step 1, no stale render)
--   2. nothing once the group is locked (bendleLocked on any step slide of the group)
--   3. one row per team per Bendle group (shinyGroupId)
--   4. no UPDATE: the first lock is final (this also covers an UPDATE that
--      moves a Bendle row's slide_id to another slide, which would otherwise
--      free the team to guess again)
-- Every other phone board is untouched. Host Unlock clears the group's rows
-- through clear_bendle_group_answers (phone_answers has no DELETE policy).
--
-- Rollback:
--   drop trigger if exists phone_answers_guard_bendle on public.phone_answers;
--   drop function if exists public.guard_bendle_phone_answers();
--   drop function if exists public.clear_bendle_group_answers(text, text);
--   then re-run the create function + grant block of
--   20260905150156_bendle_answer_counts_drop_total.sql to restore bendle_answer_counts.

create or replace function public.guard_bendle_phone_answers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_slides  jsonb;
  v_slide   jsonb;
  v_group   text;
  v_ids     text[];
begin
  -- An UPDATE that moves a row off a Bendle step is still an UPDATE of a guess.
  if tg_op = 'UPDATE'
     and (old.show_id, old.slide_id) is distinct from (new.show_id, new.slide_id)
     and exists (
       select 1
       from public.shows s, jsonb_array_elements(coalesce(s.slides, '[]'::jsonb)) sl
       where s.id::text = old.show_id
         and sl->>'id' = old.slide_id
         and sl->>'type' = 'question'
         and sl->'data'->'shinyInputSchema'->>'type' = 'bendle'
     ) then
    raise exception 'bendle_no_update' using errcode = '55000';
  end if;

  select s.current_slide_id::text, s.slides into v_current, v_slides
  from public.shows s
  where s.id::text = new.show_id;

  select sl into v_slide
  from jsonb_array_elements(coalesce(v_slides, '[]'::jsonb)) sl
  where sl->>'id' = new.slide_id;

  if v_slide is null
     or v_slide->>'type' is distinct from 'question'
     or v_slide->'data'->'shinyInputSchema'->>'type' is distinct from 'bendle' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'bendle_no_update' using errcode = '55000';
  end if;

  v_group := v_slide->'data'->>'shinyGroupId';
  if v_group is null then
    raise exception 'bendle_no_group' using errcode = '55000';
  end if;

  if v_current is distinct from new.slide_id then
    raise exception 'bendle_not_live' using errcode = '55000';
  end if;

  select array_agg(sl->>'id') into v_ids
  from jsonb_array_elements(v_slides) sl
  where sl->>'type' = 'question'
    and sl->'data'->'shinyInputSchema'->>'type' = 'bendle'
    and sl->'data'->>'shinyGroupId' = v_group;

  if exists (
    select 1 from jsonb_array_elements(v_slides) sl
    where sl->>'id' = any(v_ids) and sl->'data'->>'bendleLocked' = 'true'
  ) then
    raise exception 'bendle_locked' using errcode = '55000';
  end if;

  -- Serialise two taps from the same team on the same group. Under READ
  -- COMMITTED the next statement takes a fresh snapshot, so it sees a row the
  -- lock holder committed while we waited.
  perform pg_advisory_xact_lock(hashtext('bendle:' || new.team_id || ':' || v_group));
  if exists (
    select 1 from public.phone_answers pa
    where pa.team_id = new.team_id and pa.slide_id = any(v_ids)
  ) then
    raise exception 'bendle_already_guessed' using errcode = '23505';
  end if;

  return new;
end;
$$;

create trigger phone_answers_guard_bendle
  before insert or update on public.phone_answers
  for each row
  execute function public.guard_bendle_phone_answers();

-- Host Unlock: delete every team's guess for one Bendle group so phones can
-- guess again. Same host_verified gate as create_reauth_token (20260817173635).
create or replace function public.clear_bendle_group_answers(p_show_id text, p_group_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids   text[];
  v_count integer;
begin
  if not coalesce((((select auth.jwt()) -> 'app_metadata') ->> 'host_verified')::boolean, false) then
    raise exception 'not authorized';
  end if;

  select array_agg(sl->>'id') into v_ids
  from public.shows s, jsonb_array_elements(coalesce(s.slides, '[]'::jsonb)) sl
  where s.id::text = p_show_id
    and sl->>'type' = 'question'
    and sl->'data'->'shinyInputSchema'->>'type' = 'bendle'
    and sl->'data'->>'shinyGroupId' = p_group_id;

  if v_ids is null then
    return 0;
  end if;

  delete from public.phone_answers where show_id = p_show_id and slide_id = any(v_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.clear_bendle_group_answers(text, text) from public;
grant execute on function public.clear_bendle_group_answers(text, text) to authenticated;

-- Dead since the 2026-09-08 manual-grading rebuild: no client calls it.
drop function if exists public.bendle_answer_counts(text);
