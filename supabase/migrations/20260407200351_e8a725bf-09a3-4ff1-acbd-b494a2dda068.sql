-- Temporarily allow bulk insert for data migration
CREATE POLICY "temp_bulk_import_profiles"
ON public.profiles
FOR INSERT
WITH CHECK (true);
