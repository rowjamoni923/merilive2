
-- 1. Notification trigger for shop purchases
CREATE OR REPLACE FUNCTION public.notify_on_shop_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _item_name TEXT;
  _item_type TEXT;
BEGIN
  _item_type := COALESCE(NEW.item_type, 'item');
  
  -- Try to get item name from various shop tables
  SELECT name INTO _item_name FROM public.avatar_frames WHERE id = NEW.item_id;
  IF _item_name IS NULL THEN
    SELECT name INTO _item_name FROM public.ar_stickers WHERE id = NEW.item_id;
  END IF;
  IF _item_name IS NULL THEN
    _item_name := initcap(replace(_item_type, '_', ' '));
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.user_id,
    'reward',
    '🛍️ Purchase Successful!',
    'You purchased ' || _item_name || ' for ' || COALESCE(NEW.price_paid, 0) || ' ' || COALESCE(NEW.currency_type, 'coins'),
    jsonb_build_object(
      'item_id', NEW.item_id,
      'item_type', _item_type,
      'item_name', _item_name,
      'price', COALESCE(NEW.price_paid, 0),
      'currency', COALESCE(NEW.currency_type, 'coins'),
      'action_url', '/shop'
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_shop_purchase ON public.user_purchases;
CREATE TRIGGER trigger_notify_shop_purchase
  AFTER INSERT ON public.user_purchases
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_shop_purchase();

-- 2. Notification trigger for missed calls
CREATE OR REPLACE FUNCTION public.notify_on_missed_call()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _caller_name TEXT;
BEGIN
  -- Only trigger on status = 'missed' or 'no_answer'
  IF NEW.status NOT IN ('missed', 'no_answer', 'rejected') THEN
    RETURN NEW;
  END IF;
  
  -- For UPDATE, only fire when status actually changed
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(display_name, 'Someone') INTO _caller_name
  FROM public.profiles WHERE id = NEW.caller_id;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.receiver_id,
    'call_missed',
    '📞 Missed Call',
    'You missed a ' || COALESCE(NEW.call_type, 'video') || ' call from ' || _caller_name,
    jsonb_build_object(
      'caller_id', NEW.caller_id,
      'caller_name', _caller_name,
      'call_type', COALESCE(NEW.call_type, 'video'),
      'call_id', COALESCE(NEW.call_id, NEW.id),
      'action_url', '/call-history'
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_missed_call ON public.call_events;
CREATE TRIGGER trigger_notify_missed_call
  AFTER INSERT OR UPDATE ON public.call_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_missed_call();

-- 3. Notification trigger for incoming calls (for push notification with ringtone)
CREATE OR REPLACE FUNCTION public.notify_on_incoming_call()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _caller_name TEXT;
  _caller_avatar TEXT;
BEGIN
  IF NEW.status <> 'ringing' AND NEW.event_type <> 'call_initiated' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(display_name, 'Someone'), avatar_url INTO _caller_name, _caller_avatar
  FROM public.profiles WHERE id = NEW.caller_id;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.receiver_id,
    'call_received',
    '📞 Incoming Call',
    _caller_name || ' is calling you...',
    jsonb_build_object(
      'caller_id', NEW.caller_id,
      'caller_name', _caller_name,
      'caller_avatar', COALESCE(_caller_avatar, ''),
      'call_type', COALESCE(NEW.call_type, 'video'),
      'call_id', COALESCE(NEW.call_id, NEW.id),
      'type', 'incoming_call'
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_incoming_call ON public.call_events;
CREATE TRIGGER trigger_notify_incoming_call
  AFTER INSERT ON public.call_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_incoming_call();

-- 4. Notification preferences table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  sound_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, category)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences"
  ON public.notification_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own preferences"
  ON public.notification_preferences FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Check notification preference before inserting notification
-- This replaces the simple insert with a preference-aware version
CREATE OR REPLACE FUNCTION public.check_notification_preference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _category TEXT;
  _enabled BOOLEAN;
BEGIN
  -- Map notification type to category
  _category := CASE
    WHEN NEW.type IN ('gift', 'gift_received', 'gift_sent') THEN 'gifts'
    WHEN NEW.type IN ('call_missed', 'call_received') THEN 'calls'
    WHEN NEW.type IN ('new_follower', 'follow') THEN 'social'
    WHEN NEW.type IN ('live_started', 'party_invite', 'room_joined') THEN 'live'
    WHEN NEW.type IN ('coins_added', 'coin_purchase_helper', 'coin_purchase_direct', 'topup_approved', 'topup_rejected', 'diamonds_credited', 'coins_received', 'payment_completed') THEN 'transactions'
    WHEN NEW.type IN ('withdrawal', 'withdrawal_approved', 'withdrawal_rejected') THEN 'transactions'
    WHEN NEW.type IN ('level_up', 'reward', 'task_completed', 'daily_bonus') THEN 'rewards'
    WHEN NEW.type IN ('admin_message', 'admin_message_reply', 'system', 'security') THEN 'system'
    WHEN NEW.type IN ('beans_exchanged', 'balance_deducted', 'coin_exchange', 'diamond_sent') THEN 'transactions'
    WHEN NEW.type LIKE 'agency_%' THEN 'agency'
    WHEN NEW.type LIKE 'helper_%' OR NEW.type IN ('payroll_approved', 'payroll_rejected', 'new_topup_order', 'order_completed') THEN 'helper'
    WHEN NEW.type IN ('host_approved', 'host_rejected', 'host_application') THEN 'host'
    ELSE 'general'
  END;

  -- Check if user has disabled this category
  SELECT enabled INTO _enabled
  FROM public.notification_preferences
  WHERE user_id = NEW.user_id AND category = _category;

  -- If preference exists and is disabled, prevent insert
  IF _enabled IS NOT NULL AND _enabled = false THEN
    RETURN NULL; -- Cancel the insert
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_notification_preference ON public.notifications;
CREATE TRIGGER trigger_check_notification_preference
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.check_notification_preference();

-- Add realtime for notification_preferences
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_preferences;
