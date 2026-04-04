-- Admin Notices table for targeted announcements
CREATE TABLE public.admin_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_audience TEXT[] NOT NULL DEFAULT ARRAY['all'], -- hosts, agencies, users, level5_helpers, helpers, all
  priority TEXT NOT NULL DEFAULT 'normal', -- low, normal, high, urgent
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  read_by UUID[] DEFAULT ARRAY[]::UUID[]
);

-- Enable RLS
ALTER TABLE public.admin_notices ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read active notices
CREATE POLICY "Users can read active notices"
ON public.admin_notices
FOR SELECT
USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- Policy: Only admins can insert/update/delete
CREATE POLICY "Admins can manage notices"
ON public.admin_notices
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE user_id = auth.uid()
    AND is_active = true
  )
);

-- Index for faster queries
CREATE INDEX idx_admin_notices_target ON public.admin_notices USING GIN(target_audience);
CREATE INDEX idx_admin_notices_active ON public.admin_notices(is_active, expires_at);
CREATE INDEX idx_admin_notices_created ON public.admin_notices(created_at DESC);

-- Function to get notices for a specific user based on their role
CREATE OR REPLACE FUNCTION public.get_user_notices(p_user_id UUID)
RETURNS SETOF admin_notices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_host BOOLEAN := FALSE;
  v_is_agency BOOLEAN := FALSE;
  v_is_helper BOOLEAN := FALSE;
  v_is_level5_helper BOOLEAN := FALSE;
  v_audiences TEXT[];
BEGIN
  -- Check if user is a host (female + verified)
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
    AND gender = 'Female'
    AND is_verified = true
  ) INTO v_is_host;

  -- Check if user is an agency owner
  SELECT EXISTS (
    SELECT 1 FROM agencies
    WHERE owner_id = p_user_id
    AND is_active = true
  ) INTO v_is_agency;

  -- Check if user is a helper (regular)
  SELECT EXISTS (
    SELECT 1 FROM topup_helpers
    WHERE user_id = p_user_id
    AND is_verified = true
  ) INTO v_is_helper;

  -- Check if user is a Level 5 helper
  SELECT EXISTS (
    SELECT 1 FROM topup_helpers
    WHERE user_id = p_user_id
    AND is_verified = true
    AND helper_level = 5
  ) INTO v_is_level5_helper;

  -- Build audiences array
  v_audiences := ARRAY['all', 'users'];
  
  IF v_is_host THEN
    v_audiences := array_append(v_audiences, 'hosts');
  END IF;
  
  IF v_is_agency THEN
    v_audiences := array_append(v_audiences, 'agencies');
  END IF;
  
  IF v_is_helper THEN
    v_audiences := array_append(v_audiences, 'helpers');
  END IF;
  
  IF v_is_level5_helper THEN
    v_audiences := array_append(v_audiences, 'level5_helpers');
  END IF;

  -- Return notices that match any of user's audiences
  RETURN QUERY
  SELECT an.*
  FROM admin_notices an
  WHERE an.is_active = true
    AND (an.expires_at IS NULL OR an.expires_at > now())
    AND an.target_audience && v_audiences
  ORDER BY 
    CASE an.priority 
      WHEN 'urgent' THEN 1 
      WHEN 'high' THEN 2 
      WHEN 'normal' THEN 3 
      ELSE 4 
    END,
    an.created_at DESC;
END;
$$;