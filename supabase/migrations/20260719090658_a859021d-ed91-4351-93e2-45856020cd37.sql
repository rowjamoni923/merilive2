DO $$
BEGIN
  IF to_regclass('public.game_settings') IS NOT NULL THEN
    UPDATE public.game_settings
    SET
      game_id = 'toss_match',
      game_name = CASE WHEN lower(coalesce(game_name, '')) LIKE '%coin%' THEN 'Toss Match' ELSE game_name END,
      description = CASE WHEN coalesce(description, '') ILIKE '%coin%' THEN 'Heads or tails - 50/50 chance!' ELSE description END,
      rules = CASE
        WHEN rules IS NULL THEN rules
        ELSE replace(replace(replace(rules::text, 'coinflip', 'toss_match'), 'Coin Flip', 'Toss Match'), 'coin', 'toss')::jsonb
      END,
      setting_value = CASE
        WHEN setting_value IS NULL THEN setting_value
        ELSE replace(replace(replace(setting_value::text, 'coinflip', 'toss_match'), 'Coin Flip', 'Toss Match'), 'coin', 'toss')::jsonb
      END,
      updated_at = now()
    WHERE game_id = 'coinflip'
       OR game_name ILIKE '%coin%'
       OR description ILIKE '%coin%'
       OR rules::text ILIKE '%coin%'
       OR setting_value::text ILIKE '%coin%';
  END IF;

  IF to_regclass('public.live_game_rounds') IS NOT NULL THEN
    UPDATE public.live_game_rounds SET game_id = 'toss_match' WHERE game_id = 'coinflip';
  END IF;

  IF to_regclass('public.game_transactions') IS NOT NULL THEN
    UPDATE public.game_transactions
    SET
      game_id = CASE WHEN game_id = 'coinflip' THEN 'toss_match' ELSE game_id END,
      game_type = CASE WHEN game_type = 'coinflip' THEN 'toss_match' ELSE game_type END,
      result_data = CASE
        WHEN result_data IS NULL THEN result_data
        ELSE replace(replace(result_data::text, 'coinflip', 'toss_match'), 'coin', 'toss')::jsonb
      END
    WHERE game_id = 'coinflip'
       OR game_type = 'coinflip'
       OR result_data::text ILIKE '%coin%';
  END IF;

  IF to_regclass('public.game_sessions') IS NOT NULL THEN
    UPDATE public.game_sessions
    SET
      game_type = CASE WHEN game_type = 'coinflip' THEN 'toss_match' ELSE game_type END,
      game_data = CASE
        WHEN game_data IS NULL THEN game_data
        ELSE replace(replace(game_data::text, 'coinflip', 'toss_match'), 'coin', 'toss')::jsonb
      END
    WHERE game_type = 'coinflip'
       OR game_data::text ILIKE '%coin%';
  END IF;

  IF to_regclass('public.live_game_bets') IS NOT NULL THEN
    UPDATE public.live_game_bets SET bet_choice = replace(bet_choice, 'coin', 'toss') WHERE bet_choice ILIKE '%coin%';
  END IF;
END $$;