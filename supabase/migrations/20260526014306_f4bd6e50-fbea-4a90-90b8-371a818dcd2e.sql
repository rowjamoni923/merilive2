-- Pkg360: Unified admin balance adjust RPC
-- Routes ALL admin balance add/deduct through a single SECURITY DEFINER function
-- that (1) verifies the admin session via x-admin-token header, (2) checks the
-- required section permission, (3) sets app.bypass_profile_protection for
-- guarded profile column updates, (4) writes admin_logs, and (5) returns the
-- new balance so the UI can show it instantly.
--
-- Background:
--   AdminBalanceDeduction.tsx was doing direct `.update()` on `profiles` and
--   `topup_helpers`. `profiles.coins/beans/diamonds/total_earnings/...` are
--   locked by `protect_sensitive_profile_columns` trigger (Pkg338), and
--   `topup_helpers` has NO client write policies — so every add/deduct was
--   silently rejected. This RPC fixes both paths in one shot.

CREATE OR REPLACE FUNCTION public.admin_adjust_balance(
  _target_type text,   -- 'profile' | 'helper' | 'agency'
  _target_id   uuid,
  _field       text,   -- whitelisted per target_type below
  _delta       bigint, -- positive = add, negative = deduct; result clamped >=0
  _reason      text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid := public.current_admin_id_from_header();
  v_new      bigint;
  v_old      bigint;
  v_db_field text;
BEGIN
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated as admin');
  END IF;

  -- Section gate: finance/topup/user-mgmt OR (for agency) agency-management.
  -- Owners (role='owner') pass `admin_has_any_section_permission` automatically.
  IF _target_type = 'agency' THEN
    IF NOT public.admin_has_any_section_permission(
      ARRAY['agency-management','finance-hub','manual-topup','topup-system'], true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized for agency balance');
    END IF;
  ELSE
    IF NOT public.admin_has_any_section_permission(
      ARRAY['manual-topup','topup-system','finance-hub','user-management'], true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized for balance changes');
    END IF;
  END IF;

  IF _delta IS NULL OR _delta = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Delta must be non-zero');
  END IF;
  IF abs(_delta) > 10000000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount too large');
  END IF;
  IF _target_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing target id');
  END IF;

  -- ===== PROFILE (users / hosts) =====
  IF _target_type = 'profile' THEN
    v_db_field := CASE _field
      WHEN 'coins'             THEN 'coins'
      WHEN 'beans'             THEN 'beans'
      WHEN 'diamonds'          THEN 'diamonds'
      WHEN 'total_earnings'    THEN 'total_earnings'
      WHEN 'pending_earnings'  THEN 'pending_earnings'
      WHEN 'weekly_earnings'   THEN 'weekly_earnings'
      WHEN 'beans_balance'     THEN 'beans_balance'
      ELSE NULL
    END;
    IF v_db_field IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid profile field');
    END IF;

    -- Bypass the protect_sensitive_profile_columns trigger for this txn only.
    PERFORM set_config('app.bypass_profile_protection', 'true', true);

    EXECUTE format(
      'UPDATE public.profiles
         SET %1$I = GREATEST(COALESCE(%1$I,0) + $1, 0),
             updated_at = now()
       WHERE id = $2
       RETURNING COALESCE(%1$I,0), COALESCE(%1$I,0) - $1', v_db_field
    ) INTO v_new, v_old USING _delta, _target_id;

    IF v_new IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

  -- ===== HELPER (topup_helpers) =====
  ELSIF _target_type = 'helper' THEN
    v_db_field := CASE _field
      WHEN 'wallet_balance'  THEN 'wallet_balance'
      WHEN 'total_earnings'  THEN 'total_earnings'
      ELSE NULL
    END;
    IF v_db_field IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid helper field');
    END IF;

    EXECUTE format(
      'UPDATE public.topup_helpers
         SET %1$I = GREATEST(COALESCE(%1$I,0) + $1, 0),
             updated_at = now()
       WHERE id = $2
       RETURNING COALESCE(%1$I,0), COALESCE(%1$I,0) - $1', v_db_field
    ) INTO v_new, v_old USING _delta, _target_id;

    IF v_new IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Helper not found');
    END IF;

  -- ===== AGENCY =====
  ELSIF _target_type = 'agency' THEN
    v_db_field := CASE _field
      WHEN 'beans_balance'    THEN 'beans_balance'
      WHEN 'diamond_balance'  THEN 'diamond_balance'
      WHEN 'wallet_balance'   THEN 'wallet_balance'
      ELSE NULL
    END;
    IF v_db_field IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid agency field');
    END IF;

    -- The agencies guard triggers honor the same bypass flag.
    PERFORM set_config('app.bypass_profile_protection', 'true', true);

    EXECUTE format(
      'UPDATE public.agencies
         SET %1$I = GREATEST(COALESCE(%1$I,0) + $1, 0),
             updated_at = now()
       WHERE id = $2
       RETURNING COALESCE(%1$I,0), COALESCE(%1$I,0) - $1', v_db_field
    ) INTO v_new, v_old USING _delta, _target_id;

    IF v_new IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
    END IF;

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid target type');
  END IF;

  -- Audit log (best-effort; never blocks)
  BEGIN
    INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
    VALUES (
      v_admin_id,
      CASE WHEN _delta > 0 THEN 'balance_add' ELSE 'balance_deduct' END,
      _target_type,
      _target_id,
      jsonb_build_object(
        'field', v_db_field,
        'delta', _delta,
        'old_balance', v_old,
        'new_balance', v_new,
        'reason', _reason
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new,
    'old_balance', v_old,
    'delta', _delta,
    'field', v_db_field
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_balance(text, uuid, text, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_balance(text, uuid, text, bigint, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_adjust_balance(text, uuid, text, bigint, text) IS
'Pkg360: unified admin add/deduct for profile/helper/agency balances. Verifies admin session via x-admin-token header + section permission, bypasses protect_sensitive_profile_columns trigger for profile/agency writes, returns {success,new_balance,old_balance,delta,field}.';