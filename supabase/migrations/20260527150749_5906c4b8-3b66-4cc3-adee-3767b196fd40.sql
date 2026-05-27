-- Pkg366: Universal admin-action → user notification triggers
-- Detect admin-initiated mutations across key tables and emit an in-app notification
-- to the affected user. Works for ALL admin RPCs without editing each one individually.
-- Detection: current_admin_id_from_header() returns non-null only when request carries
-- a valid x-admin-token. Service-role / cron / user-initiated paths are skipped.

-- ============================================================================
-- 1. Shared helper: best-effort notification insert (never blocks the txn)
-- ============================================================================
CREATE OR REPLACE FUNCTION public._pkg366_notify_user(
  _user_id uuid,
  _title text,
  _message text,
  _type text,
  _data jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  BEGIN
    INSERT INTO public.notifications (user_id, title, message, type, data)
    VALUES (_user_id, COALESCE(_title,'Update'), COALESCE(_message,''), COALESCE(_type,'admin_action'), _data);
  EXCEPTION WHEN OTHERS THEN
    -- never block the underlying admin action
    NULL;
  END;
END $$;

REVOKE ALL ON FUNCTION public._pkg366_notify_user(uuid,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. Helper: is the current transaction admin-initiated?
-- ============================================================================
CREATE OR REPLACE FUNCTION public._pkg366_is_admin_ctx() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin uuid;
BEGIN
  BEGIN
    v_admin := public.current_admin_id_from_header();
  EXCEPTION WHEN OTHERS THEN
    v_admin := NULL;
  END;
  RETURN v_admin IS NOT NULL;
END $$;

REVOKE ALL ON FUNCTION public._pkg366_is_admin_ctx() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. profiles: financial + status changes by admin
-- ============================================================================
CREATE OR REPLACE FUNCTION public._pkg366_tg_profiles_admin_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_delta bigint;
  v_fld text;
BEGIN
  IF NOT public._pkg366_is_admin_ctx() THEN RETURN NEW; END IF;

  -- coins
  IF COALESCE(NEW.coins,0) <> COALESCE(OLD.coins,0) THEN
    v_delta := COALESCE(NEW.coins,0) - COALESCE(OLD.coins,0);
    PERFORM public._pkg366_notify_user(
      NEW.id,
      CASE WHEN v_delta>0 THEN 'Coins Credited' ELSE 'Coins Debited' END,
      'Admin '||CASE WHEN v_delta>0 THEN 'added' ELSE 'deducted' END||' '||abs(v_delta)||' coins. New balance: '||NEW.coins,
      CASE WHEN v_delta>0 THEN 'admin_credit' ELSE 'admin_debit' END,
      jsonb_build_object('field','coins','delta',v_delta,'new_balance',NEW.coins)
    );
  END IF;

  -- beans
  IF COALESCE(NEW.beans,0) <> COALESCE(OLD.beans,0) THEN
    v_delta := COALESCE(NEW.beans,0) - COALESCE(OLD.beans,0);
    PERFORM public._pkg366_notify_user(
      NEW.id,
      CASE WHEN v_delta>0 THEN 'Beans Credited' ELSE 'Beans Debited' END,
      'Admin '||CASE WHEN v_delta>0 THEN 'added' ELSE 'deducted' END||' '||abs(v_delta)||' beans. New balance: '||NEW.beans,
      CASE WHEN v_delta>0 THEN 'admin_credit' ELSE 'admin_debit' END,
      jsonb_build_object('field','beans','delta',v_delta,'new_balance',NEW.beans)
    );
  END IF;

  -- diamonds
  IF COALESCE(NEW.diamonds,0) <> COALESCE(OLD.diamonds,0) THEN
    v_delta := COALESCE(NEW.diamonds,0) - COALESCE(OLD.diamonds,0);
    PERFORM public._pkg366_notify_user(
      NEW.id,
      CASE WHEN v_delta>0 THEN 'Diamonds Credited' ELSE 'Diamonds Debited' END,
      'Admin '||CASE WHEN v_delta>0 THEN 'added' ELSE 'deducted' END||' '||abs(v_delta)||' diamonds. New balance: '||NEW.diamonds,
      CASE WHEN v_delta>0 THEN 'admin_credit' ELSE 'admin_debit' END,
      jsonb_build_object('field','diamonds','delta',v_delta,'new_balance',NEW.diamonds)
    );
  END IF;

  -- is_blocked
  IF COALESCE(NEW.is_blocked,false) <> COALESCE(OLD.is_blocked,false) THEN
    PERFORM public._pkg366_notify_user(
      NEW.id,
      CASE WHEN NEW.is_blocked THEN 'Account Blocked' ELSE 'Account Unblocked' END,
      CASE WHEN NEW.is_blocked THEN 'Your account has been blocked by admin.'||COALESCE(' Reason: '||NEW.blocked_reason,'')
           ELSE 'Your account has been unblocked. You can now use the app normally.' END,
      'admin_action',
      jsonb_build_object('field','is_blocked','value',NEW.is_blocked,'reason',NEW.blocked_reason)
    );
  END IF;

  -- is_banned
  IF COALESCE(NEW.is_banned,false) <> COALESCE(OLD.is_banned,false) THEN
    PERFORM public._pkg366_notify_user(
      NEW.id,
      CASE WHEN NEW.is_banned THEN 'Account Banned' ELSE 'Ban Lifted' END,
      CASE WHEN NEW.is_banned THEN 'Your account has been banned by admin.'
           ELSE 'Your ban has been lifted. Welcome back.' END,
      'admin_action',
      jsonb_build_object('field','is_banned','value',NEW.is_banned)
    );
  END IF;

  -- host_status
  IF COALESCE(NEW.host_status,'') <> COALESCE(OLD.host_status,'') THEN
    PERFORM public._pkg366_notify_user(
      NEW.id,
      'Host Status Updated',
      'Your host status changed to: '||COALESCE(NEW.host_status,'(none)'),
      'admin_action',
      jsonb_build_object('field','host_status','old',OLD.host_status,'new',NEW.host_status)
    );
  END IF;

  -- is_face_verified
  IF COALESCE(NEW.is_face_verified,false) <> COALESCE(OLD.is_face_verified,false) THEN
    PERFORM public._pkg366_notify_user(
      NEW.id,
      CASE WHEN NEW.is_face_verified THEN 'Face Verified' ELSE 'Face Verification Revoked' END,
      CASE WHEN NEW.is_face_verified THEN 'Your face verification was approved by admin.'
           ELSE 'Your face verification was revoked by admin.' END,
      'admin_action',
      jsonb_build_object('field','is_face_verified','value',NEW.is_face_verified)
    );
  END IF;

  -- call_rate_per_minute
  IF COALESCE(NEW.call_rate_per_minute,0) <> COALESCE(OLD.call_rate_per_minute,0) THEN
    PERFORM public._pkg366_notify_user(
      NEW.id,
      'Call Rate Updated',
      'Admin set your call rate to '||NEW.call_rate_per_minute||' coins/min.',
      'admin_action',
      jsonb_build_object('field','call_rate_per_minute','value',NEW.call_rate_per_minute)
    );
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pkg366_profiles_admin_notify ON public.profiles;
CREATE TRIGGER pkg366_profiles_admin_notify
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public._pkg366_tg_profiles_admin_notify();

-- ============================================================================
-- 4. agencies: balance/level/active changes by admin → notify owner
-- ============================================================================
CREATE OR REPLACE FUNCTION public._pkg366_tg_agencies_admin_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_delta bigint;
BEGIN
  IF NOT public._pkg366_is_admin_ctx() THEN RETURN NEW; END IF;
  IF NEW.owner_id IS NULL THEN RETURN NEW; END IF;

  IF COALESCE(NEW.beans_balance,0) <> COALESCE(OLD.beans_balance,0) THEN
    v_delta := COALESCE(NEW.beans_balance,0) - COALESCE(OLD.beans_balance,0);
    PERFORM public._pkg366_notify_user(NEW.owner_id,
      'Agency Beans Updated',
      'Admin '||CASE WHEN v_delta>0 THEN 'added' ELSE 'deducted' END||' '||abs(v_delta)||' agency beans. New balance: '||NEW.beans_balance,
      CASE WHEN v_delta>0 THEN 'admin_credit' ELSE 'admin_debit' END,
      jsonb_build_object('field','beans_balance','delta',v_delta,'agency_id',NEW.id));
  END IF;

  IF COALESCE(NEW.diamond_balance,0) <> COALESCE(OLD.diamond_balance,0) THEN
    v_delta := COALESCE(NEW.diamond_balance,0) - COALESCE(OLD.diamond_balance,0);
    PERFORM public._pkg366_notify_user(NEW.owner_id,
      'Agency Diamonds Updated',
      'Admin '||CASE WHEN v_delta>0 THEN 'added' ELSE 'deducted' END||' '||abs(v_delta)||' agency diamonds. New balance: '||NEW.diamond_balance,
      CASE WHEN v_delta>0 THEN 'admin_credit' ELSE 'admin_debit' END,
      jsonb_build_object('field','diamond_balance','delta',v_delta,'agency_id',NEW.id));
  END IF;

  IF COALESCE(NEW.wallet_balance,0) <> COALESCE(OLD.wallet_balance,0) THEN
    v_delta := COALESCE(NEW.wallet_balance,0) - COALESCE(OLD.wallet_balance,0);
    PERFORM public._pkg366_notify_user(NEW.owner_id,
      'Agency Wallet Updated',
      'Admin '||CASE WHEN v_delta>0 THEN 'added' ELSE 'deducted' END||' '||abs(v_delta)||' to agency wallet. New balance: '||NEW.wallet_balance,
      CASE WHEN v_delta>0 THEN 'admin_credit' ELSE 'admin_debit' END,
      jsonb_build_object('field','wallet_balance','delta',v_delta,'agency_id',NEW.id));
  END IF;

  IF COALESCE(NEW.level::text,'') <> COALESCE(OLD.level::text,'') THEN
    PERFORM public._pkg366_notify_user(NEW.owner_id,
      'Agency Level Updated',
      'Admin updated your agency level to: '||COALESCE(NEW.level::text,'(none)'),
      'admin_action',
      jsonb_build_object('field','level','old',OLD.level,'new',NEW.level,'agency_id',NEW.id));
  END IF;

  IF COALESCE(NEW.is_active,true) <> COALESCE(OLD.is_active,true) THEN
    PERFORM public._pkg366_notify_user(NEW.owner_id,
      CASE WHEN NEW.is_active THEN 'Agency Reactivated' ELSE 'Agency Deactivated' END,
      CASE WHEN NEW.is_active THEN 'Your agency has been reactivated by admin.'
           ELSE 'Your agency has been deactivated by admin.' END,
      'admin_action',
      jsonb_build_object('field','is_active','value',NEW.is_active,'agency_id',NEW.id));
  END IF;

  IF COALESCE(NEW.is_blocked,false) <> COALESCE(OLD.is_blocked,false) THEN
    PERFORM public._pkg366_notify_user(NEW.owner_id,
      CASE WHEN NEW.is_blocked THEN 'Agency Blocked' ELSE 'Agency Unblocked' END,
      'Admin '||CASE WHEN NEW.is_blocked THEN 'blocked' ELSE 'unblocked' END||' your agency.',
      'admin_action',
      jsonb_build_object('field','is_blocked','value',NEW.is_blocked,'agency_id',NEW.id));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pkg366_agencies_admin_notify ON public.agencies;
CREATE TRIGGER pkg366_agencies_admin_notify
AFTER UPDATE ON public.agencies
FOR EACH ROW EXECUTE FUNCTION public._pkg366_tg_agencies_admin_notify();

-- ============================================================================
-- 5. host_applications: status change by admin
-- ============================================================================
CREATE OR REPLACE FUNCTION public._pkg366_tg_host_app_admin_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public._pkg366_is_admin_ctx() THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status,'') = COALESCE(OLD.status,'') THEN RETURN NEW; END IF;
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  PERFORM public._pkg366_notify_user(NEW.user_id,
    CASE NEW.status
      WHEN 'approved' THEN 'Host Application Approved'
      WHEN 'rejected' THEN 'Host Application Rejected'
      ELSE 'Host Application Updated'
    END,
    CASE NEW.status
      WHEN 'approved' THEN 'Congrats! Your host application was approved.'
      WHEN 'rejected' THEN 'Your host application was rejected by admin.'
      ELSE 'Your host application status: '||NEW.status
    END,
    'admin_action',
    jsonb_build_object('status',NEW.status,'application_id',NEW.id));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pkg366_host_app_admin_notify ON public.host_applications;
CREATE TRIGGER pkg366_host_app_admin_notify
AFTER UPDATE ON public.host_applications
FOR EACH ROW EXECUTE FUNCTION public._pkg366_tg_host_app_admin_notify();

-- ============================================================================
-- 6. face_verification_submissions: review by admin
-- ============================================================================
CREATE OR REPLACE FUNCTION public._pkg366_tg_face_admin_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public._pkg366_is_admin_ctx() THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status,'') = COALESCE(OLD.status,'') THEN RETURN NEW; END IF;
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  PERFORM public._pkg366_notify_user(NEW.user_id,
    CASE NEW.status
      WHEN 'approved' THEN 'Face Verification Approved'
      WHEN 'rejected' THEN 'Face Verification Rejected'
      WHEN 'under_review' THEN 'Face Verification Under Review'
      ELSE 'Face Verification Updated'
    END,
    CASE NEW.status
      WHEN 'approved' THEN 'Your face verification was approved.'
      WHEN 'rejected' THEN 'Your face verification was rejected. Please re-submit.'
      WHEN 'under_review' THEN 'Your face verification is being reviewed.'
      ELSE 'Face verification status: '||NEW.status
    END,
    'admin_action',
    jsonb_build_object('status',NEW.status,'submission_id',NEW.id));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pkg366_face_admin_notify ON public.face_verification_submissions;
