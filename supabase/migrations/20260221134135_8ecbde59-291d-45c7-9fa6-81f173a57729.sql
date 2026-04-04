
-- Create host_levels table so the trigger doesn't fail
CREATE TABLE IF NOT EXISTS public.host_levels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level_number INTEGER NOT NULL UNIQUE,
  level_name TEXT,
  beans_required BIGINT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.host_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read host_levels" ON public.host_levels
FOR SELECT USING (true);

-- Insert default host levels matching the fallback in code
INSERT INTO public.host_levels (level_number, level_name, beans_required) VALUES
(0, 'Level 0', 0),
(1, 'Level 1', 5000),
(2, 'Level 2', 15000),
(3, 'Level 3', 50000),
(4, 'Level 4', 150000),
(5, 'Level 5', 500000),
(6, 'Level 6', 1500000),
(7, 'Level 7', 5000000),
(8, 'Level 8', 15000000),
(9, 'Level 9', 50000000),
(10, 'Level 10', 150000000)
ON CONFLICT (level_number) DO NOTHING;

-- Now cleanup stuck users - this should work since the trigger won't fail anymore
UPDATE private_calls 
SET status = 'ended', ended_at = now(), end_reason = 'cleanup'
WHERE status IN ('ringing', 'connected');

UPDATE profiles
SET is_in_call = false, current_call_id = NULL, updated_at = now()
WHERE is_in_call = true;
