DROP TRIGGER IF EXISTS on_call_ended_earnings ON public.private_calls;

CREATE OR REPLACE FUNCTION public.update_host_call_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.call_events (call_id, event_type, event_data)
    VALUES (
      NEW.id,
      'call_status_transition',
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'host_earnings_amount', COALESCE(NEW.host_earnings_amount, 0),
        'host_earned', COALESCE(NEW.host_earned, 0),
        'coins_spent', COALESCE(NEW.coins_spent, 0),
        'total_coins_deducted', COALESCE(NEW.total_coins_deducted, 0)
      )
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'update_host_call_earnings failed for call %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  RAISE;
END;
$$;

CREATE TRIGGER on_call_ended_earnings
AFTER UPDATE ON public.private_calls
FOR EACH ROW
EXECUTE FUNCTION public.update_host_call_earnings();

CREATE OR REPLACE FUNCTION public.end_private_call(
  _call_id uuid,
  _end_reason text DEFAULT 'normal'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _call_record record;
  _duration integer := 0;
BEGIN
  SELECT *
  INTO _call_record
  FROM public.private_calls
  WHERE id = _call_id
    AND status IN ('ringing', 'connected')
  FOR UPDATE;

  IF _call_record IS NULL THEN
    UPDATE public.profiles
    SET is_in_call = false,
        current_call_id = NULL,
        updated_at = now()
    WHERE current_call_id = _call_id;

    RETURN false;
  END IF;

  IF auth.uid() IS NOT NULL
     AND auth.uid() <> _call_record.caller_id
     AND auth.uid() <> _call_record.host_id THEN
    RAISE EXCEPTION 'Not authorized to end this call';
  END IF;

  IF _call_record.connected_at IS NOT NULL THEN
    _duration := GREATEST(EXTRACT(EPOCH FROM (now() - _call_record.connected_at))::integer, COALESCE(_call_record.duration_seconds, 0));
  ELSIF _call_record.started_at IS NOT NULL THEN
    _duration := GREATEST(EXTRACT(EPOCH FROM (now() - _call_record.started_at))::integer, COALESCE(_call_record.duration_seconds, 0));
  ELSE
    _duration := COALESCE(_call_record.duration_seconds, 0);
  END IF;

  UPDATE public.private_calls
  SET status = 'ended',
      ended_at = now(),
      end_reason = _end_reason,
      duration_seconds = _duration
  WHERE id = _call_id;

  UPDATE public.profiles
  SET is_in_call = false,
      current_call_id = NULL,
      updated_at = now()
  WHERE id IN (_call_record.caller_id, _call_record.host_id);

  UPDATE public.profiles
  SET total_calls_made = COALESCE(total_calls_made, 0) + 1,
      updated_at = now()
  WHERE id = _call_record.caller_id;

  UPDATE public.profiles
  SET total_calls_received = COALESCE(total_calls_received, 0) + 1,
      total_call_minutes = COALESCE(total_call_minutes, 0) + CEIL(GREATEST(_duration, 0)::numeric / 60),
      updated_at = now()
  WHERE id = _call_record.host_id;

  INSERT INTO public.call_events (call_id, event_type, event_data)
  VALUES (
    _call_id,
    'call_ended',
    jsonb_build_object(
      'end_reason', _end_reason,
      'duration_seconds', _duration,
      'coins_spent', COALESCE(_call_record.coins_spent, 0),
      'total_coins_deducted', COALESCE(_call_record.total_coins_deducted, 0),
      'host_earned', COALESCE(_call_record.host_earned, 0),
      'host_earnings_amount', COALESCE(_call_record.host_earnings_amount, 0),
      'ended_by', auth.uid()
    )
  );

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'end_private_call failed for call %: % (%)', _call_id, SQLERRM, SQLSTATE;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.end_private_call(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_private_call(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_private_call(uuid, text) TO service_role;