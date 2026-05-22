-- Pkg91 (Pkg79 audit fix): remove chat tables from supabase_realtime publication.
-- Pkg79/81c deleted ALL client postgres_changes subscriptions for these tables.
-- Keeping them in the publication = wasted WAL emission + footgun for future regressions
-- ($1400-rule). LiveKit DataPacket is the sole instant fanout; DB row remains
-- source-of-truth for moderation/history (REST late-join only).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='stream_chat'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.stream_chat';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='party_room_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.party_room_messages';
  END IF;
END $$;