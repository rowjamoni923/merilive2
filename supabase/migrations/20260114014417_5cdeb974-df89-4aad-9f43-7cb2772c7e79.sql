-- Create recharge_transactions table for tracking top-ups
CREATE TABLE public.recharge_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  amount INTEGER NOT NULL,
  coins_received INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'card',
  transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.recharge_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own transactions" 
ON public.recharge_transactions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create transactions" 
ON public.recharge_transactions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create party_rooms table
CREATE TABLE public.party_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id UUID NOT NULL REFERENCES public.profiles(id),
  name TEXT NOT NULL,
  description TEXT,
  room_type TEXT NOT NULL DEFAULT 'chat',
  game_mode TEXT,
  background_url TEXT,
  entry_fee INTEGER DEFAULT 0,
  min_level INTEGER DEFAULT 0,
  max_participants INTEGER DEFAULT 10,
  current_participants INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_private BOOLEAN DEFAULT false,
  room_code TEXT NOT NULL DEFAULT substr(md5(random()::text), 1, 6),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.party_rooms ENABLE ROW LEVEL SECURITY;

-- RLS Policies for party_rooms
CREATE POLICY "Anyone can view active party rooms" 
ON public.party_rooms 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Authenticated users can create party rooms" 
ON public.party_rooms 
FOR INSERT 
WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can update their rooms" 
ON public.party_rooms 
FOR UPDATE 
USING (auth.uid() = host_id);

CREATE POLICY "Hosts can delete their rooms" 
ON public.party_rooms 
FOR DELETE 
USING (auth.uid() = host_id);

-- Create party_room_participants table
CREATE TABLE public.party_room_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.party_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  role TEXT DEFAULT 'viewer',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  left_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(room_id, user_id)
);

-- Enable RLS
ALTER TABLE public.party_room_participants ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view room participants" 
ON public.party_room_participants 
FOR SELECT 
USING (true);

CREATE POLICY "Users can join rooms" 
ON public.party_room_participants 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave rooms" 
ON public.party_room_participants 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create game_sessions table
CREATE TABLE public.game_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.party_rooms(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL,
  status TEXT DEFAULT 'waiting',
  max_players INTEGER DEFAULT 4,
  current_players INTEGER DEFAULT 0,
  bet_amount INTEGER DEFAULT 0,
  winner_id UUID REFERENCES public.profiles(id),
  game_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view game sessions" 
ON public.game_sessions 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create game sessions" 
ON public.game_sessions 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.party_rooms WHERE id = room_id AND host_id = auth.uid()
));

CREATE POLICY "Hosts can update game sessions" 
ON public.game_sessions 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.party_rooms WHERE id = room_id AND host_id = auth.uid()
));

-- Create game_players table
CREATE TABLE public.game_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  position INTEGER,
  score INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(session_id, user_id)
);

-- Enable RLS
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view game players" 
ON public.game_players 
FOR SELECT 
USING (true);

CREATE POLICY "Users can join games" 
ON public.game_players 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their game status" 
ON public.game_players 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Add user_level column to profiles if not exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_level INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_consumption INTEGER DEFAULT 0;

-- Function to update room participant count
CREATE OR REPLACE FUNCTION public.update_room_participant_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.party_rooms SET current_participants = current_participants + 1 WHERE id = NEW.room_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.left_at IS NOT NULL AND OLD.left_at IS NULL THEN
    UPDATE public.party_rooms SET current_participants = GREATEST(current_participants - 1, 0) WHERE id = NEW.room_id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger
CREATE TRIGGER on_room_participant_change
AFTER INSERT OR UPDATE ON public.party_room_participants
FOR EACH ROW EXECUTE FUNCTION public.update_room_participant_count();

-- Function to calculate user level based on consumption
CREATE OR REPLACE FUNCTION public.calculate_user_level(_total_consumption INTEGER)
RETURNS INTEGER AS $$
BEGIN
  IF _total_consumption >= 30000000000 THEN RETURN 50;
  ELSIF _total_consumption >= 10000000000 THEN RETURN 40;
  ELSIF _total_consumption >= 3000000000 THEN RETURN 30;
  ELSIF _total_consumption >= 1000000000 THEN RETURN 20;
  ELSIF _total_consumption >= 300000000 THEN RETURN 10;
  ELSIF _total_consumption >= 100000000 THEN RETURN 9;
  ELSIF _total_consumption >= 30000000 THEN RETURN 8;
  ELSIF _total_consumption >= 10000000 THEN RETURN 7;
  ELSIF _total_consumption >= 3000000 THEN RETURN 6;
  ELSIF _total_consumption >= 1000000 THEN RETURN 5;
  ELSIF _total_consumption >= 300000 THEN RETURN 4;
  ELSIF _total_consumption >= 100000 THEN RETURN 3;
  ELSIF _total_consumption >= 30000 THEN RETURN 2;
  ELSIF _total_consumption >= 10000 THEN RETURN 1;
  ELSE RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;