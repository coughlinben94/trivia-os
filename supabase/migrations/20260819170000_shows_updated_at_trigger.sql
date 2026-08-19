-- Keeps shows.updated_at fresh on every write, from every code path.
--
-- Added 2026-08-19: Display.jsx's realtime handler started using updated_at
-- as a staleness guard (drop a payload that isn't newer than the last one
-- applied — see the 2026-08-18 show, Ben: slides "jumped back and forth").
-- Stamping it client-side in useShow.js's updateShowRow alone missed two
-- other direct `supabase.from('shows').update(...)` call sites
-- (PylRevealSlide.jsx, ScoreboardModal.jsx), which left the column frozen on
-- writes from those paths and caused Display to silently drop its own
-- updates (PYL auto-advance froze on the reveal slide). A DB trigger covers
-- every write path, including any added later, instead of every call site
-- needing to remember to stamp it.
--
-- Applied directly to the remote project on 2026-08-19 via the Supabase MCP
-- (verified in a rolled-back test transaction before this file was written);
-- this file exists so supabase/migrations stays the source of truth and a
-- fresh environment can reproduce it.

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists shows_set_updated_at on public.shows;
create trigger shows_set_updated_at
before update on public.shows
for each row execute function public.set_updated_at();
