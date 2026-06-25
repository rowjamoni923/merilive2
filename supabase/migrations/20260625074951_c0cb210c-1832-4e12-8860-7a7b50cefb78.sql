CREATE OR REPLACE FUNCTION public.tg_guard_groups_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := current_setting('request.jwt.claim.role', true);
  v_code text;
  v_try int := 0;
BEGIN
  IF v_role <> 'service_role' AND NOT public.is_active_admin_session() THEN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
    IF char_length(coalesce(NEW.name,'')) < 1 OR char_length(NEW.name) > 80 THEN
      RAISE EXCEPTION 'invalid_group_name';
    END IF;
    IF coalesce(NEW.group_type,'basic') NOT IN ('basic','family') THEN
      RAISE EXCEPTION 'invalid_group_type';
    END IF;
    IF NEW.max_members IS NULL OR NEW.max_members > 500 THEN NEW.max_members := 500; END IF;
    IF NEW.max_members < 2 THEN NEW.max_members := 2; END IF;
    NEW.owner_id := v_uid;
    NEW.created_by := v_uid;
  END IF;

  NEW.member_count := COALESCE(NEW.member_count, 0);
  NEW.is_active   := COALESCE(NEW.is_active, true);

  IF NEW.group_code IS NULL OR length(btrim(NEW.group_code)) = 0 THEN
    LOOP
      v_try := v_try + 1;
      v_code := upper(substr(translate(encode(extensions.gen_random_bytes(8),'base64'), '+/=', 'ABC'), 1, 8));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.groups WHERE group_code = v_code) OR v_try > 8;
    END LOOP;
    NEW.group_code := v_code;
  END IF;
  RETURN NEW;
END$function$;