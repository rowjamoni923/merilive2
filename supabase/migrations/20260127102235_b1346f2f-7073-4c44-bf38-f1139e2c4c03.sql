-- Update helper_level_config to match agency_level_tiers commission rates
-- Level 1 (Bronze/A1 Starter): 2%
-- Level 2 (Silver/A2 Rising): 3%
-- Level 3 (Gold/A3 Pro): 4%
-- Level 4 (Platinum/A4 Elite): 10%
-- Level 5 (Diamond/A5 Legend): 20%

UPDATE public.helper_level_config SET commission_rate = 2 WHERE level_number = 1;
UPDATE public.helper_level_config SET commission_rate = 3 WHERE level_number = 2;
UPDATE public.helper_level_config SET commission_rate = 4 WHERE level_number = 3;
UPDATE public.helper_level_config SET commission_rate = 10 WHERE level_number = 4;
UPDATE public.helper_level_config SET commission_rate = 20 WHERE level_number = 5;

-- Also update trader_level_tiers to match
UPDATE public.trader_level_tiers SET commission_rate = 2 WHERE level_number = 1;
UPDATE public.trader_level_tiers SET commission_rate = 3 WHERE level_number = 2;
UPDATE public.trader_level_tiers SET commission_rate = 4 WHERE level_number = 3;
UPDATE public.trader_level_tiers SET commission_rate = 10 WHERE level_number = 4;
UPDATE public.trader_level_tiers SET commission_rate = 20 WHERE level_number = 5;