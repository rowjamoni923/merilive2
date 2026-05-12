CREATE OR REPLACE FUNCTION public.notify_on_gift_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sender_name text;
  gift_name text;
BEGIN
  -- Live/party/call gifts are rendered by the in-room gift feed/animation system only.
  -- Do not create global notification rows for them, otherwise the receiver sees repeated top banners.
  IF NEW.stream_id IS NOT NULL OR NEW.party_room_id IS NOT NULL OR NEW.call_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO sender_name FROM profiles WHERE id = NEW.sender_id;
  SELECT name INTO gift_name FROM gifts WHERE id = NEW.gift_id;

  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    NEW.receiver_id,
    'gift_received',
    'Gift Received',
    COALESCE(sender_name, 'Someone') || ' sent you ' || COALESCE(gift_name, 'a gift'),
    jsonb_build_object(
      'gift_id', NEW.gift_id,
      'sender_id', NEW.sender_id,
      'amount', NEW.coin_amount,
      'source', 'gift_transaction'
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_on_gift_received failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url text := 'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/send-push-notification';
  v_image text;
  v_type text;
BEGIN
  v_image := NULLIF(NEW.data->>'imageUrl', '');
  IF v_image IS NULL THEN
    v_image := NULLIF(NEW.data->>'image_url', '');
  END IF;
  v_type := COALESCE(NULLIF(NEW.data->>'type',''), NEW.type, 'general');

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'userId', NEW.user_id,
      'title', NEW.title,
      'body', NEW.message,
      'imageUrl', v_image,
      'type', v_type,
      'data', COALESCE(NEW.data, '{}'::jsonb) || jsonb_build_object(
        'notification_id', NEW.id,
        'origin', 'notifications_trigger',
        'persist_fallback', false
      )
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_push_on_notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;