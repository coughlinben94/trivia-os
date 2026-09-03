-- ring_palettes — the certification shelf. Every row is a candidate from the
-- seeded generator (source='generated', Task 4), one of the picker's 6 fixed
-- presets or its hardcoded default (source='preset', shelved once by every
-- --seed-batch run so Apply always has something to match — see Task 6), or
-- a host's own custom colour pick saved for later checking (source='manual').
-- Nothing
-- reads worldPalette off a show's theme_overrides unless it first matched
-- a 'certified' row here — see WorldPaletteEditor.jsx's Apply flow. status
-- starts 'pending' and is flipped by concepts/tools/palette-sweep.mjs
-- (the same Playwright gate ring-verify.mjs runs, never a fork) running
-- OFFLINE, never live at Apply time — see
-- docs/superpowers/plans/2026-09-03-ring-palette-drift-and-shelf.md for
-- why (Ben's 2026-09-03 call: bulletproof over instant).
--
-- ring_version exists so a shelf entry expires the moment the base ring
-- world or the gate itself changes — a 'certified' row from before a ring
-- edit is not evidence about the ring after it. Bump RING_VERSION in
-- client/src/lib/ringCertification.js in the same commit as any change to
-- midnightGalaxy.ring.js, concepts/world-07-ring.html's WORLD literal, or
-- ring-spec.lock.json.

create table public.ring_palettes (
  id             uuid primary key default gen_random_uuid(),
  colors         jsonb not null,
  weights        jsonb not null,
  drift          jsonb not null default '{"arc": 0}'::jsonb,
  status         text not null default 'pending' check (status in ('pending', 'certified', 'failed')),
  source         text not null check (source in ('generated', 'manual', 'preset')),
  seed           text,
  ring_version   text not null,
  gate_summary   jsonb,
  pending_show_id text,
  created_at     timestamptz not null default now(),
  checked_at     timestamptz
);

create index ring_palettes_status_version_idx on public.ring_palettes (status, ring_version);

-- A re-run of --seed-batch N over the same seeds (e.g. batch 5 then batch 20)
-- must not double-insert. seed is null for manual/pending rows (Postgres
-- treats each null as distinct, so many pending rows coexist fine); it is
-- always set for 'generated' and 'preset' rows, where this must hold.
create unique index ring_palettes_source_seed_version_idx
  on public.ring_palettes (source, seed, ring_version)
  where seed is not null;

alter table public.ring_palettes enable row level security;

-- Same trust model as `questions` (migration 20260817193000): everything
-- behind Host.jsx's PIN gate, host_verified is the real boundary. The
-- sweep tool (Task 6) authenticates the same way scripts/backup-db.mjs
-- does — SUPABASE_SERVICE_ROLE_KEY (bypasses RLS entirely, no policy
-- needed for it) or the host PIN. No UPDATE policy is defined here on
-- purpose: only a service-role-authenticated run (or a host-PIN-elevated
-- one, which the "host update" policy below also covers) may flip
-- pending -> certified/failed — a browser session with a bare anon key
-- can insert (save a pending custom pick) but never certify its own pick.

create policy "host read ring_palettes"
on public.ring_palettes
for select
to anon, authenticated
using (
  (((select auth.jwt()) -> 'app_metadata') ->> 'host_verified')::boolean = true
);

create policy "host insert ring_palettes"
on public.ring_palettes
for insert
to anon, authenticated
with check (
  (((select auth.jwt()) -> 'app_metadata') ->> 'host_verified')::boolean = true
  and status = 'pending' -- a host session may only ever create a PENDING row
);

-- ACCEPTED GAP (Step 2b, 2026-09-03 plan review): this policy lets any
-- host_verified session flip status, not just the sweep tool's PIN-elevated
-- run — a host could in theory self-certify their own pending row from the
-- browser console. Closing this properly needs a second app_metadata claim
-- (e.g. sweep_verified) set only by the sweep tool's elevation path, but the
-- verify-host-pin Edge Function does not currently support setting a second
-- claim. Accepted as consistent with this codebase's existing risk model —
-- a host with PIN access can already edit any question's answer key, per
-- the `questions` table's own trust boundary. gate_summary (visible via the
-- SELECT policy above) lets a reviewer tell a real sweep run apart from a
-- manual flip after the fact. Not an oversight — see task-5-brief.md Step 2b.
create policy "host update ring_palettes status"
on public.ring_palettes
for update
to anon, authenticated
using (
  (((select auth.jwt()) -> 'app_metadata') ->> 'host_verified')::boolean = true
)
with check (
  (((select auth.jwt()) -> 'app_metadata') ->> 'host_verified')::boolean = true
);
