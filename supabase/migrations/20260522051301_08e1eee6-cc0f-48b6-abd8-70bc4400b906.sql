
-- Pkg91: app_sync triggers for user-owned status tables
CREATE OR REPLACE FUNCTION public.tg_app_sync_face_verification_submissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.emit_app_sync_notification(COALESCE(NEW.user_id, OLD.user_id), 'face_verification_submissions', TG_OP, COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('status', COALESCE(NEW.status, OLD.status)));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_app_sync_face_verification_submissions ON public.face_verification_submissions;
CREATE TRIGGER tg_app_sync_face_verification_submissions
AFTER INSERT OR UPDATE ON public.face_verification_submissions
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_face_verification_submissions();

CREATE OR REPLACE FUNCTION public.tg_app_sync_host_applications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.emit_app_sync_notification(COALESCE(NEW.user_id, OLD.user_id), 'host_applications', TG_OP, COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('status', COALESCE(NEW.status, OLD.status)));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_app_sync_host_applications ON public.host_applications;
CREATE TRIGGER tg_app_sync_host_applications
AFTER INSERT OR UPDATE ON public.host_applications
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_host_applications();

CREATE OR REPLACE FUNCTION public.tg_app_sync_rating_reward_claims()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.emit_app_sync_notification(COALESCE(NEW.user_id, OLD.user_id), 'rating_reward_claims', TG_OP, COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('status', COALESCE(NEW.status, OLD.status)));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_app_sync_rating_reward_claims ON public.rating_reward_claims;
CREATE TRIGGER tg_app_sync_rating_reward_claims
AFTER INSERT OR UPDATE ON public.rating_reward_claims
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_rating_reward_claims();

CREATE OR REPLACE FUNCTION public.tg_app_sync_user_noble_subscriptions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.emit_app_sync_notification(COALESCE(NEW.user_id, OLD.user_id), 'user_noble_subscriptions', TG_OP, COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('is_active', COALESCE(NEW.is_active, OLD.is_active)));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_app_sync_user_noble_subscriptions ON public.user_noble_subscriptions;
CREATE TRIGGER tg_app_sync_user_noble_subscriptions
AFTER INSERT OR UPDATE OR DELETE ON public.user_noble_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_user_noble_subscriptions();

-- Support: fan out INSERT to ticket owner (skip if owner is the sender)
CREATE OR REPLACE FUNCTION public.tg_app_sync_support_messages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF v_owner IS NOT NULL AND v_owner <> NEW.sender_id THEN
    PERFORM public.emit_app_sync_notification(v_owner, 'support_messages', TG_OP, NEW.id::text,
      jsonb_build_object('ticket_id', NEW.ticket_id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_app_sync_support_messages ON public.support_messages;
CREATE TRIGGER tg_app_sync_support_messages
AFTER INSERT ON public.support_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_support_messages();

CREATE OR REPLACE FUNCTION public.tg_app_sync_support_tickets()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.emit_app_sync_notification(COALESCE(NEW.user_id, OLD.user_id), 'support_tickets', TG_OP, COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('status', COALESCE(NEW.status, OLD.status)));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_app_sync_support_tickets ON public.support_tickets;
CREATE TRIGGER tg_app_sync_support_tickets
AFTER INSERT OR UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_support_tickets();

-- Roulette: fan out to all distinct bettors in the session
CREATE OR REPLACE FUNCTION public.tg_app_sync_roulette_bets()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r RECORD;
BEGIN
  -- Notify bettor themselves
  PERFORM public.emit_app_sync_notification(NEW.user_id, 'roulette_bets', TG_OP, NEW.id::text,
    jsonb_build_object('session_id', NEW.session_id));
  -- Fan out to other distinct bettors in the session
  FOR r IN
    SELECT DISTINCT user_id FROM public.roulette_bets
    WHERE session_id = NEW.session_id AND user_id <> NEW.user_id
    LIMIT 30
  LOOP
    PERFORM public.emit_app_sync_notification(r.user_id, 'roulette_bets', TG_OP, NEW.id::text,
      jsonb_build_object('session_id', NEW.session_id));
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_app_sync_roulette_bets ON public.roulette_bets;
CREATE TRIGGER tg_app_sync_roulette_bets
AFTER INSERT ON public.roulette_bets
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_roulette_bets();

CREATE OR REPLACE FUNCTION public.tg_app_sync_roulette_sessions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id FROM public.roulette_bets
    WHERE session_id = COALESCE(NEW.id, OLD.id)
    LIMIT 30
  LOOP
    PERFORM public.emit_app_sync_notification(r.user_id, 'roulette_sessions', TG_OP, COALESCE(NEW.id, OLD.id)::text,
      jsonb_build_object('status', COALESCE(NEW.status, OLD.status), 'winning_number', NEW.winning_number, 'winning_color', NEW.winning_color));
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_app_sync_roulette_sessions ON public.roulette_sessions;
CREATE TRIGGER tg_app_sync_roulette_sessions
AFTER UPDATE ON public.roulette_sessions
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_roulette_sessions();
