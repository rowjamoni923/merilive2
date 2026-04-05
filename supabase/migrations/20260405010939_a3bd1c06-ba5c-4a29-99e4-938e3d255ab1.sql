-- Function Batch 3: Remaining 12 functions

CREATE OR REPLACE FUNCTION public.cleanup_stale_party_participants() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE party_room_participants
  SET left_at = NOW()
  WHERE left_at IS NULL
    AND joined_at < NOW() - INTERVAL '2 hours';
    
  UPDATE party_rooms pr
  SET is_active = false
  WHERE pr.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM party_room_participants prp
      WHERE prp.room_id = pr.id
        AND prp.left_at IS NULL
        AND prp.joined_at > NOW() - INTERVAL '2 hours'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_conversations_with_details(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(conv_data ORDER BY last_message_at DESC NULLS LAST)
  INTO result
  FROM (
    SELECT 
      c.id,
      c.participant1_id,
      c.participant2_id,
      c.last_message_at,
      c.created_at,
      json_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'is_online', p.is_online,
        'is_verified', p.is_verified,
        'is_host', p.is_host,
        'gender', p.gender,
        'user_level', p.user_level,
        'country_flag', p.country_flag,
        'country_name', p.country_name,
        'city', p.city,
        'last_seen_at', p.last_seen_at,
        'call_rate_per_minute', p.call_rate_per_minute
      ) AS other_user,
      (
        SELECT m.content
        FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_message,
      (
        SELECT COUNT(*)::int
        FROM messages m
        WHERE m.conversation_id = c.id
          AND m.is_read = false
          AND m.sender_id != p_user_id
      ) AS unread_count
    FROM conversations c
    LEFT JOIN profiles p ON p.id = CASE 
      WHEN c.participant1_id = p_user_id THEN c.participant2_id 
      ELSE c.participant1_id 
    END
    WHERE c.participant1_id = p_user_id OR c.participant2_id = p_user_id
  ) conv_data;
  
  RETURN COALESCE(result, '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_agency_balance_manipulation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' OR
     current_setting('role', true) = 'postgres' OR
     current_user = 'postgres' OR
     current_user = 'supabase_admin' THEN
    RETURN NEW;
  END IF;

  IF OLD.diamond_balance IS DISTINCT FROM NEW.diamond_balance THEN
    RAISE EXCEPTION 'Direct agency diamond balance modification is not allowed.';
  END IF;

  IF OLD.beans_balance IS DISTINCT FROM NEW.beans_balance THEN
    RAISE EXCEPTION 'Direct agency beans balance modification is not allowed.';
  END IF;

  IF OLD.wallet_balance IS DISTINCT FROM NEW.wallet_balance THEN
    RAISE EXCEPTION 'Direct agency wallet balance modification is not allowed.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_helper_wallet_manipulation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' OR
     current_setting('role', true) = 'postgres' OR
     current_user = 'postgres' OR
     current_user = 'supabase_admin' THEN
    RETURN NEW;
  END IF;

  IF OLD.wallet_balance IS DISTINCT FROM NEW.wallet_balance THEN
    RAISE EXCEPTION 'Direct helper wallet balance modification is not allowed.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_all_user_levels() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  user_record RECORD;
  user_topup_total bigint;
  new_level int;
BEGIN
  FOR user_record IN 
    SELECT id, coins, total_consumption, total_earnings, user_level, is_host, gender 
    FROM profiles 
  LOOP
    IF user_record.is_host = true AND user_record.gender = 'female' THEN
      SELECT COALESCE(level_number, 0) INTO new_level
      FROM user_level_tiers
      WHERE tier_type = 'host'
        AND is_active = true
        AND min_earning_amount <= COALESCE(user_record.total_earnings, 0)
      ORDER BY level_number DESC
      LIMIT 1;
    ELSE
      user_topup_total := GREATEST(
        COALESCE(user_record.coins, 0) + COALESCE(user_record.total_consumption, 0),
        COALESCE(user_record.coins, 0),
        COALESCE(user_record.total_consumption, 0)
      );
      
      SELECT COALESCE(level_number, 0) INTO new_level
      FROM user_level_tiers
      WHERE tier_type = 'user'
        AND is_active = true
        AND min_topup_amount <= user_topup_total
      ORDER BY level_number DESC
      LIMIT 1;
    END IF;
    
    new_level := COALESCE(new_level, 0);
    
    IF new_level != COALESCE(user_record.user_level, 0) THEN
      UPDATE profiles SET user_level = new_level, updated_at = now() WHERE id = user_record.id;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_agency_commission_rate() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  tier_rate numeric;
BEGIN
  SELECT commission_rate INTO tier_rate
  FROM public.agency_level_tiers
  WHERE level_code = NEW.level AND is_active = true
  LIMIT 1;

  IF tier_rate IS NOT NULL THEN
    NEW.commission_rate := tier_rate;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_commission_rates() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.helper_level_config 
  SET commission_rate = NEW.commission_rate,
      updated_at = now()
  WHERE level_number = NEW.display_order;
  
  UPDATE public.trader_level_tiers
  SET commission_rate = NEW.commission_rate
  WHERE level_number = NEW.display_order;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_payroll_helper_agency_level() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _a5_commission NUMERIC;
BEGIN
  IF NEW.trader_level = 5 AND NEW.payroll_enabled = true AND NEW.is_verified = true THEN
    SELECT commission_rate INTO _a5_commission
    FROM agency_level_tiers
    WHERE level_code = 'A5' AND is_active = true;
    
    IF _a5_commission IS NULL THEN
      _a5_commission := 12;
    END IF;
    
    UPDATE agencies
    SET level = 'A5',
        commission_rate = _a5_commission,
        updated_at = now()
    WHERE owner_id = NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_channels_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_game_stats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO game_stats (game_id, stat_date, total_bets, total_bet_amount, total_wins, total_win_amount, house_profit, unique_players)
  VALUES (
    NEW.game_id,
    CURRENT_DATE,
    CASE WHEN NEW.transaction_type = 'bet' THEN 1 ELSE 0 END,
    CASE WHEN NEW.transaction_type = 'bet' THEN NEW.amount ELSE 0 END,
    CASE WHEN NEW.transaction_type IN ('win', 'jackpot') THEN 1 ELSE 0 END,
    CASE WHEN NEW.transaction_type IN ('win', 'jackpot') THEN NEW.amount ELSE 0 END,
    CASE WHEN NEW.transaction_type = 'bet' THEN NEW.amount 
         WHEN NEW.transaction_type IN ('win', 'jackpot') THEN -NEW.amount 
         ELSE 0 END,
    1
  )
  ON CONFLICT (game_id, stat_date) DO UPDATE SET
    total_bets = game_stats.total_bets + CASE WHEN NEW.transaction_type = 'bet' THEN 1 ELSE 0 END,
    total_bet_amount = game_stats.total_bet_amount + CASE WHEN NEW.transaction_type = 'bet' THEN NEW.amount ELSE 0 END,
    total_wins = game_stats.total_wins + CASE WHEN NEW.transaction_type IN ('win', 'jackpot') THEN 1 ELSE 0 END,
    total_win_amount = game_stats.total_win_amount + CASE WHEN NEW.transaction_type IN ('win', 'jackpot') THEN NEW.amount ELSE 0 END,
    house_profit = game_stats.house_profit + CASE WHEN NEW.transaction_type = 'bet' THEN NEW.amount 
                                                   WHEN NEW.transaction_type IN ('win', 'jackpot') THEN -NEW.amount 
                                                   ELSE 0 END,
    updated_at = now();
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_message_has_replies() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE helper_admin_messages 
  SET has_replies = true, last_reply_at = NEW.created_at
  WHERE id = NEW.message_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_online_status(p_user_id uuid, p_is_online boolean, p_last_seen_at timestamp with time zone DEFAULT now()) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ BEGIN UPDATE profiles SET is_online=p_is_online, last_seen_at=p_last_seen_at WHERE id=p_user_id; END; $$;