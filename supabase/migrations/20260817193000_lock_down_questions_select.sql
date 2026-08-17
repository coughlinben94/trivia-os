-- The "public read questions" policy (roles: public, qual: true) let anyone
-- with the anon key read every question's correct answer directly from the
-- questions table, regardless of what the UI shows. All 4 client callers
-- (Dashboard.jsx, Questions.jsx, DatabaseAddPanels.jsx, archiveQuestion.js)
-- sit behind Host.jsx's single top-level HostPinGate, which already elevates
-- the session's host_verified claim before any of these run — same claim
-- already gating this table's insert/update/delete. Restricting SELECT to
-- match closes the read side with no legitimate caller affected.

drop policy if exists "public read questions" on public.questions;

create policy "host read questions"
on public.questions
for select
to anon, authenticated
using (
  (((select auth.jwt()) -> 'app_metadata') ->> 'host_verified')::boolean = true
);
