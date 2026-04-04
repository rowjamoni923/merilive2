-- Step 1: Drop ALL triggers that depend on coins column
DROP TRIGGER IF EXISTS trigger_update_level_on_profile_change ON public.profiles;
DROP TRIGGER IF EXISTS trigger_auto_update_level_profiles ON public.profiles;
DROP TRIGGER IF EXISTS trigger_update_level_on_profile ON public.profiles;
DROP TRIGGER IF EXISTS update_level_on_profile_change ON public.profiles;

-- Step 2: Fix profiles.coins column to BIGINT
ALTER TABLE public.profiles 
ALTER COLUMN coins TYPE bigint;

-- Step 3: Recreate all the triggers
CREATE TRIGGER trigger_update_level_on_profile_change 
AFTER UPDATE OF coins, total_consumption, total_earnings 
ON public.profiles 
FOR EACH ROW 
EXECUTE FUNCTION update_user_level_comprehensive();

CREATE TRIGGER trigger_auto_update_level_profiles 
AFTER INSERT OR UPDATE OF coins, total_consumption, total_earnings, is_host 
ON public.profiles 
FOR EACH ROW 
EXECUTE FUNCTION auto_update_level();

CREATE TRIGGER trigger_update_level_on_profile 
AFTER INSERT OR UPDATE OF coins, total_earnings 
ON public.profiles 
FOR EACH ROW 
EXECUTE FUNCTION update_user_level_on_change();

CREATE TRIGGER update_level_on_profile_change 
BEFORE UPDATE OF total_earnings, total_consumption, pending_earnings 
ON public.profiles 
FOR EACH ROW 
EXECUTE FUNCTION update_user_level_on_earnings();