-- Temporarily drop FK to allow profiles import without auth.users
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Also drop the temp policy we just created (no longer needed, we'll use service role)
DROP POLICY IF EXISTS "temp_bulk_import_profiles" ON public.profiles;
