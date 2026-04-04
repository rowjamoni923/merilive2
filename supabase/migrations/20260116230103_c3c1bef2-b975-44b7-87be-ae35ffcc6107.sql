-- Create game_providers table for storing third-party game provider configurations
CREATE TABLE public.game_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id TEXT NOT NULL UNIQUE,
  provider_name TEXT NOT NULL,
  provider_type TEXT NOT NULL DEFAULT 'sdk',
  description TEXT,
  website_url TEXT,
  documentation_url TEXT,
  logo_url TEXT,
  
  -- API Credentials
  api_url TEXT,
  api_key TEXT,
  api_secret TEXT,
  merchant_id TEXT,
  app_id TEXT,
  
  -- SDK Configuration
  sdk_config JSONB DEFAULT '{}',
  
  -- Status
  is_active BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  last_tested_at TIMESTAMP WITH TIME ZONE,
  test_result TEXT,
  
  -- Games from this provider
  available_games JSONB DEFAULT '[]',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.game_providers ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read (admin check done in app)
CREATE POLICY "Anyone can read game providers"
ON public.game_providers
FOR SELECT
TO authenticated
USING (true);

-- Allow all authenticated users to manage (admin check done in app)
CREATE POLICY "Authenticated users can manage game providers"
ON public.game_providers
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Create provider_games table
CREATE TABLE public.provider_games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.game_providers(id) ON DELETE CASCADE,
  game_code TEXT NOT NULL,
  game_name TEXT NOT NULL,
  game_category TEXT,
  thumbnail_url TEXT,
  iframe_url TEXT,
  
  min_bet INTEGER DEFAULT 10,
  max_bet INTEGER DEFAULT 10000,
  house_edge DECIMAL(5,2) DEFAULT 5.00,
  
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(provider_id, game_code)
);

ALTER TABLE public.provider_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read provider games"
ON public.provider_games
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can manage provider games"
ON public.provider_games
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Create game_provider_logs table
CREATE TABLE public.game_provider_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.game_providers(id) ON DELETE SET NULL,
  log_type TEXT NOT NULL,
  endpoint TEXT,
  request_data JSONB,
  response_data JSONB,
  status_code INTEGER,
  error_message TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.game_provider_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage provider logs"
ON public.game_provider_logs
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Add provider_id to game_settings
ALTER TABLE public.game_settings 
ADD COLUMN IF NOT EXISTS provider_id UUID,
ADD COLUMN IF NOT EXISTS provider_game_code TEXT;

-- Create indexes
CREATE INDEX idx_game_providers_active ON public.game_providers(is_active);
CREATE INDEX idx_provider_games_provider ON public.provider_games(provider_id);
CREATE INDEX idx_provider_games_active ON public.provider_games(is_active);
CREATE INDEX idx_game_provider_logs_provider ON public.game_provider_logs(provider_id);
CREATE INDEX idx_game_provider_logs_created ON public.game_provider_logs(created_at DESC);

-- Insert default providers
INSERT INTO public.game_providers (provider_id, provider_name, provider_type, description, website_url, documentation_url) VALUES
('zegocloud', 'ZEGOCLOUD Mini-Game SDK', 'sdk', 'Popular SDK used by Chamet, Poppo Live. Includes Ludo, 777, UMO, Knife Challenge games.', 'https://www.zegocloud.com/product/mini-game', 'https://docs.zegocloud.com/article/16313'),
('sudmgp', 'SudMGP (Sud Tech)', 'sdk', 'Game engine used by major live apps. Teen Patti, Ludo, Lucky Wheel, Racing games.', 'https://www.sud.tech/', 'https://docs.sud.tech/en-US/'),
('agora', 'Agora Extensions', 'sdk', 'Agora marketplace extensions for interactive mini-games.', 'https://www.agora.io/en/products/extensions-marketplace/', 'https://docs.agora.io/en/'),
('pragmatic', 'Pragmatic Play', 'api', 'Premium casino game provider with slots, live casino, and table games.', 'https://www.pragmaticplay.com/', 'https://www.pragmaticplay.com/developers/'),
('evolution', 'Evolution Gaming', 'api', 'Live dealer games including blackjack, roulette, baccarat.', 'https://www.evolution.com/', 'https://www.evolution.com/'),
('spribe', 'Spribe Games', 'api', 'Crash games including Aviator, Mines, Dice, Plinko.', 'https://spribe.co/', 'https://spribe.co/games'),
('softswiss', 'SOFTSWISS', 'api', 'White-label gaming platform with 15000+ games aggregation.', 'https://www.softswiss.com/', 'https://www.softswiss.com/game-aggregator/'),
('veligames', 'VeliGames', 'api', 'Social casino and casual games API for live streaming apps.', 'https://www.veligames.com/', 'https://www.veligames.com/'),
('custom', 'Custom Provider', 'iframe', 'Add your own game provider with custom API integration.', NULL, NULL)
ON CONFLICT (provider_id) DO NOTHING;

-- Update trigger
CREATE OR REPLACE FUNCTION update_game_provider_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_game_providers_updated_at
BEFORE UPDATE ON public.game_providers
FOR EACH ROW EXECUTE FUNCTION update_game_provider_timestamp();

CREATE TRIGGER update_provider_games_updated_at
BEFORE UPDATE ON public.provider_games
FOR EACH ROW EXECUTE FUNCTION update_game_provider_timestamp();