CREATE TRIGGER pkg366_face_admin_notify
AFTER UPDATE ON public.face_verification_submissions
FOR EACH ROW EXECUTE FUNCTION public._pkg366_tg_face_admin_notify();

-- ============================================================================
-- 7. agency_withdrawals: status change by admin/helper
-- ============================================================================
CREATE OR REPLACE FUNCTION public._pkg366_tg_agency_wd_admin_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF NOT public._pkg366_is_admin_ctx() THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status,'') = COALESCE(OLD.status,'') THEN RETURN NEW; END IF;
  SELECT owner_id INTO v_owner FROM public.agencies WHERE id = NEW.agency_id;
  IF v_owner IS NULL THEN RETURN NEW; END IF;

  PERFORM public._pkg366_notify_user(v_owner,
    'Withdrawal '||initcap(NEW.status),
    'Your agency withdrawal request was '||NEW.status||'.',
    'admin_action',
    jsonb_build_object('withdrawal_id',NEW.id,'status',NEW.status,'amount',NEW.amount));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pkg366_agency_wd_admin_notify ON public.agency_withdrawals;
CREATE TRIGGER pkg366_agency_wd_admin_notify
AFTER UPDATE ON public.agency_withdrawals
FOR EACH ROW EXECUTE FUNCTION public._pkg366_tg_agency_wd_admin_notify();

