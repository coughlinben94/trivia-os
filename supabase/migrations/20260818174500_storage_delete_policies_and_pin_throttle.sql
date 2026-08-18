-- 2026-08-18 — applied live via MCP; recorded here so the repo doesn't drift.
-- Two unrelated backend fixes from BREAK-IT-REPORT-2026-08-18.md's P2/P3 list.

-- 1) Storage buckets had INSERT + SELECT policies but zero DELETE, so uploads
--    could only ever accumulate — not even the host could clean anything up.
--    Same host_verified predicate every other host-only write uses.
create policy "host delete trivia-show-media"
  on storage.objects for delete to anon, authenticated
  using (
    bucket_id = 'trivia-show-media'::text
    and ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'host_verified'::text))::boolean = true
  );

create policy "host delete trivia-host-photos"
  on storage.objects for delete to anon, authenticated
  using (
    bucket_id = 'trivia-host-photos'::text
    and ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'host_verified'::text))::boolean = true
  );

create policy "host delete trivia-fonts"
  on storage.objects for delete to anon, authenticated
  using (
    bucket_id = 'trivia-fonts'::text
    and ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'host_verified'::text))::boolean = true
  );

-- 2) Brute-force throttle for the verify-host-pin edge function. A 4-digit PIN
--    is 10,000 guesses; with no limit the whole space fell in ~35 minutes.
--    Keyed by caller IP (user id only as a no-IP fallback). RLS on with NO
--    policies on purpose — same shape as app_secrets and team_reauth_tokens:
--    the edge function's service-role client bypasses RLS, nothing else reads it.
create table if not exists public.host_pin_attempts (
  key text primary key,
  fails integer not null default 0,
  last_fail timestamptz not null default now()
);
alter table public.host_pin_attempts enable row level security;
