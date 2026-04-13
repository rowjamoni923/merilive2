
-- ☠️ DROP the OLD dangerous end_private_call(uuid) → jsonb
-- This version recalculates cost and does DOUBLE deduction of diamonds + beans
-- The CORRECT version is end_private_call(uuid, text) → boolean (session cleanup only)
DROP FUNCTION IF EXISTS public.end_private_call(uuid);

-- Also ensure get_effective_host_percent exists and reads from gift_commission setting
CREATE OR REPLACE FUNCTION public.get_effective_host_percent()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT ((setting_value::jsonb)->>'host_percent')::numeric
      FROM app_settings
      WHERE setting_key = 'gift_commission'
    ),
    50
  );
$$;
