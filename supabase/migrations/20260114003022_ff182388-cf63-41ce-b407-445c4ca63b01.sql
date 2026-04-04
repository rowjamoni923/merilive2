-- Enable realtime for all relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE agencies;
ALTER PUBLICATION supabase_realtime ADD TABLE agency_hosts;
ALTER PUBLICATION supabase_realtime ADD TABLE agency_performance;
ALTER PUBLICATION supabase_realtime ADD TABLE agency_rankings;
ALTER PUBLICATION supabase_realtime ADD TABLE gift_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE live_streams;
ALTER PUBLICATION supabase_realtime ADD TABLE stream_viewers;

-- Set REPLICA IDENTITY FULL for complete row data on updates
ALTER TABLE profiles REPLICA IDENTITY FULL;
ALTER TABLE agencies REPLICA IDENTITY FULL;
ALTER TABLE agency_hosts REPLICA IDENTITY FULL;
ALTER TABLE agency_performance REPLICA IDENTITY FULL;
ALTER TABLE agency_rankings REPLICA IDENTITY FULL;
ALTER TABLE gift_transactions REPLICA IDENTITY FULL;
ALTER TABLE live_streams REPLICA IDENTITY FULL;
ALTER TABLE stream_viewers REPLICA IDENTITY FULL;

-- Create a function to update agency performance in real-time
CREATE OR REPLACE FUNCTION public.update_agency_performance_on_gift()
RETURNS TRIGGER AS $$
DECLARE
  _host_agency_id UUID;
  _period_start DATE;
BEGIN
  -- Get the host's agency
  SELECT agency_id INTO _host_agency_id
  FROM public.profiles
  WHERE id = NEW.receiver_id;
  
  IF _host_agency_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get current week start
  _period_start := date_trunc('week', CURRENT_DATE)::date;
  
  -- Update or insert weekly performance
  INSERT INTO public.agency_performance (agency_id, period_type, period_start, total_income, golden_host_income)
  VALUES (_host_agency_id, 'weekly', _period_start, NEW.coin_amount, NEW.coin_amount)
  ON CONFLICT (agency_id, period_type, period_start)
  DO UPDATE SET 
    total_income = agency_performance.total_income + NEW.coin_amount,
    golden_host_income = agency_performance.golden_host_income + NEW.coin_amount,
    updated_at = now();
  
  -- Update host's total earnings
  UPDATE public.profiles
  SET total_earnings = COALESCE(total_earnings, 0) + NEW.coin_amount
  WHERE id = NEW.receiver_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for gift transactions
DROP TRIGGER IF EXISTS on_gift_transaction ON public.gift_transactions;
CREATE TRIGGER on_gift_transaction
  AFTER INSERT ON public.gift_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_agency_performance_on_gift();

-- Create a function to update live stream stats
CREATE OR REPLACE FUNCTION public.update_stream_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment viewer count
    UPDATE public.live_streams
    SET viewer_count = COALESCE(viewer_count, 0) + 1
    WHERE id = NEW.stream_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.left_at IS NOT NULL AND OLD.left_at IS NULL THEN
    -- Decrement viewer count when viewer leaves
    UPDATE public.live_streams
    SET viewer_count = GREATEST(COALESCE(viewer_count, 0) - 1, 0)
    WHERE id = NEW.stream_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for stream viewers
DROP TRIGGER IF EXISTS on_stream_viewer_change ON public.stream_viewers;
CREATE TRIGGER on_stream_viewer_change
  AFTER INSERT OR UPDATE ON public.stream_viewers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_stream_stats();

-- Create function to track host streaming hours
CREATE OR REPLACE FUNCTION public.update_host_hours_on_stream_end()
RETURNS TRIGGER AS $$
DECLARE
  _host_agency_id UUID;
  _period_start DATE;
  _duration_hours DECIMAL;
BEGIN
  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    -- Calculate stream duration in hours
    _duration_hours := EXTRACT(EPOCH FROM (NEW.ended_at - COALESCE(NEW.started_at, NEW.created_at))) / 3600;
    
    -- Get the host's agency
    SELECT agency_id INTO _host_agency_id
    FROM public.profiles
    WHERE id = NEW.host_id;
    
    IF _host_agency_id IS NOT NULL THEN
      _period_start := date_trunc('week', CURRENT_DATE)::date;
      
      -- Update agency performance with host hours
      INSERT INTO public.agency_performance (agency_id, period_type, period_start, total_host_hours)
      VALUES (_host_agency_id, 'weekly', _period_start, _duration_hours)
      ON CONFLICT (agency_id, period_type, period_start)
      DO UPDATE SET 
        total_host_hours = COALESCE(agency_performance.total_host_hours, 0) + _duration_hours,
        updated_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for stream end
DROP TRIGGER IF EXISTS on_stream_end ON public.live_streams;
CREATE TRIGGER on_stream_end
  AFTER UPDATE ON public.live_streams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_host_hours_on_stream_end();

-- Add unique constraint for agency_performance if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'agency_performance_unique_period'
  ) THEN
    ALTER TABLE public.agency_performance 
    ADD CONSTRAINT agency_performance_unique_period 
    UNIQUE (agency_id, period_type, period_start);
  END IF;
END $$;