-- phone_answers — captures a team's live tap-to-pair submission for a
-- "Use Your Phone" (matching, and later chain-reaction/map-maker) question.
-- Trust model deliberately mirrors `teams`, not the host-gated tables: this
-- is the phone's own data, ownership enforced by the team_id the phone holds
-- in localStorage (same as every other /join write in this app), not by a
-- host PIN JWT claim. See docs/superpowers/specs/2026-07-28-phone-answer-scoring-design.md.
--
-- One row per (slide_id, team_id) — a team's answer upserts on that pair
-- while the question is open, so changing your mind before Lock Answers
-- doesn't create duplicate rows. `score` stays null until the host locks
-- and the scoring pass runs; it's computed client-side in LiveMode.jsx,
-- same as every other score in this app (no server-side grading exists
-- anywhere in this codebase today).

create table public.phone_answers (
  id           uuid primary key default gen_random_uuid(),
  show_id      text not null,
  slide_id     text not null,
  team_id      text not null references public.teams(id) on delete cascade,
  answer       jsonb not null default '[]'::jsonb,
  score        numeric,
  submitted_at timestamptz not null default now(),
  unique (slide_id, team_id)
);

create index phone_answers_team_id_idx on public.phone_answers (team_id);
create index phone_answers_slide_id_idx on public.phone_answers (slide_id);

alter table public.phone_answers enable row level security;

create policy "public read phone_answers"
  on public.phone_answers for select
  to public
  using (true);

create policy "public insert phone_answers"
  on public.phone_answers for insert
  to public
  with check (true);

create policy "public update phone_answers"
  on public.phone_answers for update
  to public
  using (true)
  with check (true);
