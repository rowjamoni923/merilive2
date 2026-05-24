CREATE OR REPLACE FUNCTION public.reset_my_call_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_call_id uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  SELECT current_call_id INTO v_current_call_id
    FROM public.profiles
   WHERE id = auth.uid()
   FOR UPDATE;

  IF v_current_call_id IS NULL THEN
    UPDATE public.profiles
       SET is_in_call = false,
           updated_at = now()
     WHERE id = auth.uid()
       AND COALESCE(is_in_call, false) = true;
    RETURN;
  END IF;

  SELECT status INTO v_status
    FROM public.private_calls
   WHERE id = v_current_call_id;

  IF v_status IN ('pending', 'ringing', 'connected', 'active') THEN
    RETURN;
  END IF;

  UPDATE public.profiles
     SET is_in_call = false,
         current_call_id = NULL,
         updated_at = now()
   WHERE id = auth.uid();
END;
$function$;

CREATE OR REPLACE FUNCTION public.decline_private_call(_call_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _call record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _call FROM public.private_calls WHERE id = _call_id AND status IN ('pending', 'ringing') FOR UPDATE;
  IF _call IS NULL THEN
    RETURN false;
  END IF;

  IF auth.uid() <> _call.host_id AND auth.uid() <> _call.caller_id THEN
    RAISE EXCEPTION 'Not authorized to decline this call' USING ERRCODE = '42501';
  END IF;

  UPDATE public.private_calls
     SET status = 'declined', ended_at = now(), end_reason = 'declined', updated_at = now()
   WHERE id = _call_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET is_in_call = false, current_call_id = NULL, updated_at = now()
   WHERE id IN (_call.caller_id, _call.host_id)
     AND current_call_id = _call_id;

  INSERT INTO public.call_events (caller_id, receiver_id, call_type, status, call_id, event_type, event_data, ended_at)
  VALUES (_call.caller_id, _call.host_id, 'video', 'declined', _call_id, 'call_declined', jsonb_build_object('declined_by', auth.uid()), now());

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.timeout_private_call(_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  call_rec RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO call_rec FROM public.private_calls WHERE id = _call_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;

  IF auth.uid() <> call_rec.caller_id AND auth.uid() <> call_rec.host_id THEN
    RAISE EXCEPTION 'not authorized to timeout this call' USING ERRCODE = '42501';
  END IF;

  IF call_rec.status = 'connected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_already_connected');
  END IF;

  IF call_rec.status IN ('ended', 'declined', 'missed') THEN
    RETURN jsonb_build_object('success', true, 'already_ended', true, 'status', call_rec.status);
  END IF;

  IF call_rec.status NOT IN ('pending', 'ringing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_timeoutable', 'status', call_rec.status);
  END IF;

  UPDATE public.private_calls
     SET status = 'missed', ended_at = now(), end_reason = 'timeout', updated_at = now()
   WHERE id = _call_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET is_in_call = false, current_call_id = NULL, updated_at = now()
   WHERE id IN (call_rec.caller_id, call_rec.host_id)
     AND current_call_id = _call_id;

  INSERT INTO public.call_events (caller_id, receiver_id, call_type, status, call_id, event_type, event_data, ended_at)
  VALUES (call_rec.caller_id, call_rec.host_id, 'video', 'missed', _call_id, 'call_missed', jsonb_build_object('reason', 'timeout'), now());

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.end_private_call(_call_id uuid, _end_reason text DEFAULT 'normal'::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _call_record record;
  _duration integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _call_record
    FROM public.private_calls
   WHERE id = _call_id AND status IN ('ringing', 'connected', 'active')
   FOR UPDATE;

  IF _call_record IS NULL THEN
    UPDATE public.profiles
       SET is_in_call = false, current_call_id = NULL, updated_at = now()
     WHERE current_call_id = _call_id AND id = auth.uid();
    RETURN false;
  END IF;

  IF auth.uid() <> _call_record.caller_id AND auth.uid() <> _call_record.host_id THEN
    RAISE EXCEPTION 'Not authorized to end this call' USING ERRCODE = '42501';
  END IF;

  IF _call_record.connected_at IS NOT NULL THEN
    _duration := GREATEST(EXTRACT(EPOCH FROM (now() - _call_record.connected_at))::integer,
                          COALESCE(_call_record.duration_seconds, 0));
  ELSIF _call_record.started_at IS NOT NULL THEN
    _duration := GREATEST(EXTRACT(EPOCH FROM (now() - _call_record.started_at))::integer,
                          COALESCE(_call_record.duration_seconds, 0));
  ELSE
    _duration := COALESCE(_call_record.duration_seconds, 0);
  END IF;

  UPDATE public.private_calls
     SET status = 'ended',
         ended_at = now(),
         end_reason = _end_reason,
         duration_seconds = _duration,
         updated_at = now()
   WHERE id = _call_id;

  PERFORM public.settle_private_call(_call_id);

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET is_in_call = false, current_call_id = NULL, updated_at = now()
   WHERE id IN (_call_record.caller_id, _call_record.host_id)
     AND current_call_id = _call_id;

  UPDATE public.profiles
     SET total_calls_made = COALESCE(total_calls_made, 0) + 1, updated_at = now()
   WHERE id = _call_record.caller_id;

  UPDATE public.profiles
     SET total_calls_received = COALESCE(total_calls_received, 0) + 1,
         total_call_minutes = COALESCE(total_call_minutes, 0) + CEIL(GREATEST(_duration,0)::numeric/60),
         updated_at = now()
   WHERE id = _call_record.host_id;

  INSERT INTO public.call_events (call_id, event_type, event_data)
  VALUES (_call_id, 'call_ended', jsonb_build_object('end_reason', _end_reason, 'duration_seconds', _duration, 'ended_by', auth.uid()));

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'end_private_call failed for %: % (%)', _call_id, SQLERRM, SQLSTATE;
  RAISE;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reset_my_call_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decline_private_call(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.timeout_private_call(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.end_private_call(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_my_call_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_private_call(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.timeout_private_call(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_private_call(uuid, text) TO authenticated;