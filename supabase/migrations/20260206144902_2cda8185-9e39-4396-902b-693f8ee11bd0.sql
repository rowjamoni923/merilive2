
-- ===================================
-- PK Competitions Table
-- ===================================
CREATE TABLE public.pk_competitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  banner_image_url TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'ended', 'cancelled')),
  competition_type TEXT NOT NULL DEFAULT 'gift_sending' CHECK (competition_type IN ('gift_sending', 'gift_receiving', 'coins_spent', 'beans_earned', 'custom')),
  max_participants INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pk_competitions ENABLE ROW LEVEL SECURITY;

-- Everyone can view active competitions
CREATE POLICY "Anyone can view active PK competitions"
  ON public.pk_competitions FOR SELECT
  USING (is_active = true);

-- ===================================
-- PK Competition Reward Tiers
-- ===================================
CREATE TABLE public.pk_competition_rewards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competition_id UUID NOT NULL REFERENCES public.pk_competitions(id) ON DELETE CASCADE,
  rank_from INTEGER NOT NULL DEFAULT 1,
  rank_to INTEGER NOT NULL DEFAULT 1,
  reward_diamonds INTEGER NOT NULL DEFAULT 0,
  reward_beans INTEGER NOT NULL DEFAULT 0,
  reward_coins INTEGER NOT NULL DEFAULT 0,
  reward_badge TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pk_competition_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view PK competition rewards"
  ON public.pk_competition_rewards FOR SELECT
  USING (true);

-- ===================================
-- PK Participants (leaderboard entries)
-- ===================================
CREATE TABLE public.pk_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competition_id UUID NOT NULL REFERENCES public.pk_competitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  score BIGINT NOT NULL DEFAULT 0,
  rank_position INTEGER,
  reward_distributed BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(competition_id, user_id)
);

ALTER TABLE public.pk_participants ENABLE ROW LEVEL SECURITY;

-- Anyone can view participants
CREATE POLICY "Anyone can view PK participants"
  ON public.pk_participants FOR SELECT
  USING (true);

-- Users can join competitions
CREATE POLICY "Users can join PK competitions"
  ON public.pk_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ===================================
-- PK Reward Distribution History
-- ===================================
CREATE TABLE public.pk_reward_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competition_id UUID NOT NULL REFERENCES public.pk_competitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  rank_position INTEGER NOT NULL,
  reward_diamonds INTEGER DEFAULT 0,
  reward_beans INTEGER DEFAULT 0,
  reward_coins INTEGER DEFAULT 0,
  distributed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pk_reward_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own PK rewards"
  ON public.pk_reward_history FOR SELECT
  USING (auth.uid() = user_id);

