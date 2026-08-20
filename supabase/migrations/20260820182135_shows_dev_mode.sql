-- Dev Mode toggle (Host UI): when true, /display accepts a direct click or
-- keypress to step forward one slide, for previewing transitions without a
-- second Host window open. Forward-only — reuses the existing anon-callable
-- advance_show RPC (RLS-D-1), which already blocks backward/arbitrary jumps
-- regardless of this flag. Off by default so a fresh show is always in live
-- (Host-only-nav) mode.
ALTER TABLE public.shows ADD COLUMN dev_mode boolean NOT NULL DEFAULT false;
