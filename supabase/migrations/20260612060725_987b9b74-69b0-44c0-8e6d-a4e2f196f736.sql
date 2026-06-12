CREATE OR REPLACE FUNCTION public.end_private_call(_call_id uuid, _end_reason text DEFAULT 'normal'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _call_record record;
  _duration integer := 0;
  _new_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _call_record
    FROM public.private_calls
   WHERE id = _call_id AND status IN ('pending', 'ringing', 'connected', 'active')
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

  -- If call never connected (still pending/ringing), treat as cancelled so the
  -- terminal-status trigger fires and both parties' is_in_call flags clear
  -- instantly. Previously 'pending' was filtered out → host stuck "Busy".
  IF _call_record.status IN ('pending', 'ringing') THEN
    _new_status := 'cancelled';
  ELSE
    _new_status := 'ended';
  END IF;

  UPDATE public.private_calls
     SET status = _new_status,
         ended_at = now(),
         end_reason = _end_reason,
         duration_seconds = _duration,
         updated_at = now()
   WHERE id = _call_id;

  -- Only run settle/stats for calls that actually connected.
  IF _call_record.status IN ('connected', 'active') THEN
    PERFORM public.settle_private_call(_call_id);
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET is_in_call = false, current_call_id = NULL, updated_at = now()
   WHERE id IN (_call_record.caller_id, _call_record.host_id)
     AND current_call_id = _call_id;

  IF _call_record.status IN ('connected', 'active') THEN
    UPDATE public.profiles
       SET total_calls_made = COALESCE(total_calls_made, 0) + 1, updated_at = now()
     WHERE id = _call_record.caller_id;

    UPDATE public.profiles
       SET total_calls_received = COALESCE(total_calls_received, 0) + 1,
           total_call_minutes = COALESCE(total_call_minutes, 0) + CEIL(GREATEST(_duration,0)::numeric/60),
           updated_at = now()
     WHERE id = _call_record.host_id;
  END IF;

  INSERT INTO public.call_events (call_id, event_type, event_data)
  VALUES (_call_id,
          CASE WHEN _new_status = 'cancelled' THEN 'call_cancelled' ELSE 'call_ended' END,
          jsonb_build_object('end_reason', _end_reason, 'duration_seconds', _duration, 'ended_by', auth.uid(), 'final_status', _new_status));

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'end_private_call failed for %: % (%)', _call_id, SQLERRM, SQLSTATE;
  RAISE;
END;
$function$;