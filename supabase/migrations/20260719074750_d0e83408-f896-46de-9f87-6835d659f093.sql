
BEGIN;
SET LOCAL session_replication_role = 'replica';

-- Drop stale views first (will recreate later with diamond names)
DROP VIEW IF EXISTS public.coin_traders CASCADE;
DROP VIEW IF EXISTS public.v_user_reserved_coins CASCADE;

-- Step 1
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public' AND is_generated='ALWAYS' AND column_name ILIKE '%diamond%' LOOP
    IF r.table_name='profiles' AND r.column_name='coins' THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS %I CASCADE', r.table_name, r.column_name);
  END LOOP;
END $$;

-- Step 2
ALTER TABLE public.gift_transactions DROP CONSTRAINT IF EXISTS gift_transactions_coin_amount_positive;
ALTER TABLE public.gift_transactions DROP CONSTRAINT IF EXISTS gift_transactions_total_coins_nonneg;
ALTER TABLE public.gifts DROP CONSTRAINT IF EXISTS gifts_coin_value_positive;
ALTER TABLE public.gifts DROP CONSTRAINT IF EXISTS gifts_receiver_beans_not_over_price;
ALTER TABLE public.call_balance_reservations DROP CONSTRAINT IF EXISTS call_balance_reservations_reserved_coins_check;
ALTER TABLE public.wallet_ledger_audit DROP CONSTRAINT IF EXISTS wallet_ledger_audit_currency_check;
ALTER TABLE public.weekly_login_rewards_config DROP CONSTRAINT IF EXISTS weekly_login_rewards_config_reward_type_check;
ALTER TABLE public.pk_competitions DROP CONSTRAINT IF EXISTS pk_competitions_competition_type_check;

-- Step 3
DO $$ DECLARE r record; old_name text; new_name text; dup_exists boolean; BEGIN
  FOR r IN SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public' AND column_name ~* '(^|_)coins?(_|$)' AND is_generated='NEVER'
      AND NOT (table_name='profiles' AND column_name='coins') LOOP
    old_name := r.column_name;
    new_name := regexp_replace(old_name, '(^|_)coins(_|$)', E'\\1diamonds\\2', 'g');
    new_name := regexp_replace(new_name, '(^|_)coin(_|$)', E'\\1diamond\\2', 'g');
    IF new_name = old_name THEN CONTINUE; END IF;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=r.table_name AND column_name=new_name) INTO dup_exists;
    IF dup_exists THEN
      EXECUTE format('UPDATE public.%I SET %I = GREATEST(COALESCE(%I,0), COALESCE(%I,0)) WHERE (%I IS NOT NULL OR %I IS NOT NULL)',
        r.table_name, new_name, new_name, old_name, new_name, old_name);
      EXECUTE format('ALTER TABLE public.%I DROP COLUMN %I CASCADE', r.table_name, old_name);
    ELSE
      EXECUTE format('ALTER TABLE public.%I RENAME COLUMN %I TO %I', r.table_name, old_name, new_name);
    END IF;
  END LOOP;
END $$;

-- Step 4
ALTER TABLE public.profiles DROP COLUMN IF EXISTS coins CASCADE;

-- Step 5
ALTER TABLE IF EXISTS public.coin_packages           RENAME TO diamond_packages;
ALTER TABLE IF EXISTS public.coin_transactions       RENAME TO diamond_transactions;
ALTER TABLE IF EXISTS public.coin_transfers          RENAME TO diamond_transfers;
ALTER TABLE IF EXISTS public.coin_trader_transfers   RENAME TO diamond_trader_transfers;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='coin_trader_transactions') THEN
    EXECUTE 'ALTER TABLE public.coin_trader_transactions RENAME TO diamond_trader_transactions';
  END IF;
