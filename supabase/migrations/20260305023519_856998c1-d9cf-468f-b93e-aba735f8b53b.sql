-- Create a function to deduct excess weekly rewards
CREATE OR REPLACE FUNCTION public.fix_excess_weekly_rewards()
RETURNS TABLE(user_id uuid, category text, excess_beans bigint, excess_diamonds bigint, records_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_total_beans bigint := 0;
  v_total_diamonds bigint := 0;
  v_total_deleted bigint := 0;
BEGIN
  -- For each user+category combo with duplicate weekly rewards,
  -- keep the FIRST one (earliest sent_at), deduct and delete the rest
  FOR v_rec IN
    WITH ranked AS (
      SELECT h.id, h.user_id, h.category, h.reward_beans, h.reward_diamonds,
        ROW_NUMBER() OVER (PARTITION BY h.user_id, h.category ORDER BY h.sent_at ASC) as rn
      FROM leaderboard_reward_history h
      WHERE h.period_type = 'weekly'
    ),
    excess_per_user AS (
      SELECT r.user_id, r.category,
        SUM(r.reward_beans) as sum_beans,
        SUM(r.reward_diamonds) as sum_diamonds,
        array_agg(r.id) as ids_to_delete,
        COUNT(*) as cnt
      FROM ranked r
      WHERE r.rn > 1
      GROUP BY r.user_id, r.category
    )
    SELECT * FROM excess_per_user
  LOOP
    -- Deduct excess beans
    IF v_rec.sum_beans > 0 THEN
      UPDATE profiles p
      SET beans = GREATEST(0, COALESCE(p.beans, 0) - v_rec.sum_beans)
      WHERE p.id = v_rec.user_id;
      v_total_beans := v_total_beans + v_rec.sum_beans;
    END IF;
    
    -- Deduct excess diamonds
    IF v_rec.sum_diamonds > 0 THEN
      UPDATE profiles p
      SET coins = GREATEST(0, COALESCE(p.coins, 0) - v_rec.sum_diamonds)
      WHERE p.id = v_rec.user_id;
      v_total_diamonds := v_total_diamonds + v_rec.sum_diamonds;
    END IF;
    
    -- Delete excess reward history records
    DELETE FROM leaderboard_reward_history h
    WHERE h.id = ANY(v_rec.ids_to_delete);
    
    v_total_deleted := v_total_deleted + v_rec.cnt;
    
    user_id := v_rec.user_id;
    category := v_rec.category;
    excess_beans := v_rec.sum_beans;
    excess_diamonds := v_rec.sum_diamonds;
    records_deleted := v_rec.cnt;
    RETURN NEXT;
  END LOOP;
  
  -- Also delete excess weekly notifications
  DELETE FROM notifications n
  WHERE n.type = 'leaderboard_reward'
    AND n.data->>'period_type' = 'weekly'
    AND n.created_at >= '2026-03-02'
    AND n.id NOT IN (
      SELECT DISTINCT ON (n2.user_id, n2.data->>'category') n2.id
      FROM notifications n2
      WHERE n2.type = 'leaderboard_reward'
        AND n2.data->>'period_type' = 'weekly'
        AND n2.created_at >= '2026-03-02'
      ORDER BY n2.user_id, n2.data->>'category', n2.created_at ASC
    );
  
  RETURN;
END;
$$;