-- ============================================================================
-- 8. helper_topup_requests: approve/reject by admin
-- ============================================================================
CREATE OR REPLACE FUNCTION public._pkg366_tg_helper_topup_admin_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  IF NOT public._pkg366_is_admin_ctx() THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status,'') = COALESCE(OLD.status,'') THEN RETURN NEW; END IF;
  SELECT user_id INTO v_user FROM public.topup_helpers WHERE id = NEW.helper_id;
  IF v_user IS NULL THEN RETURN NEW; END IF;

  PERFORM public._pkg366_notify_user(v_user,
    'Top-up Request '||initcap(NEW.status),
    'Your top-up request was '||NEW.status||'.',
    'admin_action',
    jsonb_build_object('request_id',NEW.id,'status',NEW.status));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pkg366_helper_topup_admin_notify ON public.helper_topup_requests;
CREATE TRIGGER pkg366_helper_topup_admin_notify
AFTER UPDATE ON public.helper_topup_requests
FOR EACH ROW EXECUTE FUNCTION public._pkg366_tg_helper_topup_admin_notify();

-- ============================================================================
-- 9. topup_helpers: level/active changes by admin
-- ============================================================================
CREATE OR REPLACE FUNCTION public._pkg366_tg_topup_helpers_admin_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public._pkg366_is_admin_ctx() THEN RETURN NEW; END IF;
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  IF COALESCE(NEW.trader_level,0) <> COALESCE(OLD.trader_level,0) THEN
    PERFORM public._pkg366_notify_user(NEW.user_id,
      'Helper Level Updated',
      'Admin set your helper level to L'||NEW.trader_level,
      'admin_action',
      jsonb_build_object('field','trader_level','value',NEW.trader_level));
  END IF;

  IF COALESCE(NEW.is_active,false) <> COALESCE(OLD.is_active,false) THEN
    PERFORM public._pkg366_notify_user(NEW.user_id,
      CASE WHEN NEW.is_active THEN 'Helper Activated' ELSE 'Helper Deactivated' END,
      'Admin '||CASE WHEN NEW.is_active THEN 'activated' ELSE 'deactivated' END||' your helper account.',
      'admin_action',
      jsonb_build_object('field','is_active','value',NEW.is_active));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pkg366_topup_helpers_admin_notify ON public.topup_helpers;
CREATE TRIGGER pkg366_topup_helpers_admin_notify
AFTER UPDATE ON public.topup_helpers
FOR EACH ROW EXECUTE FUNCTION public._pkg366_tg_topup_helpers_admin_notify();