
-- 1. Reset sumaiya's fake beans to legitimate amount only
UPDATE profiles SET beans = 50 WHERE id = 'e4b8eff0-314b-44f0-a063-1400addff921';

-- 2. Block hacker's IPs permanently  
INSERT INTO blocked_ips (ip_address, reason, is_permanent) VALUES 
('88.240.180.91'::inet, 'PERMANENT: Hacker account 7954203906 - exploited RPC to inject 20M+ coins', true),
('46.221.44.172'::inet, 'PERMANENT: Hacker account 7954203906 - registration IP', true)
ON CONFLICT DO NOTHING;

-- 3. Update hacker with permanent ban + ensure all balances zero
UPDATE profiles SET 
  blocked_reason = 'PERMANENT BAN: Exploited add_coins_to_user RPC to inject ~20M coins. Device (device_dc471afb0a3e47e1) & IPs permanently banned.',
  coins = 0, beans = 0, diamonds = 0,
  is_blocked = true
WHERE id = 'b6f665cd-7811-4989-851a-c4d821ac736f';

-- 4. Create device ban table for permanent device blocking
CREATE TABLE IF NOT EXISTS public.banned_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE,
  user_id uuid REFERENCES public.profiles(id),
  reason text,
  banned_at timestamptz DEFAULT now(),
  banned_by text DEFAULT 'system',
  is_permanent boolean DEFAULT true
);

ALTER TABLE public.banned_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage banned devices" ON public.banned_devices
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true)
);

-- 5. Insert the hacker's device into banned devices
INSERT INTO public.banned_devices (device_id, user_id, reason, is_permanent)
VALUES ('device_dc471afb0a3e47e1', 'b6f665cd-7811-4989-851a-c4d821ac736f', 'PERMANENT: Exploited RPC to inject 20M+ coins', true)
ON CONFLICT (device_id) DO NOTHING;
