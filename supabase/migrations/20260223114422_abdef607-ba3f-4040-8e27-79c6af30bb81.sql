
-- Fix sumaiya's over-counted total_earnings and pending_earnings
-- Correct calculation:
-- Gift total: 1,142,899 coins * 50% (host_percent from gift_commission) = 571,449 beans
-- Call total: 16,000 coins_spent * 40% = 6,400 beans
-- Correct total_earnings = 577,849

UPDATE profiles
SET 
  total_earnings = 577849,
  pending_earnings = 577849
WHERE id = 'e4b8eff0-314b-44f0-a063-1400addff921';
