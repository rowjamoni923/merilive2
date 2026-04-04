
-- NOTIFICATION ENGINE: Create trigger functions only (no triggers yet)

-- 1. NEW FOLLOWER notification
CREATE OR REPLACE FUNCTION public.notify_on_new_follower()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_name TEXT; v_avatar TEXT;
BEGIN
  SELECT display_name, avatar_url INTO v_name, v_avatar FROM profiles WHERE id = NEW.follower_id;
  v_name := COALESCE(v_name, 'Someone');
  INSERT INTO notifications (user_id, type, title, message, data, is_read)
  VALUES (NEW.following_id, 'new_follower', '👤 New Follower!', v_name || ' started following you',
    jsonb_build_object('follower_id', NEW.follower_id, 'follower_name', v_name, 'avatar_url', COALESCE(v_avatar, '')), false);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notify_on_new_follower: %', SQLERRM; RETURN NEW;
END; $$;

-- 2. GIFT RECEIVED notification
CREATE OR REPLACE FUNCTION public.notify_on_gift_received()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_sender TEXT; v_gift TEXT;
BEGIN
  SELECT display_name INTO v_sender FROM profiles WHERE id = NEW.sender_id;
  SELECT name INTO v_gift FROM gifts WHERE id = NEW.gift_id;
  v_sender := COALESCE(v_sender, 'Someone'); v_gift := COALESCE(v_gift, 'a gift');
  INSERT INTO notifications (user_id, type, title, message, data, is_read)
  VALUES (NEW.receiver_id, 'gift_received', '🎁 ' || v_sender || ' sent you a gift!', v_gift || ' (' || NEW.coin_amount || ' coins)',
    jsonb_build_object('sender_id', NEW.sender_id, 'sender_name', v_sender, 'gift_name', v_gift, 'coin_amount', NEW.coin_amount, 'gift_id', NEW.gift_id, 'quantity', COALESCE(NEW.quantity, 1)), false);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notify_on_gift_received: %', SQLERRM; RETURN NEW;
END; $$;

-- 3. HOST APPLICATION STATUS notification
CREATE OR REPLACE FUNCTION public.notify_on_host_application_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status = 'approved' THEN
    INSERT INTO notifications (user_id, type, title, message, data, is_read)
    VALUES (NEW.user_id, 'host_approved', '🎉 Host Application Approved!', 'Your host application has been approved. Start live streaming now!',
      jsonb_build_object('status', 'approved', 'application_id', NEW.id), false);
  ELSIF NEW.status = 'rejected' THEN
    INSERT INTO notifications (user_id, type, title, message, data, is_read)
    VALUES (NEW.user_id, 'host_rejected', '❌ Host Application Rejected', COALESCE(NEW.rejection_reason, 'Your host application has been rejected.'),
      jsonb_build_object('status', 'rejected', 'reason', COALESCE(NEW.rejection_reason, ''), 'application_id', NEW.id), false);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notify_on_host_application_status: %', SQLERRM; RETURN NEW;
END; $$;

-- 4. RECHARGE COMPLETED notification
CREATE OR REPLACE FUNCTION public.notify_on_recharge_completed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_amount BIGINT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('completed', 'success') THEN RETURN NEW; END IF;
  v_amount := COALESCE(NEW.diamond_amount, NEW.coins_amount, 0);
  INSERT INTO notifications (user_id, type, title, message, data, is_read)
  VALUES (NEW.user_id, 'diamonds_credited', '💎 Diamonds Credited!', v_amount || ' Diamonds added to your account',
    jsonb_build_object('amount', v_amount, 'transaction_id', NEW.id), false);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notify_on_recharge_completed: %', SQLERRM; RETURN NEW;
END; $$;

-- 5. LIVE STREAM STARTED notification (followers)
CREATE OR REPLACE FUNCTION public.notify_on_live_stream_started()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_host TEXT;
BEGIN
  IF NEW.status != 'live' THEN RETURN NEW; END IF;
  SELECT display_name INTO v_host FROM profiles WHERE id = NEW.host_id;
  v_host := COALESCE(v_host, 'A host');
  INSERT INTO notifications (user_id, type, title, message, data, is_read)
  SELECT f.follower_id, 'live_started', '🔴 ' || v_host || ' is Live!', COALESCE(NEW.title, 'Join now!'),
    jsonb_build_object('host_id', NEW.host_id, 'host_name', v_host, 'stream_id', NEW.id, 'stream_title', COALESCE(NEW.title, '')), false
  FROM followers f WHERE f.following_id = NEW.host_id LIMIT 500;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notify_on_live_stream_started: %', SQLERRM; RETURN NEW;
END; $$;

-- 6. WITHDRAWAL STATUS notification
CREATE OR REPLACE FUNCTION public.notify_on_withdrawal_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_title TEXT; v_msg TEXT; v_type TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status IN ('approved', 'completed') THEN
    v_type := 'withdrawal_approved'; v_title := '✅ Withdrawal Approved!'; v_msg := '$' || NEW.amount || ' withdrawal approved';
  ELSIF NEW.status = 'rejected' THEN
    v_type := 'withdrawal_rejected'; v_title := '❌ Withdrawal Rejected'; v_msg := COALESCE(NEW.notes, 'Your withdrawal was rejected');
  ELSE RETURN NEW;
  END IF;
  INSERT INTO notifications (user_id, type, title, message, data, is_read)
  SELECT a.owner_id, v_type, v_title, v_msg, jsonb_build_object('status', NEW.status, 'amount', NEW.amount, 'withdrawal_id', NEW.id), false
  FROM agencies a WHERE a.id = NEW.agency_id AND a.owner_id IS NOT NULL;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notify_on_withdrawal_status: %', SQLERRM; RETURN NEW;
END; $$;
