-- Movie Chain: reject phone_answers writes once the host has locked the slide.
-- phone_answers_set_submitted_at restamps submitted_at on every write, so a
-- phone that was a beat behind the lock could re-save after the cutoff and
-- turn its earlier valid chain into a "late" (zero-point) one. The client
-- can't know the lock in time; the database does. Scoped to slides whose
-- data.movieChainLocked is true, so every other phone board is untouched.
-- Host Unlock clears movieChainLocked, which re-opens writes.
create or replace function public.block_locked_movie_chain_answers()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.shows s, jsonb_array_elements(s.slides) slide
    where s.id = new.show_id
      and slide->>'id' = new.slide_id
      and slide->'data'->>'movieChainLocked' = 'true'
  ) then
    raise exception 'movie_chain_locked' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger phone_answers_block_locked_movie_chain
  before insert or update on public.phone_answers
  for each row
  execute function public.block_locked_movie_chain_answers();
