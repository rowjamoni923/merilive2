-- Pkg381: Add chat tables to supabase_realtime publication so chat fanout
-- has a reliable safety-net alongside the LiveKit DataPacket fast-path.
-- Party/live in-room chat was LiveKit-only since Pkg81c — when DataPacket
-- fanout drops (subscribe-only token race, mobile background, etc.) no one
-- sees the message. Realtime safety-net guarantees delivery.
DO $$
BEGIN
  -- party_room_messages
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='party_room_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.party_room_messages';
  END IF;

  -- stream_chat
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='stream_chat'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_chat';
  END IF;
END
$$;

-- REPLICA IDENTITY FULL so realtime carries full row payloads (avatar fetch
-- still goes to profiles_public but room_id/user_id/content are guaranteed).
ALTER TABLE public.party_room_messages REPLICA IDENTITY FULL;
ALTER TABLE public.stream_chat REPLICA IDENTITY FULL;