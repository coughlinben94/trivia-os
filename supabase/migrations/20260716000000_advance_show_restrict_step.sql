-- RLS-D-2: advance_show (see 20260706001000_anon_advance_show_rpc.sql) validated
-- that a target slide belongs to the live show, but never constrained WHICH
-- slide — any anon caller (the anon key ships in every /join phone's JS
-- bundle) could call the RPC directly and warp the live TV to any slide in
-- the show at any moment: skip ahead to reveal a shiny answer before the
-- host gets there, or just grief the room by jumping around mid-round.
--
-- Fix: constrain the anon-reachable surface to the two shapes the real
-- caller (Display.jsx's jukebox-return effect) ever actually requests —
-- one step forward, or a direct jump to the show's own last slide (the
-- Final Break -> Winner Reveal close). Everything else now fails closed
-- (0 rows, same silent-denial shape the display's own banner already
-- handles). Backward jumps and arbitrary forward skips are no longer
-- possible via this RPC regardless of anon key exposure.
--
-- Not changed: bounds check, is_live check, slide_id-belongs-to-show check,
-- grants, updated_at non-bump. Only the WHICH-slide constraint is new.

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
     and (
       -- one step forward from wherever the show currently is
       p_slide_index = coalesce(current_slide_index, 0) + 1
       -- or a direct jump to the show's own final slide (Winner Reveal close)
       or p_slide_index = jsonb_array_length(coalesce(slides, '[]'::jsonb)) - 1
     )
  returning true;
$$;

-- Grants unchanged from the original migration — re-stated for clarity, not
-- a behavior change.
revoke all on function public.advance_show(text, text, integer) from public;
grant execute on function public.advance_show(text, text, integer) to anon, authenticated;