-- ===================================
-- Auto-distribute PK rewards function
-- ===================================
CREATE OR REPLACE FUNCTION public.distribute_pk_rewards(p_competition_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comp RECORD;
  v_count INTEGER := 0;
  v_participant RECORD;
  v_reward RECORD;
  v_rank INTEGER := 0;
  v_already BOOLEAN;
BEGIN
  -- Get competition
  SELECT * INTO v_comp FROM pk_competitions WHERE id = p_competition_id;
  IF v_comp IS NULL THEN RETURN 0; END IF;

  -- Check if already distributed
  SELECT EXISTS (
    SELECT 1 FROM pk_reward_history WHERE competition_id = p_competition_id LIMIT 1
  ) INTO v_already;
  IF v_already THEN RETURN 0; END IF;

  -- Loop through participants ordered by score
  FOR v_participant IN (
    SELECT * FROM pk_participants
    WHERE competition_id = p_competition_id AND score > 0
    ORDER BY score DESC
    LIMIT 50
  ) LOOP
    v_rank := v_rank + 1;

    -- Update rank position
    UPDATE pk_participants SET rank_position = v_rank WHERE id = v_participant.id;

    -- Find matching reward tier
    SELECT * INTO v_reward FROM pk_competition_rewards
    WHERE competition_id = p_competition_id AND is_active = true
    AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;

    IF v_reward IS NOT NULL THEN
      -- Credit rewards
      IF v_reward.reward_beans > 0 THEN
        UPDATE profiles SET beans_balance = COALESCE(beans_balance, 0) + v_reward.reward_beans WHERE id = v_participant.user_id;
      END IF;
      IF v_reward.reward_diamonds > 0 THEN
        UPDATE profiles SET coins = coins + v_reward.reward_diamonds WHERE id = v_participant.user_id;
      END IF;
      IF v_reward.reward_coins > 0 THEN
        UPDATE profiles SET coins = coins + v_reward.reward_coins WHERE id = v_participant.user_id;
      END IF;

      -- Record history
      INSERT INTO pk_reward_history (competition_id, user_id, rank_position, reward_diamonds, reward_beans, reward_coins)
      VALUES (p_competition_id, v_participant.user_id, v_rank, COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_beans, 0), COALESCE(v_reward.reward_coins, 0));

      -- Mark as distributed
      UPDATE pk_participants SET reward_distributed = true WHERE id = v_participant.id;

      -- Send notification
      INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
        v_participant.user_id, 'reward', '🏆 PK Competition Reward!',
        'Congratulations! You ranked #' || v_rank || ' in "' || v_comp.title || '"! Rewards: ' ||
        CASE WHEN COALESCE(v_reward.reward_diamonds, 0) > 0 THEN v_reward.reward_diamonds || ' Diamonds ' ELSE '' END ||
        CASE WHEN COALESCE(v_reward.reward_beans, 0) > 0 THEN v_reward.reward_beans || ' Beans ' ELSE '' END ||
        CASE WHEN COALESCE(v_reward.reward_coins, 0) > 0 THEN v_reward.reward_coins || ' Coins' ELSE '' END,
        jsonb_build_object('type', 'pk_reward', 'competition_id', p_competition_id, 'rank', v_rank,
          'reward_diamonds', COALESCE(v_reward.reward_diamonds, 0), 'reward_beans', COALESCE(v_reward.reward_beans, 0),
          'reward_coins', COALESCE(v_reward.reward_coins, 0)),
        false
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- Update competition status
  UPDATE pk_competitions SET status = 'ended' WHERE id = p_competition_id;

  RETURN v_count;
END;
$$;

-- ===================================
-- Auto-check and distribute ended PK competitions
-- ===================================
CREATE OR REPLACE FUNCTION public.auto_distribute_pk_rewards()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comp RECORD;
  v_total INTEGER := 0;
  v_result INTEGER;
BEGIN
  -- Find all active competitions that have ended
  FOR v_comp IN (
    SELECT id, title FROM pk_competitions
    WHERE status = 'active' AND end_date <= now()
  ) LOOP
    SELECT distribute_pk_rewards(v_comp.id) INTO v_result;
    v_total := v_total + COALESCE(v_result, 0);
  END LOOP;

  -- Also auto-activate upcoming competitions
  UPDATE pk_competitions SET status = 'active'
  WHERE status = 'upcoming' AND start_date <= now() AND end_date > now();

  RETURN 'PK: Distributed to ' || v_total || ' winners';
END;
$$;

-- Schedule PK auto-distribution (every hour)
SELECT cron.schedule(
  'auto-distribute-pk-rewards',
  '5 * * * *',
  $$SELECT public.auto_distribute_pk_rewards()$$
);

-- Indexes for performance
CREATE INDEX idx_pk_participants_competition ON pk_participants(competition_id, score DESC);
CREATE INDEX idx_pk_participants_user ON pk_participants(user_id);
CREATE INDEX idx_pk_competitions_status ON pk_competitions(status, end_date);

-- Updated_at trigger
CREATE TRIGGER update_pk_competitions_updated_at
  BEFORE UPDATE ON pk_competitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pk_participants_updated_at
  BEFORE UPDATE ON pk_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
