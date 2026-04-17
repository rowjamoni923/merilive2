-- Add missing leaderboard-related tables to supabase_realtime publication
-- so leaderboard auto-updates instantly when bets/PK gifts/game wins happen.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pk_participants',
    'pk_battle_gifts',
    'pk_battles',
    'game_transactions',
    'live_game_bets',
    'live_game_rounds'
  ]
  LOOP
    -- Set REPLICA IDENTITY FULL so updates send full row payloads
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    -- Add to realtime publication if not already present
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;