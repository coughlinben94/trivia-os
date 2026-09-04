-- supabase/migrations/20260904120000_bendle_songs_table.sql
-- Reusable pre-separated song content for the Bendle shiny format. Stem
-- separation itself runs offline (Demucs, local machine) — this table only
-- ever receives finished stem URLs through the admin upload panel. See
-- docs/superpowers/specs/2026-09-04-bendle-layered-audio-question-design.md.
create table public.bendle_songs (
  id           text primary key,   -- 'bnd_' + nanoid(8), generated client-side —
                                    -- same convention as shiny_formats.id ('fmt_'+nanoid8)
  title        text not null,
  answer       text not null,
  aliases      text[] not null default '{}',
  source_url   text,               -- the YouTube URL it came from; not called live, prep-trail only
  drums_url    text not null,
  bass_url     text not null,
  other_url    text not null,
  vocals_url   text not null,
  created_at   timestamptz not null default now()
);

alter table public.bendle_songs enable row level security;

create policy "public read bendle_songs"
  on public.bendle_songs for select
  to public
  using (true);

create policy "host write bendle_songs insert"
  on public.bendle_songs for insert
  to public
  with check ((auth.jwt() -> 'app_metadata' ->> 'host_verified')::boolean = true);

create policy "host write bendle_songs update"
  on public.bendle_songs for update
  to public
  using ((auth.jwt() -> 'app_metadata' ->> 'host_verified')::boolean = true)
  with check ((auth.jwt() -> 'app_metadata' ->> 'host_verified')::boolean = true);

create policy "host write bendle_songs delete"
  on public.bendle_songs for delete
  to public
  using ((auth.jwt() -> 'app_metadata' ->> 'host_verified')::boolean = true);
