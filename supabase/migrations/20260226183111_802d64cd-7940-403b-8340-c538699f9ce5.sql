-- Fix all Level 5 Payroll Helper agencies to A5/12%
UPDATE agencies
SET level = 'A5', commission_rate = 12.00, updated_at = now()
WHERE owner_id IN (
  SELECT user_id FROM topup_helpers 
  WHERE is_verified = true 
  AND payroll_enabled = true 
  AND trader_level = 5
)
AND (level != 'A5' OR commission_rate != 12.00 OR level IS NULL);
