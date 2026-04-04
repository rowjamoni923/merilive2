-- Drop all versions of the function first
DROP FUNCTION IF EXISTS public.search_user_by_app_uid(text);
DROP FUNCTION IF EXISTS public.search_user_by_app_uid(varchar);

-- Recreate with a single clear signature
CREATE OR REPLACE FUNCTION public.search_user_by_app_uid(_app_uid TEXT)
RETURNS TABLE(
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  username TEXT,
  is_host BOOLEAN,
  app_uid TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.display_name::TEXT,
    p.avatar_url::TEXT,
    p.username::TEXT,
    p.is_host,
    p.app_uid::TEXT
  FROM profiles p
  WHERE p.app_uid = _app_uid
  OR p.app_uid LIKE _app_uid || '%';
END;
$$;