-- Recalculate user level for the specific user to ensure it's correct
DO $$
BEGIN
  PERFORM recalculate_single_user_level('ab155d31-96d4-4a42-855d-b2c090ba0339');
END;
$$;

-- Verify the result
SELECT id, display_name, coins, total_consumption, 
       (coins + total_consumption) as total_topup,
       user_level, is_host, host_level
FROM profiles 
WHERE id = 'ab155d31-96d4-4a42-855d-b2c090ba0339';