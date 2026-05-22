-- Pkg80 audit: drop party_room_participants from supabase_realtime publication.
-- Pkg81b/c removed every client subscription; the publication entry is pure
-- footgun risk per $1400-rule item #4 (anything in publication is one
-- accidental .channel() away from catastrophic WAL fanout). LiveKit DataPacket
-- (publishPartyEvent participant_joined/left) is the sole realtime path.
-- DB rows are still written for late-join REST snapshot + audit history.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='party_room_participants'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.party_room_participants';
  END IF;
END $$;