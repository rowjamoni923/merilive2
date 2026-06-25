
DO $$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles p
     SET is_agency_owner = false,
         agency_id = NULL
    FROM public.agencies a
   WHERE a.owner_id = p.id
     AND a.is_active = false
     AND (COALESCE(p.is_agency_owner,false) = true OR p.agency_id = a.id);
END $$;
