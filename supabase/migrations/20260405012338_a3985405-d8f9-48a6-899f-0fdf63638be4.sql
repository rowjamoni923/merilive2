CREATE OR REPLACE FUNCTION public.cleanup_expired_admin_otps() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.admin_login_otps 
  WHERE expires_at < now() - interval '1 hour';
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.distribute_payroll_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _trader record;
BEGIN
  SELECT th.id, COUNT(pr.id) as request_count
  INTO _trader
  FROM topup_helpers th
  LEFT JOIN payroll_requests pr ON pr.trader_id = th.id AND pr.status IN ('assigned', 'processing')
  WHERE th.trader_level = 5 
    AND th.payroll_enabled = true 
    AND th.is_verified = true
  GROUP BY th.id
  ORDER BY request_count ASC
  LIMIT 1;
  
  IF _trader IS NOT NULL THEN
    NEW.trader_id := _trader.id;
    NEW.status := 'assigned';
    NEW.assigned_at := now();
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_permanent_ban() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.is_blocked = true AND (OLD.is_blocked IS NOT TRUE) THEN
    NEW.is_host := false;
    NEW.host_status := 'rejected';
    NEW.is_online := false;
    NEW.is_in_call := false;
    NEW.active_session_id := null;

    UPDATE public.agency_hosts
    SET status = 'removed', left_at = now()
    WHERE host_id = NEW.id AND status = 'active';

    UPDATE public.agencies
    SET is_blocked = true, is_active = false, blocked_at = now(),
        blocked_reason = 'Owner permanently banned'
    WHERE owner_id = NEW.id AND is_blocked IS NOT TRUE;

    DELETE FROM public.followers
    WHERE follower_id = NEW.id OR following_id = NEW.id;

    UPDATE public.live_streams
    SET is_active = false, ended_at = now()
    WHERE host_id = NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_permanent_live_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_id text;
