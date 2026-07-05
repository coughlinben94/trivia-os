-- RLS-D-1: let an unauthenticated /display browser advance a live show's
-- navigation — and NOTHING else.
--
-- Background: 20260703204140_host_pin_gate_rls locked shows-table writes
-- behind the host_verified JWT claim (PIN gate). But /display performs a
-- write of its own — the jukebox-return jump sets current_slide_index /
-- current_slide_id — and the TV browser never goes through the PIN gate,
-- so that write was silently denied (0 rows, no error): the jukebox return
-- stopped advancing the show on the real TV rig.
--
-- Design choice — SECURITY DEFINER RPC, not a column-restricted RLS policy:
-- Postgres RLS WITH CHECK cannot reference the OLD row, so "may update only
-- these two columns" has to be emulated with per-row correlated subqueries
-- comparing NEW against a pre-update snapshot — fragile, and every FUTURE
-- column added to shows silently becomes anon-writable unless someone
-- remembers to extend the comparison list. This function makes the one
-- allowed operation explicit instead: the anon-reachable surface is exactly
-- (slide_id, slide_index) on is_live rows, validated against the show's own
-- slides array, and nothing widens by accident when the table grows. It also
-- returns success explicitly, which /display's denial banner needs — the
-- silent 0-row denial is what made RLS-D-1 dangerous.
--
-- updated_at is deliberately NOT bumped: the pre-RLS display writes never
-- bumped it, and /display's no-param show picker orders by updated_at —
-- a nav write must not reshuffle that ordering.

create or replace function public.advance_show(
  p_show_id     text,
  p_slide_id    text,
  p_slide_index integer
)
returns boolean
language sql
security definer
set search_path = public
as $$
  update shows
     set current_slide_index = p_slide_index,
         current_slide_id    = p_slide_id
   where id = p_show_id
     and is_live = true
     and p_slide_index >= 0
     and p_slide_index < jsonb_array_length(coalesce(slides, '[]'::jsonb))
     and (
       p_slide_id is null
       or exists (
         select 1
           from jsonb_array_elements(coalesce(slides, '[]'::jsonb)) s
          where s ->> 'id' = p_slide_id
       )
     )
  returning true;
$$;

-- Explicit grants: callable by the display (anon) and host (authenticated);
-- nothing else inherits it implicitly.
revoke all on function public.advance_show(text, text, integer) from public;
grant execute on function public.advance_show(text, text, integer) to anon, authenticated;
