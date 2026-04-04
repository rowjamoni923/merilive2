
-- Fix: Change admin_logs.target_id from UUID to TEXT to prevent type mismatch errors
-- Many callers pass text values (ticket IDs, non-UUID identifiers) which fail the UUID cast
ALTER TABLE public.admin_logs ALTER COLUMN target_id TYPE text USING target_id::text;

-- Drop all overloaded versions of log_admin_action and recreate a single clean one
-- that accepts TEXT for target_id (matching the new column type)
DROP FUNCTION IF EXISTS public.log_admin_action(text, text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.log_admin_action(uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.log_admin_action(text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action_type text,
  _target_type text DEFAULT NULL,
  _target_id text DEFAULT NULL,
  _details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (auth.uid(), _action_type, _target_type, _target_id, _details);
END;
$$;
