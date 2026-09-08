-- Lets the host also pick where a Bendle song's reveal-beat playback stops,
-- not just where it starts. Nullable, no default: null means "play to the
-- natural end of the stem," same as every song's behavior before this
-- column existed — fully backward compatible.
alter table public.bendle_songs
  add column end_offset_seconds integer;
