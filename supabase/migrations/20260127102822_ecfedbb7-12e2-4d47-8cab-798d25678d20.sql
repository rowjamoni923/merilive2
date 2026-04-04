-- Create trigger to sync agency_level_tiers commission to helper_level_config and trader_level_tiers
CREATE OR REPLACE FUNCTION sync_commission_rates()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync to helper_level_config based on display_order matching level_number
  UPDATE public.helper_level_config 
  SET commission_rate = NEW.commission_rate,
      updated_at = now()
  WHERE level_number = NEW.display_order;
  
  -- Also sync to trader_level_tiers
  UPDATE public.trader_level_tiers
  SET commission_rate = NEW.commission_rate
  WHERE level_number = NEW.display_order;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_sync_commission_rates ON agency_level_tiers;

-- Create trigger on agency_level_tiers UPDATE
CREATE TRIGGER trigger_sync_commission_rates
  AFTER UPDATE ON public.agency_level_tiers
  FOR EACH ROW
  WHEN (OLD.commission_rate IS DISTINCT FROM NEW.commission_rate)
  EXECUTE FUNCTION sync_commission_rates();

-- Now sync current agency_level_tiers values to helper_level_config and trader_level_tiers
UPDATE public.helper_level_config hlc
SET commission_rate = alt.commission_rate,
    updated_at = now()
FROM public.agency_level_tiers alt
WHERE hlc.level_number = alt.display_order;

UPDATE public.trader_level_tiers tlt
SET commission_rate = alt.commission_rate
FROM public.agency_level_tiers alt
WHERE tlt.level_number = alt.display_order;