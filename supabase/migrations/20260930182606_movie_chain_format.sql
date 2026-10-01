insert into public.shiny_formats (id, name, icon, description, input_schema)
values (
  'fmt_movieChain',
  'Movie Chain',
  '🎬',
  'Connect two movies through credited performers. Teams score 15 for the shortest chain or 10 for one movie longer.',
  '{"type": "movie-chain", "slots": 1}'::jsonb
)
on conflict (id) do nothing;
