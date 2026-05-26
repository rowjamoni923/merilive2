-- Pkg365: Auto-dispatch AI moderator agent on every live/party room start.
-- Mirrors Pkg129 auto-record. Server-side, kill-switch respecting, idempotent.

-- 1) Enable agent + auto_moderator flags in master kill-switch (preserve others)
UPDATE public.app_settings
SET setting_value = (
  COALESCE(setting_value::jsonb, '{}'::jsonb)
    || jsonb_build_object('agent', true, 'auto_moderator', true)
)::text
WHERE setting_key = 'livekit_signaling_enabled';

-- 2) Seed auto_moderator_secret (random 32-byte hex) if absent
INSERT INTO public.app_settings (setting_key, setting_value)
SELECT 'auto_moderator_secret', encode(extensions.gen_random_bytes(32), 'hex')
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_settings WHERE setting_key = 'auto_moderator_secret'
);

-- 3) Seed agent name default
INSERT INTO public.app_settings (setting_key, setting_value)
SELECT 'auto_moderator_agent_name', 'moderator'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_settings WHERE setting_key = 'auto_moderator_agent_name'
);

-- 4) Helper: POST to livekit-auto-moderator edge fn
CREATE OR REPLACE FUNCTION public._auto_moderator_post(
  _scope text, _scope_id uuid, _room_name text, _host_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_url text := 'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/livekit-auto-moderator';
BEGIN
  SELECT setting_value INTO v_secret
  FROM public.app_settings WHERE setting_key = 'auto_moderator_secret';

  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RAISE WARNING '[Pkg365] auto_moderator_secret missing — skipping for % %', _scope, _scope_id;
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-auto-moderator-secret', v_secret
      ),
      body := jsonb_build_object(
        'scope', _scope,
        'scopeId', _scope_id::text,
        'roomName', _room_name,
        'hostId', _host_id
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[Pkg365] pg_net post failed for % %: %', _scope, _scope_id, SQLERRM;
  END;
END;
$$;

-- 5) Trigger: live_streams AFTER INSERT (only active rows)
CREATE OR REPLACE FUNCTION public.tg_auto_moderator_on_live_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  PERFORM public._auto_moderator_post(
    'live', NEW.id, COALESCE(NEW.room_name, 'live_' || NEW.id::text), NEW.host_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_moderator_on_live_start ON public.live_streams;
CREATE TRIGGER trg_auto_moderator_on_live_start
  AFTER INSERT ON public.live_streams
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_auto_moderator_on_live_start();

-- 6) Trigger: party_rooms AFTER INSERT
CREATE OR REPLACE FUNCTION public.tg_auto_moderator_on_party_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._auto_moderator_post(
    'party', NEW.id, 'party_' || NEW.id::text, NEW.host_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_moderator_on_party_start ON public.party_rooms;
CREATE TRIGGER trg_auto_moderator_on_party_start
  AFTER INSERT ON public.party_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_auto_moderator_on_party_start();

-- Lock down helper
REVOKE EXECUTE ON FUNCTION public._auto_moderator_post(text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;