
-- ============================================
-- FIX: "operator does not exist: date = text" on game_stats.stat_date
-- Convert date column to text to match PostgREST text comparisons
-- ============================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'game_stats' 
    AND column_name = 'stat_date' AND data_type = 'date'
  ) THEN
    ALTER TABLE public.game_stats ALTER COLUMN stat_date TYPE text USING stat_date::text;
  END IF;
END $$;

-- ============================================
-- FIX: add_beans_to_host uses profiles.beans_balance 
-- Ensure it uses the correct column name (beans_balance was added)
-- Also fix to use 'beans' as fallback
-- ============================================
CREATE OR REPLACE FUNCTION public.add_beans_to_host(
  p_host_id UUID,
  p_beans_amount INTEGER,
  p_total_earnings INTEGER DEFAULT 0,
  p_host_level INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add beans to hosts';
  END IF;
  UPDATE profiles
  SET beans = COALESCE(beans, 0) + p_beans_amount,
      beans_balance = COALESCE(beans_balance, 0) + p_beans_amount,
      total_earnings = COALESCE(total_earnings, 0) + p_total_earnings,
      host_level = GREATEST(COALESCE(host_level, 1), p_host_level),
      updated_at = now()
  WHERE id = p_host_id;
END;
$$;
