-- Create PK Battles table
CREATE TABLE public.pk_battles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenger_id UUID NOT NULL REFERENCES public.profiles(id),
  opponent_id UUID NOT NULL REFERENCES public.profiles(id),
  challenger_stream_id UUID REFERENCES public.live_streams(id),
  opponent_stream_id UUID REFERENCES public.live_streams(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, active, completed, cancelled, declined
  challenger_score INTEGER NOT NULL DEFAULT 0,
  opponent_score INTEGER NOT NULL DEFAULT 0,
  winner_id UUID REFERENCES public.profiles(id),
  duration_seconds INTEGER DEFAULT 180, -- 3 minutes default
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pk_battles ENABLE ROW LEVEL SECURITY;

-- Everyone can view active PK battles
CREATE POLICY "Anyone can view PK battles"
  ON public.pk_battles
  FOR SELECT
  USING (true);

-- Authenticated users can create PK battles
CREATE POLICY "Authenticated users can create PK battles"
  ON public.pk_battles
  FOR INSERT
  WITH CHECK (auth.uid() = challenger_id);

-- Participants can update their PK battles
CREATE POLICY "Participants can update PK battles"
  ON public.pk_battles
  FOR UPDATE
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

-- Create index for faster queries
CREATE INDEX idx_pk_battles_status ON public.pk_battles(status);
CREATE INDEX idx_pk_battles_challenger ON public.pk_battles(challenger_id);
CREATE INDEX idx_pk_battles_opponent ON public.pk_battles(opponent_id);

-- Create PK battle gifts table to track gifts during battle
CREATE TABLE public.pk_battle_gifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  battle_id UUID NOT NULL REFERENCES public.pk_battles(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id),
  receiver_id UUID NOT NULL REFERENCES public.profiles(id),
  gift_id UUID NOT NULL REFERENCES public.gifts(id),
  coin_amount INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pk_battle_gifts ENABLE ROW LEVEL SECURITY;

-- Anyone can view PK battle gifts
CREATE POLICY "Anyone can view PK battle gifts"
  ON public.pk_battle_gifts
  FOR SELECT
  USING (true);

-- Authenticated users can send gifts
CREATE POLICY "Authenticated users can send PK gifts"
  ON public.pk_battle_gifts
  FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Enable realtime for PK battles
ALTER TABLE public.pk_battles REPLICA IDENTITY FULL;

-- Trigger for updated_at
CREATE TRIGGER update_pk_battles_updated_at
  BEFORE UPDATE ON public.pk_battles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();