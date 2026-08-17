-- Ben's call (2026-08-17): a struggling phone at a live show that lost its
-- Supabase auth session (cleared history, iOS eviction) has no self-service
-- fix under the current RLS — teams' UPDATE policy requires owner_uid to
-- ALREADY equal auth.uid() before a write is allowed, which is exactly what
-- a session swap needs to change. Only the host (host_verified) knows which
-- real team a struggling phone belongs to, so the flow is host-initiated:
-- the host picks the team on /host, gets a short-lived single-use token, and
-- the phone redeems it to have its CURRENT session written onto that team's
-- row. Deny-all table (no SELECT/INSERT/UPDATE policies of any kind) — every
-- access goes through the two RPCs below, so the token's lifecycle (create,
-- one-time redeem, expire) can't be bypassed by a direct query.

create table public.team_reauth_tokens (
  token      text primary key default encode(gen_random_bytes(9), 'base64'),
  team_id    text not null references public.teams(id) on delete cascade,
  show_id    text not null,
  created_at timestamptz not null default now(),
  used_at    timestamptz,
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

alter table public.team_reauth_tokens enable row level security;

create or replace function public.create_reauth_token(p_team_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token   text;
  v_show_id text;
begin
  if not coalesce((((select auth.jwt()) -> 'app_metadata') ->> 'host_verified')::boolean, false) then
    raise exception 'not authorized';
  end if;

  select show_id into v_show_id from teams where id = p_team_id;
  if v_show_id is null then
    raise exception 'team not found';
  end if;

  insert into team_reauth_tokens (team_id, show_id)
  values (p_team_id, v_show_id)
  returning token into v_token;

  return v_token;
end;
$$;

revoke all on function public.create_reauth_token(text) from public;
grant execute on function public.create_reauth_token(text) to authenticated;

-- Redeeming requires the caller to already hold SOME session (auth.uid() not
-- null) — Join.jsx mints an anon one first if the phone has none, same as a
-- fresh registration does. A token is single-use (used_at set atomically
-- under the row lock below) and expires in 15 minutes regardless.
create or replace function public.redeem_reauth_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  team_reauth_tokens;
  v_team teams;
begin
  if (select auth.uid()) is null then
    return null;
  end if;

  select * into v_row from team_reauth_tokens where token = p_token for update;
  if v_row is null or v_row.used_at is not null or v_row.expires_at < now() then
    return null;
  end if;

  update team_reauth_tokens set used_at = now() where token = p_token;
  update teams set owner_uid = (select auth.uid()) where id = v_row.team_id
    returning * into v_team;

  return jsonb_build_object('id', v_team.id, 'name', v_team.name, 'color', v_team.color, 'show_id', v_team.show_id);
end;
$$;

revoke all on function public.redeem_reauth_token(text) from public;
grant execute on function public.redeem_reauth_token(text) to anon, authenticated;
