
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pk_battles'::regclass AND contype = 'p') THEN
    ALTER TABLE public.pk_battles ADD CONSTRAINT pk_battles_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pk_competitions'::regclass AND contype = 'p') THEN
    ALTER TABLE public.pk_competitions ADD CONSTRAINT pk_competitions_pkey PRIMARY KEY (id);
  END IF;
END $$;

ALTER TABLE public.pk_battles
  ADD COLUMN IF NOT EXISTS mode           text NOT NULL DEFAULT '1v1',
  ADD COLUMN IF NOT EXISTS team_size      integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS competition_id uuid REFERENCES public.pk_competitions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validate_pk_battle_mode()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.mode NOT IN ('1v1','2v2','3v3','team','tournament') THEN
    RAISE EXCEPTION 'invalid pk_battle mode: %', NEW.mode;
  END IF;
  IF NEW.team_size < 1 OR NEW.team_size > 5 THEN
    RAISE EXCEPTION 'team_size must be between 1 and 5';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_pk_battle_mode ON public.pk_battles;
CREATE TRIGGER trg_validate_pk_battle_mode
  BEFORE INSERT OR UPDATE OF mode, team_size ON public.pk_battles
  FOR EACH ROW EXECUTE FUNCTION public.validate_pk_battle_mode();

CREATE TABLE IF NOT EXISTS public.pk_battle_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES public.pk_battles(id) ON DELETE CASCADE,
  side text NOT NULL,
  user_id uuid NOT NULL,
  stream_id uuid,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (battle_id, user_id)
);
CREATE INDEX IF NOT EXISTS pk_battle_teams_battle_side_idx
  ON public.pk_battle_teams (battle_id, side);
