CREATE OR REPLACE FUNCTION public.tg_rating_reward_alert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_display_name text;
  v_title text;
  v_message text;
  v_reward_label text;
BEGIN
  IF NOT (TG_OP = 'UPDATE'
          AND NEW.status IS DISTINCT FROM OLD.status
          AND NEW.status IN ('approved', 'rejected')) THEN
    RETURN NEW;
  END IF;

  -- profiles table only has display_name + username (no full_name).
  -- Previous version referenced p.full_name which broke approve/reject with
  -- "column p.full_name does not exist" (42703).
  SELECT au.email, COALESCE(NULLIF(p.display_name, ''), NULLIF(p.username, ''), au.email)
    INTO v_email, v_display_name
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.id = au.id
  WHERE au.id = NEW.user_id;

  v_reward_label := CASE
    WHEN NEW.reward_type = 'beans'    THEN '🫘 ' || COALESCE(NEW.reward_amount, 0)::text || ' Beans'
    WHEN NEW.reward_type = 'diamonds' THEN '💎 ' || COALESCE(NEW.reward_amount, 0)::text || ' Diamonds'
    ELSE ''
  END;

  IF NEW.status = 'approved' THEN
    v_title := '🎉 Rating Reward Approved!';
    v_message := 'Your Play Store rating has been verified. '
              || v_reward_label
              || ' have been credited to your account. Thank you for your support!';
  ELSE
    v_title := '❌ Rating Reward Rejected';
    v_message := COALESCE(NULLIF(NEW.rejection_reason, ''),
                          'Your Play Store rating screenshot was not approved.')
              || ' Please submit a fresh screenshot showing all 5 stars selected on the Merilive Play Store page.';
  END IF;

  BEGIN
    INSERT INTO public.notifications (user_id, title, message, type, data)
    VALUES (
      NEW.user_id, v_title, v_message, 'system',
      jsonb_build_object(
        'kind',           'rating_reward_decision',
        'claim_id',       NEW.id,
        'status',         NEW.status,
        'reward_type',    NEW.reward_type,
        'reward_amount',  NEW.reward_amount,
        'rejection_reason', NEW.rejection_reason
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tg_rating_reward_alert notifications insert failed: %', SQLERRM;
  END;

  IF v_email IS NOT NULL AND v_email <> '' THEN
    BEGIN
      PERFORM net.http_post(
        url := 'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/send-transactional-email',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'templateName',   'rating-reward-decision',
          'recipientEmail', v_email,
          'idempotencyKey', 'rating-reward-' || NEW.id::text || '-' || NEW.status,
          'templateData',   jsonb_build_object(
            'displayName',      v_display_name,
            'status',           NEW.status,
            'rewardType',       NEW.reward_type,
            'rewardAmount',     NEW.reward_amount,
            'rejectionReason',  NEW.rejection_reason
          )
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'tg_rating_reward_alert email post failed: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;