BEGIN
  IF NEW.is_active = true AND NEW.ban_end IS NULL AND NEW.ban_duration_hours IS NULL THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
    SET is_blocked = true,
        blocked_reason = COALESCE(NEW.ban_reason, 'Permanent ban by admin'),
        blocked_at = COALESCE(blocked_at, now())
    WHERE id = NEW.user_id AND is_blocked IS NOT TRUE;

    SELECT device_id INTO v_device_id FROM public.profiles WHERE id = NEW.user_id;
    IF v_device_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.banned_devices WHERE device_id = v_device_id AND is_permanent = true
    ) THEN
      INSERT INTO public.banned_devices (user_id, device_id, reason, is_permanent, banned_at)
      VALUES (NEW.user_id, v_device_id, COALESCE(NEW.ban_reason, 'Permanent ban by admin'), true, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_welcome_bonus() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  bonus_amount INTEGER := 50;
BEGIN
  IF EXISTS (SELECT 1 FROM public.welcome_bonuses WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  UPDATE public.profiles SET coins = COALESCE(coins, 0) + bonus_amount WHERE id = NEW.id;
  INSERT INTO public.welcome_bonuses (user_id, bonus_coins)
  VALUES (NEW.id, bonus_amount) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (NEW.id, 'welcome_bonus', '🎁 Welcome Bonus!', 'Welcome! You have received 50 bonus coins.',
    jsonb_build_object('bonus_coins', bonus_amount, 'type', 'welcome_bonus'));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_reel_gift() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  host_share DECIMAL(5,2) := 0.55;
  beans_amount BIGINT;
BEGIN
  IF NEW.reel_id IS NOT NULL THEN
    beans_amount := FLOOR(NEW.coin_amount * host_share);
    UPDATE public.reels SET beans_earned = beans_earned + beans_amount WHERE id = NEW.reel_id;
    UPDATE public.profiles SET beans = COALESCE(beans, 0) + beans_amount WHERE id = NEW.receiver_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_user_ban() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.is_blocked = true AND (OLD.is_blocked IS NULL OR OLD.is_blocked = false) THEN
    NEW.coins := 0;
    NEW.pending_earnings := 0;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_agency_withdrawal_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  agency_owner_id uuid;
BEGIN
  SELECT owner_id INTO agency_owner_id FROM public.agencies WHERE id = NEW.agency_id;
  IF OLD.status IS DISTINCT FROM NEW.status AND agency_owner_id IS NOT NULL THEN
    IF NEW.status = 'completed' OR NEW.status = 'approved' THEN
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (agency_owner_id, 'withdrawal_approved', 'Withdrawal Approved! ✅',
        'Your withdrawal of $' || NEW.amount::text || ' has been approved.',
        jsonb_build_object('amount', NEW.amount, 'payment_method', NEW.payment_method));
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (agency_owner_id, 'withdrawal_rejected', 'Withdrawal Rejected',
        'Your withdrawal request has been rejected. Reason: ' || COALESCE(NEW.notes, 'Not specified'),
        jsonb_build_object('amount', NEW.amount, 'reason', NEW.notes));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_diamond_exchange() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  agency_owner_id uuid;
BEGIN
  SELECT owner_id INTO agency_owner_id FROM public.agencies WHERE id = NEW.agency_id;
  IF agency_owner_id IS NOT NULL THEN
    IF NEW.transaction_type = 'exchange' THEN
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (agency_owner_id, 'coin_exchange', 'Exchange Successful! ✨',
        'Converted ' || NEW.beans_amount::text || ' beans to ' || NEW.diamond_amount::text || ' diamonds.',
        jsonb_build_object('beans', NEW.beans_amount, 'diamonds', NEW.diamond_amount, 'fee', NEW.fee_amount));
    ELSIF NEW.transaction_type = 'send' AND NEW.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (agency_owner_id, 'diamond_sent', 'Diamonds Sent! 💎',
        'Successfully sent ' || NEW.diamond_amount::text || ' diamonds.',
        jsonb_build_object('amount', NEW.diamond_amount, 'receiver_id', NEW.user_id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_helper_level_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'approved' THEN
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (NEW.user_id, 'level_upgrade_approved', 'Level Upgrade Approved! 🎉',
        'Your upgrade to Level ' || NEW.requested_level::text || ' has been approved.',
        jsonb_build_object('level', NEW.requested_level));
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (NEW.user_id, 'level_upgrade_rejected', 'Level Upgrade Rejected',
        'Your level upgrade request has been rejected. ' || COALESCE(NEW.admin_notes, ''),
        jsonb_build_object('level', NEW.requested_level, 'reason', NEW.admin_notes));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_helper_on_admin_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _helper_user_id uuid;
BEGIN
  SELECT user_id INTO _helper_user_id FROM topup_helpers WHERE id = NEW.helper_id;
  IF _helper_user_id IS NOT NULL AND NEW.sender_type = 'admin' THEN
    INSERT INTO notifications (user_id, type, title, message, data, is_read)
    VALUES (_helper_user_id, 'admin_message', COALESCE(NEW.title, 'Admin Message'),
      COALESCE(NEW.message, ''),
      jsonb_build_object('message_id', NEW.id, 'priority', COALESCE(NEW.priority, 'normal')), false);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_helper_on_new_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _helper_user_id uuid;
BEGIN
  SELECT user_id INTO _helper_user_id FROM topup_helpers WHERE id = NEW.helper_id;
  IF _helper_user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (_helper_user_id, 'new_order', 'নতুন অর্ডার! 📦',
      'আপনার জন্য নতুন অর্ডার এসেছে। পরিমাণ: ' || NEW.amount::text,
      jsonb_build_object('order_id', NEW.id, 'amount', NEW.amount));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_gift_received() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  sender_name text;
  gift_name text;
BEGIN
  SELECT display_name INTO sender_name FROM profiles WHERE id = NEW.sender_id;
  SELECT name INTO gift_name FROM gifts WHERE id = NEW.gift_id;
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (NEW.receiver_id, 'gift_received', '🎁 Gift Received!',
    COALESCE(sender_name, 'Someone') || ' sent you ' || COALESCE(gift_name, 'a gift'),
    jsonb_build_object('gift_id', NEW.gift_id, 'sender_id', NEW.sender_id, 'amount', NEW.coin_amount));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_host_application_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'approved' THEN
      INSERT INTO notifications (user_id, type, title, message)
      VALUES (NEW.user_id, 'host_approved', '🎉 Host Application Approved!', 'Congratulations! You are now a host.');
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO notifications (user_id, type, title, message)
      VALUES (NEW.user_id, 'host_rejected', 'Host Application Update', 'Your host application was not approved.');
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_live_stream_started() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_new_follower() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  follower_name text;
BEGIN
  SELECT display_name INTO follower_name FROM profiles WHERE id = NEW.follower_id;
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (NEW.following_id, 'new_follower', '👤 New Follower!',
    COALESCE(follower_name, 'Someone') || ' started following you',
    jsonb_build_object('follower_id', NEW.follower_id));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_recharge_completed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (NEW.user_id, 'recharge_completed', '💰 Recharge Successful!',
      'Your recharge of ' || NEW.coins_amount::text || ' coins is complete.',
      jsonb_build_object('amount', NEW.coins_amount, 'transaction_id', NEW.id));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_withdrawal_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  agency_owner_id uuid;
BEGIN
  SELECT owner_id INTO agency_owner_id FROM agencies WHERE id = NEW.agency_id;
  IF OLD.status IS DISTINCT FROM NEW.status AND agency_owner_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (agency_owner_id, 'withdrawal_update', 'Withdrawal ' || NEW.status,
      'Your withdrawal of $' || NEW.amount::text || ' is now ' || NEW.status,
      jsonb_build_object('amount', NEW.amount, 'status', NEW.status));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_topup_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  helper_user_id uuid;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT user_id INTO helper_user_id FROM topup_helpers WHERE id = NEW.helper_id;
    IF helper_user_id IS NOT NULL THEN
      IF NEW.status = 'completed' THEN
        INSERT INTO notifications (user_id, type, title, message, data)
        VALUES (helper_user_id, 'topup_completed', 'টপআপ সম্পন্ন ✅',
          NEW.amount::text || ' টাকার টপআপ সম্পন্ন হয়েছে',
          jsonb_build_object('request_id', NEW.id, 'amount', NEW.amount));
      ELSIF NEW.status = 'rejected' THEN
        INSERT INTO notifications (user_id, type, title, message, data)
        VALUES (helper_user_id, 'topup_rejected', 'টপআপ বাতিল ❌',
          'আপনার টপআপ রিকোয়েস্ট বাতিল করা হয়েছে',
          jsonb_build_object('request_id', NEW.id, 'reason', NEW.admin_notes));
      END IF;
    END IF;
    IF NEW.status = 'completed' THEN
      INSERT INTO notifications (user_id, type, title, message, data)
      VALUES (NEW.user_id, 'topup_completed', 'টপআপ সম্পন্ন! 💰',
        NEW.amount::text || ' টাকার টপআপ পেয়েছেন',
        jsonb_build_object('request_id', NEW.id, 'amount', NEW.amount));
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_user_on_admin_reply() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  ticket_user_id uuid;
BEGIN
  IF NEW.sender_type = 'admin' THEN
    SELECT user_id INTO ticket_user_id FROM support_tickets WHERE id = NEW.ticket_id;
    IF ticket_user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, message, data)
      VALUES (ticket_user_id, 'support_reply', 'সাপোর্ট রিপ্লাই 💬',
        'আপনার টিকেটে নতুন রিপ্লাই এসেছে',
        jsonb_build_object('ticket_id', NEW.ticket_id, 'message_id', NEW.id));
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_balance_manipulation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF current_setting('app.bypass_profile_protection', true) = 'true' THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'UPDATE') THEN
    IF (NEW.coins IS DISTINCT FROM OLD.coins) OR
       (NEW.beans IS DISTINCT FROM OLD.beans) OR
       (NEW.pending_earnings IS DISTINCT FROM OLD.pending_earnings) OR
       (NEW.total_earnings IS DISTINCT FROM OLD.total_earnings) OR
       (NEW.total_consumption IS DISTINCT FROM OLD.total_consumption) THEN
      IF NOT (SELECT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc
        WHERE proname = current_setting('app.calling_function', true)
      )) THEN
        RAISE EXCEPTION 'Direct balance manipulation is not allowed. Use authorized RPC functions.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_negative_agency_balance() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.diamond_balance < 0 THEN
    RAISE EXCEPTION 'Agency diamond balance cannot be negative';
  END IF;
  IF NEW.beans_balance < 0 THEN
    RAISE EXCEPTION 'Agency beans balance cannot be negative';
  END IF;
  IF NEW.wallet_balance < 0 THEN
    RAISE EXCEPTION 'Agency wallet balance cannot be negative';
  END IF;
  RETURN NEW;
END;
$$;