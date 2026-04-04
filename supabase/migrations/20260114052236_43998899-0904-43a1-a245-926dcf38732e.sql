-- Create seat requests table for Party Rooms
CREATE TABLE IF NOT EXISTS public.seat_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.party_rooms(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seat_position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(room_id, requester_id, status)
);

-- Enable RLS
ALTER TABLE public.seat_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies for seat requests
CREATE POLICY "Anyone can view seat requests in their room"
ON public.seat_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.party_room_participants 
    WHERE room_id = seat_requests.room_id 
    AND user_id = auth.uid()
    AND left_at IS NULL
  )
);

CREATE POLICY "Users can create their own seat requests"
ON public.seat_requests
FOR INSERT
WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Users can update their own requests"
ON public.seat_requests
FOR UPDATE
USING (auth.uid() = requester_id OR EXISTS (
  SELECT 1 FROM public.party_rooms 
  WHERE id = seat_requests.room_id 
  AND host_id = auth.uid()
));

CREATE POLICY "Users can delete their own requests"
ON public.seat_requests
FOR DELETE
USING (auth.uid() = requester_id);

-- Add position column to party_room_participants if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'party_room_participants' 
    AND column_name = 'position'
  ) THEN
    ALTER TABLE public.party_room_participants ADD COLUMN position INTEGER;
  END IF;
END $$;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_seat_requests_room_id ON public.seat_requests(room_id);
CREATE INDEX IF NOT EXISTS idx_seat_requests_status ON public.seat_requests(status);

-- Enable realtime for seat_requests
ALTER PUBLICATION supabase_realtime ADD TABLE seat_requests;