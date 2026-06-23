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
  -- Live / party / call gifts are rendered by the in-room gift feed & animation system only.
  IF NEW.stream_id IS NOT NULL OR NEW.party_room_id IS NOT NULL OR NEW.call_id IS NOT NULL OR NEW.reel_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- DM (chat) gifts already appear inside the Messages section as a gift bubble.
  -- Do not create a duplicate global notification.
  IF NEW.idempotency_key IS NOT NULL AND NEW.idempotency_key LIKE 'dm\_%' ESCAPE '\' THEN
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