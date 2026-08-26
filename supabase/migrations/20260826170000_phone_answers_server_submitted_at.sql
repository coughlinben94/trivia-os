-- phone_answers.submitted_at was client-stamped from the phone's own clock
-- (2026-08-19, WagerBoard/MatchingBoard/OrderBoard) to work around Postgres
-- upsert only refreshing columns it's given — without an explicit stamp on
-- every save, the column's default-on-insert value froze at the FIRST write
-- and never moved on a later resave, silently defeating the host's
-- lock-cutoff check (LiveMode.jsx's scoring handlers discard any phone_answers
-- row whose submitted_at lands after the lock write).
--
-- That trade handed timing authority to the phone's own clock: a phone with
-- clock drift (stale device time, wrong timezone, no NTP sync — real on
-- actual hardware, no malice required) breaks the cutoff guarantee either
-- direction. A phone reading BEHIND server time can submit a truly-late
-- answer that still reads as on-time and gets scored when it shouldn't. A
-- phone reading AHEAD can have a legitimately on-time answer wrongly
-- discarded. Found by a same-day phone-suite audit (2026-08-26), confirmed
-- as a real scoring-integrity gap.
--
-- Fix: move ownership of this column server-side with a trigger that fires
-- on every INSERT or UPDATE, so it's authoritative regardless of what (or
-- whether) the client sends — keeps the same "always moves on resave"
-- behavior the 2026-08-19 fix needed, without trusting client-supplied time.
create or replace function public.set_phone_answers_submitted_at()
returns trigger
language plpgsql
as $$
begin
  new.submitted_at := now();
  return new;
end;
$$;

create trigger phone_answers_set_submitted_at
  before insert or update on public.phone_answers
  for each row
  execute function public.set_phone_answers_submitted_at();
