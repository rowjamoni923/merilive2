
-- ============================================
-- AGENCY TRANSFER AUDIT & CLEANUP
-- ============================================

-- 1. DELETE 4 bogus/test January records for Official Agency
-- These have inconsistent data (amount != earnings, no host, wrong amounts)
DELETE FROM agency_earnings_transfers 
WHERE id IN (
  '028d27f5-2676-4ddd-b99e-e847aeaecae6',  -- amount=5400, no host, gift_earnings=0
  '32468b8b-7780-496e-a37c-54b4699d410b',  -- amount=577701, no host, gift_earnings=0
  'c83e8e2a-4390-40f0-a4f5-2606c51a15f3',  -- amount=101M but gift=71M (mismatch)
  'cbfe8099-ed68-461d-9bdc-19d3458567c7'   -- amount=1.1M but gift=72M (mismatch)
);

-- 2. Fix the 84 valid auto records: update amount to show NET (after commission)
-- Currently amount = gift_earnings (gross). Should be amount = gross - commission
-- This corrects historical data without affecting balances (no balance was credited)
UPDATE agency_earnings_transfers
SET amount = ROUND((gift_earnings + call_earnings) * (1 - COALESCE(commission_rate, 3) / 100), 2)
WHERE status = 'completed'
  AND transfer_type = 'weekly_auto'
  AND amount = (gift_earnings + call_earnings)  -- Only fix records where amount = gross
  AND (gift_earnings + call_earnings) > 0;
