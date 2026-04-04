-- Function to create notification
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_id uuid;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
  VALUES (p_user_id, p_type, p_title, p_message, p_data, false)
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$;

-- Trigger for coin top-up approval (helper_topup_requests)
CREATE OR REPLACE FUNCTION public.notify_topup_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger when status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'completed' OR NEW.status = 'approved' THEN
      -- Notify user about approved top-up
      PERFORM public.create_notification(
        NEW.user_id,
        'topup_approved',
        'Top-up Approved! 💎',
        'Your top-up of ' || NEW.coin_amount::text || ' coins has been approved.',
        jsonb_build_object('amount', NEW.coin_amount, 'payment_method', NEW.payment_method)
      );
    ELSIF NEW.status = 'rejected' THEN
      -- Notify user about rejected top-up
      PERFORM public.create_notification(
        NEW.user_id,
        'topup_rejected',
        'Top-up Rejected',
        'Your top-up request has been rejected. Please contact support for more information.',
        jsonb_build_object('amount', NEW.coin_amount, 'reason', NEW.admin_notes)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_topup_status_notification ON public.helper_topup_requests;
CREATE TRIGGER trigger_topup_status_notification
  AFTER UPDATE ON public.helper_topup_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_topup_status_change();

-- Trigger for agency withdrawal status
CREATE OR REPLACE FUNCTION public.notify_agency_withdrawal_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  agency_owner_id uuid;
BEGIN
  -- Get agency owner
  SELECT owner_id INTO agency_owner_id FROM public.agencies WHERE id = NEW.agency_id;
  
  IF OLD.status IS DISTINCT FROM NEW.status AND agency_owner_id IS NOT NULL THEN
    IF NEW.status = 'completed' OR NEW.status = 'approved' THEN
      PERFORM public.create_notification(
        agency_owner_id,
        'withdrawal_approved',
        'Withdrawal Approved! ✅',
        'Your withdrawal of $' || NEW.amount::text || ' has been approved and processed.',
        jsonb_build_object('amount', NEW.amount, 'payment_method', NEW.payment_method)
      );
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.create_notification(
        agency_owner_id,
        'withdrawal_rejected',
        'Withdrawal Rejected',
        'Your withdrawal request has been rejected. Reason: ' || COALESCE(NEW.notes, 'Not specified'),
        jsonb_build_object('amount', NEW.amount, 'reason', NEW.notes)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_agency_withdrawal_notification ON public.agency_withdrawals;
CREATE TRIGGER trigger_agency_withdrawal_notification
  AFTER UPDATE ON public.agency_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_agency_withdrawal_status();

-- Trigger for coin transfers (when trader sends coins to user)
CREATE OR REPLACE FUNCTION public.notify_coin_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Notify receiver about received coins
  IF NEW.sender_type = 'trader_to_user' OR NEW.sender_type = 'trader_to_agency' THEN
    PERFORM public.create_notification(
      NEW.receiver_id,
      'coins_received',
      'Coins Received! 💎',
      'You have received ' || NEW.amount::text || ' diamonds.',
      jsonb_build_object('amount', NEW.amount, 'sender_id', NEW.sender_id, 'transfer_type', NEW.sender_type)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_coin_transfer_notification ON public.coin_transfers;
CREATE TRIGGER trigger_coin_transfer_notification
  AFTER INSERT ON public.coin_transfers
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_coin_transfer();

-- Trigger for agency diamond exchange
CREATE OR REPLACE FUNCTION public.notify_diamond_exchange()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  agency_owner_id uuid;
BEGIN
  -- Get agency owner
  SELECT owner_id INTO agency_owner_id FROM public.agencies WHERE id = NEW.agency_id;
  
  IF agency_owner_id IS NOT NULL THEN
    IF NEW.transaction_type = 'exchange' THEN
      PERFORM public.create_notification(
        agency_owner_id,
        'coin_exchange',
        'Exchange Successful! ✨',
        'Converted ' || NEW.beans_amount::text || ' beans to ' || NEW.diamond_amount::text || ' diamonds.',
        jsonb_build_object('beans', NEW.beans_amount, 'diamonds', NEW.diamond_amount, 'fee', NEW.fee_amount)
      );
    ELSIF NEW.transaction_type = 'send' AND NEW.user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        agency_owner_id,
        'diamond_sent',
        'Diamonds Sent! 💎',
        'Successfully sent ' || NEW.diamond_amount::text || ' diamonds.',
        jsonb_build_object('amount', NEW.diamond_amount, 'receiver_id', NEW.user_id)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_diamond_exchange_notification ON public.agency_diamond_transactions;
CREATE TRIGGER trigger_diamond_exchange_notification
  AFTER INSERT ON public.agency_diamond_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_diamond_exchange();

-- Trigger for helper level upgrade approval
CREATE OR REPLACE FUNCTION public.notify_helper_level_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM public.create_notification(
        NEW.user_id,
        'level_upgrade_approved',
        'Level Upgrade Approved! 🎉',
        'Your upgrade to Level ' || NEW.requested_level::text || ' has been approved.',
        jsonb_build_object('level', NEW.requested_level)
      );
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.create_notification(
        NEW.user_id,
        'level_upgrade_rejected',
        'Level Upgrade Rejected',
        'Your level upgrade request has been rejected. ' || COALESCE(NEW.admin_notes, ''),
        jsonb_build_object('level', NEW.requested_level, 'reason', NEW.admin_notes)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_helper_level_notification ON public.helper_applications;
CREATE TRIGGER trigger_helper_level_notification
  AFTER UPDATE ON public.helper_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_helper_level_change();