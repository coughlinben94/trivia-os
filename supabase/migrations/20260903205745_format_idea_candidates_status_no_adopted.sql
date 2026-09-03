-- Council audit finding: the status check constraint on format_idea_candidates
-- still allowed 'adopted' even though commit 8253105 removed 'adopted' from
-- the generator-common.md prose spec. Prose alone doesn't stop a future
-- agent from writing an adopted row back — drop and recreate the constraint
-- to only allow the two real states.
--
-- Verified zero existing rows had status='adopted' before this ran.

alter table public.format_idea_candidates drop constraint format_idea_candidates_status_check;
alter table public.format_idea_candidates add constraint format_idea_candidates_status_check
  check (status = any (array['proposed'::text, 'rejected'::text]));
