
-- Admin write access for parcel_templates (CRUD from admin panel)
CREATE POLICY "Admin full access to parcel templates" ON public.parcel_templates
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Admin can view all user_parcels
CREATE POLICY "Admin can view all parcels" ON public.user_parcels
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Admin can view all claims
CREATE POLICY "Admin can view all claims" ON public.parcel_claims
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );
