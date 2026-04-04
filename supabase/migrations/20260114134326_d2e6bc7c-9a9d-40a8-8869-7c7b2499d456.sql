-- Add admin RLS policies for agencies table
CREATE POLICY "Admins can view all agencies"
  ON public.agencies
  FOR SELECT
  USING (is_admin(auth.uid()));

-- Add admin RLS policies for blocked profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (is_admin(auth.uid()));

-- Add admin update policy for profiles (for blocking)
CREATE POLICY "Admins can update any profile"
  ON public.profiles
  FOR UPDATE
  USING (is_admin(auth.uid()));

-- Add admin update policy for agencies
CREATE POLICY "Admins can update any agency"
  ON public.agencies
  FOR UPDATE
  USING (is_admin(auth.uid()));

-- Add admin update policy for agency level tiers
CREATE POLICY "Admins can update agency level tiers"
  ON public.agency_level_tiers
  FOR UPDATE
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert agency level tiers"
  ON public.agency_level_tiers
  FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can delete agency level tiers"
  ON public.agency_level_tiers
  FOR DELETE
  USING (is_admin(auth.uid()));