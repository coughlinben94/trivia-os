-- redeem_reauth_token's jsonb result didn't include powerup_used — a phone
-- reauthing back into a team that had already used its powerup would show
-- the button as fresh/unused again, letting it be invoked a second time.
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

  return jsonb_build_object(
    'id', v_team.id, 'name', v_team.name, 'color', v_team.color,
    'show_id', v_team.show_id, 'powerup_used', v_team.powerup_used
  );
end;
$$;