END $$;
ALTER INDEX IF EXISTS public.coin_trader_transfers_pkey RENAME TO diamond_trader_transfers_pkey;
ALTER INDEX IF EXISTS public.idx_coin_trader_transfers_user_created RENAME TO idx_diamond_trader_transfers_user_created;
ALTER INDEX IF EXISTS public.coin_transactions_pkey RENAME TO diamond_transactions_pkey;
ALTER INDEX IF EXISTS public.uniq_coin_tx_payment_ref_completed RENAME TO uniq_diamond_tx_payment_ref_completed;
ALTER INDEX IF EXISTS public.idx_coin_transfers_receiver RENAME TO idx_diamond_transfers_receiver;
ALTER INDEX IF EXISTS public.idx_coin_transfers_sender RENAME TO idx_diamond_transfers_sender;
ALTER INDEX IF EXISTS public.idx_coin_transfers_pending RENAME TO idx_diamond_transfers_pending;
DO $$ DECLARE t record; new_name text; BEGIN
  FOR t IN SELECT tg.tgname, cl.relname AS tbl FROM pg_trigger tg JOIN pg_class cl ON cl.oid=tg.tgrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
    WHERE n.nspname='public' AND NOT tg.tgisinternal AND tg.tgname ILIKE '%coin%' LOOP
    new_name := regexp_replace(t.tgname, 'coin', 'diamond', 'gi');
    IF new_name <> t.tgname THEN EXECUTE format('ALTER TRIGGER %I ON public.%I RENAME TO %I', t.tgname, t.tbl, new_name); END IF;
  END LOOP;
END $$;

