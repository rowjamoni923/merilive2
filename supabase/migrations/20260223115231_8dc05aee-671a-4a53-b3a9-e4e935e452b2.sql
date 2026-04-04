
-- ===== DATA CORRECTION: Reverse illegitimate transactions =====

-- 1. Block hacker X.X.X$ and zero their coins
UPDATE profiles 
SET coins = 0, is_blocked = true, blocked_at = now(), 
    blocked_reason = 'Security: Exploited add_coins_to_user RPC to inject ~20M coins without purchase'
WHERE id = 'b6f665cd-7811-4989-851a-c4d821ac736f';

-- 2. Deduct sumaiya's illegitimate beans (1,142,799 coins × 50% = 571,399 beans from hacker)
UPDATE profiles 
SET total_earnings = GREATEST(0, total_earnings - 571399),
    pending_earnings = GREATEST(0, pending_earnings - 571399)
WHERE id = 'e4b8eff0-314b-44f0-a063-1400addff921';

-- 3. Deduct anbi's illegitimate beans (52,999 coins × 50% = 26,499 beans from hacker)
UPDATE profiles 
SET total_earnings = GREATEST(0, total_earnings - 26499),
    pending_earnings = GREATEST(0, pending_earnings - 26499)
WHERE id = 'd1b8faff-1ba1-4bbd-8fc0-98115dd1990e';
