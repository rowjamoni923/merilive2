CREATE OR REPLACE FUNCTION public.admin_entry_effects_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_banners int := 0;
  v_bars int := 0;
  v_name_bars int := 0;
  v_vehicles int := 0;
BEGIN
  IF NOT is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.entry_banners' INTO v_banners;
  EXCEPTION WHEN undefined_table THEN v_banners := 0; END;

  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.entry_effects' INTO v_bars;
  EXCEPTION WHEN undefined_table THEN v_bars := 0; END;

  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.entry_name_bars' INTO v_name_bars;
  EXCEPTION WHEN undefined_table THEN v_name_bars := 0; END;

  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.vehicle_entrances WHERE is_active = true' INTO v_vehicles;
  EXCEPTION WHEN undefined_table THEN v_vehicles := 0; END;

  RETURN jsonb_build_object(
    'banners',  v_banners,
    'bars',     v_bars,
    'name_bars', v_name_bars,
    'vehicles', v_vehicles
  );
END;
$function$;