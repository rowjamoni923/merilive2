CREATE OR REPLACE FUNCTION public.tg_block_dm_to_offline_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
  v_recipient_availability text;
  v_caller_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF v_caller_role = 'service_role' THEN
    RETURN NEW;
  END IF;

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

  -- Bypass if sender is admin (column is user_id, not linked_user_id)
  IF EXISTS (SELECT 1 FROM public.admin_users au
              WHERE au.user_id = NEW.sender_id AND au.is_active = true) THEN
    RETURN NEW;
  END IF;

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