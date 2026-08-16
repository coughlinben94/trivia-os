// The ported jukebox code imports '../lib/supabase' exactly as it did in its
// own repo. jukebox_state lives in the SAME Supabase project trivia-os uses
// (qwtbgusqfoypvehnungr, RLS: anon read/write on the singleton row), so this
// is a re-export of trivia-os's own client — one client, one realtime socket,
// zero data migration.
export { supabase } from '../../lib/supabase.js'