-- Step 6
DO $$ DECLARE tbl_col record; BEGIN
  FOR tbl_col IN SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public' AND column_name IN ('currency','reward_type','competition_type','type') LOOP
    BEGIN EXECUTE format('UPDATE public.%I SET %I = %L WHERE %I = %L', tbl_col.table_name, tbl_col.column_name, 'diamonds', tbl_col.column_name, 'coins'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE format('UPDATE public.%I SET %I = %L WHERE %I = %L', tbl_col.table_name, tbl_col.column_name, 'diamonds_spent', tbl_col.column_name, 'coins_spent'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE format('UPDATE public.%I SET %I = REPLACE(%I, %L, %L) WHERE %I ILIKE %L', tbl_col.table_name, tbl_col.column_name, tbl_col.column_name, 'coin', 'diamond', tbl_col.column_name, '%coin%'); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
END $$;

-- Step 7 constraints
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gift_transactions' AND column_name='diamond_amount') THEN
    ALTER TABLE public.gift_transactions ADD CONSTRAINT gift_transactions_diamond_amount_positive CHECK (diamond_amount > 0) NOT VALID;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gift_transactions' AND column_name='total_diamonds') THEN
    ALTER TABLE public.gift_transactions ADD CONSTRAINT gift_transactions_total_diamonds_nonneg CHECK (COALESCE(total_diamonds, 0::bigint) >= 0) NOT VALID;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gifts' AND column_name='diamond_value') THEN
    ALTER TABLE public.gifts ADD CONSTRAINT gifts_diamond_value_positive CHECK (diamond_value > 0) NOT VALID;
    ALTER TABLE public.gifts ADD CONSTRAINT gifts_receiver_beans_not_over_price CHECK (COALESCE(receiver_beans, 0::bigint) <= diamond_value) NOT VALID;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='call_balance_reservations' AND column_name='reserved_diamonds') THEN
    ALTER TABLE public.call_balance_reservations ADD CONSTRAINT call_balance_reservations_reserved_diamonds_check CHECK (reserved_diamonds > 0);
  END IF;
END $$;
ALTER TABLE public.wallet_ledger_audit ADD CONSTRAINT wallet_ledger_audit_currency_check CHECK (currency = ANY (ARRAY['beans','diamonds']));
ALTER TABLE public.weekly_login_rewards_config ADD CONSTRAINT weekly_login_rewards_config_reward_type_check CHECK (reward_type = ANY (ARRAY['diamonds','beans']));
ALTER TABLE public.pk_competitions ADD CONSTRAINT pk_competitions_competition_type_check CHECK (competition_type = ANY (ARRAY['gift_sending','gift_receiving','diamonds_spent','beans_earned','custom']));

-- Step 7.5 end_live_stream clean rewrite
DROP FUNCTION IF EXISTS public.end_live_stream(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.end_live_stream(p_stream_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_started timestamptz; v_is_active boolean; v_ended_existing timestamptz; v_ended timestamptz;
  v_duration int; v_audience int; v_host_pct int;
  v_beans bigint := 0; v_total_diamonds bigint := 0; v_total_gifters int := 0;
  v_top jsonb := '[]'::jsonb; v_next jsonb; v_user_level int; v_max_level int;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  SELECT started_at, is_active, ended_at INTO v_started, v_is_active, v_ended_existing
  FROM public.live_streams WHERE id = p_stream_id AND host_id = uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Stream not found or not your stream'); END IF;
  v_ended := CASE WHEN v_is_active THEN now() ELSE coalesce(v_ended_existing, now()) END;
  IF v_is_active THEN
    PERFORM set_config('app.bypass_live_stream_guard', 'on', true);
    UPDATE public.live_streams SET is_active = false, ended_at = coalesce(ended_at, v_ended), status = 'ended', viewer_count = 0
    WHERE id = p_stream_id AND host_id = uid;
    PERFORM set_config('app.bypass_live_stream_guard', 'off', true);
  END IF;
  SELECT count(DISTINCT viewer_id)::int INTO v_audience FROM public.stream_viewers WHERE stream_id = p_stream_id;
  SELECT coalesce(sum(diamond_amount), 0)::bigint INTO v_total_diamonds
  FROM public.gift_transactions WHERE stream_id = p_stream_id AND receiver_id = uid;
  SELECT count(DISTINCT sender_id)::int INTO v_total_gifters
  FROM public.gift_transactions WHERE stream_id = p_stream_id AND receiver_id = uid AND sender_id IS NOT NULL;
  SELECT coalesce(
    (SELECT jsonb_agg(jsonb_build_object('sender_id', s.sender_id, 'total_diamonds', s.total_diamonds_spent, 'display_name', s.display_name, 'avatar_url', s.avatar_url) ORDER BY s.total_diamonds_spent DESC)
     FROM (SELECT gt.sender_id, sum(gt.diamond_amount)::bigint AS total_diamonds_spent, max(pp.display_name) AS display_name, max(pp.avatar_url) AS avatar_url
           FROM public.gift_transactions gt LEFT JOIN public.profiles_public pp ON pp.id = gt.sender_id
           WHERE gt.stream_id = p_stream_id AND gt.receiver_id = uid AND gt.sender_id IS NOT NULL
           GROUP BY gt.sender_id ORDER BY sum(gt.diamond_amount) DESC LIMIT 3) s),
    '[]'::jsonb) INTO v_top;
  v_host_pct := public.get_effective_host_percent();
  v_beans := floor(v_total_diamonds * v_host_pct / 100.0)::bigint;
  v_duration := greatest(0, extract(epoch FROM (v_ended - coalesce(v_started, v_ended)))::int);
  SELECT p.user_level, p.max_user_level INTO v_user_level, v_max_level FROM public.profiles p WHERE p.id = uid;
  v_next := jsonb_build_object('user_level', coalesce(v_user_level, 1), 'max_user_level', coalesce(v_max_level, 99));
  RETURN jsonb_build_object('success', true, 'stream_id', p_stream_id, 'duration', v_duration,
    'total_beans', v_beans, 'total_diamonds', v_total_diamonds, 'total_gifters', v_total_gifters,
    'top_gifters', v_top, 'next_level_progress', v_next, 'duration_seconds', v_duration,
    'audience_count', coalesce(v_audience, 0), 'total_gift_diamonds', v_total_diamonds,
    'estimated_host_beans', v_beans, 'beans_earned', v_beans, 'host_percent', v_host_pct);
END;
$function$;

-- Step 8 function body auto-rewrite
CREATE TEMP TABLE _fn_snapshot AS
SELECT p.proname, pg_get_functiondef(p.oid) AS def, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prokind='f'
  AND (pg_get_functiondef(p.oid) ILIKE '%coin%' OR p.proname ILIKE '%coin%' OR pg_get_function_identity_arguments(p.oid) ILIKE '%coin%');

DO $$
DECLARE fn record; old_def text; new_def text; new_proname text; m text[];
BEGIN
  FOR fn IN SELECT proname, def, args FROM _fn_snapshot LOOP
    old_def := fn.def; new_def := old_def;
    new_def := regexp_replace(new_def, '\mcoin_packages\M', 'diamond_packages', 'g');
    new_def := regexp_replace(new_def, '\mcoin_transactions\M', 'diamond_transactions', 'g');
    new_def := regexp_replace(new_def, '\mcoin_transfers\M', 'diamond_transfers', 'g');
    new_def := regexp_replace(new_def, '\mcoin_trader_transfers\M', 'diamond_trader_transfers', 'g');
    new_def := regexp_replace(new_def, '\mcoin_trader_transactions\M', 'diamond_trader_transactions', 'g');
    new_def := regexp_replace(new_def, '\mcoins_amount\M', 'diamonds_amount', 'g');
    new_def := regexp_replace(new_def, '\mcoin_amount\M', 'diamond_amount', 'g');
    new_def := regexp_replace(new_def, '\mcoin_price\M', 'diamond_price', 'g');
    new_def := regexp_replace(new_def, '\mcoin_value\M', 'diamond_value', 'g');
    new_def := regexp_replace(new_def, '\mcoin_cost\M', 'diamond_cost', 'g');
    new_def := regexp_replace(new_def, '\mcoin_total\M', 'diamond_total', 'g');
    new_def := regexp_replace(new_def, '\mcoins_per_minute\M', 'diamonds_per_minute', 'g');
    new_def := regexp_replace(new_def, '\mcoins_spent\M', 'diamonds_spent', 'g');
    new_def := regexp_replace(new_def, '\mcoins_received\M', 'diamonds_received', 'g');
    new_def := regexp_replace(new_def, '\mcoins_charged\M', 'diamonds_charged', 'g');
    new_def := regexp_replace(new_def, '\mcoins_deducted\M', 'diamonds_deducted', 'g');
    new_def := regexp_replace(new_def, '\mbonus_coins\M', 'bonus_diamonds', 'g');
    new_def := regexp_replace(new_def, '\mreward_coins\M', 'reward_diamonds', 'g');
    new_def := regexp_replace(new_def, '\mprice_coins\M', 'price_diamonds', 'g');
    new_def := regexp_replace(new_def, '\mreserved_coins\M', 'reserved_diamonds', 'g');
    new_def := regexp_replace(new_def, '\mtotal_coins_earned\M', 'total_diamonds_earned', 'g');
    new_def := regexp_replace(new_def, '\mtotal_coins_spent\M', 'total_diamonds_spent', 'g');
    new_def := regexp_replace(new_def, '\mtotal_coins_won\M', 'total_diamonds_won', 'g');
    new_def := regexp_replace(new_def, '\mtotal_coins_lost\M', 'total_diamonds_lost', 'g');
    new_def := regexp_replace(new_def, '\mtotal_coins_deducted\M', 'total_diamonds_deducted', 'g');
    new_def := regexp_replace(new_def, '\mtotal_coins\M', 'total_diamonds', 'g');
    new_def := regexp_replace(new_def, '\mmax_return_coins\M', 'max_return_diamonds', 'g');
    new_def := regexp_replace(new_def, '\mcoin_rate_per_min\M', 'diamond_rate_per_min', 'g');
    new_def := regexp_replace(new_def, '\mcoins_to_usd_rate\M', 'diamonds_to_usd_rate', 'g');
    new_def := regexp_replace(new_def, '\mdefault_host_rate_coins_per_min\M', 'default_host_rate_diamonds_per_min', 'g');
    new_def := regexp_replace(new_def, '\mhost_max_rate_coins_per_min\M', 'host_max_rate_diamonds_per_min', 'g');
    new_def := regexp_replace(new_def, '\mhost_min_rate_coins_per_min\M', 'host_min_rate_diamonds_per_min', 'g');
    new_def := regexp_replace(new_def, '\.coins\M', '.diamonds', 'g');
    new_def := regexp_replace(new_def, '\mp_coin_amount\M', 'p_diamond_amount', 'g');
    new_def := regexp_replace(new_def, '\mp_coins_amount\M', 'p_diamonds_amount', 'g');
    new_def := regexp_replace(new_def, '\mp_base_coins\M', 'p_base_diamonds', 'g');
    new_def := regexp_replace(new_def, '\m_base_coins\M', '_base_diamonds', 'g');
    new_def := regexp_replace(new_def, '\mp_estimated_coins\M', 'p_estimated_diamonds', 'g');
    new_def := regexp_replace(new_def, '\mp_total_coins\M', 'p_total_diamonds', 'g');
    new_def := regexp_replace(new_def, '\mp_amount_coins\M', 'p_amount_diamonds', 'g');
    new_def := regexp_replace(new_def, '\m_estimated_coins\M', '_estimated_diamonds', 'g');
    new_def := regexp_replace(new_def, '\mv_coin_amount\M', 'v_diamond_amount', 'g');
    new_def := regexp_replace(new_def, '\mv_coin_cost\M', 'v_diamond_cost', 'g');
    new_def := regexp_replace(new_def, '\mv_total_coins\M', 'v_total_diamonds', 'g');
    new_def := regexp_replace(new_def, '\mv_coins\M', 'v_diamonds', 'g');
    new_def := regexp_replace(new_def, '\madd_coins_to_user\M', 'add_diamonds_to_user', 'g');
    new_def := regexp_replace(new_def, '\madd_coins\M', 'add_diamonds', 'g');
    new_def := regexp_replace(new_def, '\m_internal_add_coins\M', '_internal_add_diamonds', 'g');
    new_def := regexp_replace(new_def, '\madmin_add_agency_coins\M', 'admin_add_agency_diamonds', 'g');
    new_def := regexp_replace(new_def, '\madmin_add_user_coins\M', 'admin_add_user_diamonds', 'g');
    new_def := regexp_replace(new_def, '\mdeduct_coins_atomic\M', 'deduct_diamonds_atomic', 'g');
    new_def := regexp_replace(new_def, '\mdeduct_coins_from_user\M', 'deduct_diamonds_from_user', 'g');
    new_def := regexp_replace(new_def, '\mdeduct_coins\M', 'deduct_diamonds', 'g');
    new_def := regexp_replace(new_def, '\mdeduct_call_coins_per_minute\M', 'deduct_call_diamonds_per_minute', 'g');
    new_def := regexp_replace(new_def, '\m_resolve_private_call_coins_per_minute\M', '_resolve_private_call_diamonds_per_minute', 'g');
    new_def := regexp_replace(new_def, '\mcoin_trader_self_recharge\M', 'diamond_trader_self_recharge', 'g');
    new_def := regexp_replace(new_def, '\mcoin_trader_transfer_to_agency\M', 'diamond_trader_transfer_to_agency', 'g');
    new_def := regexp_replace(new_def, '\mcoin_trader_transfer_to_user\M', 'diamond_trader_transfer_to_user', 'g');
    new_def := regexp_replace(new_def, '\mget_official_coin_usd_rate\M', 'get_official_diamond_usd_rate', 'g');
    new_def := regexp_replace(new_def, '\mhelper_add_coins_to_user\M', 'helper_add_diamonds_to_user', 'g');
    new_def := regexp_replace(new_def, '\mhelper_transfer_coins_to_user\M', 'helper_transfer_diamonds_to_user', 'g');
    new_def := regexp_replace(new_def, '\mnotify_coin_transfer\M', 'notify_diamond_transfer', 'g');
    new_def := regexp_replace(new_def, '\mtransfer_coins_to_user\M', 'transfer_diamonds_to_user', 'g');
    new_def := regexp_replace(new_def, '\mtg_app_sync_coin_transfers\M', 'tg_app_sync_diamond_transfers', 'g');
    IF new_def = old_def THEN CONTINUE; END IF;
    m := regexp_match(new_def, 'CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?(\w+)', 'i');
    IF m IS NOT NULL THEN new_proname := m[1]; ELSE new_proname := fn.proname; END IF;
    BEGIN EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE', fn.proname, fn.args); EXCEPTION WHEN OTHERS THEN NULL; END;
    IF new_proname <> fn.proname THEN
      BEGIN EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE', new_proname, fn.args); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    BEGIN EXECUTE new_def; EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed %(%): %', fn.proname, fn.args, SQLERRM;
    END;
  END LOOP;
END $$;

DROP TABLE IF EXISTS _fn_snapshot;

-- Recreate the 2 dropped views with diamond names
CREATE OR REPLACE VIEW public.diamond_traders AS
  SELECT id, user_id, wallet_balance::bigint AS wallet_balance,
    CASE WHEN (COALESCE(is_active, true) AND COALESCE(is_verified, false)) THEN 'active'::text ELSE 'inactive'::text END AS status,
    created_at, updated_at
  FROM public.topup_helpers WHERE user_id = auth.uid();
GRANT SELECT ON public.diamond_traders TO authenticated;

CREATE OR REPLACE VIEW public.v_user_reserved_diamonds AS
  SELECT caller_id AS user_id, COALESCE(sum(reserved_diamonds), 0::bigint) AS total_reserved
  FROM public.call_balance_reservations
  WHERE status = 'active' AND expires_at > now()
  GROUP BY caller_id;
GRANT SELECT ON public.v_user_reserved_diamonds TO authenticated, service_role;

ALTER TABLE IF EXISTS public.zero_coin_wave_log RENAME TO zero_diamond_wave_log;

DO $$ DECLARE bad_col int; bad_tbl int; BEGIN
  SELECT COUNT(*) INTO bad_col FROM information_schema.columns WHERE table_schema='public' AND column_name ILIKE '%coin%';
  SELECT COUNT(*) INTO bad_tbl FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%coin%';
  RAISE NOTICE 'Remnants cols=%, tbls=%', bad_col, bad_tbl;
  IF bad_col > 0 THEN RAISE EXCEPTION 'Still % coin columns', bad_col; END IF;
  IF bad_tbl > 0 THEN RAISE EXCEPTION 'Still % coin tables/views', bad_tbl; END IF;
END $$;

COMMIT;
