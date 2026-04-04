-- =============================================
-- ADMIN DEVICE ACCESS CONTROL SYSTEM
-- Only approved devices can access admin panel
-- =============================================

-- Device status enum
CREATE TYPE admin_device_status AS ENUM ('pending', 'approved', 'blocked');

-- Admin allowed devices table
CREATE TABLE public.admin_allowed_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  device_name TEXT,
  device_info JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  status admin_device_status DEFAULT 'pending',
  approved_by UUID REFERENCES public.admin_users(id),
  approved_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  
  -- Each device fingerprint can only be registered once per admin user
  UNIQUE(admin_user_id, device_fingerprint)
);

-- Enable RLS
ALTER TABLE public.admin_allowed_devices ENABLE ROW LEVEL SECURITY;

-- Index for fast lookups
CREATE INDEX idx_admin_devices_fingerprint ON public.admin_allowed_devices(device_fingerprint);
CREATE INDEX idx_admin_devices_admin_user ON public.admin_allowed_devices(admin_user_id);
CREATE INDEX idx_admin_devices_status ON public.admin_allowed_devices(status);

-- RLS Policies
-- Owners can see all devices
CREATE POLICY "Owners can view all devices"
ON public.admin_allowed_devices
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid() AND role = 'owner'
  )
);

-- Owners can manage all devices
CREATE POLICY "Owners can manage all devices"
ON public.admin_allowed_devices
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid() AND role = 'owner'
  )
);

-- Sub-admins can only see their own devices
CREATE POLICY "Sub-admins can view own devices"
ON public.admin_allowed_devices
FOR SELECT
USING (
  admin_user_id IN (
    SELECT id FROM public.admin_users WHERE user_id = auth.uid()
  )
);

-- Allow device registration (insert) for authenticated users
CREATE POLICY "Allow device registration"
ON public.admin_allowed_devices
FOR INSERT
WITH CHECK (true);

-- Function to check if a device is approved for admin access
CREATE OR REPLACE FUNCTION public.is_admin_device_approved(
  _user_id UUID,
  _device_fingerprint TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_user admin_users;
  _device_exists BOOLEAN;
BEGIN
  -- Get admin user
  SELECT * INTO _admin_user FROM admin_users WHERE user_id = _user_id LIMIT 1;
  
  -- If not an admin user, deny
  IF _admin_user.id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Owners have unlimited device access
  IF _admin_user.role = 'owner' THEN
    RETURN TRUE;
  END IF;
  
  -- Check if this device is approved for this admin
  SELECT EXISTS (
    SELECT 1 FROM admin_allowed_devices
    WHERE admin_user_id = _admin_user.id
      AND device_fingerprint = _device_fingerprint
      AND status = 'approved'
  ) INTO _device_exists;
  
  RETURN _device_exists;
END;
$$;

-- Function to register a new device (returns device id if successful)
CREATE OR REPLACE FUNCTION public.register_admin_device(
  _device_fingerprint TEXT,
  _device_name TEXT DEFAULT NULL,
  _device_info JSONB DEFAULT '{}',
  _ip_address TEXT DEFAULT NULL,
  _user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_user admin_users;
  _device_id UUID;
  _existing_device admin_allowed_devices;
BEGIN
  -- Get admin user
  SELECT * INTO _admin_user FROM admin_users WHERE user_id = auth.uid() LIMIT 1;
  
  IF _admin_user.id IS NULL THEN
    RAISE EXCEPTION 'Not an admin user';
  END IF;
  
  -- Check if device already exists
  SELECT * INTO _existing_device 
  FROM admin_allowed_devices 
  WHERE admin_user_id = _admin_user.id AND device_fingerprint = _device_fingerprint;
  
  IF _existing_device.id IS NOT NULL THEN
    -- Update last used
    UPDATE admin_allowed_devices 
    SET last_used_at = now(),
        ip_address = COALESCE(_ip_address, ip_address),
        user_agent = COALESCE(_user_agent, user_agent)
    WHERE id = _existing_device.id;
    
    RETURN _existing_device.id;
  END IF;
  
  -- For owners, auto-approve devices
  IF _admin_user.role = 'owner' THEN
    INSERT INTO admin_allowed_devices (
      admin_user_id, device_fingerprint, device_name, device_info,
      ip_address, user_agent, status, approved_by, approved_at
    ) VALUES (
      _admin_user.id, _device_fingerprint, _device_name, _device_info,
      _ip_address, _user_agent, 'approved', _admin_user.id, now()
    ) RETURNING id INTO _device_id;
  ELSE
    -- For sub-admins, device starts as pending
    INSERT INTO admin_allowed_devices (
      admin_user_id, device_fingerprint, device_name, device_info,
      ip_address, user_agent, status
    ) VALUES (
      _admin_user.id, _device_fingerprint, _device_name, _device_info,
      _ip_address, _user_agent, 'pending'
    ) RETURNING id INTO _device_id;
  END IF;
  
  RETURN _device_id;
END;
$$;

-- Function to approve/block a device (owner only)
CREATE OR REPLACE FUNCTION public.update_admin_device_status(
  _device_id UUID,
  _new_status admin_device_status,
  _notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_user admin_users;
BEGIN
  -- Check if caller is owner
  SELECT * INTO _admin_user FROM admin_users 
  WHERE user_id = auth.uid() AND role = 'owner' LIMIT 1;
  
  IF _admin_user.id IS NULL THEN
    RAISE EXCEPTION 'Only owners can manage device access';
  END IF;
  
  -- Update device status
  UPDATE admin_allowed_devices
  SET status = _new_status,
      approved_by = CASE WHEN _new_status = 'approved' THEN _admin_user.id ELSE approved_by END,
      approved_at = CASE WHEN _new_status = 'approved' THEN now() ELSE approved_at END,
      notes = COALESCE(_notes, notes)
  WHERE id = _device_id;
  
  RETURN TRUE;
END;
$$;