-- Create a function to automatically update user_level when total_earnings or total_consumption changes
CREATE OR REPLACE FUNCTION public.update_user_level_on_earnings()
RETURNS TRIGGER AS $$
DECLARE
  _new_level INT;
  _level_type TEXT;
  _points NUMERIC;
BEGIN
  -- Determine level type based on gender and host status
  IF NEW.is_host = true AND NEW.gender = 'female' THEN
    _level_type := 'host';
    _points := COALESCE(NEW.total_earnings, 0);
  ELSE
    _level_type := 'user';
    _points := COALESCE(NEW.total_consumption, 0);
  END IF;
  
  -- Calculate new level based on points
  -- Host levels: 0-999=0, 1000-4999=1, 5000-19999=2, 20000-49999=3, 50000-99999=4, 100000-499999=5, 500000+=6
  -- User levels same thresholds
  IF _points >= 500000 THEN
    _new_level := 6;
  ELSIF _points >= 100000 THEN
    _new_level := 5;
  ELSIF _points >= 50000 THEN
    _new_level := 4;
  ELSIF _points >= 20000 THEN
    _new_level := 3;
  ELSIF _points >= 5000 THEN
    _new_level := 2;
  ELSIF _points >= 1000 THEN
    _new_level := 1;
  ELSE
    _new_level := 0;
  END IF;
  
  -- Update level if changed
  IF COALESCE(NEW.user_level, 0) != _new_level THEN
    NEW.user_level := _new_level;
    -- Also update host_level for hosts
    IF NEW.is_host = true THEN
      NEW.host_level := _new_level;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic level updates
DROP TRIGGER IF EXISTS update_level_on_profile_change ON public.profiles;

CREATE TRIGGER update_level_on_profile_change
  BEFORE UPDATE OF total_earnings, total_consumption, pending_earnings
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_level_on_earnings();