\set ON_ERROR_STOP on
-- supabase/tests/bendle_song_extras.sql
-- Run ONLY against a throwaway database that has the production schema, never production:
--   psql "$THROWAWAY_DB_URL" -v I_AM_NOT_PRODUCTION=1 -f supabase/tests/bendle_song_extras.sql
-- Run it as a superuser (it uses set role). ON_ERROR_STOP (line 1) makes the
-- first failed check abort the script, so "all checks passed" prints only if
-- every check passed. Everything runs in one transaction and is rolled back.
\if :{?I_AM_NOT_PRODUCTION}
\else
  \echo 'Refusing to run: pass -v I_AM_NOT_PRODUCTION=1 and point at a throwaway database.'
  \quit
\endif

begin;

-- Runs p_sql and passes only if it fails with a permission or RLS error
-- (42501) or, when p_msg is given, with exactly that message.
create function pg_temp.expect_refused(p_sql text, p_msg text default null) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_msg is null and sqlstate = '42501' then return; end if;
    if p_msg is not null and sqlerrm = p_msg then return; end if;
    raise exception 'expected %, got % (%)', coalesce(p_msg, 'permission denied'), sqlerrm, sqlstate;
  end;
  raise exception 'expected %, but the statement succeeded', coalesce(p_msg, 'permission denied');
end $$;
grant execute on function pg_temp.expect_refused(text, text) to anon, authenticated;

-- Rows that already exist, 'aaa' inserted last so the
-- list order below proves it follows norm_key, not insertion.
insert into public.bendle_song_extras (title, artist, norm_key) values ('Uptown Funk', 'Mark Ronson', 'uptown funk|mark ronson');
insert into public.bendle_song_extras (title, artist, norm_key) values ('Aaa', 'Bbb', 'aaa|bbb');
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bendle_song_extras' and column_name = 'created_at') then
    raise exception 'created_at must not exist (it would date tonight''s song)';
  end if;
end $$;

-- anon: phones read the list only through list_bendle_song_extras (no id, no
-- date, sorted by norm_key); the table itself, writes and the add RPC are refused.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$ begin
  if (select string_agg(norm_key, ',') from public.list_bendle_song_extras()) <> 'aaa|bbb,uptown funk|mark ronson' then
    raise exception 'anon list wrong or not sorted by norm_key: %', (select string_agg(norm_key, ',') from public.list_bendle_song_extras());
  end if;
end $$;
select pg_temp.expect_refused($$select id from public.bendle_song_extras$$);
select pg_temp.expect_refused($$select title, artist, norm_key from public.bendle_song_extras$$);
select pg_temp.expect_refused($$insert into public.bendle_song_extras (title, artist, norm_key) values ('X', 'Y', 'x|y')$$);
select pg_temp.expect_refused($$update public.bendle_song_extras set title = 'Hacked'$$);
select pg_temp.expect_refused($$delete from public.bendle_song_extras$$);
select pg_temp.expect_refused($$select public.add_bendle_song_extra('X', 'Y', 'x|y')$$);
reset role;

-- Signed-in phone (not the host): can read, cannot write, RPC says not authorized.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{}}';
do $$ begin
  if (select count(*) from public.list_bendle_song_extras()) <> 2 then raise exception 'authenticated cannot list extras'; end if;
end $$;
select pg_temp.expect_refused($$select id from public.bendle_song_extras$$);
select pg_temp.expect_refused($$insert into public.bendle_song_extras (title, artist, norm_key) values ('X', 'Y', 'x|y')$$);
select pg_temp.expect_refused($$select public.add_bendle_song_extra('X', 'Y', 'x|y')$$, 'not authorized');

-- Host: adds once; a second add of the same key returns false and leaves one row.
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"host_verified":true}}';
do $$ begin
  if public.add_bendle_song_extra('  Africa ', ' Toto ', 'africa|toto') is not true then raise exception 'first add did not return true'; end if;
  if public.add_bendle_song_extra('Africa', 'Toto', 'africa|toto') is not false then raise exception 'second add did not return false'; end if;
  if public.add_bendle_song_extra('Uptown Funk', 'Mark Ronson', 'uptown funk|mark ronson') is not false then raise exception 'existing row add did not return false'; end if;
  if (select count(*) from public.list_bendle_song_extras() l where l.norm_key = 'africa|toto') <> 1 then raise exception 'expected one africa row'; end if;
  if (select l.title || '|' || l.artist from public.list_bendle_song_extras() l where l.norm_key = 'africa|toto') <> 'Africa|Toto' then raise exception 'title/artist not trimmed'; end if;
end $$;

-- Empty and over-long values are refused.
select pg_temp.expect_refused($$select public.add_bendle_song_extra('   ', 'Toto', 'x|toto')$$, 'invalid song');
select pg_temp.expect_refused($$select public.add_bendle_song_extra('Africa', '', 'africa|')$$, 'invalid song');
select pg_temp.expect_refused($$select public.add_bendle_song_extra(null, 'Toto', 'africa|toto')$$, 'invalid song');
select pg_temp.expect_refused($$select public.add_bendle_song_extra('Africa', 'Toto', '')$$, 'invalid song');
select pg_temp.expect_refused($$select public.add_bendle_song_extra(repeat('a', 201), 'Toto', 'long|toto')$$, 'invalid song');
select pg_temp.expect_refused($$select public.add_bendle_song_extra('Africa', repeat('b', 201), 'africa|long')$$, 'invalid song');
reset role;

-- The table itself refuses an empty key or blank title even from the owner.
do $$ begin
  begin
    insert into public.bendle_song_extras (title, artist, norm_key) values ('A', 'B', '');
    raise exception 'empty norm_key accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.bendle_song_extras (title, artist, norm_key) values (' ', 'B', 'k|b');
    raise exception 'blank title accepted';
  exception when check_violation then null;
  end;
end $$;

do $$ begin
  if (select count(*) from public.bendle_song_extras) <> 3 then raise exception 'expected 3 rows, got %', (select count(*) from public.bendle_song_extras); end if;
end $$;

\echo 'bendle_song_extras: all checks passed'
rollback;
