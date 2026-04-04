-- Roulette Game Tables

-- 1. Roulette Sessions (each spin is a session)
CREATE TABLE public.roulette_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_number SERIAL,
  status TEXT NOT NULL DEFAULT 'betting' CHECK (status IN ('betting', 'spinning', 'completed')),
  winning_number INTEGER,
  betting_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 2. Roulette Bets
CREATE TABLE public.roulette_bets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.roulette_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bet_type TEXT NOT NULL, -- '0', '1-12', '13-24', '25-36', 'red', 'black', 'odd', 'even'
  bet_amount INTEGER NOT NULL,
  multiplier INTEGER NOT NULL, -- x36, x3, x2
  is_winner BOOLEAN,
  payout INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE public.roulette_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roulette_bets ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for Sessions (everyone can view)
CREATE POLICY "Anyone can view roulette sessions"
  ON public.roulette_sessions FOR SELECT
  USING (true);

-- 5. RLS Policies for Bets
CREATE POLICY "Users can view all bets in session"
  ON public.roulette_bets FOR SELECT
  USING (true);

CREATE POLICY "Users can place their own bets"
  ON public.roulette_bets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 6. Enable Realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.roulette_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.roulette_bets;

-- 7. Index for faster queries
CREATE INDEX idx_roulette_bets_session ON public.roulette_bets(session_id);
CREATE INDEX idx_roulette_bets_user ON public.roulette_bets(user_id);
CREATE INDEX idx_roulette_sessions_status ON public.roulette_sessions(status);