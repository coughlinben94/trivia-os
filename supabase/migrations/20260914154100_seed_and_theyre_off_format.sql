insert into shiny_formats (id, name, icon, description, input_schema)
values (
  'fmt_rc4H8kLp',
  'And They''re Off!',
  '🏇',
  'Teams pick a winner among 4 real contenders; the host reveals it with an animated one-lap horse race driven by real historical data.',
  '{"type": "race"}'::jsonb
)
on conflict (id) do nothing;
