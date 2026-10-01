-- Team emoji: an optional personality mark picked on /join, shown beside the
-- team name on the TV. Nullable, so every existing team and show is untouched.
alter table public.teams add column if not exists emoji text;
alter table public.teams add constraint teams_emoji_len check (emoji is null or char_length(emoji) <= 16);
