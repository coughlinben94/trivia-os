-- Lets the host pick a single point in the song where playback starts,
-- instead of always 0:00. All three in-round tiers (and the reveal beat)
-- anchor to this same point — see BENDLE_TIERS in bendleScoring.js and
-- ShinyBendleQuestion.jsx's playback effects.
-- Default 0 is fully backward compatible: every song processed before this
-- column existed keeps playing from the start of the file, unchanged.
alter table public.bendle_songs
  add column start_offset_seconds integer not null default 0;