GRANT SELECT ON public.pk_battle_teams TO authenticated, anon;
GRANT ALL ON public.pk_battle_teams TO service_role;
ALTER TABLE public.pk_battle_teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "teams readable to all" ON public.pk_battle_teams;
CREATE POLICY "teams readable to all" ON public.pk_battle_teams FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.pk_team_invite(
  p_battle_id uuid, p_user_id uuid, p_side text, p_stream_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid := auth.uid(); _battle record; _captain uuid; _current_size int;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','unauthorized'); END IF;
  IF p_side NOT IN ('challenger','opponent') THEN RETURN jsonb_build_object('ok',false,'error','invalid_side'); END IF;
  SELECT * INTO _battle FROM public.pk_battles WHERE id = p_battle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','battle_not_found'); END IF;
  IF _battle.status NOT IN ('pending','accepted','active') THEN RETURN jsonb_build_object('ok',false,'error','battle_not_open'); END IF;
  IF _battle.team_size <= 1 THEN RETURN jsonb_build_object('ok',false,'error','not_a_team_battle'); END IF;
  _captain := CASE WHEN p_side='challenger' THEN COALESCE(_battle.challenger_id,_battle.host1_id)
                   ELSE COALESCE(_battle.opponent_id,_battle.host2_id) END;
  IF _captain IS DISTINCT FROM _uid THEN RETURN jsonb_build_object('ok',false,'error','only_captain_can_invite'); END IF;
  SELECT count(*) INTO _current_size FROM public.pk_battle_teams WHERE battle_id=p_battle_id AND side=p_side;
  IF _current_size >= _battle.team_size THEN RETURN jsonb_build_object('ok',false,'error','team_full'); END IF;
  INSERT INTO public.pk_battle_teams (battle_id, side, user_id, stream_id, role)
  VALUES (p_battle_id, p_side, p_user_id, p_stream_id, 'member')
  ON CONFLICT (battle_id, user_id) DO NOTHING;
  RETURN jsonb_build_object('ok',true);
END; $function$;
REVOKE ALL ON FUNCTION public.pk_team_invite(uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_team_invite(uuid,uuid,text,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seed_pk_battle_captains()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.challenger_id IS NOT NULL THEN
    INSERT INTO public.pk_battle_teams (battle_id, side, user_id, stream_id, role)
    VALUES (NEW.id, 'challenger', NEW.challenger_id, NEW.challenger_stream_id, 'captain')
    ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.opponent_id IS NOT NULL THEN
    INSERT INTO public.pk_battle_teams (battle_id, side, user_id, stream_id, role)
    VALUES (NEW.id, 'opponent', NEW.opponent_id, NEW.opponent_stream_id, 'captain')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_seed_pk_battle_captains ON public.pk_battles;
CREATE TRIGGER trg_seed_pk_battle_captains
  AFTER INSERT ON public.pk_battles
  FOR EACH ROW EXECUTE FUNCTION public.seed_pk_battle_captains();

INSERT INTO public.pk_battle_teams (battle_id, side, user_id, stream_id, role)
SELECT b.id, 'challenger', b.challenger_id, b.challenger_stream_id, 'captain'
  FROM public.pk_battles b WHERE b.challenger_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO public.pk_battle_teams (battle_id, side, user_id, stream_id, role)
SELECT b.id, 'opponent', b.opponent_id, b.opponent_stream_id, 'captain'
  FROM public.pk_battles b WHERE b.opponent_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.end_pk_battle(p_battle_id uuid, p_reason text DEFAULT 'time_up')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _battle record; _winner_id uuid; _loser_id uuid; _winner_side text;
  _loser_score bigint; _mvp_id uuid; _final text;
  _punish_secs int := 90; _bonus_total bigint := 0; _bonus_each bigint := 0;
  _reward_pct numeric := 0.70; _team_count int := 1; _member record;
BEGIN
  SELECT * INTO _battle FROM public.pk_battles WHERE id = p_battle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','battle_not_found'); END IF;
  IF _battle.status = 'ended' THEN RETURN jsonb_build_object('ok',true,'already_ended',true); END IF;

  IF COALESCE(_battle.challenger_score,0) > COALESCE(_battle.opponent_score,0) THEN
    _winner_id := COALESCE(_battle.challenger_id,_battle.host1_id);
    _loser_id  := COALESCE(_battle.opponent_id,_battle.host2_id);
    _winner_side := 'challenger'; _loser_score := COALESCE(_battle.opponent_score,0);
    _final := 'winner_decided';
  ELSIF COALESCE(_battle.opponent_score,0) > COALESCE(_battle.challenger_score,0) THEN
    _winner_id := COALESCE(_battle.opponent_id,_battle.host2_id);
    _loser_id  := COALESCE(_battle.challenger_id,_battle.host1_id);
    _winner_side := 'opponent'; _loser_score := COALESCE(_battle.challenger_score,0);
    _final := 'winner_decided';
  ELSE _winner_id := NULL; _loser_id := NULL; _winner_side := NULL; _final := 'draw';
  END IF;

  IF p_reason IN ('forfeit_left','forfeit_disconnect','cancelled','ended_admin') THEN
    _final := p_reason;
  END IF;

  SELECT sender_id INTO _mvp_id FROM public.pk_battle_gifts
   WHERE battle_id = p_battle_id GROUP BY sender_id ORDER BY SUM(coin_amount) DESC LIMIT 1;

  IF _winner_side IS NOT NULL AND _loser_score > 0 THEN
    _bonus_total := FLOOR(_loser_score * _reward_pct)::bigint;
    SELECT GREATEST(count(*),1) INTO _team_count FROM public.pk_battle_teams
     WHERE battle_id = p_battle_id AND side = _winner_side;
    _bonus_each := FLOOR(_bonus_total / _team_count)::bigint;
    IF _bonus_each > 0 THEN
      FOR _member IN SELECT user_id FROM public.pk_battle_teams
                      WHERE battle_id = p_battle_id AND side = _winner_side LOOP
        UPDATE public.profiles
           SET beans = COALESCE(beans,0)+_bonus_each,
               beans_balance = COALESCE(beans_balance,0)+_bonus_each,
               total_earnings = COALESCE(total_earnings,0)+_bonus_each,
               updated_at = now()
         WHERE id = _member.user_id;
        INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, status, notes)
        VALUES (_member.user_id, _bonus_each, 'pk_battle_reward', 'completed',
          jsonb_build_object('battle_id',p_battle_id,'side',_winner_side,'team_count',_team_count,
                             'reward_pct',_reward_pct,'loser_score',_loser_score,
                             'mvp_user_id',_mvp_id)::text);
      END LOOP;
    END IF;
  END IF;

  UPDATE public.pk_battles
     SET status='ended', ended_at=now(),
         winner_user_id=_winner_id, winner_id=_winner_id,
         mvp_user_id=_mvp_id, final_status=_final,
         punishment_end_ts = CASE WHEN _loser_id IS NOT NULL
            THEN now() + (_punish_secs || ' seconds')::interval ELSE NULL END,
         updated_at = now()
   WHERE id = p_battle_id;

  RETURN jsonb_build_object('ok',true,'winner_user_id',_winner_id,'loser_user_id',_loser_id,
    'mvp_user_id',_mvp_id,'final_status',_final,'bonus_total',_bonus_total,
    'bonus_each',_bonus_each,'team_count',_team_count,
    'punishment_end_ts', CASE WHEN _loser_id IS NOT NULL
      THEN now() + (_punish_secs || ' seconds')::interval ELSE NULL END);
END; $function$;

CREATE OR REPLACE VIEW public.pk_agency_leaderboard AS
SELECT
  ah.agency_id,
  count(*) FILTER (WHERE b.winner_user_id = ah.host_id) AS wins,
  count(*) FILTER (
    WHERE b.status = 'ended' AND b.winner_user_id IS NOT NULL
      AND b.winner_user_id <> ah.host_id
      AND (b.challenger_id = ah.host_id OR b.opponent_id = ah.host_id
           OR b.host1_id   = ah.host_id OR b.host2_id   = ah.host_id)
  ) AS losses,
  COALESCE(SUM(
    CASE
      WHEN b.challenger_id = ah.host_id OR b.host1_id = ah.host_id THEN COALESCE(b.challenger_score,0)
      WHEN b.opponent_id   = ah.host_id OR b.host2_id = ah.host_id THEN COALESCE(b.opponent_score,0)
      ELSE 0 END), 0) AS total_score
FROM public.agency_hosts ah
LEFT JOIN public.pk_battles b
  ON (b.challenger_id = ah.host_id OR b.opponent_id = ah.host_id
      OR b.host1_id   = ah.host_id OR b.host2_id   = ah.host_id)
GROUP BY ah.agency_id;

GRANT SELECT ON public.pk_agency_leaderboard TO authenticated, service_role;
