DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='party_rooms') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.party_rooms';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='party_room_participants') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.party_room_participants';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='stream_viewers') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_viewers';
  END IF;
END$$;

ALTER TABLE public.party_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.party_room_participants REPLICA IDENTITY FULL;
ALTER TABLE public.stream_viewers REPLICA IDENTITY FULL;
ALTER TABLE public.live_streams REPLICA IDENTITY FULL;
ALTER TABLE public.private_calls REPLICA IDENTITY FULL;