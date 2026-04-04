-- Add party_room_participants to supabase_realtime publication for real-time seat/join updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.party_room_participants;