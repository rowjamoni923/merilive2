-- Add new fields for percentage, scheduling, and milestone campaigns
ALTER TABLE public.recharge_campaigns 
  ADD COLUMN IF NOT EXISTS bonus_percentage INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS schedule_start TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS schedule_end TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS milestone_amount BIGINT DEFAULT NULL;

-- Update the campaign type check to include milestone
ALTER TABLE public.recharge_campaigns DROP CONSTRAINT IF EXISTS valid_campaign_type;
ALTER TABLE public.recharge_campaigns ADD CONSTRAINT valid_campaign_type 
  CHECK (campaign_type IN ('bonus', 'discount', 'first_recharge', 'custom', 'milestone'));