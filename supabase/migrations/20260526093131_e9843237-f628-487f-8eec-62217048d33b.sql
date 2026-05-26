
-- Pkg367: 30-min auto-offline + hard-offline DM block

-- 1) Tighten stale-online sweep: 1 hour -> 30 minutes
CREATE OR REPLACE FUNCTION public.cleanup_stale_online_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.private_calls
  SET status = 'missed', ended_at = now(), end_reason = 'timeout'
  WHERE status = 'ringing'
    AND created_at < now() - interval '60 seconds';

  UPDATE public.private_calls
  SET status = 'ended', ended_at = now(), end_reason = 'stale_cleanup'
  WHERE status = 'connected'
    AND started_at < now() - interval '2 hours';

  UPDATE public.profiles
  SET is_in_call = false, current_call_id = NULL
  WHERE is_in_call = true
    AND id NOT IN (
      SELECT caller_id FROM public.private_calls WHERE status IN ('ringing', 'connected')
      UNION
      SELECT host_id   FROM public.private_calls WHERE status IN ('ringing', 'connected')
    );

  -- Pkg367: auto-mark offline after 30 minutes of no heartbeat
  UPDATE public.profiles
  SET is_online = false
  WHERE is_online = true
    AND last_seen_at < now() - interval '30 minutes';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_stale_online_users() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cleanup_stale_online_users() TO authenticated, service_role;

-- 2) DM block when receiver host_availability='offline'
--    (Hard-offline mode: blocks ordinary DMs; admins / service-role / self bypass)
CREATE OR REPLACE FUNCTION public.tg_block_dm_to_offline_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_recipient uuid;
  v_recipient_availability text;
  v_caller_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  -- Bypass for service role and triggered system inserts
  IF v_caller_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Resolve recipient from conversation
  SELECT CASE
           WHEN participant1_id = NEW.sender_id THEN participant2_id
           ELSE participant1_id
         END
    INTO v_recipient
    FROM public.conversations
   WHERE id = NEW.conversation_id;

  IF v_recipient IS NULL OR v_recipient = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  -- Bypass if sender is admin
  IF EXISTS (SELECT 1 FROM public.admin_users au
              WHERE au.linked_user_id = NEW.sender_id AND au.is_active = true) THEN
    RETURN NEW;
  END IF;

  -- AI replies (system) are allowed through
  IF COALESCE(NEW.is_ai_reply, false) = true THEN
    RETURN NEW;
  END IF;

  SELECT host_availability INTO v_recipient_availability
    FROM public.profiles WHERE id = v_recipient;

  IF v_recipient_availability = 'offline' THEN
    RAISE EXCEPTION 'recipient_offline'
      USING ERRCODE = '22023',
            HINT   = 'This user is offline and cannot receive messages right now.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_block_dm_to_offline_user ON public.messages;
CREATE TRIGGER tg_block_dm_to_offline_user
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_dm_to_offline_user();

-- 3) pg_cron: run cleanup every minute
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pkg367_auto_offline_every_minute') THEN
    PERFORM cron.unschedule('pkg367_auto_offline_every_minute');
  END IF;
  PERFORM cron.schedule(
    'pkg367_auto_offline_every_minute',
    '* * * * *',
    $job$ SELECT public.cleanup_stale_online_users(); $job$
  );
END $$;
