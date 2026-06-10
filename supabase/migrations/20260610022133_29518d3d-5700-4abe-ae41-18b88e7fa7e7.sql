CREATE UNIQUE INDEX IF NOT EXISTS party_room_participants_seat_uniq
  ON public.party_room_participants (room_id, seat_number)
  WHERE seat_number IS NOT NULL AND left_at IS NULL;