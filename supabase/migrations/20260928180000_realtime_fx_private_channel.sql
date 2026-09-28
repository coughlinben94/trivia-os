-- Locks down the broadcast channel the TV/phone effects ("fx") will use.
--
-- STATUS: NOT APPLIED. Written 2026-09-28, waiting for Ben's sign-off before
-- it touches prod (it changes authorization on realtime.messages).
--
-- Why: today realtime.messages has no RLS policies at all. Any phone holding
-- the public anon key can send a broadcast on any channel. Nothing listens
-- for effects yet, so it is harmless today; once a TV effects layer exists,
-- a guest could fire it. This gives one private topic family, fx:<showId>:
--   * SEND    only a PIN-verified host (host_verified JWT claim, the same
--             predicate every write policy in this project uses).
--   * RECEIVE any client, signed in or not. The TV only signs in anonymously
--             when someone steps the show from it, and a phone that is only
--             watching may not have a session, so `anon` must be allowed too.
--             Effects carry nothing private; only SEND needs protecting.
--
-- What this does NOT do on its own:
--   * RLS on realtime.messages only guards PRIVATE channels. The client must
--     open the channel with { config: { private: true } } and call
--     supabase.realtime.setAuth() before subscribing.
--   * Existing public channels keep working exactly as before. To stop
--     phones sending on public channels, the Realtime setting "Allow public
--     access" must be switched off in the dashboard. That also affects every
--     existing public presence/broadcast channel (Display, Join), so it is a
--     separate decision, not part of this migration.
--   * Verify with two real sessions (a host, a plain phone) that the phone's
--     send on an fx: topic is rejected before building on it.

create policy "fx: host can send"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'fx:%'
    and ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'host_verified'::text)::boolean = true)
  );

create policy "fx: any client can receive"
  on realtime.messages
  for select
  to anon, authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'fx:%'
  );
