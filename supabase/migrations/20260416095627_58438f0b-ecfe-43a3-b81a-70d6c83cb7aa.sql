
-- 1. Fix profiles: Remove overly permissive SELECT policy, add restricted one
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;

-- Create a function to check if user is viewing their own profile or public fields
CREATE OR REPLACE FUNCTION public.is_own_profile(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _profile_id = auth.uid()
$$;

-- Users can see all profiles but only public fields (enforced via profiles_public view)
-- Users can see their own full profile
-- This policy stays: "Users can view own profile" already exists

-- 2. Fix storage buckets: Make payment-proofs and chat-media private
UPDATE storage.buckets SET public = false WHERE id = 'payment-proofs';
UPDATE storage.buckets SET public = false WHERE id = 'chat-media';

-- Remove overly broad public read policy on chat-media
DROP POLICY IF EXISTS "public_read_chat-media" ON storage.objects;

-- 3. Fix helper payment methods: Remove unrestricted read policies
DROP POLICY IF EXISTS "auth_read_helper_pm" ON public.helper_payment_methods;
DROP POLICY IF EXISTS "auth_read_helper_cpm" ON public.helper_country_payment_methods;

-- 4. Fix storage write access: Restrict level-assets, channel-logos, media-files to admins only

-- level-assets: Drop existing permissive policies and add admin-only
DROP POLICY IF EXISTS "level_assets_insert" ON storage.objects;
DROP POLICY IF EXISTS "level_assets_update" ON storage.objects;
DROP POLICY IF EXISTS "level_assets_delete" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload level-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update level-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete level-assets" ON storage.objects;

CREATE POLICY "Admin only insert level-assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'level-assets' AND public.is_admin(auth.uid()));

CREATE POLICY "Admin only update level-assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'level-assets' AND public.is_admin(auth.uid()));

CREATE POLICY "Admin only delete level-assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'level-assets' AND public.is_admin(auth.uid()));

-- channel-logos: Drop existing permissive policies and add admin-only
DROP POLICY IF EXISTS "channel_logos_insert" ON storage.objects;
DROP POLICY IF EXISTS "channel_logos_update" ON storage.objects;
DROP POLICY IF EXISTS "channel_logos_delete" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload channel logos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update channel logos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete channel logos" ON storage.objects;

CREATE POLICY "Admin only insert channel-logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'channel-logos' AND public.is_admin(auth.uid()));

CREATE POLICY "Admin only update channel-logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'channel-logos' AND public.is_admin(auth.uid()));

CREATE POLICY "Admin only delete channel-logos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'channel-logos' AND public.is_admin(auth.uid()));

-- media-files: Drop existing permissive policies and add admin-only
DROP POLICY IF EXISTS "media_files_insert" ON storage.objects;
DROP POLICY IF EXISTS "media_files_update" ON storage.objects;
DROP POLICY IF EXISTS "media_files_delete" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload media files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update media files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete media files" ON storage.objects;

CREATE POLICY "Admin only insert media-files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'media-files' AND public.is_admin(auth.uid()));

CREATE POLICY "Admin only update media-files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'media-files' AND public.is_admin(auth.uid()));

CREATE POLICY "Admin only delete media-files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'media-files' AND public.is_admin(auth.uid()));

-- 5. Protect diamonds/coins from client-side manipulation
-- Add a trigger to prevent direct updates to financial columns via client
CREATE OR REPLACE FUNCTION public.protect_financial_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow changes to financial columns via RPC (server-side) or admin
  -- Check if this is a direct client update (not from an RPC or admin)
  IF current_setting('app.bypass_profile_protection', true) = 'true' THEN
    RETURN NEW;
  END IF;
  
  -- If financial columns are being changed by a non-admin user directly, block it
  IF (OLD.coins IS DISTINCT FROM NEW.coins 
      OR OLD.diamonds IS DISTINCT FROM NEW.diamonds 
      OR OLD.beans IS DISTINCT FROM NEW.beans) THEN
    -- Check if caller is admin
    IF NOT public.is_admin(auth.uid()) THEN
      NEW.coins := OLD.coins;
      NEW.diamonds := OLD.diamonds;
      NEW.beans := OLD.beans;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop if exists then create
DROP TRIGGER IF EXISTS trg_protect_financial_columns ON public.profiles;
CREATE TRIGGER trg_protect_financial_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_financial_columns();
